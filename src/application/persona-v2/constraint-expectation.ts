import type { StructureContent } from "../../domain/persona-v2/shared-knowledge.js";
import type {
  SourceSchemaEvidence,
  ExpectedStructure,
} from "../../domain/persona-v2/source-schema.js";
import { matchesStructureResource } from "./structure-resources.js";
import {
  foreignKeyDependency,
  matchesForeignKey,
  structureColumnsEqual,
} from "./relationship-constraints.js";

/** Only declared dependencies are pinned, never every key observed in a table. */
export function constraintExpectation(
  content: StructureContent,
  evidence: SourceSchemaEvidence,
  tableId: string,
): NonNullable<ExpectedStructure["resources"][number]["constraints"]> {
  const table = content.tables.find((t) => t.id === tableId)!;
  const name = (t: typeof table) =>
    t.physicalNames.find((p) => p.dialect === evidence.identity.dialect)?.name ?? t.name;
  const observed = evidence.resources.find((r) =>
    matchesStructureResource(name(table), r.resource, evidence.identity.dialect),
  )!;
  const columnsEqual = (a: readonly string[], b: readonly string[]) =>
    structureColumnsEqual(a, b, evidence.identity.dialect);
  const dependencies = content.relationships
    .filter((r) => r.origin === "database" && !r.via.length)
    .flatMap((relation) => {
      const dependency = foreignKeyDependency(content, evidence, relation);
      return dependency?.childId === tableId ? [{ relation, dependency }] : [];
    });
  const uniqueProofs = dependencies
    .filter((d) => d.dependency.requireUnique)
    .flatMap(({ dependency }) => {
      const primary =
        observed.coverage.constraintStatus &&
        observed.coverage.primaryKeys &&
        observed.primaryKeys.find(
          (k) => k.status === "enabled" && columnsEqual(k.columns, dependency.columns),
        );
      const unique =
        !primary &&
        observed.coverage.constraintStatus &&
        observed.coverage.uniqueKeys &&
        observed.uniqueKeys?.find(
          (k) => k.status === "enabled" && columnsEqual(k.columns, dependency.columns),
        );
      return primary
        ? [{ kind: "primary", key: primary }]
        : unique
          ? [{ kind: "unique", key: unique }]
          : [];
    });
  return {
    primaryKeys: observed.primaryKeys.filter(
      (k) =>
        (table.keys ?? []).some(
          (d) => d.kind === "primary" && columnsEqual(d.columns, k.columns),
        ) || uniqueProofs.some((p) => p.kind === "primary" && p.key === k),
    ),
    uniqueKeys: (observed.uniqueKeys ?? []).filter(
      (k) =>
        (table.keys ?? []).some((d) => d.kind === "unique" && columnsEqual(d.columns, k.columns)) ||
        uniqueProofs.some((p) => p.kind === "unique" && p.key === k),
    ),
    foreignKeys: observed.foreignKeys.filter((k) =>
      dependencies.some(({ relation, dependency }) =>
        matchesForeignKey(content, evidence, relation, dependency, k),
      ),
    ),
  };
}
