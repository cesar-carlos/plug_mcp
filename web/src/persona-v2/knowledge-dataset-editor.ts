import type { LibraryPayload } from "../../../src/application/persona-v2/knowledge-library-schema";
import { datasetLogicalType } from "../../../src/application/persona-v2/dataset-types";

export interface DatasetCell {
  text: string;
  isNull: boolean;
}

export interface DatasetTableEdit {
  id: string;
  columns: string[];
  rows: Record<string, DatasetCell>[];
}

export interface DatasetTemplateColumn {
  name: string;
  logicalType: string;
  nullable: boolean;
  classification: string;
}

export interface DatasetTemplateTable {
  id: string;
  name: string;
  columns: readonly DatasetTemplateColumn[];
}

export const DATASET_MAX_ROWS = 1000;
export const DATASET_MAX_CELLS = 20000;

export type DatasetProvenanceKind = "synthetic" | "authorized";
export type DatasetPayload = Extract<LibraryPayload, { kind: "dataset" }>;

export function eligibleDatasetTables(
  tables: readonly DatasetTemplateTable[],
): DatasetTemplateTable[] {
  return tables
    .map((table) => ({
      ...table,
      columns: table.columns.filter(
        (column) => column.classification === "livre" && datasetLogicalType(column.logicalType),
      ),
    }))
    .filter((table) => table.columns.length);
}

export function remainingDatasetTables(
  eligible: readonly DatasetTemplateTable[],
  tables: readonly DatasetTableEdit[],
): DatasetTemplateTable[] {
  return eligible.filter((table) => !tables.some((item) => item.id === table.id));
}

export function datasetEditorDirty(input: {
  slug: string;
  name: string;
  description: string;
  authorizationRef: string;
  provenance: DatasetProvenanceKind;
  chosenTable: string;
  tables: readonly DatasetTableEdit[];
}): boolean {
  return Boolean(
    input.slug ||
    input.name ||
    input.description ||
    input.authorizationRef ||
    input.provenance !== "synthetic" ||
    input.chosenTable ||
    input.tables.length,
  );
}

export function datasetRowCount(tables: readonly DatasetTableEdit[]): number {
  return tables.reduce((sum, table) => sum + table.rows.length, 0);
}

export function datasetCellCount(tables: readonly DatasetTableEdit[]): number {
  return tables.reduce((sum, table) => sum + table.rows.length * table.columns.length, 0);
}

export function canAddDatasetRow(
  rowCount: number,
  cellCount: number,
  columnCount: number,
): boolean {
  return rowCount < DATASET_MAX_ROWS && cellCount + columnCount <= DATASET_MAX_CELLS;
}

export function datasetTableFields(
  eligible: readonly DatasetTemplateTable[],
  table: DatasetTableEdit,
): readonly DatasetTemplateColumn[] {
  return eligible.find((item) => item.id === table.id)?.columns ?? [];
}

export function emptyDatasetRow(
  columns: readonly DatasetTemplateColumn[],
): Record<string, DatasetCell> {
  return Object.fromEntries(columns.map((column) => [column.name, { text: "", isNull: false }]));
}

export function isBooleanDatasetType(logicalType: string): boolean {
  return datasetLogicalType(logicalType) === "boolean";
}

export function datasetCellInputMode(logicalType: string): "decimal" | "text" {
  const type = datasetLogicalType(logicalType);
  return type === "integer" || type === "number" || type === "decimal" ? "decimal" : "text";
}

export function parseDatasetCell(
  cell: DatasetCell,
  type: string,
): string | number | boolean | null {
  if (cell.isNull) {
    return null;
  }
  if (type === "boolean") {
    if (cell.text !== "true" && cell.text !== "false") {
      throw new Error("Escolha verdadeiro ou falso.");
    }
    return cell.text === "true";
  }
  if (type === "integer" || type === "number") {
    const syntax = type === "integer" ? /^-?\d+$/ : /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
    const number = Number(cell.text);
    if (
      !syntax.test(cell.text) ||
      !Number.isFinite(number) ||
      (type === "integer" && !Number.isSafeInteger(number))
    ) {
      throw new Error("Informe um número válido; inteiros devem ter precisão segura.");
    }
    return number;
  }
  return cell.text;
}

export function buildDatasetPayload(input: {
  templateId: string;
  templateVersion: number;
  templateHash: string;
  provenance: DatasetProvenanceKind;
  description: string;
  authorizationRef: string;
  tables: readonly DatasetTableEdit[];
  eligible: readonly DatasetTemplateTable[];
}): DatasetPayload {
  if (!input.tables.length || input.tables.some((table) => !table.columns.length)) {
    throw new Error("Adicione uma tabela e selecione ao menos um campo em cada tabela.");
  }
  return {
    kind: "dataset",
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    templateHash: input.templateHash,
    provenance:
      input.provenance === "synthetic"
        ? { kind: "synthetic", description: input.description }
        : {
            kind: "authorized",
            description: input.description,
            authorizationRef: input.authorizationRef,
          },
    tables: input.tables.map((table) => {
      const columns = datasetTableFields(input.eligible, table)
        .filter((column) => table.columns.includes(column.name))
        .map((column) => ({
          name: column.name,
          type: datasetLogicalType(column.logicalType)!,
        }));
      return {
        tableId: table.id,
        columns,
        rows: table.rows.map((row, index) =>
          columns.map((column) => {
            const cell = row[column.name];
            try {
              if (!cell) {
                throw new Error("Valor inválido.");
              }
              return parseDatasetCell(cell, column.type);
            } catch (cause) {
              throw new Error(
                `Tabela ${table.id}, linha ${index + 1}, campo ${column.name}: ${cause instanceof Error ? cause.message : "Valor inválido."}`,
                { cause },
              );
            }
          }),
        ),
      };
    }),
  };
}

export function datasetEditorErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Confira os valores do dataset.";
}
