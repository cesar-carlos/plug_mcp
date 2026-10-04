import { describe, expect, it } from "vitest";
import { parseSelect } from "../../src/application/use-cases/shared/sql-ast.js";
import { exigirFiltroEscopoPadrao } from "../../src/application/use-cases/shared/escopo-filtro.js";
import { validarSqlNoEscopo } from "../../src/application/use-cases/shared/validar-escopo.js";
import { assertFanoutSeguro } from "../../src/application/use-cases/shared/assert-fanout.js";
import { parseEscopoSkill } from "../../src/domain/entities/escopo.js";

const recorte = (sql: string) =>
  exigirFiltroEscopoPadrao({
    sql,
    dialeto: "postgres",
    colunasDasTabelas: { pedido: ["id", "empresa", "valor"], item: ["pedido", "empresa", "valor"] },
    escopoPadrao: {
      empresa: "A",
      bindings: [
        { tabela: "pedido", coluna: "empresa", param: "empresa" },
        { tabela: "item", coluna: "empresa", param: "empresa" },
      ],
    },
  });
const scope = parseEscopoSkill({
  tabelas: ["pedido", "item"],
  colunasPorTabela: { pedido: ["id", "empresa", "valor"], item: ["pedido", "empresa", "valor"] },
  relacionamentos: [
    {
      tabelaOrigem: "pedido",
      tabelaDestino: "item",
      colunaOrigem: "id",
      colunaDestino: "pedido",
      pares: [
        { colunaOrigem: "id", colunaDestino: "pedido" },
        { colunaOrigem: "empresa", colunaDestino: "empresa" },
      ],
      cardinalidade: "1:N",
      tipoJoin: "inner",
    },
  ],
});

describe("SQL adversarial e correção dos resultados", () => {
  it.each([
    "p.empresa = :empresa OR 1=1",
    "p.empresa <> :empresa",
    "p.valor = :empresa",
    "NOT (p.empresa = :empresa)",
    "(p.empresa = :empresa AND p.valor > 0) OR p.valor < 0",
  ])("recusa recorte contornável: %s", (where) =>
    expect(() => recorte(`SELECT p.id FROM pedido p WHERE ${where}`)).toThrow(
      expect.objectContaining({ code: "ESCOPO_FILTRO_AUSENTE" }),
    ),
  );
  it("exige recorte em UNION, CTE e subconsulta", () => {
    for (const sql of [
      "SELECT p.id FROM pedido p WHERE p.empresa=:empresa UNION ALL SELECT p.id FROM pedido p WHERE p.valor>0",
      "WITH x AS (SELECT p.id FROM pedido p WHERE p.valor>0) SELECT x.id FROM x",
      "SELECT p.id FROM pedido p WHERE p.empresa=:empresa AND EXISTS (SELECT i.pedido FROM item i WHERE i.valor>0)",
    ]) {
      expect(() => recorte(sql)).toThrow(
        expect.objectContaining({ code: "ESCOPO_FILTRO_AUSENTE" }),
      );
    }
  });
  it("aceita igualdade obrigatória em todas as alternativas", () => {
    expect(() =>
      recorte(
        "SELECT p.id FROM pedido p WHERE (p.empresa=:empresa AND p.valor>0) OR (p.empresa=:empresa AND p.valor<0)",
      ),
    ).not.toThrow();
  });
  it.each([
    "SELECT p.id INTO copia FROM pedido p",
    "SELECT pg_sleep(10)",
    "SELECT nextval('seq')",
    "SELECT minha_funcao(p.id) FROM pedido p",
    "SELECT public.now()",
    "SELECT p.id FROM outro.pedido p",
  ])("recusa efeito colateral ou origem desconhecida: %s", (sql) => {
    expect(() => parseSelect(sql, "postgres")).toThrow(
      expect.objectContaining({ code: "SQL_EFEITO_COLATERAL" }),
    );
  });
  it("limita trabalho antes de invocar o parser", () => {
    expect(() => parseSelect(`SELECT ${"(".repeat(65)}1${")".repeat(65)}`, "postgres")).toThrow(
      expect.objectContaining({ code: "CONSULTA_ORCAMENTO" }),
    );
    expect(() => parseSelect(`SELECT '${"a".repeat(100_000)}'`, "postgres")).toThrow(
      expect.objectContaining({ code: "CONSULTA_ORCAMENTO" }),
    );
  });
  it.each(["GROUP BY p.fora", "HAVING MAX(p.fora)>0", "ORDER BY p.fora"])(
    "verifica referência física em %s",
    (clause) => {
      expect(() =>
        validarSqlNoEscopo(`SELECT SUM(p.valor) total FROM pedido p ${clause}`, "postgres", scope),
      ).toThrow(expect.objectContaining({ code: "COLUNA_FORA_DO_ESCOPO" }));
    },
  );
  it("igualdades alternativas não compõem um JOIN", () => {
    const sql =
      "SELECT p.id,i.valor FROM pedido p JOIN item i ON p.id=i.pedido OR p.empresa=i.empresa WHERE p.valor>0";
    expect(() => validarSqlNoEscopo(sql, "postgres", scope)).toThrow(
      expect.objectContaining({ code: "JOIN_DESCONHECIDO" }),
    );
  });
  it("SUM de pai é multiplicado; SUM de filho preserva grão", () => {
    const from = "FROM pedido p JOIN item i ON p.id=i.pedido AND p.empresa=i.empresa";
    expect(() =>
      assertFanoutSeguro(parseSelect(`SELECT SUM(p.valor) total ${from}`, "postgres"), scope),
    ).toThrow(expect.objectContaining({ code: "AGREGACAO_INSEGURA" }));
    expect(() =>
      assertFanoutSeguro(parseSelect(`SELECT SUM(i.valor) total ${from}`, "postgres"), scope),
    ).not.toThrow();
  });
  it("aceita pré-agregação por todas as chaves e recusa grão incompleto", () => {
    const sql =
      "SELECT SUM(p.valor) total FROM pedido p JOIN (SELECT i.pedido,i.empresa,SUM(i.valor) total FROM item i GROUP BY i.pedido,i.empresa) x ON p.id=x.pedido AND p.empresa=x.empresa";
    expect(() => assertFanoutSeguro(parseSelect(sql, "postgres"), scope)).not.toThrow();
    expect(() =>
      assertFanoutSeguro(
        parseSelect(sql.replace("AND p.empresa=x.empresa", ""), "postgres"),
        scope,
      ),
    ).toThrow(expect.objectContaining({ code: "AGREGACAO_INSEGURA" }));
  });
  it("EXISTS correlacionado usa somente relacionamento composto publicado", () => {
    const sql =
      "SELECT SUM(p.valor) total FROM pedido p WHERE p.empresa=:empresa AND EXISTS (SELECT i.pedido FROM item i WHERE i.pedido=p.id AND i.empresa=p.empresa AND i.empresa=:empresa)";
    const ast = validarSqlNoEscopo(sql, "postgres", scope);
    expect(() => assertFanoutSeguro(ast, scope)).not.toThrow();
    expect(() => recorte(sql)).not.toThrow();
    expect(() =>
      validarSqlNoEscopo(sql.replace("AND i.empresa=p.empresa ", ""), "postgres", scope),
    ).toThrow(expect.objectContaining({ code: "JOIN_DESCONHECIDO" }));
  });
  it("JOIN derivado também precisa do relacionamento composto", () => {
    const sql =
      "SELECT SUM(p.valor) total FROM pedido p JOIN (SELECT i.pedido,i.empresa,SUM(i.valor) total FROM item i GROUP BY i.pedido,i.empresa) x ON p.id=x.pedido AND p.empresa=x.empresa";
    expect(() => validarSqlNoEscopo(sql, "postgres", scope)).not.toThrow();
    expect(() =>
      validarSqlNoEscopo(sql.replace("AND p.empresa=x.empresa", ""), "postgres", scope),
    ).toThrow(expect.objectContaining({ code: "JOIN_DESCONHECIDO" }));
  });
  it("recorte configurado sem coluna identificável é fail-closed", () => {
    expect(() =>
      exigirFiltroEscopoPadrao({
        sql: "SELECT p.valor FROM pedido p WHERE p.valor>0",
        dialeto: "postgres",
        colunasDasTabelas: { pedido: ["valor"] },
        escopoPadrao: { empresa: "A" },
      }),
    ).toThrow(expect.objectContaining({ code: "ESCOPO_FILTRO_AUSENTE" }));
  });
});
