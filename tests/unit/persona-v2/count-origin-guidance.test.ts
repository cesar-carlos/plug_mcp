import { expect, it } from "vitest";
import { parseSelect } from "../../../src/application/use-cases/shared/sql-ast.js";
import { validarSqlNoEscopo } from "../../../src/application/use-cases/shared/validar-escopo.js";
import { assertFanoutSeguro } from "../../../src/application/use-cases/shared/assert-fanout.js";
import { parseEscopoSkill } from "../../../src/domain/entities/escopo.js";
import { aggregationDiagnostic } from "../../../src/domain/errors/aggregation-diagnostic.js";
import { personaDialectGuide } from "../../../src/application/persona-v2/dialect-guide.js";
const scope = parseEscopoSkill({
  tabelas: ["vendas", "tipos"],
  colunasPorTabela: { vendas: ["id", "empresa", "tipo", "valor"], tipos: ["id", "empresa"] },
  relacionamentos: [
    {
      tabelaOrigem: "vendas",
      colunaOrigem: "tipo",
      tabelaDestino: "tipos",
      colunaDestino: "id",
      pares: [
        { colunaOrigem: "empresa", colunaDestino: "empresa" },
        { colunaOrigem: "tipo", colunaDestino: "id" },
      ],
      tipoJoin: "inner",
      cardinalidade: "N:1",
    },
  ],
});
const query = (count: string) =>
  `SELECT v.empresa, ${count} AS quantidade FROM vendas v JOIN tipos t ON t.empresa=v.empresa AND t.id=v.tipo WHERE v.id>:minimum GROUP BY v.empresa`;
it.each(["COUNT_BIG(*)", "COUNT(*)", "SUM(1)", "COUNT_BIG(t.id)"])(
  "mantém recusa de origem incerta ou dimensão multiplicada: %s",
  (count) => {
    const ast = validarSqlNoEscopo(query(count), "mssql", scope);
    let error: unknown;
    try {
      assertFanoutSeguro(ast, scope);
    } catch (e) {
      error = e;
    }
    expect(error).toMatchObject({
      code: "AGREGACAO_INSEGURA",
      details: { aggregationReason: "measure_multiplication" },
    });
    expect(aggregationDiagnostic(error)).toMatchObject({
      aggregationGrain: {
        selectPath: [],
        groupingKeyCount: 1,
        measureIndex: 1,
        sourceIndex: 1,
        targetIndex: 0,
      },
    });
    if (count !== "COUNT_BIG(t.id)")
      expect(error).toMatchObject({ hint: expect.stringContaining("COUNT_BIG(*)") });
  },
);
it("chave da venda passa apenas com relacionamento completo e não autoriza campo novo", () => {
  const ast = validarSqlNoEscopo(query("COUNT_BIG(v.id)"), "mssql", scope);
  expect(() => assertFanoutSeguro(ast, scope)).not.toThrow();
  expect(() => validarSqlNoEscopo(query("COUNT_BIG(v.segredo)"), "mssql", scope)).toThrow(
    expect.objectContaining({ code: "COLUNA_FORA_DO_ESCOPO" }),
  );
  expect(() =>
    assertFanoutSeguro(
      parseSelect(query("COUNT_BIG(v.id)").replace("t.empresa=v.empresa AND ", ""), "mssql"),
      scope,
    ),
  ).toThrow(expect.objectContaining({ code: "AGREGACAO_INSEGURA" }));
});
it("guia explica origem, chave composta e limite da substituição sem prometer EXISTS", () => {
  const guide = personaDialectGuide("mssql").limite;
  expect(guide).toContain("COUNT_BIG(v.id)");
  expect(guide).toContain("COUNT_BIG(t.id)");
  expect(guide).toContain("COUNT_BIG(*)");
  expect(guide).toContain("chave completa");
  expect(guide).toContain("não nula");
  expect(guide).toContain("EXISTS");
});
