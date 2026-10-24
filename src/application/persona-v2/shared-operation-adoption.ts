import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { Source } from "../../domain/persona-v2/model.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import {
  operationTrainingSchema,
  type OperationPackage,
} from "../../domain/persona-v2/operation-training.js";
import {
  adoptStructuralKnowledge,
  sharedKnowledgeCurrent,
  type StructuralKnowledgeTraining,
} from "./shared-query-adoption.js";
import { compileOperationTraining } from "./operation-training.js";
import { datasetLogicalType } from "./dataset-types.js";
import { parseSourceRestrictions } from "./source-restrictions.js";
import { assertQueryRelationshipPaths } from "./query-relationship-paths.js";
import { matchesSharedRelationship } from "./shared-relationship.js";

/** Publication and runner use the same exact adoption, never a synthetic query or SQL execution. */
export async function compileOperationPublication(
  tx: PersonaTransaction,
  ownerId: string,
  source: Source,
  raw: unknown,
  services: Pick<PersonaServices, "crypto" | "now">,
  name: string,
): Promise<OperationPackage> {
  const pkg = compileOperationTraining(raw, source, services.crypto, name);
  const training = pkg.training;
  if (!training.sharedKnowledge) return pkg;
  if (
    training.tables.some((t) => !t.grain || t.columns.some((c) => c.classification !== "livre"))
  ) {
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Adoção de operação exige grão explícito e classificação livre em todos os campos.",
    );
  }
  const structural: StructuralKnowledgeTraining = {
    sharedKnowledge: training.sharedKnowledge,
    tables: training.tables.map((t) => ({
      name: t.name,
      meaning: t.meaning,
      grain: t.grain!,
      resourceType: "table",
    })),
    columns: training.tables.flatMap((t) =>
      t.columns.map((c) => ({
        table: t.name,
        name: c.name,
        meaning: c.meaning,
        classification: c.classification!,
      })),
    ),
    relationships: training.relationships ?? [],
    rules: training.rules,
  };
  const restrictions = parseSourceRestrictions(source.rowRestrictions);
  const relatedTables = new Set(
    structural.relationships.flatMap((r) => [r.from, ...(r.via ?? []), r.to]),
  );
  // Unused training declarations and unrelated keys must not become physical dependencies.
  const relevant = training.tables.filter(
    (t) =>
      training.steps.some((s) => s.table === t.name) ||
      training.reconciliationQuery?.table === t.name ||
      relatedTables.has(t.name),
  );
  const used = new Map(
    relevant.map((table) => [
      table.name,
      new Set([
        ...table.identity,
        ...table.grain!,
        ...structural.relationships.flatMap((r) => [
          ...(r.from === table.name ? r.keys.map((key) => key.from) : []),
          ...(r.to === table.name ? r.keys.map((key) => key.to) : []),
        ]),
        ...training.steps
          .filter((s) => s.table === table.name)
          .flatMap((s) =>
            [...s.values, ...s.where, ...s.outputs, ...(s.adaptiveFilters ?? [])].map(
              (c) => c.column,
            ),
          ),
        ...restrictions.filter((r) => r.table === table.name).map((r) => r.column),
        ...(training.dialect === "sybase" ? (table.uniqueKeys ?? []).flat() : []),
        ...(training.reconciliationQuery?.table === table.name
          ? [training.reconciliationQuery.operationIdColumn]
          : []),
      ]),
    ]),
  );
  structural.tables = structural.tables.filter((t) => used.has(t.name));
  structural.columns = structural.columns.filter((c) => used.get(c.table)?.has(c.name));
  if (
    relevant.some((t) =>
      [...used.get(t.name)!].some((name) => !t.columns.some((c) => c.name === name)),
    )
  ) {
    throw new PersonaV2Error("INVALID_PLAN", "Grão ou dependência da operação sem campo treinado.");
  }
  const keys = new Map(
    relevant.map((t) => [
      t.name,
      [t.identity, ...(training.dialect === "sybase" ? (t.uniqueKeys ?? []) : [])],
    ]),
  );
  const adopted = (await adoptStructuralKnowledge(
    tx,
    ownerId,
    source,
    structural,
    services,
    keys,
  ))!;
  for (const table of relevant) {
    const common = adopted.content.tables.find(
      (t) =>
        (t.physicalNames.find((n) => n.dialect === source.dialect)?.name ?? t.name) === table.name,
    )!;
    for (const columns of keys.get(table.name)!) {
      if (
        !common.keys?.some(
          (k) => k.status === "enabled" && canonicalJson(k.columns) === canonicalJson(columns),
        )
      ) {
        throw new PersonaV2Error(
          "INCOMPLETE_INPUT",
          "Identidade e chaves da operação exigem PK/UNIQUE publicados e comprovados, sem enforcement desconhecido.",
        );
      }
    }
    for (const column of table.columns.filter((c) => used.get(table.name)!.has(c.name))) {
      const field = common.columns.find((c) => c.name === column.name)!;
      const logical = field.logicalType.trim().toLowerCase();
      const type = logical === "uuid" ? "uuid" : datasetLogicalType(logical);
      if (type !== column.type && !(column.type === "date" && type === "datetime")) {
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Tipo da operação diverge do tipo lógico compartilhado; revise o contrato sem conversão presumida.",
        );
      }
    }
  }
  const capabilities = [
    ...pkg.requiredCapabilities,
    ...relevant.map((t) => `source:${source.id}:table:${t.name}:select`),
    ...structural.columns.map((c) => `source:${source.id}:column:${c.table}.${c.name}:read`),
    `operation-knowledge:${services.crypto.sha256Hex(canonicalJson(adopted))}`,
  ];
  return {
    ...pkg,
    sharedKnowledge: adopted,
    requiredCapabilities: [...new Set(capabilities)].sort(),
  };
}

/** Used at discovery, preparation, approval, dispatch and delivery, with current catalog grants. */
export async function sharedOperationKnowledgeCurrent(
  tx: PersonaTransaction,
  ownerId: string,
  pkg: OperationPackage,
): Promise<boolean> {
  const parsed = operationTrainingSchema.safeParse(pkg.training);
  if (!parsed.success) return false;
  if (!pkg.sharedKnowledge) return !parsed.data.sharedKnowledge;
  try {
    assertQueryRelationshipPaths({
      tables: parsed.data.tables,
      relationships: parsed.data.relationships ?? [],
    });
    if (
      (parsed.data.relationships ?? []).some(
        (relation) =>
          !pkg.sharedKnowledge!.content.relationships.some((common) =>
            matchesSharedRelationship(pkg.sharedKnowledge!.content, pkg.dialect, relation, common),
          ),
      )
    )
      return false;
  } catch {
    return false;
  }
  const ref = parsed.data.sharedKnowledge;
  if (
    ref?.catalogId !== pkg.sharedKnowledge.catalogId ||
    ref.publicationId !== pkg.sharedKnowledge.publicationId ||
    ref.evidenceId !== pkg.sharedKnowledge.evidenceId ||
    ref.profilePublicationId !== pkg.sharedKnowledge.profilePublicationId
  )
    return false;
  return sharedKnowledgeCurrent(tx, ownerId, pkg.sharedKnowledge);
}
