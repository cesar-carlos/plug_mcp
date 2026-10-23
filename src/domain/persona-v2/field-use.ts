import { z } from "zod";

export const FIELD_USES = [
  "projecao",
  "filtro",
  "join",
  "agrupamento",
  "ordenacao",
  "exportacao",
] as const;
export type FieldUse = (typeof FIELD_USES)[number];
export const fieldUsesSchema = z
  .array(z.enum(FIELD_USES))
  .min(1)
  .max(6)
  .refine((uses) => new Set(uses).size === uses.length, "Finalidades repetidas.");
export interface FieldPolicy {
  readonly table: string;
  readonly name: string;
  readonly classification: string;
  readonly uses?: readonly FieldUse[];
  readonly usePurpose?: string;
}
export function allowedFieldUses(field: FieldPolicy): readonly FieldUse[] {
  if (field.classification === "segredo" || field.classification === "inferido") return [];
  if (field.uses) return field.uses;
  return field.classification === "livre" ? FIELD_USES.filter((use) => use !== "exportacao") : [];
}
export const executableField = (field: FieldPolicy): boolean => allowedFieldUses(field).length > 0;
export const fieldUseCapability = (sourceId: string, field: FieldPolicy, use: FieldUse): string =>
  `field-use:${sourceId}:${field.table}.${field.name}:${use}`;
