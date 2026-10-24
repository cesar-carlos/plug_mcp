import { it, expect } from "vitest";
import { createServer } from "node:https";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import {
  sendExternalHttps,
  PublicExternalHttp,
} from "../../../src/infrastructure/persona-v2/external-http.js";
import { PersonaExternalAdapters } from "../../../src/infrastructure/persona-v2/external-adapters.js";
import { externalContractSchema } from "../../../src/domain/persona-v2/external-contract.js";
import { randomUUID } from "node:crypto";
it("TLS nativo valida certificado e recusa redirect/tamanho sem seguir outro destino", async () => {
  const cert = await readFile(new URL("../../fixtures/tls/test-cert.pem", import.meta.url));
  const key = await readFile(new URL("../../fixtures/tls/test-key.pem", import.meta.url));
  const hits: string[] = [];
  const server = createServer({ cert, key }, (req, res) => {
    hits.push(req.url!);
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "https://127.0.0.1/private" });
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ name: req.url === "/large" ? "x".repeat(1000) : "fixture" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = new URL(`https://localhost:${(server.address() as AddressInfo).port}/ok`);
  const input = {
    url,
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(3000),
    maxBytes: 100,
  };
  const address = { address: "127.0.0.1", family: 4 };
  try {
    expect((await sendExternalHttps(input, address, cert)).body).toContain("fixture");
    await expect(sendExternalHttps(input, address)).rejects.toThrow();
    await expect(
      sendExternalHttps({ ...input, url: new URL("/redirect", url) }, address, cert),
    ).rejects.toThrow();
    await expect(
      sendExternalHttps({ ...input, url: new URL("/large", url) }, address, cert),
    ).rejects.toThrow();
    expect(hits).toEqual(["/ok", "/redirect", "/large"]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("adapters REST e MCP usam HTTPS real de fixture sem encaminhar credencial de consumidor", async () => {
  const cert = await readFile(new URL("../../fixtures/tls/test-cert.pem", import.meta.url));
  const key = await readFile(new URL("../../fixtures/tls/test-key.pem", import.meta.url));
  const shape = {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false,
  };
  const received: string[] = [];
  const server = createServer({ cert, key }, (req, res) => {
    expect(req.headers.authorization).toBe("Bearer integration-fixture");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") {
      received.push("GET");
      res.end(JSON.stringify({ name: "fixture" }));
      return;
    }
    const parts: Buffer[] = [];
    req.on("data", (part: Buffer) => parts.push(part));
    req.on("end", () => {
      if (req.url === "/write") {
        received.push("POST");
        expect(JSON.parse(Buffer.concat(parts).toString())).toEqual({ name: "test" });
        res.end(JSON.stringify({ name: "fixture" }));
        return;
      }
      const rpc = JSON.parse(Buffer.concat(parts).toString()) as { id?: string; method: string };
      received.push(rpc.method);
      if (rpc.method === "notifications/initialized") {
        res.statusCode = 202;
        res.end();
        return;
      }
      const result =
        rpc.method === "initialize"
          ? { protocolVersion: "2025-11-25", capabilities: { tools: {} } }
          : rpc.method === "tools/list"
            ? {
                tools: [
                  {
                    name: "lookup",
                    inputSchema: shape,
                    outputSchema: shape,
                    annotations: { readOnlyHint: true },
                  },
                ],
              }
            : { structuredContent: { name: "fixture" } };
      res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const local = new URL(`https://localhost:${(server.address() as AddressInfo).port}`);
  // Only test injection maps the public fixture name to a private TLS server.
  // Production has no resolver/CA/port override configuration.
  const adapter = new PersonaExternalAdapters(
    new PublicExternalHttp({
      resolve: () => Promise.resolve([{ address: "8.8.8.8", family: 4 }]),
      send: (input) =>
        sendExternalHttps(
          { ...input, url: new URL(input.url.pathname + input.url.search, local) },
          { address: "127.0.0.1", family: 4 },
          cert,
        ),
    }),
  );
  const field = { type: "string", required: true, purpose: "Teste", classification: "livre" };
  const contract = externalContractSchema.parse({
    operationId: randomUUID(),
    integrationId: randomUUID(),
    purpose: "Fixture",
    effect: "consulta",
    transport: { kind: "rest", method: "GET", path: "/lookup" },
    input: { name: field },
    output: { name: field },
    timeoutMs: 3000,
    maxResponseBytes: 4096,
  });
  const connection = {
    destination: "https://public.example.com",
    credential: { credentialType: "bearer" as const, token: "integration-fixture" },
  };
  let validations = 0;
  const validate = () => {
    validations++;
    return Promise.resolve();
  };
  try {
    expect(
      await adapter.invoke(
        connection,
        contract,
        { name: "test" },
        AbortSignal.timeout(3000),
        validate,
      ),
    ).toEqual({ name: "fixture" });
    expect(
      await adapter.invoke(
        connection,
        {
          ...contract,
          transport: { kind: "mcp_http", tool: "lookup", inputSchema: shape, outputSchema: shape },
        },
        { name: "test" },
        AbortSignal.timeout(3000),
        validate,
      ),
    ).toEqual({ name: "fixture" });
    expect(received).toEqual([
      "GET",
      "initialize",
      "notifications/initialized",
      "tools/list",
      "tools/call",
    ]);
    expect(validations).toBe(5);
    let claims = 0;
    const claim = () => {
      claims++;
      return Promise.resolve();
    };
    const action = {
      ...contract,
      effect: "acao" as const,
      effectDescription: "Ação de fixture",
      reconciliation: "Conferir referência",
    };
    expect(
      await adapter.executeAction(
        connection,
        { ...action, transport: { kind: "rest", method: "POST", path: "/write" } },
        { name: "test" },
        AbortSignal.timeout(3000),
        validate,
        claim,
      ),
    ).toEqual({ name: "fixture" });
    expect(
      await adapter.executeAction(
        connection,
        {
          ...action,
          transport: { kind: "mcp_http", tool: "lookup", inputSchema: shape, outputSchema: shape },
        },
        { name: "test" },
        AbortSignal.timeout(3000),
        validate,
        claim,
      ),
    ).toEqual({ name: "fixture" });
    expect(claims).toBe(2);
    expect(validations).toBe(10);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
