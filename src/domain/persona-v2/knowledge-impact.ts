import { z } from "zod";

export const knowledgeImpactQueryShape = {
  after: z.uuid().optional(),
  table: z
    .string()
    .regex(/^[a-z_][a-z0-9_$]*(\.[a-z_][a-z0-9_$]*)?$/)
    .max(200)
    .optional(),
  column: z
    .string()
    .regex(/^[a-z_][a-z0-9_$]*$/)
    .max(100)
    .optional(),
};
export const validImpactFilter = (value: { table?: string; column?: string }): boolean =>
  !value.column || !!value.table;
export const knowledgeImpactQuerySchema = z
  .strictObject(knowledgeImpactQueryShape)
  .refine(validImpactFilter, { message: "Selecione a tabela para filtrar uma coluna." });
export interface KnowledgeImpactResource {
  schema: string | null;
  name: string;
  column?: string;
}
export function impactResource(value: {
  table?: string;
  column?: string;
}): KnowledgeImpactResource | undefined {
  if (!value.table) return undefined;
  const parts = value.table.split(".");
  return {
    schema: parts.length === 2 ? parts[0]! : null,
    name: parts.at(-1)!,
    ...(value.column ? { column: value.column } : {}),
  };
}
