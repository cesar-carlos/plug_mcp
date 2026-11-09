import { expect, it } from "vitest";
import { normalizeSqlResult } from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";

it("não escolhe silenciosamente entre coleções de metadados divergentes", () => {
  expect(() =>
    normalizeSqlResult({
      columns: ["value"],
      rows: [],
      column_metadata: [{ name: "value", odbc_type: 7 }],
      columns_metadata: [{ name: "value", odbc_type: 12 }],
    }),
  ).toThrow();
  expect(
    normalizeSqlResult({
      columns: ["value"],
      rows: [],
      column_metadata: [{ name: "value", odbc_type: 7 }],
      columns_metadata: [{ odbc_type: 7, name: "value" }],
    }).columnsMetadata,
  ).toEqual([{ name: "value", odbcType: 7 }]);
});

it.each([
  { name: "value", odbc_type: null, odbcType: 7 },
  { name: "value", odbc_type: 12, odbcType: 7 },
  { name: "value", column_name: "other" },
  { name: "value", type: "VARCHAR", data_type: "BINARY" },
  { name: "value", nullable: false, is_nullable: true },
  { name: "value", nullable: "false" },
  { name: "value", type: 7 },
])("recusa metadados contraditórios/malformados: %j", (metadata) => {
  expect(() =>
    normalizeSqlResult({ columns: ["value"], rows: [], column_metadata: [metadata] }),
  ).toThrow();
});

it("preserva aliases compatíveis sem perder tipo ou nulabilidade", () => {
  expect(
    normalizeSqlResult({
      columns: ["value"],
      rows: [],
      column_metadata: [
        {
          name: "value",
          column_name: "value",
          type: "BINARY",
          data_type: "BINARY",
          nullable: false,
          is_nullable: false,
          odbc_type: 7,
          odbcType: 7,
          type_system: "odbc_fast",
        },
      ],
    }).columnsMetadata,
  ).toEqual([
    { name: "value", type: "BINARY", nullable: false, odbcType: 7, typeSystem: "odbc_fast" },
  ]);
});
