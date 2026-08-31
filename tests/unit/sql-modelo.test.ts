import { describe, expect, it } from "vitest";
import { escopoFromSqlModelo } from "../../src/application/use-cases/shared/escopo-from-modelo.js";
import {
  bindNamedParams,
  bindParamsForValidation,
  coerceBoundParams,
  columnQualifier,
  expandirInListas,
  extractNamedParams,
  parseJoinEqualities,
  parseSqlModelo,
  rewriteAtParamsToColon,
  sqlDeclaraLimiteDeLinhas,
  sqlParaOdbc,
  sqlValidacaoVazia,
} from "../../src/application/use-cases/shared/sql-modelo.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";

describe("parseSqlModelo", () => {
  it("aceita SELECT nomeado com FROM", () => {
    const modelo = parseSqlModelo("SELECT p.codprod AS codigo, p.descricao FROM produto p");
    expect(modelo.tabelas.map((t) => t.nome.toLowerCase())).toContain("produto");
    expect(modelo.colunas.some((c) => c.alias.toLowerCase() === "codigo")).toBe(true);
  });

  it("rejeita SELECT *", () => {
    expect(() => parseSqlModelo("SELECT * FROM produto")).toThrow(DomainError);
  });

  it("rejeita várias tabelas sem JOIN", () => {
    expect(() => parseSqlModelo("SELECT a.id, b.id FROM a, b")).toThrow(DomainError);
  });

  it("aceita JOIN explícito", () => {
    const modelo = parseSqlModelo(
      "SELECT p.codprod, i.qtd FROM pedido p INNER JOIN item i ON i.pedido = p.codigo",
    );
    expect(modelo.relacionamentos.length).toBeGreaterThan(0);
    expect(modelo.tabelas.length).toBeGreaterThanOrEqual(2);
  });

  it("rejeita segundo comando", () => {
    expect(() =>
      parseSqlModelo("SELECT p.codprod AS codigo FROM produto p; DELETE FROM produto"),
    ).toThrow(DomainError);
  });

  it("extrai placeholders :nome e @nome fora de literais", () => {
    expect(
      extractNamedParams(
        "SELECT p.codprod FROM produto p WHERE p.codprod = :codigo AND p.nome <> ':x'",
      ),
    ).toEqual(["codigo"]);
    expect(extractNamedParams("SELECT p.codprod FROM produto p WHERE p.codprod = @codigo")).toEqual(
      ["codigo"],
    );
  });

  it("bindNamedParams exige params presentes", () => {
    try {
      bindNamedParams("SELECT p.codprod FROM produto p WHERE p.codprod = :codigo", {});
      expect.fail("deveria lançar");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ERROR_CODES.VALIDATION_ERROR);
    }
    expect(
      bindNamedParams("SELECT p.codprod FROM produto p WHERE p.codprod = :codigo", { codigo: 1 }),
    ).toEqual({ codigo: 1 });
  });

  it("rejeita expressão sem AS", () => {
    expect(() => parseSqlModelo("SELECT SUM(qtd) FROM item")).toThrow(DomainError);
    try {
      parseSqlModelo("SELECT p.preco * p.qtd FROM produto p");
      expect.fail("deveria lançar");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ERROR_CODES.INVALID_SQL);
    }
    const modelo = parseSqlModelo("SELECT SUM(qtd) AS total FROM item");
    expect(modelo.colunas.some((c) => c.alias.toLowerCase() === "total")).toBe(true);
  });

  it("rejeita coluna sem qualificador quando há JOIN", () => {
    expect(() =>
      parseSqlModelo(
        "SELECT codprod, nome FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli",
      ),
    ).toThrow(DomainError);
  });

  it("aceita expressão com AS mesmo em JOIN", () => {
    const modelo = parseSqlModelo(
      "SELECT p.codprod, SUM(i.qtd) AS total FROM pedido p INNER JOIN item i ON i.pedido = p.codigo GROUP BY p.codprod",
    );
    expect(modelo.colunas.some((c) => c.alias.toLowerCase() === "total")).toBe(true);
  });

  it("extrai igualdades do ON e o qualificador da coluna", () => {
    const modelo = parseSqlModelo(
      "SELECT p.codprod, c.nome FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli",
    );
    expect(parseJoinEqualities(modelo.relacionamentos[0]?.on)).toEqual([
      { leftAlias: "c", leftColumn: "codcli", rightAlias: "p", rightColumn: "codcli" },
    ]);
    expect(columnQualifier("p.codprod")).toBe("p");
    expect(columnQualifier("SUM(p.qtd)")).toBeNull();
  });

  it("bindParamsForValidation preenche ausentes com null", () => {
    expect(
      bindParamsForValidation("SELECT p.codprod FROM produto p WHERE p.codprod = :codigo", {}),
    ).toEqual({ codigo: null });
    expect(
      bindParamsForValidation("SELECT p.codprod FROM produto p WHERE p.codprod = :codigo", {
        codigo: 10,
      }),
    ).toEqual({ codigo: 10 });
  });

  it("rejeita JOIN sem igualdade no ON", () => {
    expect(() =>
      parseSqlModelo("SELECT p.codprod, c.nome FROM produto p INNER JOIN cliente c ON 1 = 1"),
    ).toThrow(DomainError);
    try {
      parseSqlModelo("SELECT p.codprod, c.nome FROM produto p INNER JOIN cliente c ON 1 = 1");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ERROR_CODES.INVALID_SQL);
    }
  });

  it("aceita CROSS JOIN sem exigir ON", () => {
    const modelo = parseSqlModelo("SELECT p.codprod, c.nome FROM produto p CROSS JOIN cliente c");
    expect(modelo.relacionamentos.some((rel) => rel.tipoJoin.includes("cross"))).toBe(true);
  });

  it("bind recusa number com string não numérica", () => {
    expect(() =>
      coerceBoundParams({ codigo: "abc" }, [
        { nome: "codigo", descricao: "Código", obrigatorio: true, tipo: "number" },
      ]),
    ).toThrow(DomainError);
  });
});

describe("escopoFromSqlModelo grao", () => {
  it("usa GROUP BY quando houver agregação", () => {
    const escopo = escopoFromSqlModelo(
      parseSqlModelo(
        "SELECT p.codprod, SUM(p.codprod) AS total FROM produto p WHERE p.codprod > 0 GROUP BY p.codprod",
      ),
    );
    expect(escopo.graoResultado.map((item) => item.toLowerCase())).toContain("codprod");
    expect(escopo.graoPorTabela.produto?.map((item) => item.toLowerCase())).toContain("codprod");
    expect(escopo.metricasSaida.some((item) => item.alias.toLowerCase() === "total")).toBe(true);
  });

  it("usa colunas físicas do SELECT sem agregação", () => {
    const escopo = escopoFromSqlModelo(
      parseSqlModelo("SELECT p.codprod AS codigo, p.descricao FROM produto p"),
    );
    expect(escopo.graoResultado.map((item) => item.toLowerCase())).toEqual(
      expect.arrayContaining(["codprod", "descricao"]),
    );
    expect(escopo.colunasPorTabela.produto?.map((item) => item.toLowerCase())).toEqual(
      expect.arrayContaining(["codprod", "descricao"]),
    );
    expect(escopo.colunasPorTabela.produto?.some((item) => item.toLowerCase() === "codigo")).toBe(
      false,
    );
  });

  it("inclui colunas de WHERE e todas as igualdades de JOIN composto", () => {
    const escopo = escopoFromSqlModelo(
      parseSqlModelo(
        "SELECT p.codprod, c.nome FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli AND c.empresa = p.empresa WHERE p.ativo = 1",
      ),
    );
    const produto = escopo.colunasPorTabela.produto?.map((item) => item.toLowerCase()) ?? [];
    const cliente = escopo.colunasPorTabela.cliente?.map((item) => item.toLowerCase()) ?? [];
    expect(produto).toEqual(expect.arrayContaining(["codprod", "codcli", "empresa", "ativo"]));
    expect(cliente).toEqual(expect.arrayContaining(["nome", "codcli", "empresa"]));
    expect(escopo.relacionamentos.length).toBe(1);
    expect(escopo.relacionamentos[0]?.pares).toHaveLength(2);
  });
});

describe("sqlParaOdbc / limites", () => {
  it("reescreve @dataInicio e preserva @@identity", () => {
    const sql =
      "SELECT p.codprod, @@identity AS ident FROM produto p WHERE p.data >= @dataInicio AND p.nome <> '@x'";
    expect(rewriteAtParamsToColon(sql, ["dataInicio"])).toBe(
      "SELECT p.codprod, @@identity AS ident FROM produto p WHERE p.data >= :dataInicio AND p.nome <> '@x'",
    );
    expect(sqlParaOdbc(sql)).toContain(":dataInicio");
    expect(sqlParaOdbc(sql)).toContain("@@identity");
  });

  it("detecta TOP LIMIT OFFSET FETCH START AT FIRST e ignora ORDER BY puro", () => {
    expect(sqlDeclaraLimiteDeLinhas("SELECT TOP 10 p.id FROM p ORDER BY p.id")).toBe(true);
    expect(sqlDeclaraLimiteDeLinhas("SELECT p.id FROM p LIMIT 10")).toBe(true);
    expect(
      sqlDeclaraLimiteDeLinhas(
        "SELECT p.id FROM p ORDER BY p.id OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY",
      ),
    ).toBe(true);
    expect(sqlDeclaraLimiteDeLinhas("SELECT TOP 10 START AT 11 p.id FROM p")).toBe(true);
    expect(sqlDeclaraLimiteDeLinhas("SELECT FIRST 10 p.id FROM p")).toBe(true);
    expect(sqlDeclaraLimiteDeLinhas("SELECT p.id FROM p ORDER BY p.id")).toBe(false);
    expect(sqlDeclaraLimiteDeLinhas("SELECT p.id FROM p WHERE p.nome = 'LIMIT 1'")).toBe(false);
    expect(
      sqlDeclaraLimiteDeLinhas("SELECT p.id FROM p WHERE p.id IN (SELECT TOP 1 x.id FROM x)"),
    ).toBe(false);
  });

  it("sqlValidacaoVazia tira ORDER BY externo e preserva ORDER BY de janela", () => {
    const grouped =
      "SELECT cr.CodEmpresa, SUM(cr.SaldoReceber) AS s FROM ContaReceber cr GROUP BY cr.CodEmpresa ORDER BY cr.CodEmpresa";
    const wrapped = sqlValidacaoVazia("mssql", grouped);
    expect(wrapped).toMatch(/AS _validacao/i);
    expect(wrapped).not.toMatch(/_validacao[\s\S]*ORDER\s+BY/i);
    const innerMatch = /\(([\s\S]*)\)\s+AS\s+_validacao/i.exec(wrapped);
    const inner = innerMatch?.[1] ?? "";
    expect(inner).not.toMatch(/\bORDER\s+BY\b/i);
    expect(inner).toMatch(/GROUP BY cr\.CodEmpresa/i);

    const janela = sqlValidacaoVazia(
      "mssql",
      "SELECT SUM(x) OVER (PARTITION BY a ORDER BY b) AS s FROM t",
    );
    expect(janela).toMatch(/OVER \(PARTITION BY a ORDER BY b\)/i);
    expect(janela).toMatch(/WHERE 1 = 0/i);
  });

  it("não trata ::cast, @@var nem comentário como param", () => {
    expect(
      extractNamedParams("SELECT now()::date AS d FROM produto p WHERE p.codprod = :codigo"),
    ).toEqual(["codigo"]);
    expect(
      extractNamedParams("SELECT @@identity AS ident FROM produto p WHERE p.codprod = @codigo"),
    ).toEqual(["codigo"]);
    expect(
      extractNamedParams("SELECT p.codprod FROM produto p WHERE p.codprod = :id -- @comentario"),
    ).toEqual(["id"]);
  });

  it("expande IN (:lista) em um placeholder por valor", () => {
    const expanded = expandirInListas(
      "SELECT r.valor FROM receber r WHERE r.empresa IN (:empresas) AND r.valor > 0",
      { empresas: ["1", "2"] },
    );
    expect(expanded.sql).toMatch(/IN \(:empresas_0, :empresas_1\)/i);
    expect(expanded.params).toEqual({ empresas_0: "1", empresas_1: "2" });
    expect(bindNamedParams(expanded.sql, expanded.params)).toEqual({
      empresas_0: "1",
      empresas_1: "2",
    });
  });

  it("recusa lista IN vazia", () => {
    expect(() =>
      expandirInListas("SELECT r.valor FROM receber r WHERE r.empresa IN (:empresas)", {
        empresas: [],
      }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.VALIDATION_ERROR }));
  });
});
