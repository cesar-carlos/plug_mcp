import type { StructureContent } from "../../domain/persona-v2/shared-knowledge.js";
import type { SourceSchemaEvidence } from "../../domain/persona-v2/source-schema.js";

export const physicalStructureName = (
  table: StructureContent["tables"][number],
  dialect: SourceSchemaEvidence["identity"]["dialect"],
): string => table.physicalNames.find((p) => p.dialect === dialect)?.name ?? table.name;

export const matchesStructureResource = (
  name: string,
  resource: SourceSchemaEvidence["resources"][number]["resource"],
  dialect: SourceSchemaEvidence["identity"]["dialect"],
): boolean => {
  const observed = resource.schema ? `${resource.schema}.${resource.name}` : resource.name;
  return dialect === "sybase" ? observed.toLowerCase() === name.toLowerCase() : observed === name;
};
