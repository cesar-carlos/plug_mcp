import { expect, it } from "vitest";
import {
  adoptTraining,
  scopeForContent,
  type KnowledgeSelection,
  type Inspection,
  type Content,
} from "./knowledge-model";
import { emptyTraining } from "./model";
const content: Content = {
  system: "Fixture",
  label: "1",
  dialects: ["postgres"],
  tables: [
    {
      id: "orders",
      name: "orders",
      meaning: "Pedidos",
      resourceType: "table",
      grain: ["id"],
      physicalNames: [{ dialect: "postgres", name: "public.orders" }],
      columns: [
        {
          name: "id",
          meaning: "Chave",
          logicalType: "integer",
          nullable: false,
          classification: "livre",
        },
        {
          name: "amount",
          meaning: "Valor",
          logicalType: "decimal",
          nullable: true,
          classification: "livre",
        },
      ],
    },
  ],
  relationships: [],
  examples: [],
  rules: ["Valores em BRL"],
};
const selection: KnowledgeSelection = {
  catalogId: "catalog",
  standard: {
    id: "standard",
    patternId: "pattern",
    revision: 1,
    hash: "hash",
    content,
    suspendedAt: null,
  },
};
const evidence = { id: "evidence" } as Inspection;
it("aplica versão explícita sem alterar SQL, parâmetros ou objeto original", () => {
  const training = {
    ...emptyTraining(),
    sourceId: "source",
    dialect: "postgres" as const,
    sqlModel: "SELECT id FROM public.orders WHERE id>:minimum",
    parameters: [{ name: "minimum", type: "number" as const, required: true, meaning: "Mínimo" }],
  };
  const copy = JSON.stringify(training);
  const adopted = adoptTraining(training, selection, evidence, ["orders"], ["orders.id"]);
  expect(adopted.sqlModel).toBe(training.sqlModel);
  expect(adopted.parameters).toEqual(training.parameters);
  expect(adopted.sharedKnowledge).toEqual({
    catalogId: "catalog",
    publicationId: "standard",
    evidenceId: "evidence",
  });
  expect(adopted.columns.map((c) => c.name)).toEqual(["id"]);
  expect(JSON.stringify(training)).toBe(copy);
});
it("recusa ausência do grão e segredos; pessoal exige finalidades posteriores no editor", () => {
  const training = { ...emptyTraining(), dialect: "postgres" as const };
  expect(() => adoptTraining(training, selection, evidence, ["orders"], ["orders.amount"])).toThrow(
    /grão/,
  );
  const restricted = structuredClone(selection);
  restricted.standard.content.tables[0].columns[0].classification = "pessoal";
  const adopted = adoptTraining(training, restricted, evidence, ["orders"], ["orders.id"]);
  expect(adopted.columns[0]).toMatchObject({ classification: "pessoal" });
  expect(adopted.columns[0]?.uses).toBeUndefined();
  restricted.standard.content.tables[0].columns[0].classification = "segredo";
  expect(() => adoptTraining(training, restricted, evidence, ["orders"], ["orders.id"])).toThrow(
    /segredos/,
  );
});
it("não adivinha schema e usa escopo nulo para Firebird", () => {
  expect(scopeForContent(content, "postgres")).toEqual([
    { schema: "public", name: "orders", type: "table" },
  ]);
  expect(() => scopeForContent(content, "mssql")).toThrow(/schema/);
  expect(scopeForContent(content, "firebird")).toEqual([
    { schema: null, name: "orders", type: "table" },
  ]);
});
it("adota intermediária e IDs dos elos sem transformar N:N em relação direta", () => {
  const selected = structuredClone(selection);
  selected.standard.content.tables = ["a", "ab", "b"].map((id) => ({
    ...structuredClone(content.tables[0]),
    id,
    name: id,
    grain: ["id"],
    physicalNames: [{ dialect: "postgres", name: `public.${id}` }],
  }));
  const edge = (id: string, from: string, to: string, cardinality: "1:N" | "N:1" | "N:N") => ({
    id,
    from,
    to,
    keys: [{ from: "id", to: "id" }],
    join: "inner" as const,
    cardinality,
    optional: false,
    meaning: id,
    via: [] as string[],
  });
  selected.standard.content.relationships = [
    edge("a_links", "a", "ab", "1:N"),
    edge("link_b", "ab", "b", "N:1"),
    { ...edge("a_b", "a", "b", "N:N"), via: ["ab"], path: ["a_links", "link_b"] },
  ];
  const training = { ...emptyTraining(), dialect: "postgres" as const };
  const adopted = adoptTraining(
    training,
    selected,
    evidence,
    ["a", "ab", "b"],
    ["a.id", "ab.id", "b.id"],
  );
  expect(adopted.relationships[2]).toMatchObject({
    id: "a_b",
    via: ["public.ab"],
    path: ["a_links", "link_b"],
  });
  expect(adopted.relationships.slice(0, 2).every((r) => r.id && !r.via?.length)).toBe(true);
  expect(training.relationships).toEqual([]);
});
