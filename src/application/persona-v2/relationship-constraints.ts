import type { StructureContent } from "../../domain/persona-v2/shared-knowledge.js";
import type { SourceSchemaEvidence } from "../../domain/persona-v2/source-schema.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { matchesStructureResource, physicalStructureName } from "./structure-resources.js";

type Relation = StructureContent["relationships"][number];
export interface ForeignKeyDependency {
  childId: string;
  parentId: string;
  columns: readonly string[];
  targetColumns: readonly string[];
  requireUnique: boolean;
}
export const structureColumnsEqual = (
  a: readonly string[],
  b: readonly string[],
  _dialect: SourceSchemaEvidence["identity"]["dialect"],
): boolean => canonicalJson(a) === canonicalJson(b);

export function matchesForeignKey(
  content: StructureContent,
  evidence: SourceSchemaEvidence,
  relation: Relation,
  dependency: ForeignKeyDependency,
  key: SourceSchemaEvidence["resources"][number]["foreignKeys"][number],
): boolean {
  const parent = content.tables.find((t) => t.id === dependency.parentId);
  return (
    !!parent &&
    (!relation.constraintName ||
      relation.constraintName.toLowerCase() === key.name.toLowerCase()) &&
    structureColumnsEqual(dependency.columns, key.columns, evidence.identity.dialect) &&
    structureColumnsEqual(dependency.targetColumns, key.targetColumns, evidence.identity.dialect) &&
    matchesStructureResource(
      physicalStructureName(parent, evidence.identity.dialect),
      key.target,
      evidence.identity.dialect,
    )
  );
}

/** Cardinality describes traversal; a reverse 1:N still pins the child's native FK. */
export function foreignKeyDependency(
  content: StructureContent,
  evidence: SourceSchemaEvidence,
  relation: Relation,
): ForeignKeyDependency | null {
  if (relation.via.length || relation.cardinality === "N:N") return null;
  const directed = (reverse: boolean): ForeignKeyDependency => ({
    childId: reverse ? relation.to : relation.from,
    parentId: reverse ? relation.from : relation.to,
    columns: relation.keys.map((k) => (reverse ? k.to : k.from)),
    targetColumns: relation.keys.map((k) => (reverse ? k.from : k.to)),
    requireUnique: relation.cardinality === "1:1",
  });
  if (relation.cardinality !== "1:1") return directed(relation.cardinality === "1:N");
  const candidates = [directed(false), directed(true)].filter((dependency) => {
    const child = content.tables.find((t) => t.id === dependency.childId);
    const observed =
      child &&
      evidence.resources.find((r) =>
        matchesStructureResource(
          physicalStructureName(child, evidence.identity.dialect),
          r.resource,
          evidence.identity.dialect,
        ),
      );
    return observed?.foreignKeys.some((k) =>
      matchesForeignKey(content, evidence, relation, dependency, k),
    );
  });
  // Two physical directions need an explicit constraint name, not a silent ordering choice.
  return candidates.length === 1
    ? candidates[0]!
    : candidates.length === 0
      ? directed(false)
      : null;
}

export function relationshipPath(
  content: StructureContent,
  relation: Relation,
): readonly Relation[] | null {
  if (
    !relation.via.length ||
    relation.cardinality !== "N:N" ||
    relation.path?.length !== relation.via.length + 1 ||
    new Set(relation.path).size !== relation.path.length ||
    new Set([relation.from, ...relation.via, relation.to]).size !== relation.via.length + 2
  )
    return null;
  const nodes = [relation.from, ...relation.via, relation.to];
  const edges: Relation[] = [];
  for (const [index, id] of relation.path.entries()) {
    const edge = content.relationships.find((r) => r.id === id);
    if (
      !edge ||
      edge.id === relation.id ||
      edge.via.length ||
      edge.cardinality === "N:N" ||
      !(
        (edge.from === nodes[index] && edge.to === nodes[index + 1]) ||
        (edge.to === nodes[index] && edge.from === nodes[index + 1])
      )
    )
      return null;
    edges.push(edge);
  }
  return edges;
}
