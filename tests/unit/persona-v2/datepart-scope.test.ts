import { expect, it } from "vitest";
import { parseSelect } from "../../../src/application/use-cases/shared/sql-ast.js";
import { validarSqlNoEscopo } from "../../../src/application/use-cases/shared/validar-escopo.js";
import { escopoFromSqlModelo } from "../../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../../src/application/use-cases/shared/sql-modelo.js";

const from = " FROM vendas v JOIN tipos t ON t.id=v.tipo";
const scope = escopoFromSqlModelo(
  parseSqlModelo("SELECT v.id, v.data, v.day, t.day" + from, "mssql"),
);

it.each(["day", "dd", "d", "month", "mm", "year", "yyyy", "hour", "mi", "ns"])(
  "DATEADD reconhece unidade %s no filtro com JOIN e parâmetros",
  (unit) => {
    const sql =
      "SELECT v.id" +
      from +
      ` WHERE v.data >= CAST(:inicio AS date) AND v.data < DATEADD(${unit}, :quantidade, CAST(:fim AS date))`;
    const ast = validarSqlNoEscopo(sql, "mssql", scope);
    expect(ast.sql).toBe(sql);
    expect(ast.usageRefs?.filtro).toEqual([
      { table: "v", column: "data" },
      { table: "v", column: "data" },
    ]);
  },
);

it.each(["DATEADD", "DATEDIFF", "DATEDIFF_BIG"])("%s não oculta colunas day reais", (fn) => {
  const sql = `SELECT ${fn}(day, v.day, t.day) AS n` + from + " WHERE v.id > :minimum";
  const ast = validarSqlNoEscopo(sql, "mssql", scope);
  expect(ast.usageRefs?.projecao).toEqual([
    { table: "v", column: "day" },
    { table: "t", column: "day" },
  ]);
  expect(() => validarSqlNoEscopo(sql.replace("v.day", "day"), "mssql", scope)).toThrow(
    expect.objectContaining({ code: "COLUNA_AMBIGUA" }),
  );
  expect(() => validarSqlNoEscopo(sql.replace("t.day", "t.segredo"), "mssql", scope)).toThrow(
    expect.objectContaining({ code: "COLUNA_FORA_DO_ESCOPO" }),
  );
});

it("não normaliza unidade desconhecida, qualificada ou função de outro dialeto", () => {
  for (const unit of ["unidade_desconhecida", "v.segredo"]) {
    expect(() =>
      validarSqlNoEscopo(`SELECT DATEADD(${unit},1,v.data) AS n` + from, "mssql", scope),
    ).toThrow();
  }
  const ast = parseSelect("SELECT DATEADD(day,1,v.data) AS n FROM vendas v", "sybase");
  expect(ast.usageRefs?.projecao).toContainEqual({ table: null, column: "day" });
});
