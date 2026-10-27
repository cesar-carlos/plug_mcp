import { expect, it } from "vitest";
import {
  buildDatasetPayload,
  canAddDatasetRow,
  DATASET_MAX_CELLS,
  DATASET_MAX_ROWS,
  datasetCellCount,
  datasetCellInputMode,
  datasetEditorDirty,
  datasetEditorErrorMessage,
  datasetRowCount,
  datasetTableFields,
  eligibleDatasetTables,
  emptyDatasetRow,
  isBooleanDatasetType,
  parseDatasetCell,
  remainingDatasetTables,
  type DatasetTableEdit,
  type DatasetTemplateTable,
} from "./knowledge-dataset-editor";

const tables: DatasetTemplateTable[] = [
  {
    id: "orders",
    name: "Pedidos",
    columns: [
      { name: "id", logicalType: "integer", nullable: false, classification: "livre" },
      { name: "secret", logicalType: "string", nullable: false, classification: "segredo" },
      { name: "flag", logicalType: "boolean", nullable: true, classification: "livre" },
      { name: "note", logicalType: "text", nullable: true, classification: "livre" },
    ],
  },
  {
    id: "empty",
    name: "Vazia",
    columns: [{ name: "hash", logicalType: "unknown", nullable: false, classification: "livre" }],
  },
];

it("restringe tabelas e campos livres com tipo reconhecido", () => {
  const eligible = eligibleDatasetTables(tables);
  expect(eligible.map((table) => table.id)).toEqual(["orders"]);
  expect(eligible[0]?.columns.map((column) => column.name)).toEqual(["id", "flag", "note"]);
  const edit: DatasetTableEdit = { id: "orders", columns: ["id"], rows: [] };
  expect(remainingDatasetTables(eligible, [edit]).map((table) => table.id)).toEqual([]);
  expect(datasetTableFields(eligible, edit).map((column) => column.name)).toEqual([
    "id",
    "flag",
    "note",
  ]);
  expect(isBooleanDatasetType("boolean")).toBe(true);
  expect(isBooleanDatasetType("integer")).toBe(false);
  expect(datasetCellInputMode("integer")).toBe("decimal");
  expect(datasetCellInputMode("text")).toBe("text");
});

it("marca sujeira local e respeita teto de linhas e células", () => {
  expect(
    datasetEditorDirty({
      slug: "",
      name: "",
      description: "",
      authorizationRef: "",
      provenance: "synthetic",
      chosenTable: "",
      tables: [],
    }),
  ).toBe(false);
  expect(
    datasetEditorDirty({
      slug: "",
      name: "",
      description: "",
      authorizationRef: "",
      provenance: "authorized",
      chosenTable: "",
      tables: [],
    }),
  ).toBe(true);
  const rows: DatasetTableEdit[] = [
    {
      id: "orders",
      columns: ["id", "flag"],
      rows: [emptyDatasetRow(eligibleDatasetTables(tables)[0].columns)],
    },
  ];
  expect(datasetRowCount(rows)).toBe(1);
  expect(datasetCellCount(rows)).toBe(2);
  expect(canAddDatasetRow(DATASET_MAX_ROWS, 0, 1)).toBe(false);
  expect(canAddDatasetRow(0, DATASET_MAX_CELLS, 1)).toBe(false);
  expect(canAddDatasetRow(0, DATASET_MAX_CELLS - 1, 1)).toBe(true);
});

it("converte células e recusa número inseguro sem executar consulta", () => {
  expect(parseDatasetCell({ text: "x", isNull: true }, "string")).toBeNull();
  expect(parseDatasetCell({ text: "true", isNull: false }, "boolean")).toBe(true);
  expect(parseDatasetCell({ text: "false", isNull: false }, "boolean")).toBe(false);
  expect(parseDatasetCell({ text: "12", isNull: false }, "integer")).toBe(12);
  expect(parseDatasetCell({ text: "1.5e2", isNull: false }, "number")).toBe(150);
  expect(parseDatasetCell({ text: "abc", isNull: false }, "string")).toBe("abc");
  expect(() => parseDatasetCell({ text: "", isNull: false }, "boolean")).toThrow(
    "Escolha verdadeiro ou falso.",
  );
  expect(() => parseDatasetCell({ text: "1.2", isNull: false }, "integer")).toThrow(
    "Informe um número válido; inteiros devem ter precisão segura.",
  );
  expect(() =>
    parseDatasetCell({ text: String(Number.MAX_SAFE_INTEGER + 1), isNull: false }, "integer"),
  ).toThrow("Informe um número válido; inteiros devem ter precisão segura.");
});

it("monta o payload editorial só com campos escolhidos", () => {
  const eligible = eligibleDatasetTables(tables);
  const payload = buildDatasetPayload({
    templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateVersion: 2,
    templateHash: "f".repeat(64),
    provenance: "authorized",
    description: "Amostra revisada",
    authorizationRef: "ticket-1",
    eligible,
    tables: [
      {
        id: "orders",
        columns: ["id", "flag"],
        rows: [
          {
            id: { text: "3", isNull: false },
            flag: { text: "true", isNull: false },
            note: { text: "ignorada", isNull: false },
          },
        ],
      },
    ],
  });
  expect(payload).toEqual({
    kind: "dataset",
    templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateVersion: 2,
    templateHash: "f".repeat(64),
    provenance: {
      kind: "authorized",
      description: "Amostra revisada",
      authorizationRef: "ticket-1",
    },
    tables: [
      {
        tableId: "orders",
        columns: [
          { name: "id", type: "integer" },
          { name: "flag", type: "boolean" },
        ],
        rows: [[3, true]],
      },
    ],
  });
  expect(() =>
    buildDatasetPayload({
      templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      templateVersion: 2,
      templateHash: "f".repeat(64),
      provenance: "synthetic",
      description: "vazio",
      authorizationRef: "",
      eligible,
      tables: [],
    }),
  ).toThrow("Adicione uma tabela e selecione ao menos um campo em cada tabela.");
  expect(
    datasetEditorErrorMessage(
      new Error(
        "Tabela orders, linha 1, campo id: Informe um número válido; inteiros devem ter precisão segura.",
      ),
    ),
  ).toContain("Tabela orders");
  expect(datasetEditorErrorMessage("x")).toBe("Confira os valores do dataset.");
});
