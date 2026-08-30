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
});
