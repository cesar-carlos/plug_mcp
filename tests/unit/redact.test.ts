import { describe, expect, it, vi } from "vitest";
import { ConsoleTestLogger } from "../helpers/console-logger.js";

describe("redact de logs", () => {
  it("mascara password_hash, access_token e refresh_token no logger de testes", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      new ConsoleTestLogger().info("login", {
        password_hash: "hash-secreto",
        passwordHash: "hashCamel",
        access_token: "at-secret",
        refresh_token: "rt-secret",
        email: "dev@localhost",
      });
      expect(spy).toHaveBeenCalledOnce();
      const fields = spy.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(fields.password_hash).toBe("[redacted]");
      expect(fields.passwordHash).toBe("[redacted]");
      expect(fields.access_token).toBe("[redacted]");
      expect(fields.refresh_token).toBe("[redacted]");
      expect(fields.email).toBe("dev@localhost");
    } finally {
      spy.mockRestore();
    }
  });
});
