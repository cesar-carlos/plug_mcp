import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { testConfig } from "../../src/config/env.js";
import {
  createToolRunner,
  errorResult,
  jsonResult,
} from "../../src/infrastructure/mcp/tool-result.js";
import {
  mapPlugServerAbort,
  isAbortError,
} from "../../src/infrastructure/plug-server/map-plug-error.js";

describe("tool-result", () => {
  it("jsonResult serializa sem indentação", () => {
    const result = jsonResult({ success: true, n: 1 });
    expect(result.content[0]?.text).toBe('{"success":true,"n":1}');
  });

  it("INTERNAL_ERROR usa mensagem genérica e registra o erro real", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
    const run = createToolRunner(testConfig(), logger);
    const result = await run("consultar_dados", async () => {
      throw new Error("invalid encrypted payload");
    });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text) as {
      error: { code: string; message: string };
    };
    expect(payload.error.code).toBe("INTERNAL_ERROR");
    expect(payload.error.message).toBe("Erro interno.");
    expect(payload.error.message).not.toContain("encrypted");
    expect(logger.error).toHaveBeenCalled();
    const fields = logger.error.mock.calls[0]?.[1] as { tool?: string; error?: string };
    expect(fields.tool).toBe("consultar_dados");
    expect(fields.error).toContain("invalid encrypted payload");
  });

  it("DomainError não é logado como inesperado", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
    const result = errorResult(
      new DomainError({
        code: "VALIDATION_ERROR",
        message: "sql é obrigatório.",
        hint: "Obtenha sql_base",
      }),
      testConfig(),
      logger,
      "consultar_dados",
    );
    expect(logger.error).not.toHaveBeenCalled();
    const payload = JSON.parse(result.content[0]!.text) as { error: { code: string } };
    expect(payload.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("mapPlugServerAbort", () => {
  it("mapeia AbortError para PLUG_SERVER_TIMEOUT retryable", () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(isAbortError(abort)).toBe(true);
    const err = mapPlugServerAbort();
    expect(err.code).toBe("PLUG_SERVER_TIMEOUT");
    expect(err.retryable).toBe(true);
  });
});
