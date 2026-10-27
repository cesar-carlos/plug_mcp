export const SESSION_WARNING_MS = 120_000;

export function sessionWarningDelayMs(expiresAt: string, now: number): number {
  return Math.max(0, Date.parse(expiresAt) - now - SESSION_WARNING_MS);
}

export function sessionExpirationDelayMs(expiresAt: string, now: number): number {
  return Math.max(0, Date.parse(expiresAt) - now);
}
