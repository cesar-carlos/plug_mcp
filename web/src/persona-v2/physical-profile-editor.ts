import type { Profile } from "./knowledge-model";

export const PHYSICAL_PROFILE_CONTENT_LIMIT = 51200;

export interface PhysicalProfileOverrides {
  tables: string[];
  relationships: string[];
}

export interface PhysicalProfilePreview {
  profile: Profile;
  hash: string;
  confirmationHash: string;
  expiresAt: string;
  reviewDueAt: string;
}

export const physicalProfileSavedMessage =
  "Rascunho físico salvo. Revise a mesma evidência antes de publicar.";

export const physicalProfilePublishedMessage =
  "Perfil publicado. Selecione a versão explicitamente no treinamento; nenhuma skill foi atualizada.";

export const physicalProfileSuspendedMessage =
  "Versão física suspensa. As dependências ficam bloqueadas.";

export const physicalProfileExpiredMessage =
  "A revisão expirou. Revise novamente antes de publicar.";

export function emptyPhysicalOverrides(): PhysicalProfileOverrides {
  return { tables: [], relationships: [] };
}

export function copyPhysicalOverrides(overrides: {
  tables: readonly string[];
  relationships: readonly string[];
}): PhysicalProfileOverrides {
  return { tables: [...overrides.tables], relationships: [...overrides.relationships] };
}

export function clonePhysicalContent(content: unknown): unknown {
  return JSON.parse(JSON.stringify(content)) as unknown;
}

export function physicalProfileFingerprint(input: {
  name: string;
  content: unknown;
  overrides: PhysicalProfileOverrides;
}): string {
  return JSON.stringify({
    name: input.name,
    content: input.content,
    overrides: input.overrides,
  });
}

export function physicalProfileDirty(
  editing: boolean,
  fingerprint: string,
  saved: string,
): boolean {
  return editing && fingerprint !== saved;
}

export function physicalProfileSwitchNeedsDiscard(dirty: boolean, reviewDate: string): boolean {
  return dirty || !!reviewDate;
}

export function physicalProfileReportsDirty(input: {
  dirty: boolean;
  suspendConfirmed: boolean;
  reviewDate: string;
}): boolean {
  return input.dirty || input.suspendConfirmed || !!input.reviewDate;
}

export function physicalProfileContentExceedsLimit(
  content: unknown,
  limit = PHYSICAL_PROFILE_CONTENT_LIMIT,
): boolean {
  return new TextEncoder().encode(JSON.stringify(content)).byteLength > limit;
}

export function physicalProfilePreviewExpired(expiresAt: string, now: number): boolean {
  return Date.parse(expiresAt) <= now;
}

export function physicalProfileInitialContent(
  draft: Profile | undefined,
  selectedProfileContent: unknown,
  standardContent: unknown,
): unknown {
  return clonePhysicalContent(draft?.content ?? selectedProfileContent ?? standardContent);
}

export function physicalProfileErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
