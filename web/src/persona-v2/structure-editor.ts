import { structureContentSchema } from "../../../src/domain/persona-v2/structure-content-schema";
import type { z } from "zod";

export type StructureDraft = z.infer<typeof structureContentSchema>;
export type StructureEditorSection = "tables" | "relationships";
export type StructureTable = StructureDraft["tables"][number];
export type StructureRelationship = StructureDraft["relationships"][number];
export type StructureExample = StructureDraft["examples"][number];
export type StructureColumn = StructureTable["columns"][number];
export type StructureDialect = StructureDraft["dialects"][number];

export const structureDialects = [
  { id: "mssql", label: "SQL Server" },
  { id: "sybase", label: "SQL Anywhere" },
  { id: "postgres", label: "PostgreSQL" },
] as const;

export const structureExampleParameterTypes = [
  "string",
  "number",
  "integer",
  "decimal",
  "boolean",
  "date",
  "datetime",
] as const;

export function emptyStructureContent(): StructureDraft {
  return {
    system: "",
    label: "",
    dialects: [],
    tables: [],
    relationships: [],
    examples: [],
    rules: [],
  };
}

export function emptyStructureTable(): StructureTable {
  return {
    id: "",
    name: "",
    meaning: "",
    resourceType: "table",
    grain: [],
    physicalNames: [],
    columns: [],
  };
}

export function emptyStructureColumn(): StructureColumn {
  return {
    name: "",
    meaning: "",
    logicalType: "",
    nullable: false,
    classification: "inferido",
  };
}

export function emptyStructureKey(): NonNullable<StructureTable["keys"]>[number] {
  return { id: "", kind: "primary", columns: [], status: "unknown" };
}

export function emptyStructurePhysicalName(
  dialect: StructureDialect,
): StructureTable["physicalNames"][number] {
  return { dialect, name: "" };
}

export function emptyStructureNativeType(
  dialect: StructureDialect,
): NonNullable<StructureColumn["nativeTypes"]>[number] {
  return { dialect, type: "" };
}

export function emptyStructureRelationship(): StructureRelationship {
  return {
    id: "",
    from: "",
    to: "",
    keys: [{ from: "", to: "" }],
    join: "inner",
    cardinality: "N:1",
    optional: false,
    meaning: "",
    via: [],
    path: [],
    origin: "business",
  };
}

export function emptyStructureKeyPair(): StructureRelationship["keys"][number] {
  return { from: "", to: "" };
}

export function emptyStructureExample(): StructureExample {
  return {
    id: "",
    purpose: "",
    explanation: "",
    state: "inactive",
    variants: [],
  };
}

export function emptyStructureExampleVariant(
  dialect: StructureDialect,
): StructureExample["variants"][number] {
  return { dialect, sql: "", parameters: [] };
}

export function emptyStructureExampleParameter(): StructureExample["variants"][number]["parameters"][number] {
  return { name: "", meaning: "", type: "string", required: true };
}

export function defaultStructureDialect(dialects: StructureDraft["dialects"]): StructureDialect {
  return dialects[0] ?? "mssql";
}

/** Split a comma or newline editorial list, ignoring empty fragments. */
export function splitStructureList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Keep non-empty rule lines without trimming the retained text. */
export function splitStructureRules(value: string): string[] {
  return value.split("\n").filter((line) => line.trim());
}

export function optionalStructureNumber(value: string, valueAsNumber: number): number | undefined {
  return value === "" ? undefined : valueAsNumber;
}

export function optionalStructureText(value: string): string | undefined {
  return value || undefined;
}

export function parseStructureContent(value: unknown): {
  content: StructureDraft | undefined;
  invalid: boolean;
} {
  const parsed = structureContentSchema.safeParse(value);
  return {
    content: parsed.success ? parsed.data : undefined,
    invalid: value !== undefined && !parsed.success,
  };
}

export function applyStructureRelationshipOrigin(
  relation: StructureRelationship,
  originValue: string,
): void {
  relation.origin = originValue === "database" ? "database" : "business";
  if (relation.origin === "business") {
    delete relation.constraintName;
    delete relation.constraintStatus;
    return;
  }
  relation.constraintStatus ??= "unknown";
}

export function structureTableColumns(
  tables: StructureDraft["tables"],
  tableId: string,
): StructureColumn[] {
  return tables.find((table) => table.id === tableId)?.columns ?? [];
}

export function structureExampleSqls(
  examples: StructureDraft["examples"],
): { id: string; dialect: string; sql: string }[] {
  return examples.flatMap((example) =>
    example.variants.map((variant) => ({
      id: example.id,
      dialect: variant.dialect,
      sql: variant.sql,
    })),
  );
}

export function structureEditorVisibility(
  sections: readonly StructureEditorSection[] | undefined,
): {
  identity: boolean;
  tables: boolean;
  relationships: boolean;
  library: boolean;
} {
  const full = sections === undefined;
  return {
    identity: full,
    tables: full || sections.includes("tables"),
    relationships: full || sections.includes("relationships"),
    library: full,
  };
}
