import { z } from "zod";
import {
  operationScalarSchema,
  type OperationPackage,
} from "../../domain/persona-v2/operation-training.js";
import type {
  OperationReconciliationQuery,
  TypedScalar,
} from "../../domain/persona-v2/operation.js";
import { PersonaV2Error, type Source } from "../../domain/persona-v2/model.js";
import { parseSourceRestrictions } from "./source-restrictions.js";
import { quoteOperationTable } from "../../domain/persona-v2/operation-identifiers.js";
import { matchesStructureResource } from "./structure-resources.js";

/** Exact published marker query. Never accepts SQL/keys/expected outcomes from the caller. */
export function compileOperationReconciliation(
  pkg: OperationPackage,
  source: Source,
  operationId: string,
): OperationReconciliationQuery {
  z.uuid().parse(operationId);
  const r = pkg.training.reconciliationQuery;
  if (!r) throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Skill sem conciliação publicada.");
  const q = (v: string) =>
    source.dialect === "mssql" || source.dialect === "sybase" ? `[${v}]` : `"${v}"`;
  const params: Record<string, TypedScalar> = {
    operation_id: { type: "uuid", value: operationId },
  };
  const predicates = [`${q(r.operationIdColumn)} = :operation_id`];
  for (const scope of parseSourceRestrictions(source.rowRestrictions).filter(
    (v) => v.table === r.table,
  )) {
    const col = pkg.training.tables
      .find((t) => t.name === r.table)!
      .columns.find((c) => c.name === scope.column)!;
    params[scope.parameter] = operationScalarSchema.parse({
      type: col.type,
      value: col.type === "boolean" ? scope.value : String(scope.value),
    });
    predicates.push(`${q(scope.column)} = :${scope.parameter}`);
  }
  return {
    ...(pkg.sharedKnowledge
      ? {
          expectedStructure: {
            version: 1 as const,
            resources: pkg.sharedKnowledge.expectedStructure.resources.filter((resource) =>
              matchesStructureResource(r.table, resource.resource, source.dialect),
            ),
          },
        }
      : {}),
    table: r.table,
    column: r.operationIdColumn,
    params,
    sql: `SELECT ${q(r.operationIdColumn)} AS ${q("operation_marker")} FROM ${quoteOperationTable(r.table, source.dialect)} WHERE ${predicates.join(" AND ")}`,
  };
}
