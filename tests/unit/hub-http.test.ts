import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_TIMEOUT_MS_LIMIT,
  createHubHttpAgents,
  createPooledFetch,
  destroyHubHttpAgents,
  HUB_BRIDGE_TIMEOUT_MS_DEFAULT,
  HUB_HTTP_AUTH_MAX_SOCKETS,
  HUB_HTTP_KEEPALIVE_MS,
  HUB_HTTP_MAX_SOCKETS,
  hubBridgeWaitMs,
  hubHttpAbortMs,
  type HubHttpAgents,
} from "../../src/infrastructure/plug-server/hub-http.js";

it.each([204, 205, 304])(
  "preserves bodyless HTTP %s responses for delegation revocation",
  async (status) => {
    const server = createServer((_req, res) => {
      res.writeHead(status);
      res.end();
    });
    const agents = createHubHttpAgents();
    try {
      const port = await listen(server);
      const response = await createPooledFetch(agents.auth)(`http://127.0.0.1:${port}/fixture`, {
        method: "DELETE",
      });
      expect(response.status).toBe(status);
      expect(response.body).toBeNull();
    } finally {
      destroyHubHttpAgents(agents);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

const listen = async (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        resolve(addr.port);
        return;
      }
      reject(new Error("listen failed"));
    });
  });

const closeServer = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

describe("hubBridgeWaitMs / hubHttpAbortMs", () => {
  it("sem timeout_ms usa o default 30s do bridge (não soma 5s)", () => {
    expect(hubBridgeWaitMs(undefined)).toBe(HUB_BRIDGE_TIMEOUT_MS_DEFAULT);
    expect(hubHttpAbortMs(35_000, hubBridgeWaitMs(undefined))).toBe(35_000);
  });

  it("com timeout_ms replica o wait do hub (max(body, timeout_ms+5s))", () => {
    expect(hubBridgeWaitMs(30_000)).toBe(35_000);
    expect(hubBridgeWaitMs(60_000)).toBe(65_000);
    expect(hubHttpAbortMs(35_000, hubBridgeWaitMs(60_000))).toBe(70_000);
  });

  it("não espera além do teto do hub + headroom de download", () => {
    expect(hubBridgeWaitMs(AGENT_TIMEOUT_MS_LIMIT)).toBe(305_000);
    expect(hubHttpAbortMs(35_000, hubBridgeWaitMs(AGENT_TIMEOUT_MS_LIMIT))).toBe(310_000);
  });
});

describe("createPooledFetch", () => {
  let agents: HubHttpAgents | undefined;
  let server: Server | undefined;

  it("recusa Content-Length excessivo antes de aguardar o corpo", async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-length": "4096" });
      res.flushHeaders();
    });
    const port = await listen(server);
    agents = createHubHttpAgents();
    await expect(
      createPooledFetch(agents.sql, 128)(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(500),
      }),
    ).rejects.toMatchObject({ name: "HubResponseError" });
  });

  it.each(["br", "gzip, gzip", "truncated-gzip"])(
    "recusa codificação incompatível/truncada: %s",
    async (encoding) => {
      let requests = 0;
      server = createServer((_req, res) => {
        requests += 1;
        res.writeHead(200, {
          "content-encoding": encoding === "truncated-gzip" ? "gzip" : encoding,
        });
        res.end(
          encoding === "truncated-gzip" ? gzipSync('{"ok":true}').subarray(0, 12) : '{"ok":true}',
        );
      });
      const port = await listen(server);
      agents = createHubHttpAgents();
      await expect(
        createPooledFetch(agents.sql)(`http://127.0.0.1:${port}/`),
      ).rejects.toMatchObject({ name: "HubResponseError" });
      expect(requests).toBe(1);
    },
  );

  it("HEAD preserva ausência de corpo mesmo com tamanho e gzip do recurso", async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-encoding": "gzip", "content-length": "4096" });
      res.end();
    });
    const port = await listen(server);
    agents = createHubHttpAgents();
    const result = await createPooledFetch(agents.sql, 128)(`http://127.0.0.1:${port}/`, {
      method: "HEAD",
    });
    expect(result.status).toBe(200);
    expect(result.body).toBeNull();
  });

  it("cancela pedido ainda na fila do pool sem enviá-lo depois", async () => {
    let requests = 0;
    server = createServer((req, res) => {
      requests += 1;
      res.writeHead(200);
      if (req.url === "/ok") {
        res.end("ok");
        return;
      }
      res.write("waiting");
    });
    const port = await listen(server);
    agents = createHubHttpAgents();
    agents.sql.http.maxSockets = 1;
    const fetcher = createPooledFetch(agents.sql);
    const active = new AbortController();
    const first = fetcher(`http://127.0.0.1:${port}/`, { signal: active.signal });
    const firstFailure = expect(first).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.waitFor(() => expect(requests).toBe(1));
    const queued = fetcher(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(30) });
    const queuedFailure = expect(queued).rejects.toMatchObject({ name: "TimeoutError" });
    await queuedFailure;
    active.abort();
    await firstFailure;
    expect(requests).toBe(1);
    expect((await fetcher(`http://127.0.0.1:${port}/ok`)).ok).toBe(true);
    expect(requests).toBe(2);
  });

  it("interrompe corpo parcial no prazo sem aguardar o fim da resposta", async () => {
    let requests = 0;
    server = createServer((_req, res) => {
      requests += 1;
      res.writeHead(200);
      res.write('{"partial":');
    });
    const port = await listen(server);
    agents = createHubHttpAgents();
    await expect(
      createPooledFetch(agents.sql)(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(50),
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(requests).toBe(1);
  });

  it.each([false, true])("recusa resposta acima do limite (gzip=%s), sem retry", async (gzip) => {
    let requests = 0;
    server = createServer((_req, res) => {
      requests += 1;
      const payload = Buffer.from("x".repeat(4096));
      res.writeHead(200, gzip ? { "content-encoding": "gzip" } : {});
      res.end(gzip ? gzipSync(payload) : payload);
    });
    const port = await listen(server);
    agents = createHubHttpAgents();
    await expect(createPooledFetch(agents.sql, 128)(`http://127.0.0.1:${port}/`)).rejects.toThrow();
    expect(requests).toBe(1);
    // A failed response must not poison the pool for the next explicit request.
    expect((await createPooledFetch(agents.sql, 8192)(`http://127.0.0.1:${port}/`)).ok).toBe(true);
    expect(requests).toBe(2);
  });

  afterEach(async () => {
    if (agents) {
      destroyHubHttpAgents(agents);
      agents = undefined;
    }
    if (server) {
      server.closeAllConnections();
      await closeServer(server);
      server = undefined;
    }
  });

  it("reusa a conexão TCP entre requests sequenciais", async () => {
    let connections = 0;
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json", connection: "keep-alive" });
      res.end(JSON.stringify({ ok: true }));
    });
    server.keepAliveTimeout = 10_000;
    server.on("connection", () => {
      connections += 1;
    });
    const port = await listen(server);
    agents = createHubHttpAgents();
    const fetchImpl = createPooledFetch(agents.sql);
    const url = `http://127.0.0.1:${String(port)}/`;
    const first = await fetchImpl(url, { method: "GET" });
    const second = await fetchImpl(url, { method: "GET" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(connections).toBe(1);
    expect(HUB_HTTP_KEEPALIVE_MS).toBe(30_000);
  });

  it("descomprime gzip do hub", async () => {
    const payload = Buffer.from(JSON.stringify({ gzip: true }), "utf8");
    server = createServer((_req, res) => {
      const compressed = gzipSync(payload);
      res.writeHead(200, {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": String(compressed.length),
      });
      res.end(compressed);
    });
    const port = await listen(server);
    agents = createHubHttpAgents();
    const fetchImpl = createPooledFetch(agents.sql);
    const response = await fetchImpl(`http://127.0.0.1:${String(port)}/`, { method: "GET" });
    const json: unknown = await response.json();
    expect(json).toEqual({ gzip: true });
    expect(response.headers.has("content-encoding")).toBe(false);
    expect(response.headers.has("content-length")).toBe(false);
  });

  it("respeita AbortSignal (TimeoutError) sem reenviar o pedido", async () => {
    let requests = 0;
    server = createServer(() => {
      requests += 1;
    });
    const port = await listen(server);
    agents = createHubHttpAgents();
    const fetchImpl = createPooledFetch(agents.sql);
    await expect(
      fetchImpl(`http://127.0.0.1:${String(port)}/`, {
        method: "GET",
        signal: AbortSignal.timeout(40),
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(requests).toBe(1);
  });

  it("isola o Agent de sql.execute do de login/refresh/getPolicy (dois pools TCP)", async () => {
    let connections = 0;
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json", connection: "keep-alive" });
      res.end(JSON.stringify({ ok: true }));
    });
    server.keepAliveTimeout = 10_000;
    server.on("connection", () => {
      connections += 1;
    });
    const port = await listen(server);
    agents = createHubHttpAgents();
    expect(agents.sql.http).not.toBe(agents.auth.http);
    expect(agents.sql.https).not.toBe(agents.auth.https);
    expect(agents.sql.http.maxSockets).toBe(HUB_HTTP_MAX_SOCKETS);
    expect(agents.auth.http.maxSockets).toBe(HUB_HTTP_AUTH_MAX_SOCKETS);

    const sqlFetch = createPooledFetch(agents.sql);
    const authFetch = createPooledFetch(agents.auth);
    const url = `http://127.0.0.1:${String(port)}/`;
    expect((await sqlFetch(url, { method: "GET" })).ok).toBe(true);
    expect((await authFetch(url, { method: "GET" })).ok).toBe(true);
    expect(connections).toBe(2);
    expect((await sqlFetch(url, { method: "GET" })).ok).toBe(true);
    expect((await authFetch(url, { method: "GET" })).ok).toBe(true);
    expect(connections).toBe(2);
  });
});
