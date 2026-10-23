import type { FederationPlan } from "../../src/domain/persona-v2/federation.js";

export const federationTraining = (sources: readonly { id: string; publicationId: string }[]) => ({
  purpose: "Comparar valores de pedidos entre duas bases sintéticas",
  semantics: {
    matching: "Igualdade exata do ID compartilhado",
    normalization: "IDs inteiros; sem coerção implícita",
    missing: "LEFT preserva ausência como null",
    duplicates: "Recusar duplicidade: um registro por ID em cada base",
    units: "Valores monetários",
    currency: "BRL nas duas fontes; sem conversão",
    calendar: "Mesmo calendário comercial",
  },
  steps: [
    ...sources.slice(0, 2).map((s, i) => ({
      kind: "local" as const,
      id: i === 0 ? "a" : "b",
      sourceId: s.id,
      publicationId: s.publicationId,
      columns: ["id", "amount"],
    })),
    {
      kind: "join" as const,
      id: "combined",
      left: "a",
      right: "b",
      join: "left" as const,
      keys: [{ left: "id", right: "id" }],
      cardinality: "one_to_one" as const,
      columns: [
        { side: "left" as const, column: "id", as: "id" },
        { side: "left" as const, column: "amount", as: "amount_a" },
        { side: "right" as const, column: "amount", as: "amount_b" },
      ],
    },
  ],
  output: "combined",
  budget: {},
});
export const federationPlan = (
  sources: readonly { id: string; publicationId: string }[],
  publicationId: string,
): FederationPlan => {
  const training = federationTraining(sources);
  return {
    publicationId,
    steps: training.steps.map((s) =>
      s.kind === "local"
        ? {
            kind: s.kind,
            id: s.id,
            sourceId: s.sourceId,
            publicationId: s.publicationId,
            sql: "SELECT p.id,p.amount FROM orders p WHERE p.id > :minimum ORDER BY p.id",
            params: { minimum: 0 },
          }
        : s,
    ),
    output: training.output,
    page: 1,
    pageSize: 10,
  };
};
export const federationCase = (sources: readonly { id: string; publicationId: string }[]) => ({
  name: "IDs iguais e valores em BRL",
  input: {
    plan: federationPlan(sources, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    fixtures: [
      {
        stepId: "a",
        columns: ["id", "amount"],
        rows: [
          { id: 1, amount: "10.25" },
          { id: 2, amount: "20.50" },
        ],
        truncated: false,
      },
      {
        stepId: "b",
        columns: ["id", "amount"],
        rows: [
          { id: 1, amount: "100.75" },
          { id: 2, amount: "200.25" },
        ],
        truncated: false,
      },
    ],
  },
  expected: {
    rows: [
      { id: 1, amount_a: "10.25", amount_b: "100.75" },
      { id: 2, amount_a: "20.50", amount_b: "200.25" },
    ],
    columns: ["id", "amount_a", "amount_b"],
    totalRows: 2,
  },
});
