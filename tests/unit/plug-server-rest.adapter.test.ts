import { describe, expect, it } from "vitest";
import {
  PlugServerRestAdapter,
  normalizeSqlResult,
} from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

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

const captureExecuteSql = async (options?: {
  maxRows?: number;
  timeoutMs?: number;
  page?: number;
  pageSize?: number;
}): Promise<Record<string, unknown>> => {
  let captured: unknown;
  const fetchImpl: typeof fetch = async (_url, init) => {
    captured = JSON.parse(String(init?.body ?? "{}"));
    return okSqlResponse();
  };
  const adapter = new PlugServerRestAdapter("http://hub.test", new SilentTestLogger(), fetchImpl);
  await adapter.executeSql({
    accessToken: "tok",
    agentId: "11111111-1111-4111-8111-111111111111",
    clientToken: "client",
    sql: "SELECT p.codprod AS codigo FROM produto p ORDER BY p.codprod",
    options,
  });
  return commandOptions(captured);
};

describe("PlugServerRestAdapter.executeSql", () => {
  it("envia execution_mode preserve quando não há paginação", async () => {
    const options = await captureExecuteSql({ maxRows: 50 });
    expect(options.execution_mode).toBe("preserve");
    expect(options.page).toBeUndefined();
    expect(options.page_size).toBeUndefined();
    expect(options.max_rows).toBe(50);
  });

  it("omite execution_mode e envia page/page_size quando pagina", async () => {
    const options = await captureExecuteSql({ maxRows: 20, page: 2, pageSize: 10 });
    expect(options.execution_mode).toBeUndefined();
    expect(options.page).toBe(2);
    expect(options.page_size).toBe(10);
    expect(options.max_rows).toBe(20);
  });

  it("não pagina (e preserva SQL) se page vier sem page_size", async () => {
    const options = await captureExecuteSql({ page: 2 });
    expect(options.execution_mode).toBe("preserve");
    expect(options.page).toBeUndefined();
    expect(options.page_size).toBeUndefined();
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
});
