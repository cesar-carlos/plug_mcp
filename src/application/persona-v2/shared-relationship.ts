import type { StructureContent } from "../../domain/persona-v2/shared-knowledge.js";
import type { QueryTraining } from "./query-training.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { physicalStructureName } from "./structure-resources.js";

/** A logical path must be explicit in training; matching endpoints never grants a shortcut. */
export function matchesSharedRelationship(
  content: StructureContent,
  dialect: QueryTraining["dialect"],
  relation: QueryTraining["relationships"][number],
  common: StructureContent["relationships"][number],
): boolean {
  const physical = (id: string) => {
    const table = content.tables.find((t) => t.id === id);
    return table && physicalStructureName(table, dialect);
  };
  return (
    physical(common.from) === relation.from &&
    physical(common.to) === relation.to &&
    canonicalJson(common.keys) === canonicalJson(relation.keys) &&
    common.join === relation.join &&
    common.cardinality === relation.cardinality &&
    common.meaning === relation.meaning &&
    (relation.id === undefined || relation.id === common.id) &&
    canonicalJson(common.via.map(physical)) === canonicalJson(relation.via ?? []) &&
    canonicalJson(common.path ?? []) === canonicalJson(relation.path ?? []) &&
    (!common.via.length || relation.id === common.id)
  );
}
