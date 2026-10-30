import { describe, expect, it } from "vitest";
import { assertFanoutSeguro } from "../../src/application/use-cases/shared/assert-fanout.js";
import { tryParseSelect } from "../../src/application/use-cases/shared/sql-ast.js";
import { parseEscopoSkill } from "../../src/domain/entities/escopo.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";

const escopoNn = parseEscopoSkill({
  tabelas: ["pedido", "item"],
  colunasPorTabela: { pedido: ["id", "valor"], item: ["pedido", "qtde"] },
  metricasSaida: [{ alias: "total", expr: "SUM(pedido.valor)" }],
  relacionamentos: [
    {
      tabelaOrigem: "pedido",
      colunaOrigem: "id",
      tabelaDestino: "item",
      colunaDestino: "pedido",
      pares: [{ colunaOrigem: "id", colunaDestino: "pedido" }],
      tipoJoin: "inner",
      cardinalidade: "N:N",
    },
  ],
});

describe("fan-out por AST ∩ pacote", () => {
  it("identifica causas seguras sem mudar a recusa", () => {
    const ast = tryParseSelect(
      "SELECT SUM(p.valor) AS total FROM pedido p JOIN item i ON i.pedido=p.id",
      "mssql",
    )!;
    const cases = [
      [ast, escopoNn, "measure_multiplication"],
      [ast, { ...escopoNn, relacionamentos: [] }, "relationship_unproven"],
      [
        { ...ast, joins: ast.joins.map((join) => ({ ...join, equalities: [] })) },
        escopoNn,
        "join_grain_unproven",
      ],
      [
        ast,
        {
          ...escopoNn,
          graosConfirmados: {
            pedido: {
              chaves: ["missing"],
              significado: "fixture",
              evidencia: "declaracao_usuario",
            },
          },
        },
        "invalid_declared_grain",
      ],
    ] as const;
    for (const [query, scope, reason] of cases) {
      expect(() => assertFanoutSeguro(query, scope)).toThrow(
        expect.objectContaining({
          code: ERROR_CODES.AGREGACAO_INSEGURA,
          details: { aggregationReason: reason },
        }),
      );
    }
  });
  it("bloqueia agregação de medida com JOIN N:N no AST", () => {
    const ast = tryParseSelect(
      "SELECT SUM(p.valor) AS total FROM pedido p INNER JOIN item i ON i.pedido = p.id",
      "mssql",
    );
    expect(() => assertFanoutSeguro(ast!, escopoNn)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.AGREGACAO_INSEGURA }),
    );
  });

  it("não dispara sem JOIN mesmo com métrica", () => {
    const ast = tryParseSelect("SELECT SUM(p.valor) AS total FROM pedido p", "mssql");
    expect(() => assertFanoutSeguro(ast!, escopoNn)).not.toThrow();
  });

  it("protege qualquer medida mesmo sem metricasSaida", () => {
    const semMetrica = parseEscopoSkill({
      tabelas: ["pedido", "item"],
      colunasPorTabela: { pedido: ["id", "qtde"], item: ["pedido", "qtde"] },
      relacionamentos: [
        {
          tabelaOrigem: "pedido",
          colunaOrigem: "id",
          tabelaDestino: "item",
          colunaDestino: "pedido",
          pares: [{ colunaOrigem: "id", colunaDestino: "pedido" }],
          tipoJoin: "inner",
          cardinalidade: null,
        },
      ],
    });
    const qtde = tryParseSelect(
      "SELECT SUM(p.qtde) AS n FROM pedido p INNER JOIN item i ON i.pedido = p.id",
      "mssql",
    );
    expect(() => assertFanoutSeguro(qtde!, semMetrica)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.AGREGACAO_INSEGURA }),
    );
    const valor = tryParseSelect(
      "SELECT SUM(p.valor) AS total FROM pedido p INNER JOIN item i ON i.pedido = p.id",
      "mssql",
    );
    expect(() => assertFanoutSeguro(valor!, semMetrica)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.AGREGACAO_INSEGURA }),
    );
  });

  it("bloqueia o mesmo padrão no sqlModelo (consulta exemplo)", () => {
    const ast = tryParseSelect(
      "SELECT SUM(p.valor) AS total FROM pedido p INNER JOIN item i ON i.pedido = p.id",
      "mssql",
    );
    expect(() => assertFanoutSeguro(ast!, escopoNn)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.AGREGACAO_INSEGURA }),
    );
  });
});
