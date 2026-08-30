import { describe, expect, it } from "vitest";
import { testConfig } from "../../src/config/env.js";
import type { LoggerPort } from "../../src/domain/ports/logger.port.js";
import { MemoryRateLimitStore } from "../../src/infrastructure/http/rate-limit.js";
import { createToolRunner, jsonResult } from "../../src/infrastructure/mcp/tool-result.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";

const logger: LoggerPort = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: function child() {
    return this;
  },
};

describe("rate limit por tool", () => {
  it("estoura teto de consultar_dados sem afetar listar_acessos", async () => {
    const store = new MemoryRateLimitStore();
    const config = testConfig({
      MCP_QUERY_TOOL_RATE_LIMIT_MAX: 1,
      MCP_TOOL_RATE_LIMIT_MAX: 10,
    });
    const run = createToolRunner(config, logger, { rateLimit: store, clientIp: () => "1.1.1.1" });
    const first = await run("consultar_dados", async () => ({
      columns: ["ok"],
      rows: [{ ok: 1 }],
    }));
    expect(first.isError).toBeUndefined();
    const second = await run("consultar_dados", async () => ({ ok: true }));
    expect(second.isError).toBe(true);
    const payload = JSON.parse(second.content[0]!.text) as {
      error: { code: string; source?: string; stage?: string };
    };
    expect(payload.error.code).toBe(ERROR_CODES.RATE_LIMITED);
    expect(payload.error.source).toBe("mcp");
    expect(payload.error.stage).toBe("rate_limit");
    const list = await run("listar_acessos", async () => ({ acessos: [] }));
    expect(list.isError).toBeUndefined();
  });

  it("jsonResult preenche structuredContent tabular", () => {
    const result = jsonResult({
      columns: ["codigo"],
      rows: [{ codigo: 1 }],
      truncated: true,
      maxRowsApplied: 1,
    });
    expect(result.structuredContent).toMatchObject({
      columns: ["codigo"],
      rows: [{ codigo: 1 }],
      truncated: true,
      maxRowsApplied: 1,
    });
  });
});
