import { expect, it } from "vitest";
import { reactive } from "vue";
import {
  emptyFederation,
  emptyFederationCase,
  federationPublicationCandidate,
  federationSemanticsLabels,
  newStep,
  stepColumns,
} from "./federation-editor";
import type { CatalogPublication, PublishedPackage } from "../../../src/domain/persona-v2/catalog";
import {
  federationTrainingSchema,
  federationEditableCaseSchema,
  federationCaseSchema,
} from "../../../src/domain/persona-v2/federation-training";
import { federationTraining, federationCase } from "../../../tests/helpers/persona-v2-federation";
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
it("caso copia o contrato reativo sem adotar futuras edições nem produzir SQL", () => {
  const training = reactive(federationTraining(refs));
  const test = emptyFederationCase(training);
  const join = training.steps.find((s) => s.kind === "join")!;
  join.keys.push({ left: "amount", right: "amount" });
  expect(test.input.plan.steps[2]).not.toEqual(join);
  expect(test.input.plan.steps.filter((s) => s.kind === "local").every((s) => s.sql === "")).toBe(
    true,
  );
  expect(test.expected).toEqual({
    columns: ["id", "amount_a", "amount_b"],
    rows: [],
    totalRows: 0,
  });
});
it("projeções derivadas preservam a ordem, sem inferir referências ausentes ou ciclos", () => {
  const steps = federationTraining(refs).steps;
  const project = {
    kind: "project" as const,
    id: "selected",
    input: "combined",
    columns: [{ column: "amount_b", as: "value" }],
  };
  expect(
    stepColumns(
      [...steps, project, { kind: "sort", id: "ordered", input: "selected", order: [] }],
      "ordered",
    ),
  ).toEqual(["value"]);
  expect(stepColumns([{ kind: "sort", id: "loop", input: "loop", order: [] }], "loop")).toEqual([]);
  expect(stepColumns(steps, "absent")).toEqual([]);
});
it("criar etapas não inventa fontes, chaves ou instruções de negócio", () => {
  const draft = emptyFederation();
  expect(federationTrainingSchema.safeParse(draft).success).toBe(false);
  expect(newStep("aggregate", "total")).toEqual({
    kind: "aggregate",
    id: "total",
    input: "",
    dimensions: [],
    measures: [{ operation: "count", as: "count" }],
  });
});
it("casos sintéticos preservam decimais textuais, nulos e erros esperados", () => {
  const test = federationCaseSchema.parse(federationCase(refs));
  test.input.fixtures[0].rows[0].amount = "9007199254740993.01";
  test.input.fixtures[1].rows[0].amount = null;
  const parsed = federationEditableCaseSchema.parse(test);
  expect(parsed).toEqual(test);
  expect(
    federationEditableCaseSchema.safeParse({ ...test, expected: { errorCode: "INCOMPLETE_INPUT" } })
      .success,
  ).toBe(true);
});
it("casos pelo transporte têm sementes e resultado tipados; não converte formato sintético", () => {
  const basic = federationCase(refs);
  const test = {
    name: "Fixture independente",
    input: {
      plan: basic.input.plan,
      sources: refs.map((s) => ({
        sourceId: s.id,
        fixtures: [
          {
            table: "orders",
            generated: [],
            rows: [
              {
                id: { type: "integer", value: "9007199254740993" },
                amount: { type: "decimal", value: "10.25" },
              },
            ],
          },
        ],
      })),
    },
    expected: {
      columns: [{ name: "value", type: "decimal" }],
      rows: [{ value: { type: "decimal", value: "10.25" } }],
      ordered: true,
      totalRows: 1,
    },
  };
  expect(federationEditableCaseSchema.parse(test)).toEqual(test);
  expect(
    federationEditableCaseSchema.safeParse({
      ...test,
      expected: { ...test.expected, rows: [{ value: { type: "decimal", value: 10.25 } }] },
    }).success,
  ).toBe(false);
});
it("dependência de cruzamento exige publicação de consulta ativa na base vigente", () => {
  const publication = {
    id: "11111111-1111-4111-8111-111111111111",
    personaId: "22222222-2222-4222-8222-222222222222",
    skillId: "33333333-3333-4333-8333-333333333333",
    revision: 3,
    hash: "a".repeat(64),
    sourceVersion: 1,
    sourceFingerprint: "f",
    suspendedAt: null,
    package: {
      format: "persona-query-v2",
      name: "Pedidos",
      sourceId: "src-1",
      training: { tables: [] },
    },
  } as CatalogPublication<PublishedPackage>;
  const source = {
    id: "src-1",
    name: "ERP",
    dialect: "postgres",
    active: true,
  } as const;
  const candidate = federationPublicationCandidate(publication, [source]);
  expect(candidate).toMatchObject({
    id: publication.id,
    sourceId: "src-1",
    name: "Pedidos",
    sourceName: "ERP",
    dialect: "postgres",
  });
  expect(
    federationPublicationCandidate({ ...publication, suspendedAt: new Date() }, [source]),
  ).toBeNull();
  expect(federationPublicationCandidate(publication, [{ ...source, active: false }])).toBeNull();
  expect(Object.keys(federationSemanticsLabels)).toEqual(Object.keys(emptyFederation().semantics));
});
