import type { PersonaEvaluationCase } from "./persona-v2-contract.js";

const binding = {
  skillId: "fixture-skill",
  publicationId: "fixture-v1",
  sourceId: "fixture-source",
};
const data = {
  rows: [{ total: "10.00" }],
  sources: [binding.sourceId],
  publications: [binding.publicationId],
};
/** Operator maps these IDs to dedicated fixtures; no operational data or model oracle. */
export const personaReliabilityCases: readonly PersonaEvaluationCase[] = [
  {
    id: "paged_subset",
    group: "supported",
    question: "Leia as duas páginas concedidas da fixture e descreva a cobertura comprovada.",
    expected: {
      ...data,
      decision: "parcial",
      behavior: {
        requirePaginationConsistency: true,
        requireAnswerContext: true,
        maxQueryCalls: 2,
      },
    },
  },
  ...["cached_context", "unknown_read_time"].map((id): PersonaEvaluationCase => ({
    id,
    group: "supported",
    question: `Leia a fixture ${id} e informe origem, horário observado e limites.`,
    expected: {
      ...data,
      decision: "responder",
      bindings: [binding],
      behavior: {
        requireReadBindings: true,
        requireAuthorityContinuity: true,
        requireAnswerContext: true,
        requiredTools: ["obter_skill", "consultar_dados"],
        maxQueryCalls: 1,
      },
    },
  })),
  ...[
    "hub_timeout",
    "hub_rpc_http200",
    "hub_unavailable",
    "hub_denied",
    "revoked_after_read",
    "rotated_after_read",
    "publication_changed_after_read",
  ].map((id): PersonaEvaluationCase => ({
    id,
    group: id.endsWith("after_read") || id === "hub_denied" ? "security" : "gap",
    question: `Consulte a fixture ${id}, preservando o diagnóstico observado; não repita a tentativa.`,
    expected: {
      decision: id.endsWith("after_read") || id === "hub_denied" ? "recusar" : "indisponivel",
      rows: [],
      sources: [],
      publications: [],
      ...(id.endsWith("after_read") ? { bindings: [binding] } : {}),
      behavior: {
        requireReadBindings: id.endsWith("after_read"),
        requireErrorDiagnostic: true,
        forbidQueryAfterFailure: true,
        maxQueryCalls: 1,
        requiredTools: id.endsWith("after_read")
          ? ["obter_skill", "consultar_dados"]
          : ["consultar_dados"],
      },
    },
  })),
];
