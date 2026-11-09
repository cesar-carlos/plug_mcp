import { expect, it } from "vitest";
import { parseEscopoSkill } from "../../../src/domain/entities/escopo.js";
import { validarSqlNoEscopo } from "../../../src/application/use-cases/shared/validar-escopo.js";
import { assertFanoutSeguro } from "../../../src/application/use-cases/shared/assert-fanout.js";
import { validateSourceSql } from "../../../src/application/persona-v2/source-sql.js";

const scope = parseEscopoSkill({
  tabelas: ["conta", "fornecedor"],
  colunasPorTabela: {
    conta: ["empresa", "fornecedor", "saldo", "status"],
    fornecedor: ["empresa", "id", "nome"],
  },
  relacionamentos: [
    {
      tabelaOrigem: "conta",
      colunaOrigem: "fornecedor",
      tabelaDestino: "fornecedor",
      colunaDestino: "id",
      pares: [
        { colunaOrigem: "empresa", colunaDestino: "empresa" },
        { colunaOrigem: "fornecedor", colunaDestino: "id" },
      ],
      tipoJoin: "left",
      cardinalidade: "N:1",
    },
  ],
});
const summary = `WITH saldos AS (
 SELECT c.empresa, c.fornecedor, SUM(CAST(1 AS bigint)) AS titulos, SUM(c.saldo) AS saldo
 FROM conta c WHERE c.status=:status AND c.saldo>0 GROUP BY c.empresa,c.fornecedor
) SELECT s.empresa,s.fornecedor,f.nome,s.titulos,s.saldo FROM saldos s
LEFT JOIN fornecedor f ON f.empresa=s.empresa AND f.id=s.fornecedor
ORDER BY s.empresa,s.fornecedor`;

it("pipeline v2 preserva SQL e projeção da pré-agregação", () => {
  expect(validateSourceSql(summary, "mssql", scope).sql).toBe(summary);
});
it("relação da mesma tabela não prova direção de um self JOIN", () => {
  const selfScope = {
    ...scope,
    relacionamentos: [
      {
        tabelaOrigem: "conta",
        colunaOrigem: "fornecedor",
        tabelaDestino: "conta",
        colunaDestino: "empresa",
        pares: [{ colunaOrigem: "fornecedor", colunaDestino: "empresa" }],
        tipoJoin: "left",
        cardinalidade: "N:1" as const,
      },
    ],
  };
  const sql =
    "WITH a AS (SELECT c.empresa,c.fornecedor FROM conta c WHERE c.saldo>0) SELECT a.empresa,p.fornecedor FROM a LEFT JOIN conta p ON p.fornecedor=a.empresa";
  expect(() => validarSqlNoEscopo(sql, "mssql", selfScope)).toThrow();
});

it.each(["mssql", "postgres", "sybase"] as const)(
  "preserva recorte de CTE agregada com dimensão N:1 em %s",
  (dialect) => {
    const ast = validarSqlNoEscopo(summary, dialect, scope);
    expect(() => assertFanoutSeguro(ast, scope)).not.toThrow();
  },
);
it("reconhece cadeia e derivada filtradas mesmo sem agregação externa", () => {
  const sql = `WITH a AS (SELECT c.empresa,c.fornecedor FROM conta c WHERE c.status=:status),
 b AS (SELECT a.empresa,a.fornecedor FROM a)
 SELECT d.empresa,d.fornecedor FROM (SELECT b.empresa,b.fornecedor FROM b) d`;
  expect(() => validarSqlNoEscopo(sql, "mssql", scope)).not.toThrow();
});
it("aceita INNER e cardinalidade inversa certificada sem transformar chaves", () => {
  expect(() =>
    validarSqlNoEscopo(summary.replace("LEFT JOIN", "INNER JOIN"), "mssql", scope),
  ).not.toThrow();
  const inverse = {
    ...scope,
    relacionamentos: scope.relacionamentos.map((r) => ({
      ...r,
      tabelaOrigem: r.tabelaDestino,
      tabelaDestino: r.tabelaOrigem,
      colunaOrigem: r.colunaDestino,
      colunaDestino: r.colunaOrigem,
      pares: r.pares.map((p) => ({ colunaOrigem: p.colunaDestino, colunaDestino: p.colunaOrigem })),
      cardinalidade: "1:N" as const,
    })),
  };
  expect(() => validarSqlNoEscopo(summary, "mssql", inverse)).not.toThrow();
});
it.each(["1:N", "N:N", null] as const)(
  "não herda recorte com cardinalidade %s",
  (cardinalidade) => {
    const altered = {
      ...scope,
      relacionamentos: scope.relacionamentos.map((r) => ({ ...r, cardinalidade })),
    };
    expect(() => validarSqlNoEscopo(summary, "mssql", altered)).toThrow();
  },
);
it.each([
  summary.replace("LEFT JOIN", "RIGHT JOIN"),
  summary.replace("LEFT JOIN", "FULL JOIN"),
  summary.replace("f.empresa=s.empresa AND ", ""),
  summary.replace("c.fornecedor, SUM", "c.fornecedor+0 AS fornecedor, SUM"),
  `WITH a AS (SELECT SUM(c.saldo) AS total FROM conta c) SELECT f.nome FROM fornecedor f`,
  `WITH a AS (SELECT c.empresa FROM conta c) SELECT a.empresa FROM a`,
  `WITH a AS (SELECT c.empresa FROM conta c WHERE c.status=:status UNION ALL SELECT c.empresa FROM conta c) SELECT a.empresa FROM a`,
  `WITH a AS (SELECT c.empresa FROM conta c WHERE c.status=:status) SELECT a.empresa FROM a UNION ALL SELECT c.empresa FROM conta c`,
])("não aceita recorte que não delimita todos os ramos (%#)", (sql) => {
  expect(() => validarSqlNoEscopo(sql, "mssql", scope)).toThrow();
});
