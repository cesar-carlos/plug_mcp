import type {
  CatalogPublication,
  PublishedPackage,
  QueryPackage,
} from "../../domain/persona-v2/catalog.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { matchesSharedRelationship } from "./shared-relationship.js";
import type {
  KnowledgeDocument,
  KnowledgeOrigin,
} from "../../domain/persona-v2/knowledge-context.js";
import type { StructureContent } from "../../domain/persona-v2/shared-knowledge.js";
import { queryTrainingSchema } from "./query-training.js";
import { federationTrainingSchema } from "./federation-training.js";
import { operationKnowledgeTables } from "./operation-knowledge-scope.js";

export const normalizeKnowledgeText = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export const privateKnowledgeOrigin = (
  publication: CatalogPublication<PublishedPackage>,
): KnowledgeOrigin => ({ kind: "privado", publicationId: publication.id, hash: publication.hash });
type SharedItem =
  | { kind: "table"; id: string; value: unknown }
  | { kind: "column"; id: string; column: string; value: unknown }
  | { kind: "relationship"; id: string; value: unknown }
  | { kind: "rule"; value: string };
export const sharedItemOrigin = (
  publication: CatalogPublication<QueryPackage>,
  item: SharedItem,
  base?: StructureContent,
): KnowledgeOrigin => {
  const ref = publication.package.sharedKnowledge;
  if (!ref) {
    return privateKnowledgeOrigin(publication);
  }
  let original: unknown;
  if (item.kind === "rule") {
    original = base?.rules.find((r) => r === item.value);
  } else if (item.kind === "relationship") {
    original = base?.relationships.find((r) => r.id === item.id);
  } else {
    const table = base?.tables.find((t) => t.id === item.id);
    original =
      item.kind === "column"
        ? table?.columns.find((c) => c.name === item.column)
        : table
          ? {
              meaning: table.meaning,
              grain: table.grain,
              name: table.name,
              resourceType: table.resourceType,
              physicalName: physicalKnowledgeName(table, publication.package.dialect),
            }
          : undefined;
  }
  // Only an exact comparison attributes an item to the base instead of its adopted profile.
  const profile =
    !!ref.profilePublicationId && canonicalJson(original ?? null) !== canonicalJson(item.value);
  return {
    kind: profile ? "perfil" : "padrao",
    catalogId: ref.catalogId,
    publicationId: profile ? ref.profilePublicationId : ref.publicationId,
    hash: profile ? ref.profileHash! : ref.publicationHash,
  };
};
export const physicalKnowledgeName = (
  table: StructureContent["tables"][number],
  dialect: QueryPackage["dialect"],
): string => table.physicalNames.find((n) => n.dialect === dialect)?.name ?? table.name;
export const sharedRelationship = (
  pkg: QueryPackage,
  relation: ReturnType<typeof queryTrainingSchema.parse>["relationships"][number],
): StructureContent["relationships"][number] | undefined => {
  const content = pkg.sharedKnowledge?.content;
  return content?.relationships.find((r) =>
    matchesSharedRelationship(content, pkg.dialect, relation, r),
  );
};

/** Derives only visible metadata. SQL text, values, credentials and draft names are never indexed. */
export function publicationKnowledgeDocuments(
  publication: CatalogPublication<PublishedPackage>,
  base?: StructureContent,
): readonly KnowledgeDocument[] {
  const pkg = publication.package,
    origin = privateKnowledgeOrigin(publication);
  const documents: KnowledgeDocument[] = [
    {
      id: "skill",
      kind: "skill",
      label: pkg.name,
      text: normalizeKnowledgeText(`${pkg.name} ${pkg.purpose}`),
      origin,
    },
  ];
  const add = (item: Omit<KnowledgeDocument, "text">, texts: readonly (string | undefined)[]) => {
    documents.push({
      ...item,
      text: normalizeKnowledgeText(texts.filter((s) => s !== undefined).join(" ")),
    });
  };
  if (pkg.format === "persona-federation-v2") {
    const training = federationTrainingSchema.parse(pkg.training);
    for (const [id, meaning] of Object.entries(training.semantics)) {
      add({ id: `rule:${id}`, kind: "rule", label: meaning, origin }, [meaning]);
    }
    return documents;
  }
  if (pkg.format === "persona-sql-operation-v2") {
    for (const table of operationKnowledgeTables(pkg)) {
      add(
        {
          id: `table:${table.name}`,
          kind: "table",
          label: table.meaning,
          sourceId: pkg.sourceId,
          table: table.name,
          origin,
        },
        [table.name, table.meaning],
      );
      for (const column of table.columns) {
        add(
          {
            id: `column:${table.name}.${column.name}`,
            kind: "column",
            label: column.meaning,
            sourceId: pkg.sourceId,
            table: table.name,
            column: column.name,
            origin,
          },
          [table.name, column.name, column.meaning],
        );
      }
    }
    pkg.training.rules.forEach((rule, i) =>
      add({ id: `rule:${i}`, kind: "rule", label: rule, origin }, [rule]),
    );
    return documents;
  }
  const query = { ...publication, package: pkg };
  const training = queryTrainingSchema.parse(pkg.training),
    shared = pkg.sharedKnowledge;
  if (training.semantics) {
    add(
      { id: "rule:semantic-synonyms", kind: "rule", label: "Termos comerciais revisados", origin },
      training.semantics.synonyms,
    );
    for (const metric of training.semantics.metrics) {
      add({ id: `rule:metric:${metric.id}`, kind: "rule", label: metric.name, origin }, [
        metric.name,
        metric.definition,
        metric.unit,
      ]);
    }
  }
  const free = training.columns.filter((column) =>
    pkg.scope.colunasPorTabela[column.table]?.includes(column.name),
  );
  const tableIds = new Set(free.map((c) => c.table));
  for (const table of training.tables.filter((t) => tableIds.has(t.name))) {
    const common = shared?.content.tables.find(
      (t) => physicalKnowledgeName(t, pkg.dialect) === table.name,
    );
    const itemOrigin = common
      ? sharedItemOrigin(
          query,
          {
            kind: "table",
            id: common.id,
            value: {
              meaning: common.meaning,
              grain: common.grain,
              name: common.name,
              resourceType: common.resourceType,
              physicalName: physicalKnowledgeName(common, pkg.dialect),
            },
          },
          base,
        )
      : origin;
    add(
      {
        id: `table:${table.name}`,
        kind: "table",
        label: table.meaning,
        sourceId: pkg.sourceId,
        table: table.name,
        origin: itemOrigin,
      },
      [
        table.name,
        table.meaning,
        ...table.grain.filter((name) =>
          free.some((c) => c.table === table.name && c.name === name),
        ),
      ],
    );
  }
  for (const column of free) {
    const table = shared?.content.tables.find(
        (t) => physicalKnowledgeName(t, pkg.dialect) === column.table,
      ),
      field = table?.columns.find((c) => c.name === column.name);
    const itemOrigin =
      field && table
        ? sharedItemOrigin(
            query,
            { kind: "column", id: table.id, column: field.name, value: field },
            base,
          )
        : origin;
    add(
      {
        id: `column:${column.table}.${column.name}`,
        kind: "column",
        label: column.meaning,
        sourceId: pkg.sourceId,
        table: column.table,
        column: column.name,
        origin: itemOrigin,
      },
      [column.table, column.name, column.meaning, field?.unit, field?.currency, field?.calendar],
    );
  }
  training.relationships.forEach((relationship, i) => {
    if (
      !relationship.keys.every(
        (k) =>
          free.some((c) => c.table === relationship.from && c.name === k.from) &&
          free.some((c) => c.table === relationship.to && c.name === k.to),
      )
    ) {
      return;
    }
    const common = sharedRelationship(pkg, relationship);
    add(
      {
        id: `relationship:${i}`,
        kind: "relationship",
        label: relationship.meaning,
        sourceId: pkg.sourceId,
        origin: common
          ? sharedItemOrigin(query, { kind: "relationship", id: common.id, value: common }, base)
          : origin,
      },
      [relationship.from, relationship.to, relationship.meaning, relationship.cardinality],
    );
  });
  training.rules.forEach((rule, i) =>
    add(
      {
        id: `rule:${i}`,
        kind: "rule",
        label: rule,
        origin: shared?.content.rules.includes(rule)
          ? sharedItemOrigin(query, { kind: "rule", value: rule }, base)
          : origin,
      },
      [rule],
    ),
  );
  for (const example of training.examples ?? []) {
    if (example.state !== undefined && example.state !== "approved") {
      continue;
    }
    add(
      {
        id: `example:${example.id}`,
        kind: "example",
        label: example.purpose,
        sourceId: pkg.sourceId,
        origin,
      },
      [example.purpose, example.explanation],
    );
  }
  for (const parameter of training.parameters) {
    add(
      {
        id: `parameter:${parameter.name}`,
        kind: "parameter",
        label: parameter.meaning,
        sourceId: pkg.sourceId,
        origin,
      },
      [parameter.name, parameter.meaning],
    );
  }
  return documents;
}
