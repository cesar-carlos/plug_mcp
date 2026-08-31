import { describe, expect, it } from "vitest";
import {
  applySelectAliasHints,
  columnMetadataItemSchema,
  hintsFromGrafoColunas,
  normalizeColumnsMetadata,
} from "../../src/application/use-cases/shared/columns-metadata.js";

describe("normalizeColumnsMetadata", () => {
  it("aceita item só com name no contrato Zod do outputSchema", () => {
    expect(columnMetadataItemSchema.parse({ name: "SaldoReceber" })).toEqual({
      name: "SaldoReceber",
    });
  });

  it("preenche type e nullable com null quando o hub omite", () => {
    expect(normalizeColumnsMetadata(["SaldoReceber"], [{ name: "SaldoReceber" }])).toEqual([
      { name: "SaldoReceber", type: null, nullable: null },
    ]);
  });

  it("trata type vazio do hub como ausente e cai no grafo", () => {
    const hints = hintsFromGrafoColunas([
      { nome: "SaldoReceber", tipo: "numeric", nullable: false },
    ]);
    expect(
      normalizeColumnsMetadata(
        ["SaldoReceber"],
        [{ name: "SaldoReceber", type: "  ", nullable: true }],
        hints,
      ),
    ).toEqual([{ name: "SaldoReceber", type: "numeric", nullable: true }]);
  });

  it("prefere hub e cai no grafo", () => {
    const hints = hintsFromGrafoColunas([
      { nome: "SaldoReceber", tipo: "numeric", nullable: false },
    ]);
    expect(normalizeColumnsMetadata(["SaldoReceber"], [{ name: "SaldoReceber" }], hints)).toEqual([
      { name: "SaldoReceber", type: "numeric", nullable: false },
    ]);
    expect(
      normalizeColumnsMetadata(
        ["SaldoReceber"],
        [{ name: "SaldoReceber", type: "decimal", nullable: true }],
        hints,
      ),
    ).toEqual([{ name: "SaldoReceber", type: "decimal", nullable: true }]);
  });

  it("copia hint da coluna física para o alias de column_ref", () => {
    const hints = hintsFromGrafoColunas([{ nome: "codprod", tipo: "int", nullable: false }]);
    applySelectAliasHints(hints, [
      { alias: "codigo", column: "codprod", isExpression: false, isStar: false },
    ]);
    expect(normalizeColumnsMetadata(["codigo"], [{ name: "codigo" }], hints)).toEqual([
      { name: "codigo", type: "int", nullable: false },
    ]);
  });

  it("não copia hint para CAST nem agregação", () => {
    const hints = hintsFromGrafoColunas([
      { nome: "SaldoReceber", tipo: "numeric", nullable: false },
    ]);
    applySelectAliasHints(hints, [
      { alias: "total", column: "SaldoReceber", isExpression: true, isStar: false },
      { alias: "emissao", column: "DataEmissao", isExpression: true, isStar: false },
    ]);
    expect(normalizeColumnsMetadata(["total", "emissao"], undefined, hints)).toEqual([
      { name: "total", type: null, nullable: null },
      { name: "emissao", type: null, nullable: null },
    ]);
  });
});
