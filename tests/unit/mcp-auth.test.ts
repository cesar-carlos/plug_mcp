import { describe, expect, it } from "vitest";
import { isMcpTokenExpired } from "../../src/infrastructure/mcp/mcp-auth.js";

describe("isMcpTokenExpired", () => {
  it("não expira quando tokenExpiresAt é null", () => {
    expect(isMcpTokenExpired({ tokenExpiresAt: null })).toBe(false);
  });

  it("expira quando tokenExpiresAt já passou", () => {
    expect(isMcpTokenExpired({ tokenExpiresAt: new Date(0) }, Date.now())).toBe(true);
  });

  it("não expira quando tokenExpiresAt está no futuro", () => {
    expect(isMcpTokenExpired({ tokenExpiresAt: new Date(Date.now() + 60_000) })).toBe(false);
  });
});
