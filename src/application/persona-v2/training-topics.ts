import { PERSONA_V2_TRAINING_BASE as base } from "./training-base.js";
import { PERSONA_ADMINISTRATION_GUIDANCE } from "./runtime-administration-guidance.js";
import {
  SQL_RUNTIME_GUIDANCE,
  KNOWLEDGE_RUNTIME_GUIDANCE,
  OPERATIONS_RUNTIME_GUIDANCE,
} from "./runtime-task-guidance.js";
import { createHash } from "node:crypto";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";

export const TRAINING_TOPICS = ["sql", "knowledge", "operations", "administration"] as const;
export function trainingTopic(
  topic?: (typeof TRAINING_TOPICS)[number],
): Readonly<Record<string, unknown>> {
  if (!topic) return base;
  const common = {
    version: base.version,
    baseHash: base.hash,
    topic,
    role: base.role,
    errorDiagnostics: base.errorDiagnostics,
  };
  const wrap = (content: Readonly<Record<string, unknown>>) => {
    const guide = { ...common, ...content };
    return {
      ...guide,
      contentHash: createHash("sha256").update(canonicalJson(guide)).digest("hex"),
    };
  };
  switch (topic) {
    case "sql":
      return wrap({
        guidance: SQL_RUNTIME_GUIDANCE,
        sqlSummaries: base.sqlSummaries,
        queryContract: base.queryContract,
        executionLimits: base.executionLimits,
        fieldUses: base.fieldUses,
        results: base.results,
      });
    case "knowledge":
      return wrap({
        guidance: KNOWLEDGE_RUNTIME_GUIDANCE,
        sharedKnowledge: base.sharedKnowledge,
        library: base.library,
        relationshipPaths: base.relationshipPaths,
        structurePages: base.structurePages,
      });
    case "operations":
      return wrap({
        guidance: OPERATIONS_RUNTIME_GUIDANCE,
        operationResources: base.operationResources,
        operationKnowledge: base.operationKnowledge,
        operationRelationships: base.operationRelationships,
        integrationCredentials: base.integrationCredentials,
        executionLimits: base.executionLimits,
      });
    case "administration":
      return wrap({ guidance: PERSONA_ADMINISTRATION_GUIDANCE });
  }
}
