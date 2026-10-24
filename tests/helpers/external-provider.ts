import { createServer } from "node:https";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { PersonaExternalAdapters } from "../../src/infrastructure/persona-v2/external-adapters.js";
import { PersonaExternalDiscovery } from "../../src/infrastructure/persona-v2/external-discovery.js";
import {
  PublicExternalHttp,
  sendExternalHttps,
} from "../../src/infrastructure/persona-v2/external-http.js";
import { externalContractSchema } from "../../src/domain/persona-v2/external-contract.js";
import { randomUUID } from "node:crypto";

const field = (type: "string" | "number" | "boolean") => ({
  type,
  required: true,
  purpose: "Fixture sintética",
  classification: "livre" as const,
});
const input = { id: field("string") },
  output = { name: field("string") };
const proofOutput = {
  id: field("string"),
  count: field("number"),
  complete: field("boolean"),
  status: field("string"),
};
const shape = (fields: typeof input | typeof output | typeof proofOutput) => ({
  type: "object",
  properties: Object.fromEntries(Object.entries(fields).map(([key, f]) => [key, { type: f.type }])),
  required: Object.keys(fields),
  additionalProperties: false,
});

/** Native TLS fixture with a durable synthetic provider ledger. No production resolver/CA override exists. */
export async function externalProviderFixture(kind: "rest" | "mcp_http") {
  const cert = await readFile(new URL("../fixtures/tls/test-cert.pem", import.meta.url));
  const key = await readFile(new URL("../fixtures/tls/test-key.pem", import.meta.url));
  const directory = await mkdtemp(join(tmpdir(), "se7e-external-fixture-")),
    ledger = join(directory, "ledger.json");
  await writeFile(ledger, "{}");
  const state = {
    loseResponse: false,
    mode: "normal",
    writes: 0,
    reads: 0,
    invalidCredential: 0,
    invalidProtocol: 0,
    drift: false,
    fixtureRunId: "",
    invalidOwnership: false,
    loseCleanup: false,
    cleanups: 0,
    beforeCleanup: () => Promise.resolve(),
    beforeRead: () => Promise.resolve(),
  };
  const writeTransport =
    kind === "rest"
      ? { kind, method: "POST" as const, path: "/write" }
      : { kind, tool: "write", inputSchema: shape(input), outputSchema: shape(output) };
  const readTransport =
    kind === "rest"
      ? { kind, method: "GET" as const, path: "/lookup" }
      : { kind, tool: "lookup", inputSchema: shape(input), outputSchema: shape(proofOutput) };
  const contract = externalContractSchema.parse({
    operationId: randomUUID(),
    integrationId: randomUUID(),
    purpose: "Efeito isolado",
    effect: "acao",
    approval: "automatic",
    effectDescription: "Grava ledger sintético",
    reconciliation: "Consulta chave original sem repetir",
    transport: writeTransport,
    input,
    output,
    timeoutMs: 3000,
    maxResponseBytes: 8192,
    reconciliationCheck: {
      guarantee: "Serviço retorna contagem completa e estado terminal por chave única",
      transport: readTransport,
      input,
      output: proofOutput,
      bindings: { id: "id" },
      evidence: {
        countField: "count",
        completeField: "complete",
        correlation: [{ inputField: "id", outputField: "id" }],
        statusField: "status",
        appliedValue: "applied",
      },
    },
  });
  const server = createServer({ cert, key }, (req, res) => {
    void (async () => {
      if (
        !["Bearer fixture-external-only", "Bearer isolated", "Bearer fixture-only"].includes(
          String(req.headers.authorization),
        )
      ) {
        state.invalidCredential++;
        res.writeHead(401).end();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      const parts: Buffer[] = [];
      for await (const part of req) parts.push(Buffer.from(part as Uint8Array));
      if (req.url?.includes("/_se7e_fixture/")) {
        const query = new URL(req.url, "https://fixture.example.com").searchParams;
        const control =
          req.method === "GET"
            ? { runId: query.get("runId"), packageHash: query.get("packageHash") }
            : (JSON.parse(Buffer.concat(parts).toString()) as {
                runId: string;
                packageHash: string;
              });
        if (control.runId !== state.fixtureRunId || state.invalidOwnership) {
          res.writeHead(403).end();
          return;
        }
        if (req.url.includes("/cleanup")) {
          state.cleanups++;
          await state.beforeCleanup();
          if (state.loseCleanup) {
            req.socket.destroy();
            return;
          }
          await writeFile(ledger, "{}");
          res.end(JSON.stringify({ runId: control.runId, cleaned: true }));
          return;
        }
        res.end(JSON.stringify({ ...control, isolated: true, ready: true }));
        return;
      }
      const rpc =
        kind === "mcp_http"
          ? (JSON.parse(Buffer.concat(parts).toString()) as {
              id?: string;
              method: string;
              params?: { name?: string; arguments?: { id: string } };
            })
          : null;
      if (
        rpc &&
        rpc.method !== "initialize" &&
        (req.headers["mcp-session-id"] !== "fixture-session" ||
          req.headers["mcp-protocol-version"] !== "2025-11-25")
      ) {
        state.invalidProtocol++;
        res.writeHead(400).end();
        return;
      }
      const reply = (result: unknown) => {
        const message = rpc ? { jsonrpc: "2.0", id: rpc.id, result } : result;
        if (rpc?.method === "tools/call") {
          res.setHeader("Content-Type", "text/event-stream");
          res.end(`data: ${JSON.stringify(message)}\n\n`);
        } else res.end(JSON.stringify(message));
      };
      if (rpc?.method === "initialize") {
        res.setHeader("Mcp-Session-Id", "fixture-session");
        reply({ protocolVersion: "2025-11-25", capabilities: { tools: {} } });
        return;
      }
      if (rpc?.method === "notifications/initialized") {
        res.writeHead(202).end();
        return;
      }
      if (rpc?.method === "tools/list") {
        reply({
          tools: [
            {
              name: "write",
              inputSchema: shape(input),
              outputSchema: shape(output),
              annotations: { readOnlyHint: false },
            },
            {
              name: "lookup",
              inputSchema: shape(input),
              outputSchema: state.drift ? { type: "string" } : shape(proofOutput),
              annotations: { readOnlyHint: true },
            },
          ],
        });
        return;
      }
      const write = rpc ? rpc.params?.name === "write" : req.url?.endsWith("/write");
      const id = rpc
        ? rpc.params?.arguments?.id
        : write
          ? (JSON.parse(Buffer.concat(parts).toString()) as { id: string }).id
          : new URL(req.url!, "https://fixture.example.com").searchParams.get("id");
      if (!id) {
        res.writeHead(400).end();
        return;
      }
      const entries = JSON.parse(await readFile(ledger, "utf8")) as Record<string, string>;
      if (write) {
        entries[id] = "applied";
        state.writes++;
        await writeFile(ledger, JSON.stringify(entries));
        if (state.loseResponse) {
          req.socket.destroy();
          return;
        }
        reply(rpc ? { structuredContent: { name: "fixture" } } : { name: "fixture" });
        return;
      }
      state.reads++;
      await state.beforeRead();
      if (state.mode === "timeout") return;
      const data = {
        id: state.mode === "mismatch" ? "another-key" : id,
        count: state.mode === "absent" ? 0 : state.mode === "duplicate" ? 2 : entries[id] ? 1 : 0,
        complete: state.mode !== "partial",
        status: state.mode === "pending" ? "pending" : (entries[id] ?? "absent"),
      };
      if (state.mode === "invalid") {
        reply({ unexpected: "provider-secret" });
        return;
      }
      reply(rpc ? { structuredContent: data } : data);
    })().catch(() => {
      res.writeHead(500).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const local = new URL(`https://localhost:${(server.address() as AddressInfo).port}`);
  const http = new PublicExternalHttp({
    resolve: () => Promise.resolve([{ address: "8.8.8.8", family: 4 }]),
    send: (request) =>
      sendExternalHttps(
        { ...request, url: new URL(request.url.pathname + request.url.search, local) },
        { address: "127.0.0.1", family: 4 },
        cert,
      ),
  });
  const adapter = new PersonaExternalAdapters(http);
  return {
    contract,
    adapter,
    discovery: new PersonaExternalDiscovery(http),
    state,
    ledger,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true });
    },
  };
}
