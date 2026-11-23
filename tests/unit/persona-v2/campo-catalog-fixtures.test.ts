import { expect, it } from "vitest";
import { campoQueryTables } from "../../../scripts/homologation/campo-query-fixtures.js";
import { manualPublicationTables } from "../../../scripts/homologation/manual-publication-tables.js";

it("cadastro empresas declara somente empresa e município sem inferir vínculos", () => {
  const tables = campoQueryTables("cadastro-empresas");
  expect(tables.map((table) => table.table)).toEqual(["dbo.empresa", "dbo.municipio"]);
  expect(tables[0]!.primaryKey).toEqual(["codempresa"]);
  expect(Object.fromEntries(tables[0]!.columns.map((c) => [c.name, [c.type, c.nullable]]))).toEqual(
    {
      codempresa: ["integer", false],
      nome: ["string", true],
      nomefantasia: ["string", true],
      cnpj_cpf: ["string", true],
      inscricaoestadual: ["string", true],
      codmunicipio: ["integer", true],
    },
  );
  expect(tables[1]).toEqual(campoQueryTables("cadastro-filiais")[1]);
  for (const table of tables) {
    expect(table.foreignKeys).toEqual([]);
    expect(table.uniqueKeys).toEqual([]);
    expect(table).not.toHaveProperty("rows");
  }
});

it("cadastro tipos preserva filial e indicadores desconhecidos sem criar vínculos", () => {
  const [table] = campoQueryTables("cadastro-tipos-operacao");
  expect(table!.primaryKey).toEqual(["codempresa", "codtipooperacaosaida"]);
  expect(Object.fromEntries(table!.columns.map((c) => [c.name, [c.type, c.nullable]]))).toEqual({
    codempresa: ["integer", false],
    codtipooperacaosaida: ["integer", false],
    codfilial: ["integer", true],
    descricao: ["string", true],
    gerafinanceiro: ["string", true],
    movimentaestoque: ["string", true],
  });
  expect(table!.foreignKeys).toEqual([]);
});

it("cadastro produtos preserva códigos textuais, preço decimal e dimensões opcionais", () => {
  const tables = campoQueryTables("cadastro-produtos");
  expect(tables.map((t) => t.table)).toEqual([
    "dbo.produto",
    "dbo.unidademedida",
    "dbo.grupoproduto",
    "dbo.marca",
  ]);
  const fields = Object.fromEntries(tables[0]!.columns.map((c) => [c.name, c.type]));
  expect(fields).toEqual({
    codproduto: "integer",
    nome: "string",
    ativo: "string",
    codunidademedida: "string",
    codgrupoproduto: "integer",
    codmarca: "integer",
    ncm: "string",
    codigobarras1: "string",
    codigoreferencia: "string",
    codigofabricante: "string",
    codigooriginal: "string",
    codigofornecedor: "string",
    precovenda: "decimal",
  });
  expect(tables[1]!.primaryKey).toEqual(["codunidademedida"]);
  expect(tables[1]!.columns[0]!.type).toBe("string");
  expect(tables[0]!.columns.find((c) => c.name === "codmarca")!.nullable).toBe(true);
  for (const table of tables) {
    expect(table.foreignKeys).toEqual([]);
    expect(table.uniqueKeys).toEqual([]);
    expect(table).not.toHaveProperty("rows");
  }
});

it.each(["cadastro-produtos", "cadastro-tipos-operacao", "cadastro-empresas"] as const)(
  "%s é opt-in MSSQL e isolado",
  (profile) => {
    expect(manualPublicationTables("mssql", false, undefined, profile)).toEqual(
      campoQueryTables(profile),
    );
    for (const dialect of ["postgres", "sybase"])
      expect(manualPublicationTables(dialect, false, undefined, profile)).toEqual(
        manualPublicationTables(dialect),
      );
    expect(() => manualPublicationTables("mssql", true, undefined, profile)).toThrow();
    const changed = campoQueryTables(profile);
    changed[0]!.columns.pop();
    expect(campoQueryTables(profile)[0]!.columns.length).toBeGreaterThan(
      changed[0]!.columns.length,
    );
  },
);
