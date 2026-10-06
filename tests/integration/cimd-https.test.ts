import { createServer, type Server } from "node:https";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  CimdClient,
  pinnedOAuthLookup,
  readCimdHttps,
} from "../../src/infrastructure/oauth/cimd-client.js";

const cert = await readFile(new URL("../fixtures/tls/test-cert.pem", import.meta.url));
const key = await readFile(new URL("../fixtures/tls/test-key.pem", import.meta.url));
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((r) => {
          s.closeAllConnections();
          s.close(() => r());
        }),
    ),
  );
});
const fixture = async (host = "127.0.0.1") => {
  let sni = "",
    hits = 0;
  const server = createServer({ cert, key }, (req, res) => {
    hits++;
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/client.json") {
      res.end(
        JSON.stringify({
          client_id: `https://${req.headers.host}/client.json`,
          redirect_uris: ["https://chatgpt.com/callback"],
          token_endpoint_auth_methods_supported: ["private_key_jwt", "none"],
          token_endpoint_auth_method: "private_key_jwt",
        }),
      );
    } else if (req.url === "/invalid-json") res.end("{");
    else if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/ok" });
      res.end();
    } else if (req.url === "/wrong-type") {
      res.setHeader("Content-Type", "text/plain");
      res.end("{}");
    } else if (req.url === "/big") res.end("x".repeat(65_537));
    else if (req.url === "/broken") {
      res.write("{");
      res.socket?.destroy();
    } else if (req.url === "/wait") {
      /* cancelado pelo deadline do cliente */
    } else res.end(JSON.stringify({ ok: true }));
  });
  server.on("secureConnection", (socket) => {
    sni = typeof socket.servername === "string" ? socket.servername : "";
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: new URL(`https://cimd.test:${port}/ok`),
    address: { address: host, family: host === "::1" ? 6 : 4 },
    stats: () => ({ sni, hits }),
  };
};

describe("CIMD HTTPS nativo", () => {
  it.each([
    [false, "8.8.8.8", 4],
    [true, "8.8.8.8", 4],
    [false, "2001:4860:4860::8888", 6],
    [true, "2001:4860:4860::8888", 6],
  ] as const)("callback DNS all=%s sobre %s usa somente IP fixado", (all, address, family) => {
    let result: unknown;
    pinnedOAuthLookup({ address, family })(
      "ignored.test",
      { all },
      (_error, value, resolvedFamily) => {
        result = [value, resolvedFamily];
      },
    );
    expect(result).toEqual(all ? [[{ address, family }], undefined] : [address, family]);
  });
  it.each(["client.json", "invalid-json"])(
    "valida documento pelo transporte nativo: %s",
    async (path) => {
      const f = await fixture();
      f.url.pathname = `/${path}`;
      const id = f.url.toString(),
        redirect = "https://chatgpt.com/callback";
      let resolutions = 0;
      const client = new CimdClient(
        { [id]: [redirect] },
        {
          resolve: async () => {
            resolutions++;
            return [{ address: "8.8.8.8", family: 4 }];
          },
          // Somente esta dependência de teste recebe um destino local; a política foi validada acima.
          read: (url, approved, signal) => {
            expect(approved.address).toBe("8.8.8.8");
            return readCimdHttps(url, f.address, signal, cert);
          },
        },
      );
      if (path === "client.json")
        await expect(client.validate(id, redirect)).resolves.toBeUndefined();
      else
        await expect(client.validate(id, redirect)).rejects.toMatchObject({
          code: "invalid_client",
        });
      expect(resolutions).toBe(1);
      expect(f.stats()).toEqual({ sni: "cimd.test", hits: 1 });
    },
  );
  it.each(["127.0.0.1", "::1"])("TLS preserva hostname/SNI sobre %s", async (host) => {
    const f = await fixture(host);
    expect(
      JSON.parse(await readCimdHttps(f.url, f.address, new AbortController().signal, cert)),
    ).toEqual({ ok: true });
    expect(f.stats()).toEqual({ sni: "cimd.test", hits: 1 });
  });
  it("rejeita CA desconhecida e hostname incorreto", async () => {
    const f = await fixture();
    await expect(
      readCimdHttps(f.url, f.address, new AbortController().signal),
    ).rejects.toBeInstanceOf(Error);
    f.url.hostname = "wrong.test";
    await expect(
      readCimdHttps(f.url, f.address, new AbortController().signal, cert),
    ).rejects.toMatchObject({ code: "ERR_TLS_CERT_ALTNAME_INVALID" });
    expect(f.stats().hits).toBe(0);
  });
  it.each(["redirect", "wrong-type", "big", "broken"])(
    "recusa %s e não segue redirect",
    async (path) => {
      const f = await fixture();
      f.url.pathname = `/${path}`;
      await expect(
        readCimdHttps(f.url, f.address, new AbortController().signal, cert),
      ).rejects.toBeInstanceOf(Error);
      expect(f.stats().hits).toBe(1);
    },
  );
  it("cancela resposta pendente pelo deadline", async () => {
    const f = await fixture();
    f.url.pathname = "/wait";
    await expect(
      readCimdHttps(f.url, f.address, AbortSignal.timeout(100), cert),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("cache vencido revalida DNS e rejeita rebinding antes do socket", async () => {
    let now = 0,
      resolves = 0,
      reads = 0;
    const id = "https://cimd.test/client.json",
      redirect = "https://chatgpt.com/callback";
    const client = new CimdClient(
      { [id]: [redirect] },
      {
        resolve: async () => [{ address: ++resolves === 1 ? "8.8.8.8" : "127.0.0.1", family: 4 }],
        read: async () => {
          reads++;
          return JSON.stringify({ client_id: id, redirect_uris: [redirect] });
        },
      },
      () => now,
    );
    await client.validate(id, redirect);
    await client.validate(id, redirect);
    now = 300_001;
    await expect(client.validate(id, redirect)).rejects.toMatchObject({ code: "invalid_client" });
    await expect(client.validate(id, redirect)).rejects.toMatchObject({ code: "invalid_client" });
    expect(reads).toBe(1);
    expect(resolves).toBe(3);
  });
});
