import type { TrainedRelationship } from "../../domain/persona-v2/knowledge-adoption.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";

/** Path edges are explicit training; the conceptual N:N edge never enters the SQL allowlist. */
export function assertQueryRelationshipPaths(training: {
  readonly tables: readonly { name: string }[];
  readonly relationships: readonly TrainedRelationship[];
}): void {
  const relations = training.relationships;
  const ids = relations.flatMap((r) => (r.id ? [r.id] : []));
  if (new Set(ids).size !== ids.length)
    throw new PersonaV2Error("INVALID_PLAN", "Identificadores de relacionamentos duplicados.");
  for (const relation of relations) {
    const via = relation.via ?? [],
      path = relation.path ?? [];
    if (!via.length) {
      if (path.length)
        throw new PersonaV2Error("INVALID_PLAN", "Caminho exige tabelas intermediárias.");
      continue;
    }
    const nodes = [relation.from, ...via, relation.to];
    if (
      !relation.id ||
      relation.cardinality !== "N:N" ||
      new Set(nodes).size !== nodes.length ||
      path.length !== via.length + 1 ||
      new Set(path).size !== path.length ||
      nodes.some((name) => !training.tables.some((t) => t.name === name))
    ) {
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Caminho N:N incompleto ou fora das tabelas treinadas.",
      );
    }
    for (const [index, id] of path.entries()) {
      const edge = relations.find((r) => r.id === id);
      if (
        !edge ||
        edge.id === relation.id ||
        edge.via?.length ||
        edge.cardinality === "N:N" ||
        !(
          (edge.from === nodes[index] && edge.to === nodes[index + 1]) ||
          (edge.to === nodes[index] && edge.from === nodes[index + 1])
        )
      ) {
        throw new PersonaV2Error("INVALID_PLAN", "Elos do caminho N:N ausentes ou divergentes.");
      }
    }
  }
}
