import { PERSONA_V2_TRAINING_BASE as base } from "./training-base.js";
import { PERSONA_ADMINISTRATION_GUIDANCE } from "./runtime-administration-guidance.js";
import {
  SQL_RUNTIME_GUIDANCE,
  KNOWLEDGE_RUNTIME_GUIDANCE,
  OPERATIONS_RUNTIME_GUIDANCE,
} from "./runtime-task-guidance.js";
import { createHash } from "node:crypto";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { z } from "zod";

export const TRAINING_TOPICS = [
  "sql",
  "knowledge",
  "operations",
  "administration",
  "plug-server",
] as const;
export const trainingTopicInputSchema = z.strictObject({
  topic: z.enum(TRAINING_TOPICS).optional(),
});
function buildTrainingTopic(
  topic: (typeof TRAINING_TOPICS)[number],
): Readonly<Record<string, unknown>> & { contentHash: string } {
  const common = {
    version: base.version,
    baseHash: base.hash,
    topic,
    role: base.role,
    errorDiagnostics: base.errorDiagnostics,
    trainingIntake:
      topic === "knowledge"
        ? base.trainingIntake
        : 'Para lacunas editoriais, carregue obter_treinamento_base({topic:"knowledge"}) antes de encaminhar feedback ou solicitar melhoria. Confira a cobertura concedida e entregue a parte comprovada. Falha temporária, recusa de acesso ou resultado vazio não provam falta de treinamento. Não invente causas, IDs ou confirmação de envio; não envie SQL, parâmetros, resultados ou segredos. Não reenvie automaticamente nem abra pedidos duplicados. Curadoria e publicação são decisões separadas; conhecimento não concede autoridade.',
    trainingRequestExample: base.trainingRequestExample,
  };
  const wrap = (content: Readonly<Record<string, unknown>>) => {
    const guide = { ...common, ...content };
    return {
      ...guide,
      contentHash: createHash("sha256").update(canonicalJson(guide)).digest("hex"),
    };
  };
  switch (topic) {
    case "plug-server":
      return wrap({
        plugServer: base.plugServer,
        hubCommands: base.hubCommands,
        hubContract: base.hubContract,
        hubTransport: base.hubTransport,
        queryContract: base.queryContract,
        executionLimits: base.executionLimits,
        authority: base.authority,
      });
    case "sql":
      return wrap({
        guidance: SQL_RUNTIME_GUIDANCE,
        queryContinuity: base.queryContinuity,
        queryKnowledgeWorkflow: base.queryKnowledgeWorkflow,
        sqlSummaries: base.sqlSummaries,
        relationshipPaths: base.relationshipPaths,
        queryContract: base.queryContract,
        executionLimits: base.executionLimits,
        fieldUses: base.fieldUses,
        results: base.results,
      });
    case "knowledge":
      return wrap({
        guidance: KNOWLEDGE_RUNTIME_GUIDANCE,
        queryKnowledgeWorkflow: base.queryKnowledgeWorkflow,
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

// Static public guidance: hash once, but never share mutable nested response objects.
const topicJson = new Map(
  TRAINING_TOPICS.map((topic) => {
    const guide = buildTrainingTopic(topic);
    const json = JSON.stringify(guide);
    return [
      topic,
      { json, contentHash: guide.contentHash, bytes: Buffer.byteLength(json, "utf8") },
    ];
  }),
);

export interface TrainingManifest {
  version: string;
  baseHash: string;
  topics: { topic: (typeof TRAINING_TOPICS)[number]; contentHash: string; bytes: number }[];
}

/** Public content identity and JSON UTF-8 size, not a permission or publication fingerprint. */
export function trainingManifest(): TrainingManifest {
  return {
    version: base.version,
    baseHash: base.hash,
    topics: [...topicJson].map(([topic, guide]) => ({
      topic,
      contentHash: guide.contentHash,
      bytes: guide.bytes,
    })),
  };
}

export function trainingTopic(
  topic?: (typeof TRAINING_TOPICS)[number],
): Readonly<Record<string, unknown>> {
  if (!topic) return base;
  const guide = topicJson.get(topic);
  if (!guide) throw new Error("Unknown training topic");
  return JSON.parse(guide.json) as Record<string, unknown>;
}
