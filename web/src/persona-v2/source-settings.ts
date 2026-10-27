import type { SourceRestriction } from "./model";

export const MAX_SOURCE_RESTRICTIONS = 64;

export const SOURCE_VERSION_CHANGED_MESSAGE = "Cadastro mudou. Recarregue a base antes de salvar.";

export type SourceSettingsAction = "save" | "rotate";

export interface SourceSettingsIdentity {
  name: string;
  purpose: string;
  environment: string;
}

export interface SourceRestrictionDraft {
  table: string;
  column: string;
  parameter: string;
  value: string;
  type: "string" | "number" | "boolean";
}

export interface SourceCredentialDraft {
  email: string;
  password: string;
  clientToken: string;
}

export function emptySourceCredentials(): SourceCredentialDraft {
  return { email: "", password: "", clientToken: "" };
}

export function clearSourceCredentials(credentials: SourceCredentialDraft): void {
  credentials.email = "";
  credentials.password = "";
  credentials.clientToken = "";
}

export function hasSourceCredentials(credentials: SourceCredentialDraft): boolean {
  return Object.values(credentials).some(Boolean);
}

export function emptySourceRestriction(): SourceRestrictionDraft {
  return {
    table: "",
    column: "",
    parameter: "__scope_",
    value: "",
    type: "string",
  };
}

export function restrictionDraftType(
  value: SourceRestriction["value"],
): SourceRestrictionDraft["type"] {
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return "number";
  }
  return "string";
}

export function draftSourceRestrictions(
  restrictions: readonly SourceRestriction[] | undefined,
): SourceRestrictionDraft[] {
  return (restrictions ?? []).map((restriction) => ({
    table: restriction.table,
    column: restriction.column,
    parameter: restriction.parameter,
    value: String(restriction.value),
    type: restrictionDraftType(restriction.value),
  }));
}

export function publishedSourceRestrictions(
  drafts: readonly SourceRestrictionDraft[],
): SourceRestriction[] {
  return drafts.map((draft) => ({
    table: draft.table,
    column: draft.column,
    parameter: draft.parameter,
    value:
      draft.type === "boolean"
        ? draft.value === "true"
        : draft.type === "number"
          ? Number(draft.value)
          : draft.value,
  }));
}

export function sourceSettingsSnapshot(
  form: SourceSettingsIdentity,
  restrictions: readonly SourceRestrictionDraft[],
): string {
  return JSON.stringify({ form, restrictions });
}

export function isSourceIdentityDirty(
  form: SourceSettingsIdentity,
  restrictions: readonly SourceRestrictionDraft[],
  initial: string,
): boolean {
  return sourceSettingsSnapshot(form, restrictions) !== initial;
}

export function isSourceSettingsDirty(
  form: SourceSettingsIdentity,
  restrictions: readonly SourceRestrictionDraft[],
  initial: string,
  credentials: SourceCredentialDraft,
): boolean {
  return isSourceIdentityDirty(form, restrictions, initial) || hasSourceCredentials(credentials);
}

export function sourceImpactUrl(base: string, sourceId: string, expectedVersion: number): string {
  return `${base}/fontes/${sourceId}/impacto?expectedVersion=${expectedVersion}`;
}
