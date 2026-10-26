import { expect, it } from "vitest";
import { assertOperationDatasetColumns } from "../../../src/application/persona-v2/operation-dataset.js";
import {
  templatePayloadSchema,
  type LibraryPayload,
} from "../../../src/application/persona-v2/knowledge-library-schema.js";
import { structureContent } from "../../helpers/persona-v2-structure.js";
import { operationTraining } from "../../helpers/persona-v2-operation.js";

function fixture() {
  const template = templatePayloadSchema.parse({ kind: "template", content: structureContent() });
  const dataset: Extract<LibraryPayload, { kind: "dataset" }> = {
    kind: "dataset",
    templateId: "11111111-1111-4111-8111-111111111111",
    templateVersion: 1,
    templateHash: "a".repeat(64),
    provenance: { kind: "synthetic", description: "Fixture" },
    tables: [{ tableId: "orders", columns: [{ name: "amount", type: "decimal" }], rows: [] }],
  };
  return { template, dataset, training: operationTraining() };
}
for (const dialect of ["postgres", "mssql", "sybase"] as const) {
  it(`conserva nome físico exato do dataset para operação ${dialect}`, () => {
    const { template, dataset, training } = fixture();
    training.dialect = dialect;
    template.content.tables[0]!.physicalNames = [{ dialect, name: "fixture.orders" }];
    expect(() => assertOperationDatasetColumns(dataset, template, training)).toThrow(/Tabela/);
    training.tables[0]!.name = "fixture.orders";
    expect(() => assertOperationDatasetColumns(dataset, template, training)).not.toThrow();
  });
}
it("recusa tipo e classificação incompatíveis mesmo com zero linhas ou somente nulos", () => {
  const { template, dataset, training } = fixture();
  const amount = training.tables[0]!.columns.find((column) => column.name === "amount")!;
  amount.type = "integer";
  expect(() => assertOperationDatasetColumns(dataset, template, training)).toThrow(/Coluna/);
  dataset.tables[0]!.rows = [[null]];
  expect(() => assertOperationDatasetColumns(dataset, template, training)).toThrow(/Coluna/);
  amount.type = "decimal";
  for (const classification of ["pessoal", "sensivel", "segredo", "inferido"] as const) {
    amount.classification = classification;
    expect(() => assertOperationDatasetColumns(dataset, template, training)).toThrow(/Coluna/);
  }
});
it("recusa coluna removida e view sem inferir compatibilidade", () => {
  const { template, dataset, training } = fixture();
  training.tables[0]!.columns = training.tables[0]!.columns.filter(
    (column) => column.name !== "amount",
  );
  expect(() => assertOperationDatasetColumns(dataset, template, training)).toThrow(/Coluna/);
  template.content.tables[0]!.resourceType = "view";
  expect(() => assertOperationDatasetColumns(dataset, template, operationTraining())).toThrow(
    /tabela física/,
  );
});
