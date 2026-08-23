import { randomBytes } from "node:crypto";

export class SetupCodeStore {
  private readonly codes = new Map<string, { token: string; expiresAt: number }>();

  issue(token: string, ttlMs = 10 * 60_000): { code: string; expiresAt: Date } {
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
