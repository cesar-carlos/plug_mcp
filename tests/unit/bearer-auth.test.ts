import { describe, expect, it, vi } from "vitest";
import {
  authenticateBearer,
  timingSafeStringEqual,
} from "../../src/infrastructure/oauth/bearer-auth.js";
import { testConfig } from "../../src/config/env.js";
import type { Request } from "express";

const reqWithBearer = (token: string | undefined): Request =>
  ({
    header: (name: string) =>
      name.toLowerCase() === "authorization" && token ? `Bearer ${token}` : undefined,
  }) as Request;

describe("bearer auth", () => {
  it("compara MCP_DEV_BEARER_TOKEN com timing-safe equal", async () => {
    expect(timingSafeStringEqual("abc", "abc")).toBe(true);
    expect(timingSafeStringEqual("abc", "abd")).toBe(false);
    expect(timingSafeStringEqual("abc", "abcd")).toBe(false);

    const config = testConfig({ MCP_DEV_BEARER_TOKEN: "dev-bearer-token-value-32chars!!" });
    config.devAccountId = "dev-account";
    const jwt = {
      verifyAccessToken: vi.fn().mockRejectedValue(new Error("not a jwt")),
    };

    const ok = await authenticateBearer(
      reqWithBearer("dev-bearer-token-value-32chars!!"),
      config,
      jwt as never,
    );
    expect(ok).toBe("dev-account");
    expect(jwt.verifyAccessToken).not.toHaveBeenCalled();

    const denied = await authenticateBearer(
      reqWithBearer("dev-bearer-token-value-32chars!?"),
      config,
      jwt as never,
    );
    expect(denied).toBeNull();
  });

  it("nega request sem Authorization", async () => {
    const config = testConfig();
    const jwt = { verifyAccessToken: vi.fn() };
    const accountId = await authenticateBearer(reqWithBearer(undefined), config, jwt as never);
    expect(accountId).toBeNull();
    expect(jwt.verifyAccessToken).not.toHaveBeenCalled();
  });
});
