import { z } from "zod";

export const manualSessionSchema = z.strictObject({
  format: z.literal("persona-manual-training-v1"),
  expiresAt: z.iso.datetime(),
});
export const manualSessionMinutesSchema = z.number().int().min(10).max(120);
export type ManualSession = z.infer<typeof manualSessionSchema>;
export const manualSecretsSchema = z.strictObject({
  mcpEncryptionKey: z.string().regex(/^[a-f0-9]{64}$/),
});

/** A fixture lifetime is separate from SQL, approval and administrative-session limits. */
export function fixtureSessionDeadline(raw: unknown, defaultMs: number, now = Date.now()): number {
  const parsed = z.object({ manualTraining: manualSessionSchema.optional() }).safeParse(raw);
  if (!parsed.success) throw new Error("Configuração da sessão manual inválida.");
  if (!parsed.data.manualTraining) return now + defaultMs;
  const expiresAt = Date.parse(parsed.data.manualTraining.expiresAt);
  if (expiresAt <= now || expiresAt > now + 120 * 60_000) {
    throw new Error("Sessão manual expirada ou acima do teto de duas horas.");
  }
  return expiresAt;
}

export function createManualSession(minutes: number, now = Date.now()): ManualSession {
  return {
    format: "persona-manual-training-v1",
    expiresAt: new Date(now + manualSessionMinutesSchema.parse(minutes) * 60_000).toISOString(),
  };
}
