import { randomBytes } from "node:crypto";
import { MCP_SETUP_TTL_MS } from "../../domain/ports/mcp-setup-repository.port.js";

export class SetupCodeStore {
  private readonly codes = new Map<string, { token: string; expiresAt: number }>();

  issue(token: string, ttlMs = MCP_SETUP_TTL_MS): { code: string; expiresAt: Date } {
    const code = randomBytes(16).toString("hex");
    const expiresAt = Date.now() + ttlMs;
    this.codes.set(code, { token, expiresAt });
    return { code, expiresAt: new Date(expiresAt) };
  }

  consume(code: string): string | null {
    const row = this.codes.get(code);
    this.codes.delete(code);
    if (!row || row.expiresAt <= Date.now()) {
      return null;
    }
    return row.token;
  }
}
