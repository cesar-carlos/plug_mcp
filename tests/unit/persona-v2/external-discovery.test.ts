import { it, expect, vi } from "vitest";
import { PersonaExternalDiscovery } from "../../../src/infrastructure/persona-v2/external-discovery.js";
import { PersonaExternalAdapters } from "../../../src/infrastructure/persona-v2/external-adapters.js";
import { externalContractSchema } from "../../../src/domain/persona-v2/external-contract.js";
import { randomUUID } from "node:crypto";
import {
  PublicExternalHttp,
  type ExternalHttpRequest,
  type ExternalHttpResponse,
} from "../../../src/infrastructure/persona-v2/external-http.js";
import { externalProviderFixture } from "../../helpers/external-provider.js";
const connection = {
  destination: "https://fixture.example.com",
  credential: { credentialType: "bearer" as const, token: "isolated" },
};
const shape = { type: "object", properties: {}, additionalProperties: false };
function fixture(mode = "normal") {
  const methods: string[] = [];
  const send = vi.fn(async (input: ExternalHttpRequest): Promise<ExternalHttpResponse> => {
    const rpc = JSON.parse(input.body!) as {
      id?: string;
      method: string;
      params: { cursor?: string };
    };
    methods.push(rpc.method);
    if (rpc.method === "notifications/initialized") return { status: 202, headers: {}, body: "" };
    if (rpc.method === "tools/call")
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { structuredContent: {} } }),
      };
    const result =
      rpc.method === "initialize"
        ? { protocolVersion: "2025-11-25", capabilities: { tools: {} } }
        : {
            tools: [
              {
                name: mode === "duplicate" ? "same" : rpc.params.cursor ? "second" : "first",
                inputSchema: shape,
                outputSchema: shape,
                annotations: { readOnlyHint: true },
              },
            ],
            ...(!rpc.params.cursor || mode === "loop" ? { nextCursor: "page-2" } : {}),
          };
    return {
      status: 200,
      headers: { "content-type": "application/json", "mcp-session-id": "test-session" },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }),
    };
  });
  const network = { resolve: async () => [{ address: "8.8.8.8", family: 4 }], send };
  return {
    adapter: new PersonaExternalDiscovery(new PublicExternalHttp(network)),
    methods,
    send,
    network,
  };
}
it("lista páginas completas sem tools/call, com sessão e autorização em cada envio", async () => {
  const f = fixture(),
    check = vi.fn(() => Promise.resolve());
  const result = await f.adapter.discover(connection, AbortSignal.timeout(3000), check);
  expect(result.tools.map((t) => t.name)).toEqual(["first", "second"]);
  expect(f.methods).toEqual([
    "initialize",
    "notifications/initialized",
    "tools/list",
    "tools/list",
  ]);
  expect(check).toHaveBeenCalledTimes(4);
  expect(f.send.mock.calls[1]![0].headers).toMatchObject({
    "Mcp-Session-Id": "test-session",
    "MCP-Protocol-Version": "2025-11-25",
    Authorization: "Bearer isolated",
  });
});
it.each(["duplicate", "loop"])("recusa catálogo ambíguo ou cursor repetido: %s", async (mode) => {
  const f = fixture(mode);
  await expect(
    f.adapter.discover(connection, AbortSignal.timeout(3000), () => Promise.resolve()),
  ).rejects.toThrow();
  expect(f.methods).not.toContain("tools/call");
});
it("revogação e DNS privado impedem novo envio sem retry", async () => {
  const f = fixture();
  await expect(
    f.adapter.discover(connection, AbortSignal.timeout(3000), async () => {
      throw new Error("revoked");
    }),
  ).rejects.toThrow();
  expect(f.send).not.toHaveBeenCalled();
  const denied = new PersonaExternalDiscovery(
    new PublicExternalHttp({
      ...f.network,
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
    }),
  );
  await expect(
    denied.discover(connection, AbortSignal.timeout(3000), () => Promise.resolve()),
  ).rejects.toThrow();
  expect(f.send).not.toHaveBeenCalled();
});
it("TLS nativo descobre sem leituras de negócio ou efeitos", async () => {
  const provider = await externalProviderFixture("mcp_http");
  try {
    const result = await provider.discovery.discover(connection, AbortSignal.timeout(3000), () =>
      Promise.resolve(),
    );
    expect(result.tools.map((t) => t.name)).toEqual(["write", "lookup"]);
    expect(provider.state.writes).toBe(0);
    expect(provider.state.reads).toBe(0);
    expect(provider.state.invalidCredential).toBe(0);
    expect(provider.state.invalidProtocol).toBe(0);
  } finally {
    await provider.close();
  }
});
it("execução encontra ferramenta da segunda página e recusa duplicata antes da chamada", async () => {
  const f = fixture(),
    adapter = new PersonaExternalAdapters(new PublicExternalHttp(f.network));
  const contract = externalContractSchema.parse({
    operationId: randomUUID(),
    integrationId: randomUUID(),
    purpose: "Fixture",
    effect: "consulta",
    transport: { kind: "mcp_http", tool: "second", inputSchema: shape, outputSchema: shape },
    input: {},
    output: {},
    timeoutMs: 1000,
    maxResponseBytes: 4096,
  });
  expect(
    await adapter.invoke(connection, contract, {}, AbortSignal.timeout(3000), () =>
      Promise.resolve(),
    ),
  ).toEqual({});
  expect(f.methods.filter((m) => m === "tools/list")).toHaveLength(2);
  expect(f.methods.at(-1)).toBe("tools/call");
  const duplicate = fixture("duplicate");
  await expect(
    new PersonaExternalAdapters(new PublicExternalHttp(duplicate.network)).invoke(
      connection,
      contract,
      {},
      AbortSignal.timeout(3000),
      () => Promise.resolve(),
    ),
  ).rejects.toThrow();
  expect(duplicate.methods).not.toContain("tools/call");
});
