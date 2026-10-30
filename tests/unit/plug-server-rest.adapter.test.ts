import { describe, expect, it, vi } from "vitest";
import {
  PlugServerRestAdapter,
  normalizeSqlResult,
} from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import {
  AGENT_TIMEOUT_MS_LIMIT,
  hubBridgeWaitMs,
  hubHttpAbortMs,
} from "../../src/infrastructure/plug-server/hub-http.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

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
    normalizeSqlResult({
      rows: [{ file: "YQ==" }],
      column_metadata: [{ name: "file", odbc_type: -4, type_system: 7 }],
    }).columnsMetadata,
  ).toEqual([{ name: "file", odbcType: -4, typeSystem: "unknown" }]);
  expect(
    normalizeSqlResult({
      columns: ["file"],
      rows: [{ file: "YQ==" }],
      column_metadata: [{ name: "file", odbc_type: "-4" }],
    }).columnsMetadata,
  ).toEqual([{ name: "file" }]);
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
