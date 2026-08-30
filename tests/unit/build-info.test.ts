import { describe, expect, it } from "vitest";
import { buildInfo } from "../../src/config/build-info.js";

describe("buildInfo sha", () => {
  it("usa GIT_SHA do ambiente", () => {
    const previous = process.env.GIT_SHA;
    process.env.GIT_SHA = "abc123def";
    expect(buildInfo().sha).toBe("abc123def");
    if (previous === undefined) {
      delete process.env.GIT_SHA;
    } else {
      process.env.GIT_SHA = previous;
    }
  });

  it("lê a versão do package.json na ausência de MCP_VERSION", () => {
    const previous = process.env.MCP_VERSION;
    delete process.env.MCP_VERSION;
    expect(buildInfo().version).toBe("0.2.0");
    if (previous === undefined) {
      delete process.env.MCP_VERSION;
    } else {
      process.env.MCP_VERSION = previous;
    }
  });
});
