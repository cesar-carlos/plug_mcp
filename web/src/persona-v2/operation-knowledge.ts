import type { OperationTraining } from "./operation-editor";
import {
  physicalName,
  type Content,
  type Inspection,
  type KnowledgeSelection,
} from "./knowledge-model";
import { datasetLogicalType } from "../../../src/application/persona-v2/dataset-types";

/** Only enrich declared resources. Never infer a write grant, key, type or step. */
export function adoptOperationKnowledge(
  training: OperationTraining,
  selection: KnowledgeSelection,
  inspection: Inspection,
  tableIds: readonly string[],
  fields: readonly string[],
): OperationTraining {
  const expiresAt = Date.parse(inspection.expiresAt);
  if (
    inspection.sourceId !== training.sourceId ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    throw new Error("Inspecione novamente a mesma base antes de aplicar o conhecimento.");
  }
  if (selection.standard.suspendedAt || selection.profile?.suspended) {
    throw new Error("A versão selecionada está suspensa.");
  }
  if (
    selection.profile &&
    (selection.profile.catalogId !== selection.catalogId ||
      selection.profile.basePublicationId !== selection.standard.id ||
      selection.profile.baseHash !== selection.standard.hash)
  ) {
    throw new Error("O perfil físico não corresponde à versão exata do padrão.");
  }
  const content = selection.profile?.content ?? selection.standard.content;
  const chosen = content.tables.filter((t) => tableIds.includes(t.id));
  if (
    !chosen.length ||
    chosen.length !== tableIds.length ||
    chosen.length !== training.tables.length
  ) {
    throw new Error("Selecione todas e somente as tabelas declaradas na operação.");
  }
  const byPhysical = (name: string) =>
    chosen.find((t) => physicalName(t, training.dialect) === name);
  const tables = training.tables.map((table) => {
    const common = byPhysical(table.name);
    if (!common || common.resourceType !== "table") {
      throw new Error(
        `Declare a tabela física exata ${table.name} antes de adotar; views não habilitam operação.`,
      );
    }
    if (
      !common.grain.length ||
      common.grain.some((c) => !table.columns.some((field) => field.name === c))
    ) {
      throw new Error(`Declare os campos do grão de ${table.name} no contrato da operação.`);
    }
    const selected = common.columns.filter((c) => fields.includes(`${common.id}.${c.name}`));
    if (
      selected.length !== table.columns.length ||
      table.columns.some((c) => !selected.some((field) => field.name === c.name))
    ) {
      throw new Error(`Selecione todos e somente os campos declarados em ${table.name}.`);
    }
    const columns = table.columns.map((column) => {
      const field = selected.find((c) => c.name === column.name)!;
      const type =
        field.logicalType.trim().toLowerCase() === "uuid"
          ? "uuid"
          : datasetLogicalType(field.logicalType);
      if (
        field.classification !== "livre" ||
        (column.classification && column.classification !== "livre")
      ) {
        throw new Error(
          "Operações exigem classificação livre confirmada, sem ampliar dados pessoais ou sensíveis.",
        );
      }
      if (type !== column.type && !(column.type === "date" && type === "datetime")) {
        throw new Error(
          `Revise o tipo de ${table.name}.${column.name}; adoção não converte tipos.`,
        );
      }
      return { ...column, meaning: field.meaning, classification: "livre" as const };
    });
    return { ...table, meaning: common.meaning, grain: [...common.grain], columns };
  });
  const relationships = operationKnowledgeRelationships(content, training.dialect, chosen, fields);
  return {
    ...training,
    tables,
    relationships,
    rules: [...new Set([...training.rules, ...content.rules])],
    sharedKnowledge: {
      catalogId: selection.catalogId,
      publicationId: selection.standard.id,
      evidenceId: inspection.id,
      ...(selection.profile ? { profilePublicationId: selection.profile.publicationId } : {}),
    },
  };
}

function operationKnowledgeRelationships(
  content: Content,
  dialect: OperationTraining["dialect"],
  tables: Content["tables"],
  fields: readonly string[],
): NonNullable<OperationTraining["relationships"]> {
  const selected = new Set(tables.map((t) => t.id));
  if (
    content.relationships.some(
      (r) => selected.has(r.from) && selected.has(r.to) && r.via.some((id) => !selected.has(id)),
    )
  ) {
    throw new Error("Inclua as intermediárias do relacionamento N:N no contrato antes de adotar.");
  }
  const relations = content.relationships.filter(
    (r) => selected.has(r.from) && selected.has(r.to) && r.via.every((id) => selected.has(id)),
  );
  if (
    relations.some(
      (r) =>
        r.via.length &&
        (!r.path?.length ||
          r.path.some((id) => !relations.some((edge) => edge.id === id && !edge.via.length))),
    )
  ) {
    throw new Error("Inclua todas as intermediárias e relações diretas do caminho N:N.");
  }
  if (
    relations.some((r) =>
      r.keys.some(
        (k) => !fields.includes(`${r.from}.${k.from}`) || !fields.includes(`${r.to}.${k.to}`),
      ),
    )
  ) {
    throw new Error("Declare e selecione todos os pares de campos dos relacionamentos.");
  }
  const name = (id: string) =>
    physicalName(
      tables.find((t) => t.id === id)!,
      dialect,
    );
  return relations.map((r) => ({
    id: r.id,
    from: name(r.from),
    to: name(r.to),
    keys: r.keys.map((k) => ({ ...k })),
    join: r.join,
    cardinality: r.cardinality,
    meaning: r.meaning,
    ...(r.via.length ? { via: r.via.map(name), path: [...r.path!] } : {}),
  }));
}
