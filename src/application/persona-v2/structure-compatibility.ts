import type { StructureContent } from "../../domain/persona-v2/shared-knowledge.js";
import type { SourceSchemaEvidence } from "../../domain/persona-v2/source-schema.js";
import { constraintExpectation } from "./constraint-expectation.js";
import { matchesStructureResource, physicalStructureName } from "./structure-resources.js";
import {
  foreignKeyDependency,
  matchesForeignKey,
  relationshipPath,
  structureColumnsEqual,
} from "./relationship-constraints.js";
export { matchesStructureResource } from "./structure-resources.js";
export interface StructureComparison {
  status: "compatible" | "incompatible" | "inconclusive";
  issues: {
    resource: string;
    field?: string;
    code: string;
    state: "incompatible" | "inconclusive";
  }[];
  executionReady: false;
  semanticApproval: false;
  automaticAdoption: false;
}

/** Technical comparison only. Semantic meaning and execution authority are never inferred. */
export function compareStructureEvidence(
  content: StructureContent,
  evidence: SourceSchemaEvidence,
): StructureComparison {
  const issues: {
    resource: string;
    field?: string;
    code: string;
    state: "incompatible" | "inconclusive";
  }[] = [];
  const dialect = evidence.identity.dialect;
  if (!content.dialects.includes(dialect))
    issues.push({ resource: content.system, code: "DIALECT_NOT_DECLARED", state: "incompatible" });
  for (const table of content.tables) {
    const name = table.physicalNames.find((p) => p.dialect === dialect)?.name ?? table.name;
    const observed = evidence.resources.find(
      (r) =>
        matchesStructureResource(name, r.resource, dialect) &&
        r.resource.type === table.resourceType,
    );
    if (observed?.status !== "available" || !observed.coverage.columns) {
      issues.push({ resource: table.id, code: "RESOURCE_NOT_PROVEN", state: "inconclusive" });
      continue;
    }
    for (const field of table.columns) {
      const column = observed.columns.find((c) => c.name === field.name);
      if (!column) {
        issues.push({
          resource: table.id,
          field: field.name,
          code: "COLUMN_MISSING",
          state: "incompatible",
        });
        continue;
      }
      if (column.nullable === null)
        issues.push({
          resource: table.id,
          field: field.name,
          code: "NULLABILITY_UNKNOWN",
          state: "inconclusive",
        });
      else if (column.nullable !== field.nullable)
        issues.push({
          resource: table.id,
          field: field.name,
          code: "NULLABILITY_DIFFERS",
          state: "incompatible",
        });
      const native = field.nativeTypes?.find((n) => n.dialect === dialect);
      if (!native)
        issues.push({
          resource: table.id,
          field: field.name,
          code: "NATIVE_TYPE_NOT_DECLARED",
          state: "inconclusive",
        });
      else if (
        native.type.toLowerCase() !== column.nativeType.toLowerCase() ||
        (native.scale !== undefined && native.scale !== column.scale) ||
        ((native.length ?? native.precision) !== undefined &&
          (native.length ?? native.precision) !== column.size)
      )
        issues.push({
          resource: table.id,
          field: field.name,
          code: "NATIVE_TYPE_DIFFERS",
          state: "incompatible",
        });
    }
    const expected = constraintExpectation(content, evidence, table.id);
    for (const key of table.keys ?? []) {
      const candidates = key.kind === "primary" ? expected.primaryKeys : expected.uniqueKeys;
      const found = candidates.find(
        (k) =>
          k.columns.map((c) => c.toLowerCase()).join("\0") ===
          key.columns.map((c) => c.toLowerCase()).join("\0"),
      );
      const coverage =
        key.kind === "primary" ? observed.coverage.primaryKeys : observed.coverage.uniqueKeys;
      if (
        !coverage ||
        !observed.coverage.constraintStatus ||
        found?.status === "unknown" ||
        key.status !== "enabled"
      )
        issues.push({
          resource: table.id,
          code: "CONSTRAINT_STATUS_NOT_PROVEN",
          state: "inconclusive",
        });
      else if (found?.status !== "enabled")
        issues.push({ resource: table.id, code: "CONSTRAINT_DIFFERS", state: "incompatible" });
    }
  }
  for (const relation of content.relationships.filter((r) => r.origin === "database")) {
    if (relation.via.length) {
      const path = relationshipPath(content, relation);
      if (
        !path ||
        path.some((r) => r.origin !== "database") ||
        relation.constraintName ||
        relation.constraintStatus !== "enabled"
      ) {
        issues.push({
          resource: relation.id,
          code: "RELATIONSHIP_PATH_NOT_PROVEN",
          state: "inconclusive",
        });
      }
      continue;
    }
    const dependency = foreignKeyDependency(content, evidence, relation);
    const child = dependency && content.tables.find((t) => t.id === dependency.childId);
    const observed =
      child &&
      evidence.resources.find((r) =>
        matchesStructureResource(physicalStructureName(child, dialect), r.resource, dialect),
      );
    if (!dependency || observed?.status !== "available") {
      issues.push({
        resource: relation.id,
        code: "RELATIONSHIP_DIRECTION_NOT_PROVEN",
        state: "inconclusive",
      });
      continue;
    }
    if (
      dependency.requireUnique &&
      (!observed.coverage.constraintStatus ||
        ![
          ...(observed.coverage.primaryKeys ? observed.primaryKeys : []),
          ...(observed.coverage.uniqueKeys ? (observed.uniqueKeys ?? []) : []),
        ].some(
          (k) =>
            k.status === "enabled" && structureColumnsEqual(k.columns, dependency.columns, dialect),
        ))
    )
      issues.push({
        resource: relation.id,
        code: "RELATIONSHIP_UNIQUENESS_NOT_PROVEN",
        state: "inconclusive",
      });
    const found = observed.foreignKeys.find((k) =>
      matchesForeignKey(content, evidence, relation, dependency, k),
    );
    if (
      !observed.coverage.foreignKeys ||
      !observed.coverage.constraintStatus ||
      found?.status === "unknown" ||
      relation.constraintStatus !== "enabled"
    )
      issues.push({
        resource: relation.id,
        code: "RELATIONSHIP_ENFORCEMENT_NOT_PROVEN",
        state: "inconclusive",
      });
    else if (found?.status !== "enabled")
      issues.push({ resource: relation.id, code: "RELATIONSHIP_DIFFERS", state: "incompatible" });
  }
  return {
    status: issues.some((i) => i.state === "incompatible")
      ? "incompatible"
      : issues.length
        ? "inconclusive"
        : "compatible",
    issues,
    executionReady: false,
    semanticApproval: false,
    automaticAdoption: false,
  };
}
