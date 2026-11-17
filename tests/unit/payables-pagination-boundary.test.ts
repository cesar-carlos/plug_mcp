import { expect, it, vi } from "vitest";
import { tryParseSelect } from "../../src/application/use-cases/shared/sql-ast.js";
import { PlugServerRestAdapter } from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";
import { safeErrorDetails } from "../../src/domain/errors/safe-error-details.js";

// Synthetic schema and parameters: never persist the user's operational query.
const sql =
  "SELECT t.CompanyId AS company, t.BranchId AS branch, t.TitleId AS title, s.Name AS supplier, t.DueDate AS due, t.Status AS status, t.Balance AS balance FROM fixture_titles t LEFT JOIN fixture_suppliers s ON s.SupplierId=t.SupplierId WHERE t.Status IN ('A','P') AND t.Balance>0 AND t.CompanyId=:company AND t.BranchId=:branch ORDER BY due ASC, title ASC";
it.each([1, 2])(
  "MSSQL list preserves mixed-case projection, LEFT JOIN and named parameters on page %i",
  async (page) => {
    const ast = tryParseSelect(sql, "mssql");
    expect(ast).not.toBeNull();
    expect(ast!.colunas.map((c) => c.alias)).toEqual([
      "company",
      "branch",
      "title",
      "supplier",
      "due",
      "status",
      "balance",
    ]);
    expect(ast!.orderByRefs.map((r) => r.column.toLowerCase())).toEqual(["due", "title"]);
    const http = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.command.params.sql).toBe(sql);
      expect(body.command.params.params).toEqual({ company: 71, branch: 93 });
      expect(body.command.params.options).toMatchObject({ page, page_size: 30 });
      expect(body.command.params.options).not.toHaveProperty("execution_mode");
      return Response.json({
        response: {
          type: "single",
          success: true,
          item: {
            id: body.command.id,
            success: true,
            result: { columns: ["title"], rows: [], truncated: false },
          },
        },
      });
    });
    const adapter = new PlugServerRestAdapter("https://fixture.test", new SilentTestLogger(), http);
    await adapter.executeSql({
      accessToken: "synthetic",
      clientToken: "synthetic",
      agentId: "fixture",
      sql,
      params: { company: 71, branch: 93 },
      options: { page, pageSize: 30 },
    });
    expect(http).toHaveBeenCalledTimes(1);
  },
);
it("unclassified engine refusal stays visible and never triggers a second SELECT", async () => {
  const http = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({
      response: {
        type: "single",
        success: false,
        item: {
          id: body.command.id,
          success: false,
          error: { code: -32102, message: "synthetic opaque execution failure" },
        },
      },
    });
  });
  const adapter = new PlugServerRestAdapter("https://fixture.test", new SilentTestLogger(), http);
  const error = await adapter
    .executeSql({
      accessToken: "synthetic",
      clientToken: "synthetic",
      agentId: "fixture",
      sql,
      params: { company: 71, branch: 93 },
      options: { page: 1, pageSize: 30 },
    })
    .catch((e: unknown) => e);
  expect(error).toMatchObject({ code: "INVALID_SQL", source: "sql_engine", retryable: false });
  expect(safeErrorDetails((error as { details: unknown }).details)).toMatchObject({
    sqlReason: "unclassified_engine_error",
    rpcCode: -32102,
  });
  expect(http).toHaveBeenCalledTimes(1);
});
