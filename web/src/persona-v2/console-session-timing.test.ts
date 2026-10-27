import { describe, expect, it } from "vitest";
import { sessionExpirationDelayMs, sessionWarningDelayMs } from "./console-session-timing";

describe("prazos de sessão Client", () => {
  it("avisa dois minutos antes do vencimento e expira no instante autenticado", () => {
    const now = Date.parse("2026-10-27T12:00:00.000Z");
    const expiresAt = "2026-10-27T12:05:00.000Z";
    expect(sessionWarningDelayMs(expiresAt, now)).toBe(180_000);
    expect(sessionExpirationDelayMs(expiresAt, now)).toBe(300_000);
  });

  it("não usa atraso negativo quando o prazo já passou", () => {
    const now = Date.parse("2026-10-27T12:00:00.000Z");
    const expiresAt = "2026-10-27T11:59:00.000Z";
    expect(sessionWarningDelayMs(expiresAt, now)).toBe(0);
    expect(sessionExpirationDelayMs(expiresAt, now)).toBe(0);
  });
});
