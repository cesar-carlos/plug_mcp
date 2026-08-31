import { describe, expect, it } from "vitest";
import {
  agruparColunasCatalogo,
  isIdentificadorSql,
  sqlDescreverTabela,
} from "../../src/application/use-cases/shared/schema-introspection.js";

describe("agruparColunasCatalogo", () => {
  it("colapsa tipos explodidos em uma linha por coluna sem gravar a explosão", () => {
    const { colunas, ambiguas } = agruparColunasCatalogo([
      { column_name: "DtEmissao", data_type: "datetime", is_nullable: "YES" },
      { column_name: "DtEmissao", data_type: "uniqueidentifier", is_nullable: "YES" },
      { column_name: "DtEmissao", data_type: "geometry", is_nullable: "YES" },
      { column_name: "DtEmissao", data_type: "xml", is_nullable: "YES" },
      { column_name: "Valor", data_type: "numeric", is_nullable: "NO" },
    ]);
    expect(ambiguas).toBe(true);
    expect(colunas).toHaveLength(2);
    expect(colunas[0]).toEqual({ nome: "DtEmissao", tipo: "", nullable: "YES" });
    expect(colunas[1]).toEqual({ nome: "Valor", tipo: "numeric", nullable: "NO" });
  });

  it("preserva tipo único", () => {
    const { colunas, ambiguas } = agruparColunasCatalogo([
      { column_name: "CodConta", data_type: "int", is_nullable: "NO" },
    ]);
    expect(ambiguas).toBe(false);
    expect(colunas).toEqual([{ nome: "CodConta", tipo: "int", nullable: "NO" }]);
  });

  it("ignora nome que não é identificador SQL", () => {
    const { colunas } = agruparColunasCatalogo([
      { column_name: "ValorPago", data_type: "numeric", is_nullable: "NO" },
      { column_name: "Status / Situacao pagar", data_type: "", is_nullable: "YES" },
    ]);
    expect(colunas.map((coluna) => coluna.nome)).toEqual(["ValorPago"]);
  });
});

describe("isIdentificadorSql", () => {
  it("aceita identificador físico e recusa título de anotação", () => {
    expect(isIdentificadorSql("DataPagamento")).toBe(true);
    expect(isIdentificadorSql("ValorPago")).toBe(true);
    expect(isIdentificadorSql("Status / Situacao pagar")).toBe(false);
  });
});

describe("sqlDescreverTabela mssql", () => {
  it("junta user_type_id e system_type_id", () => {
    const sql = sqlDescreverTabela("mssql", false);
    expect(sql).toContain("t.user_type_id = c.user_type_id");
    expect(sql).toContain("t.system_type_id = c.system_type_id");
  });
});
