import { expect, it } from "vitest";
import {
  buildFederationPlan,
  federationConsumerSemantics,
  federationSourceName,
  type FederationConsumerContext,
  type FederationLocalInput,
} from "./federation-consumer";

const refs = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    publicationId: "22222222-2222-4222-8222-222222222222",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    publicationId: "44444444-4444-4444-8444-444444444444",
  },
];

const pkg: Pick<FederationConsumerContext, "publicationId" | "output" | "steps"> = {
  publicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  output: "combined",
  steps: [
    {
      kind: "local",
      id: "a",
      sourceId: refs[0].id,
      publicationId: refs[0].publicationId,
      columns: ["id", "amount"],
    },
    {
      kind: "local",
      id: "b",
      sourceId: refs[1].id,
      publicationId: refs[1].publicationId,
      columns: ["id", "amount"],
    },
    {
      kind: "join",
      id: "combined",
      left: "a",
      right: "b",
      join: "left",
      cardinality: "one_to_one",
      keys: [{ left: "id", right: "id" }],
      columns: [{ side: "left", column: "id", as: "id" }],
    },
  ],
};

function input(id: string, sourceId: string, publicationId: string): FederationLocalInput {
  return {
    id,
    sourceId,
    publicationId,
    name: id,
    sql: `SELECT ${id}.id`,
    parameters: [
      { name: "minimum", type: "string", required: true, meaning: "Mínimo" },
      { name: "flag", type: "boolean", required: false, meaning: "Flag" },
    ],
    values: { minimum: "10", flag: "true" },
    modes: {},
  };
}

it("rótulos do consumidor não reutilizam o texto editorial do treinamento", () => {
  expect(federationConsumerSemantics.matching).toBe("Correspondência");
  expect(federationSourceName([{ id: "src", name: "ERP" }], "src")).toBe("ERP");
  expect(federationSourceName([{ id: "src", name: "ERP" }], "missing")).toBe("missing");
});

it("plano local adapta SQL e parâmetros sem alterar etapas combinadas", () => {
  const plan = buildFederationPlan(
    pkg,
    [
      input("a", refs[0].id, refs[0].publicationId),
      {
        ...input("b", refs[1].id, refs[1].publicationId),
        modes: { flag: "omit" },
        values: { minimum: "2" },
      },
    ],
    3,
    50,
  );
  expect(plan.publicationId).toBe(pkg.publicationId);
  expect(plan.output).toBe("combined");
  expect(plan.page).toBe(3);
  expect(plan.pageSize).toBe(50);
  expect(plan.steps[0]).toEqual({
    kind: "local",
    id: "a",
    sourceId: refs[0].id,
    publicationId: refs[0].publicationId,
    sql: "SELECT a.id",
    params: { minimum: "10", flag: true },
  });
  expect(plan.steps[1]).toMatchObject({
    kind: "local",
    id: "b",
    params: { minimum: "2" },
  });
  expect(plan.steps[2]).toEqual(pkg.steps[2]);
});

it("plano recusa parâmetro obrigatório ausente e não inventa etapa local", () => {
  expect(() =>
    buildFederationPlan(
      pkg,
      [
        { ...input("a", refs[0].id, refs[0].publicationId), values: {}, modes: {} },
        input("b", refs[1].id, refs[1].publicationId),
      ],
      1,
      100,
    ),
  ).toThrow("Informe Mínimo (minimum).");
  expect(() =>
    buildFederationPlan(pkg, [input("b", refs[1].id, refs[1].publicationId)], 1, 100),
  ).toThrow();
});
