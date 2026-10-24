import type { CatalogPublication, QueryPackage } from "../../domain/persona-v2/catalog.js";
import type { StructureContent } from "../../domain/persona-v2/shared-knowledge.js";
import type { OperationPackage } from "../../domain/persona-v2/operation-training.js";
import type {
  KnowledgeGraph,
  KnowledgeNode,
  KnowledgeEdge,
} from "../../domain/persona-v2/knowledge-context.js";
import { queryTrainingSchema } from "./query-training.js";
import { operationKnowledgeTables } from "./operation-knowledge-scope.js";
import {
  privateKnowledgeOrigin,
  physicalKnowledgeName,
  sharedItemOrigin,
  sharedRelationship,
} from "./knowledge-documents.js";

export const tableNodeId = (sourceId: string, table: string): string =>
  `table:${sourceId}:${table}`;
export const columnNodeId = (sourceId: string, table: string, column: string): string =>
  `column:${sourceId}:${table}.${column}`;

/** Removing a dependency must also remove every path that depended on it. */
export function knowledgeEdgesWithExposedPaths(
  edges: readonly KnowledgeEdge[],
): readonly KnowledgeEdge[] {
  let exposed = edges;
  let remaining = edges.length;
  while (remaining-- > 0) {
    const ids = new Set(exposed.map((e) => e.id));
    const next = exposed.filter((e) => e.path.every((id) => ids.has(id)));
    if (next.length === exposed.length) {
      break;
    }
    exposed = next;
  }
  return exposed;
}

export function operationKnowledgeGraph(
  publication: CatalogPublication<OperationPackage>,
): KnowledgeGraph {
  const pkg = publication.package,
    origin = privateKnowledgeOrigin(publication);
  const nodes = operationKnowledgeTables(pkg).flatMap((table) => {
    const scope = {
      sourceId: pkg.sourceId,
      schema: table.name.includes(".") ? table.name.split(".")[0]! : null,
      table: table.name.split(".").at(-1)!,
      origin,
    };
    return [
      {
        ...scope,
        id: tableNodeId(pkg.sourceId, table.name),
        kind: "table" as const,
        meaning: table.meaning,
        ...(table.identity ? { grain: table.identity } : {}),
      },
      ...table.columns.map((column) => ({
        ...scope,
        id: columnNodeId(pkg.sourceId, table.name, column.name),
        kind: "column" as const,
        column: column.name,
        meaning: column.meaning,
      })),
    ];
  });
  return { nodes, edges: [], omittedRelationships: 0 };
}

/** No inferred edges. Unknown optionality stays unknown, and N:N keeps its declared path. */
export function queryKnowledgeGraph(
  publication: CatalogPublication<QueryPackage>,
  base?: StructureContent,
): KnowledgeGraph {
  const pkg = publication.package,
    training = queryTrainingSchema.parse(pkg.training),
    shared = pkg.sharedKnowledge;
  const nodes: KnowledgeNode[] = [],
    edges: KnowledgeEdge[] = [];
  const free = training.columns.filter((c) =>
    pkg.scope.colunasPorTabela[c.table]?.includes(c.name),
  );
  const tableNames = new Set(free.map((c) => c.table));
  const physical = (name: string) => ({
    schema: name.includes(".") ? name.split(".")[0]! : null,
    table: name.split(".").at(-1)!,
  });
  for (const table of training.tables.filter((t) => tableNames.has(t.name))) {
    const common = shared?.content.tables.find(
      (t) => physicalKnowledgeName(t, pkg.dialect) === table.name,
    );
    nodes.push({
      id: tableNodeId(pkg.sourceId, table.name),
      kind: "table",
      sourceId: pkg.sourceId,
      ...physical(table.name),
      meaning: table.meaning,
      ...(table.grain.every((name) => free.some((c) => c.table === table.name && c.name === name))
        ? { grain: table.grain }
        : {}),
      origin: common
        ? sharedItemOrigin(
            publication,
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
        : privateKnowledgeOrigin(publication),
    });
  }
  for (const column of free) {
    const table = shared?.content.tables.find(
        (t) => physicalKnowledgeName(t, pkg.dialect) === column.table,
      ),
      field = table?.columns.find((c) => c.name === column.name);
    nodes.push({
      id: columnNodeId(pkg.sourceId, column.table, column.name),
      kind: "column",
      sourceId: pkg.sourceId,
      ...physical(column.table),
      column: column.name,
      meaning: column.meaning,
      origin:
        table && field
          ? sharedItemOrigin(
              publication,
              { kind: "column", id: table.id, column: field.name, value: field },
              base,
            )
          : privateKnowledgeOrigin(publication),
    });
  }
  training.relationships.forEach((relation, index) => {
    if (
      !tableNames.has(relation.from) ||
      !tableNames.has(relation.to) ||
      !relation.keys.every(
        (k) =>
          free.some((c) => c.table === relation.from && c.name === k.from) &&
          free.some((c) => c.table === relation.to && c.name === k.to),
      )
    ) {
      return;
    }
    const common = sharedRelationship(pkg, relation);
    const via = common
      ? common.via
          .map((id) => shared!.content.tables.find((t) => t.id === id))
          .filter((t) => t !== undefined)
          .map((t) => tableNodeId(pkg.sourceId, physicalKnowledgeName(t, pkg.dialect)))
      : (relation.via ?? []).map((name) => tableNodeId(pkg.sourceId, name));
    if (
      via.length !== (common?.via.length ?? relation.via?.length ?? 0) ||
      via.some((id) => !nodes.some((n) => n.id === id))
    ) {
      return;
    }
    edges.push({
      id: `relationship:${publication.id}:${common?.id ?? relation.id ?? index}`,
      from: tableNodeId(pkg.sourceId, relation.from),
      to: tableNodeId(pkg.sourceId, relation.to),
      sourceId: pkg.sourceId,
      keys: relation.keys,
      join: relation.join,
      cardinality: relation.cardinality,
      optional: common?.optional ?? null,
      meaning: relation.meaning,
      via,
      path: (common?.path ?? relation.path ?? []).map(
        (id) => `relationship:${publication.id}:${id}`,
      ),
      constraintStatus: common?.constraintStatus ?? null,
      origin: common
        ? sharedItemOrigin(
            publication,
            { kind: "relationship", id: common.id, value: common },
            base,
          )
        : privateKnowledgeOrigin(publication),
    });
  });
  // A path may only reference edges actually exposed by this snapshot, never hidden catalog items.
  const exposed = knowledgeEdgesWithExposedPaths(edges);
  return {
    nodes,
    edges: exposed,
    omittedRelationships: training.relationships.length - exposed.length,
  };
}
