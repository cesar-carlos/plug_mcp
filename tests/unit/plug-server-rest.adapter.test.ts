import { describe, expect, it, vi } from "vitest";
import {
  PlugServerRestAdapter,
  normalizeSqlResult,
} from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import {
  AGENT_TIMEOUT_MS_LIMIT,
  hubBridgeWaitMs,
  hubHttpAbortMs,
  HubResponseError,
  HubTransportError,
} from "../../src/infrastructure/plug-server/hub-http.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";
import { queryTransportContext } from "../../src/application/persona-v2/query-transport-context.js";
import { reportPersonaV2ToolError } from "../../src/infrastructure/mcp/persona-v2-tool-error.js";
import { PinoLoggerAdapter } from "../../src/infrastructure/logging/pino-logger.adapter.js";
import pino from "pino";

it.each(["queue", "connection", "response"] as const)(
  "correlaciona falha %s pelo supportId sem conteúdo privado",
  async (phase) => {
    const http = vi.fn<typeof fetch>(async () => {
      throw new HubTransportError(phase, "timeout");
    });
    const adapter = new PlugServerRestAdapter(
      "https://private-fixture.test",
      new SilentTestLogger(),
      http,
    );
    const error = await adapter
      .executeSql({
        accessToken: "private-marker",
        clientToken: "private-marker",
        agentId: "private-marker",
        sql: "private-marker",
      })
      .catch((failure: unknown) => failure);
    let output = "";
    const logger = new PinoLoggerAdapter(
      pino(
        {},
        {
          write: (line) => {
            output += line;
          },
        },
      ),
    );
    const response = reportPersonaV2ToolError(error, logger);
    expect(JSON.parse(output)).toMatchObject({
      supportId: response.supportId,
      stage: `sql.execute.${phase}`,
      details: { transportReason: "timeout" },
    });
    expect(output).not.toContain("private");
    expect(http).toHaveBeenCalledTimes(1);
  },
);

it("propaga o mesmo cancelamento da consulta ao HTTP sem renovar o orçamento", async () => {
  const controller = new AbortController();
  const http = vi.fn<typeof fetch>(async (_url, init) => {
    expect(init?.signal?.aborted).toBe(false);
    controller.abort();
    expect(init?.signal?.aborted).toBe(true);
    throw new DOMException("synthetic", "AbortError");
  });
  const adapter = new PlugServerRestAdapter("https://fixture.test", new SilentTestLogger(), http);
  await expect(
    queryTransportContext.run({ personaId: "fixture", signal: controller.signal }, () =>
      adapter.login("fixture", "fixture"),
    ),
  ).rejects.toBeDefined();
  expect(http).toHaveBeenCalledTimes(1);
});

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

it.each(["wrong-id", "batch", "false-success", "conflict", "missing-id", "invalid-version"])(
  "recusa envelope RPC inconsistente (%s) sem entregar linhas nem repetir",
  async (variant) => {
    const http = vi.fn<typeof fetch>(async (_url, init) => {
      const input = asRecord(JSON.parse(String(init?.body)));
      const id = asRecord(input?.command)?.id;
      return Response.json({
        response: {
          type: variant === "batch" ? "batch" : "single",
          success: variant !== "false-success",
          item: {
            ...(variant === "missing-id" ? {} : { id: variant === "wrong-id" ? "other" : id }),
            success: variant !== "false-success",
            ...(variant === "invalid-version" ? { jsonrpc: "1.0" } : {}),
            result: { columns: ["value"], rows: [{ value: "private-synthetic" }] },
            ...(variant === "conflict"
              ? { error: { code: -32602, message: "private-synthetic" } }
              : {}),
          },
        },
      });
    });
    const adapter = new PlugServerRestAdapter("https://fixture.test", new SilentTestLogger(), http);
    const result = adapter.executeSql({
      accessToken: "fixture",
      clientToken: "fixture",
      agentId: "fixture",
      sql: "SELECT 1",
    });
    await expect(result).rejects.toMatchObject({
      code: "PLUG_SERVER_ERROR",
      retryable: false,
      stage: "sql.execute",
    });
    await expect(result).rejects.not.toThrow("private-synthetic");
    expect(http).toHaveBeenCalledTimes(1);
  },
);

it("aceita envelope normalizado correlacionado, inclusive resultado vazio", async () => {
  const adapter = new PlugServerRestAdapter(
    "https://fixture.test",
    new SilentTestLogger(),
    async (_url, init) => {
      const input = asRecord(JSON.parse(String(init?.body)));
      return Response.json({
        response: {
          type: "single",
          success: true,
          item: {
            id: asRecord(input?.command)?.id,
            success: true,
            result: { columns: ["value"], rows: [] },
          },
        },
      });
    },
  );
  await expect(
    adapter.executeSql({
      accessToken: "fixture",
      clientToken: "fixture",
      agentId: "fixture",
      sql: "SELECT 1",
    }),
  ).resolves.toMatchObject({ columns: ["value"], rows: [] });
});

it.each(["root", "response", "data"])(
  "preserva erro RPC no envelope compatível %s",
  async (shape) => {
    const error = { error: { code: -32602, message: "private-synthetic" } };
    const http = vi.fn(async () => Response.json(shape === "root" ? error : { [shape]: error }));
    const adapter = new PlugServerRestAdapter("https://fixture.test", new SilentTestLogger(), http);
    await expect(
      adapter.getClientTokenPolicy({
        accessToken: "fixture",
        clientToken: "fixture",
        agentId: "fixture",
      }),
    ).rejects.toMatchObject({ code: "PLUG_SERVER_ERROR", stage: "getPolicy", retryable: false });
    expect(http).toHaveBeenCalledTimes(1);
  },
);

it.each([
  {},
  { agentId: "other", hasClientToken: true, isHubConnected: true },
  { agentId: "fixture-agent" },
])("não aprova resposta de acesso vazia, incompleta ou de outro agente", async (agent) => {
  const http = vi.fn(async () => Response.json({ agent }));
  const adapter = new PlugServerRestAdapter("https://fixture.test", new SilentTestLogger(), http);
  await expect(adapter.getAgentAccessStatus("fixture", "fixture-agent")).rejects.toMatchObject({
    code: "PLUG_SERVER_ERROR",
    retryable: false,
  });
  expect(http).toHaveBeenCalledTimes(1);
});

it("limite de transporte não sugere reconexão nem retry", async () => {
  const fetcher = vi.fn().mockRejectedValue(new HubResponseError());
  const adapter = new PlugServerRestAdapter("http://fixture.test", new SilentTestLogger(), fetcher);
  await expect(adapter.login("fixture", "fixture")).rejects.toMatchObject({
    code: "PLUG_SERVER_ERROR",
    retryable: false,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(["<html>synthetic-private-value</html>", "{}", '{"response":{"item":{"result":{}}}}'])(
  "recusa sucesso SQL sem resultado válido, sem devolver conteúdo privado: %s",
  async (body) => {
    const fetcher = vi.fn(async () => new Response(body));
    const adapter = new PlugServerRestAdapter(
      "http://fixture.test",
      new SilentTestLogger(),
      fetcher,
    );
    const promise = adapter.executeSql({
      accessToken: "fixture",
      clientToken: "fixture",
      agentId: "fixture",
      sql: "SELECT 1",
    });
    await expect(promise).rejects.toMatchObject({
      code: "PLUG_SERVER_ERROR",
      source: "plug_server_http",
      stage: "sql.execute",
      retryable: false,
    });
    await expect(promise).rejects.not.toThrow("synthetic-private-value");
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it.each(["invalid JSON", "{}"])(
  "login com resposta inválida não pede reconexão: %s",
  async (body) => {
    const fetcher = vi.fn(async () => new Response(body));
    const adapter = new PlugServerRestAdapter(
      "http://fixture.test",
      new SilentTestLogger(),
      fetcher,
    );
    await expect(adapter.login("fixture", "fixture")).rejects.toMatchObject({
      code: "PLUG_SERVER_ERROR",
      retryable: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it("preserva erro HTTP 503 com corpo HTML sem classificar como expiração", async () => {
  const adapter = new PlugServerRestAdapter(
    "http://fixture.test",
    new SilentTestLogger(),
    async () => new Response("private", { status: 503 }),
  );
  await expect(adapter.login("fixture", "fixture")).rejects.toMatchObject({
    code: "AGENT_UNAVAILABLE",
    source: "plug_server_http",
  });
});

it.each(["approved", "pending", "rejected", "revoked", "expired"])(
  "não restaura acesso negado pelo histórico %s",
  async (status) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "AGENT_ACCESS_DENIED" }), { status: 403 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ requests: [{ agentId: "fixture-agent", status }] }), {
          status: 200,
        }),
      );
    const adapter = new PlugServerRestAdapter(
      "http://hub.fixture.test",
      new SilentTestLogger(),
      fetcher,
    );
    const result = await adapter.getAgentAccessStatus("fixture-jwt", "fixture-agent");
    expect(result.state).toBe(status === "approved" ? "unknown" : status);
    expect(result.hasClientToken).toBe(false);
    expect(result.sourceIdentity).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);

it("preserva tipo ODBC do wire do agente sem inferir base64 textual como binário", () => {
  const result = normalizeSqlResult({
    columns: ["file"],
    rows: [{ file: "YQ==" }],
    column_metadata: [{ name: "file", odbc_type: -4 }],
  });
  expect(result.columnsMetadata).toEqual([{ name: "file", odbcType: -4 }]);
  expect(result.rows).toEqual([{ file: "YQ==" }]);
  expect(
    normalizeSqlResult({
      rows: [{ file: "YQ==" }],
      column_metadata: [{ name: "file", odbc_type: 7, type_system: "odbc_fast" }],
    }).columnsMetadata,
  ).toEqual([{ name: "file", odbcType: 7, typeSystem: "odbc_fast" }]);
  expect(
    () =>
      normalizeSqlResult({
        rows: [{ file: "YQ==" }],
        column_metadata: [{ name: "file", odbc_type: -4, type_system: 7 }],
      }).columnsMetadata,
  ).toThrow(expect.objectContaining({ code: "PLUG_SERVER_ERROR" }));
  expect(
    () =>
      normalizeSqlResult({
        columns: ["file"],
        rows: [{ file: "YQ==" }],
        column_metadata: [{ name: "file", odbc_type: "-4" }],
      }).columnsMetadata,
  ).toThrow(expect.objectContaining({ code: "PLUG_SERVER_ERROR" }));
});

it.each([
  null,
  "bad",
  [null],
  [{}],
  [
    { name: "file", type: "bytea" },
    { name: "FILE", type: "text" },
  ],
])("não descarta metadados inválidos/duplicados: %j", (column_metadata) => {
  expect(() => normalizeSqlResult({ rows: [{ file: "fixture" }], column_metadata })).toThrow(
    expect.objectContaining({ code: "PLUG_SERVER_ERROR" }),
  );
});

const commandOptions = (body: unknown): Record<string, unknown> => {
  const root = asRecord(body);
  const command = asRecord(root?.command);
  const params = asRecord(command?.params);
  return asRecord(params?.options) ?? {};
};

const okSqlResponse = (): Response =>
  new Response(
    JSON.stringify({
      response: {
        item: {
          result: { columns: ["id"], rows: [{ id: 1 }] },
        },
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

it.each([1, 2, null])("não presume suporte estrutural para capability %s", async (version) => {
  const adapter = new PlugServerRestAdapter(
    "http://hub.fixture.test",
    new SilentTestLogger(),
    async () =>
      new Response(
        JSON.stringify({
          data: {
            agent: {
              agentId: "fixture-agent",
              sourceIdentity: 1,
              sourceSchema: version,
              sourceConstraints: version,
              sqlOperations: {
                version: 1,
                structureGuard: version,
                maxSteps: 32,
                maxAffectedRows: 100000,
                timeoutMs: 300000,
              },
              hasClientToken: true,
              isHubConnected: true,
            },
          },
        }),
        { status: 200 },
      ),
  );
  const result = await adapter.getAgentAccessStatus("fixture-jwt", "fixture-agent");
  expect(result.sourceSchema).toBe(version === 1 ? 1 : null);
  expect(result.sourceConstraints).toBe(version === 1 ? 1 : null);
  expect(result.sqlOperations?.structureGuard).toBe(version === 1 ? 1 : undefined);
});

const captureExecuteSql = async (
  options?: {
    maxRows?: number;
    timeoutMs?: number;
    page?: number;
    pageSize?: number;
    requestServerTimings?: boolean;
  },
  httpTimeoutMs = 35_000,
): Promise<{ envelope: Record<string, unknown>; abortMs: number[]; fetchCalls: number }> => {
  let captured: unknown;
  const abortMs: number[] = [];
  let fetchCalls = 0;
  const origTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    abortMs.push(ms);
    return origTimeout(ms);
  });
  const fetchImpl: typeof fetch = async (_url, init) => {
    fetchCalls += 1;
    captured = JSON.parse(String(init?.body ?? "{}"));
    return okSqlResponse();
  };
  const adapter = new PlugServerRestAdapter(
    "http://hub.test",
    new SilentTestLogger(),
    fetchImpl,
    httpTimeoutMs,
  );
  try {
    await adapter.executeSql({
      accessToken: "tok",
      agentId: "11111111-1111-4111-8111-111111111111",
      clientToken: "client",
      sql: "SELECT p.codprod AS codigo FROM produto p ORDER BY p.codprod",
      options,
    });
  } finally {
    timeoutSpy.mockRestore();
  }
  return { envelope: asRecord(captured) ?? {}, abortMs, fetchCalls };
};

describe("PlugServerRestAdapter.executeSql", () => {
  it("preserva truncated=false explícito e não inventa completude quando ausente", () => {
    expect(
      normalizeSqlResult({ result: { columns: ["id"], rows: [], truncated: false } }).truncated,
    ).toBe(false);
    expect(normalizeSqlResult({ result: { columns: ["id"], rows: [] } }).truncated).toBeUndefined();
  });
  it("encaminha database explícito da fonte sem alterar SQL nem parâmetros", async () => {
    let captured: Record<string, unknown> = {};
    const adapter = new PlugServerRestAdapter(
      "http://hub.test",
      new SilentTestLogger(),
      async (_url, init) => {
        captured = JSON.parse(String(init?.body));
        return okSqlResponse();
      },
    );
    await adapter.executeSql({
      accessToken: "jwt",
      agentId: "agent",
      clientToken: "source",
      database: "base-a",
      sql: "SELECT id FROM orders WHERE id > :minimum",
      params: { minimum: 0 },
    });
    expect(asRecord(asRecord(captured.command)?.params)).toMatchObject({
      database: "base-a",
      sql: "SELECT id FROM orders WHERE id > :minimum",
      params: { minimum: 0 },
    });
  });
  it("envia execution_mode preserve quando não há paginação", async () => {
    const { envelope } = await captureExecuteSql({ maxRows: 50 });
    const options = commandOptions(envelope);
    expect(options.execution_mode).toBe("preserve");
    expect(options.page).toBeUndefined();
    expect(options.page_size).toBeUndefined();
    expect(options.max_rows).toBe(50);
    expect(envelope.timeoutMs).toBe(30_000);
  });

  it("omite execution_mode e envia page/page_size quando pagina", async () => {
    const { envelope } = await captureExecuteSql({ maxRows: 20, page: 2, pageSize: 10 });
    const options = commandOptions(envelope);
    expect(options.execution_mode).toBeUndefined();
    expect(options.page).toBe(2);
    expect(options.page_size).toBe(10);
    expect(options.max_rows).toBe(20);
  });

  it("não pagina (e preserva SQL) se page vier sem page_size", async () => {
    const { envelope } = await captureExecuteSql({ page: 2 });
    const options = commandOptions(envelope);
    expect(options.execution_mode).toBe("preserve");
    expect(options.page).toBeUndefined();
    expect(options.page_size).toBeUndefined();
  });

  it("alinha timeoutMs do bridge e AbortSignal ao wait do hub (não corta em 35s)", async () => {
    const skillTimeoutMs = 60_000;
    const { envelope, abortMs } = await captureExecuteSql({
      maxRows: 50,
      timeoutMs: skillTimeoutMs,
    });
    const options = commandOptions(envelope);
    const bridgeWait = hubBridgeWaitMs(skillTimeoutMs);
    expect(envelope.timeoutMs).toBe(bridgeWait);
    expect(options.timeout_ms).toBe(skillTimeoutMs);
    expect(abortMs[0]).toBe(hubHttpAbortMs(35_000, bridgeWait));
    expect(abortMs[0]).toBeGreaterThan(35_000);
  });

  it("restringe timeout_ms ao teto do agente (300s) sem retry de SQL", async () => {
    const { envelope, abortMs, fetchCalls } = await captureExecuteSql({ timeoutMs: 400_000 });
    const options = commandOptions(envelope);
    expect(options.timeout_ms).toBe(AGENT_TIMEOUT_MS_LIMIT);
    expect(envelope.timeoutMs).toBe(hubBridgeWaitMs(AGENT_TIMEOUT_MS_LIMIT));
    expect(abortMs[0]).toBe(hubHttpAbortMs(35_000, hubBridgeWaitMs(AGENT_TIMEOUT_MS_LIMIT)));
    expect(fetchCalls).toBe(1);
  });

  it("solicita serverTimings somente quando o chamador opta", async () => {
    const sampled = await captureExecuteSql({ requestServerTimings: true });
    expect(sampled.envelope.requestServerTimings).toBe(true);
    const omitted = await captureExecuteSql();
    expect(omitted.envelope.requestServerTimings).toBeUndefined();
  });
});

describe("PlugServerRestAdapter HTTP pools", () => {
  const okLoginResponse = (): Response =>
    new Response(JSON.stringify({ data: { accessToken: "jwt", refreshToken: "rt" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const okPolicyResponse = (): Response =>
    new Response(
      JSON.stringify({
        response: { item: { result: { allTables: false, tables: ["produto"] } } },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  it("login/refresh/getPolicy usam o pool auth; sql.execute usa o pool sql", async () => {
    const authPaths: string[] = [];
    const sqlPaths: string[] = [];
    const authFetch: typeof fetch = async (input, init) => {
      authPaths.push(String(input));
      const headers = new Headers(init?.headers);
      expect(headers.get("cookie")).toBeNull();
      if (String(input).includes("client-auth")) {
        expect(headers.has("authorization")).toBe(false);
        return okLoginResponse();
      }
      expect(headers.get("authorization")).toBe("Bearer jwt");
      return okPolicyResponse();
    };
    const sqlFetch: typeof fetch = async (input, init) => {
      sqlPaths.push(String(input));
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer tok");
      expect(headers.get("cookie")).toBeNull();
      return okSqlResponse();
    };
    const adapter = new PlugServerRestAdapter("http://hub.test", new SilentTestLogger(), {
      sql: sqlFetch,
      auth: authFetch,
    });
    await adapter.login("a@b.c", "secret");
    await adapter.refresh("rt");
    await adapter.getClientTokenPolicy({
      accessToken: "jwt",
      agentId: "11111111-1111-4111-8111-111111111111",
      clientToken: "client",
    });
    await adapter.executeSql({
      accessToken: "tok",
      agentId: "11111111-1111-4111-8111-111111111111",
      clientToken: "client",
      sql: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :id",
    });
    expect(authPaths).toEqual([
      "http://hub.test/api/v1/client-auth/login",
      "http://hub.test/api/v1/client-auth/refresh",
      "http://hub.test/api/v1/agents/commands",
    ]);
    expect(sqlPaths).toEqual(["http://hub.test/api/v1/agents/commands"]);
  });
});

describe("normalizeSqlResult", () => {
  it.each([
    { columns: ["id", "id"], rows: [[1, 2]] },
    { columns: ["id"], rows: [[1, 2]] },
    { columns: ["id", "name"], rows: [[1]] },
    { columns: [123], rows: [[1]] },
    { columns: ["id"], rows: [null] },
    { columns: ["id"], rows: [42] },
    { columns: ["id"], rows: "bad", data: [{ id: 1 }] },
    { columns: ["id"], rows: [], truncated: "false" },
    { columns: ["id"], rows: [], effective_max_rows: 1.5 },
    { columns: ["id"], rows: [], effective_max_rows: 0 },
    { columns: ["id"], rows: [], effective_max_rows: 10, meta: { effective_max_rows: 20 } },
  ])("recusa perda silenciosa de valores ou metadados inválidos: %j", (result) => {
    expect(() => normalizeSqlResult(result)).toThrow(
      expect.objectContaining({ code: "PLUG_SERVER_ERROR", retryable: false }),
    );
  });

  it("preserva rows vazio sem adotar dados alternativos e aceita data sem rows", () => {
    expect(normalizeSqlResult({ columns: ["id"], rows: [], data: [{ id: 99 }] }).rows).toEqual([]);
    expect(normalizeSqlResult({ columns: ["id"], data: [[7]] }).rows).toEqual([{ id: 7 }]);
  });

  it("materializa __proto__ como coluna própria sem alterar protótipo", () => {
    const result = normalizeSqlResult({ columns: ["__proto__", "id"], rows: [["fixture", 1]] });
    const row = result.rows[0]!;
    expect(Object.hasOwn(row, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(row, "__proto__")).toMatchObject({ value: "fixture" });
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
  });

  it.each([
    null,
    {},
    { page: 1, page_size: 5, has_next_page: false },
    { page: 1, page_size: 5, has_next_page: false, has_previous_page: true },
    {
      page: Number.MAX_SAFE_INTEGER + 1,
      page_size: 5,
      has_next_page: false,
      has_previous_page: true,
    },
  ])("não descarta paginação inválida para aparentar completude: %j", (pagination) => {
    expect(() =>
      normalizeSqlResult({ columns: ["id"], rows: [], truncated: false, pagination }),
    ).toThrow(expect.objectContaining({ code: "PLUG_SERVER_ERROR" }));
  });
  it("mapeia pagination.has_next_page e truncated do hub", () => {
    const result = normalizeSqlResult({
      response: {
        item: {
          result: {
            columns: ["id"],
            rows: [{ id: 1 }],
            truncated: true,
            pagination: {
              page: 2,
              page_size: 10,
              returned_rows: 10,
              has_next_page: true,
              has_previous_page: true,
            },
          },
        },
      },
    });
    expect(result.truncated).toBe(true);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 10,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it("mapeia column_metadata e zero linhas", () => {
    const empty = normalizeSqlResult({
      response: {
        item: {
          result: {
            columns: ["id"],
            rows: [],
            column_metadata: [{ name: "id", type: "int", nullable: false }],
          },
        },
      },
    });
    expect(empty.rows).toEqual([]);
    expect(empty.columns).toEqual(["id"]);
    expect(empty.columnsMetadata).toEqual([{ name: "id", type: "int", nullable: false }]);
  });

  it("mantém column_metadata só com name", () => {
    const named = normalizeSqlResult({
      response: {
        item: {
          result: {
            columns: ["SaldoReceber"],
            rows: [{ SaldoReceber: 1 }],
            column_metadata: [{ name: "SaldoReceber" }],
          },
        },
      },
    });
    expect(named.columnsMetadata).toEqual([{ name: "SaldoReceber" }]);
  });

  it("normaliza timings e metadados de execução do hub", () => {
    const result = normalizeSqlResult({
      serverTimings: { phasesMs: { total: 12, agent: 7 } },
      response: {
        item: {
          result: {
            columns: ["id"],
            rows: [{ id: 1 }],
            sql_handling_mode: "preserve",
            max_rows_handling: "response_truncation",
            effective_max_rows: 100,
          },
        },
      },
    });
    expect(result.serverTimings).toEqual({ total: 12, agent: 7 });
    expect(result.sqlHandlingMode).toBe("preserve");
    expect(result.maxRowsHandling).toBe("response_truncation");
    expect(result.effectiveMaxRows).toBe(100);
  });
});

describe("PlugServerRestAdapter network errors", () => {
  it("mapeia ECONNREFUSED para PLUG_SERVER_ERROR, não erro cru", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:9"), {
          code: "ECONNREFUSED",
        }),
      });
    };
    const adapter = new PlugServerRestAdapter("http://hub.test", new SilentTestLogger(), fetchImpl);
    await expect(
      adapter.executeSql({
        accessToken: "tok",
        agentId: "11111111-1111-4111-8111-111111111111",
        clientToken: "client",
        sql: "SELECT 1 FROM produto",
      }),
    ).rejects.toMatchObject({
      code: "PLUG_SERVER_ERROR",
      source: "plug_server_http",
      retryable: true,
      stage: "sql.execute",
    });
  });
});

it("inspeção conserva etapa e distingue timeout do bridge de recusa de acesso", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        code: "SERVICE_UNAVAILABLE",
        message: "Timed out waiting for agent response",
      }),
      { status: 503 },
    ),
  );
  const adapter = new PlugServerRestAdapter(
    "http://hub.fixture.test",
    new SilentTestLogger(),
    fetcher,
  );
  await expect(
    adapter.describeSchema({
      accessToken: "fixture",
      agentId: "fixture",
      clientToken: "fixture",
      database: "fixture",
      expectedSource: { version: 1, dialect: "mssql", identityHash: "a".repeat(64) },
      inspection: {
        resources: [{ schema: "dbo", name: "orders", type: "table" }],
        offset: 0,
        pageSize: 1,
      },
    }),
  ).rejects.toMatchObject({
    code: "PLUG_SERVER_TIMEOUT",
    stage: "sql.describeSchema",
    retryable: false,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
