import { expect, it } from "vitest";
import { mapPlugServerFailure } from "../../src/infrastructure/plug-server/map-plug-error.js";

it.each([405, 408, 500, 502, 504])(
  "HTTP %s sem RPC reconhecido não vira falha SQL ou policy por texto",
  (status) => {
    for (const body of [
      { message: "permission denied: private-gateway" },
      { message: "SQL syntax error near private-table" },
      { error: { code: -32009, message: "syntax error near private-table" } },
      {
        error: {
          code: -32999,
          message: "private-body",
          data: { category: "sql", technical_message: "private-sql" },
        },
      },
    ]) {
      const result = mapPlugServerFailure({ status, body });
      expect(result).toMatchObject({ code: "PLUG_SERVER_ERROR", source: "plug_server_http" });
      expect(result.details).toMatchObject({ httpStatus: status });
      expect(JSON.stringify(result)).not.toContain("private-");
      expect(result.nextAction).toBeUndefined();
      expect(result.retryable).toBe(false);
    }
  },
);

it("RPC SQL explícito conserva precedência sobre HTTP 502", () => {
  const result = mapPlugServerFailure({
    status: 502,
    body: {
      error: {
        code: -32102,
        message: "SQL execution failed",
        data: { technical_message: "syntax error" },
      },
    },
  });
  expect(result).toMatchObject({ code: "INVALID_SQL", source: "sql_engine" });
});

it("HTTP 200 preserva compatibilidade com diagnóstico legado SQL sem RPC", () => {
  expect(mapPlugServerFailure({ status: 200, body: { message: "syntax error" } }).source).toBe(
    "sql_engine",
  );
});
