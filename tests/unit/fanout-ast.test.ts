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
  it("bloqueia agregação de medida com JOIN N:N no AST", () => {
    const ast = tryParseSelect(
      "SELECT SUM(p.valor) AS total FROM pedido p INNER JOIN item i ON i.pedido = p.id",
      "mssql",
    );
    expect(() => assertFanoutSeguro(ast!, escopoNn)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.FANOUT_NAO_DECLARADO }),
    );
  });

  it("não dispara sem JOIN mesmo com métrica", () => {
    const ast = tryParseSelect("SELECT SUM(p.valor) AS total FROM pedido p", "mssql");
    expect(() => assertFanoutSeguro(ast!, escopoNn)).not.toThrow();
  });

  it("sem metricasSaida só trata valor|saldo como medida", () => {
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
    expect(() => assertFanoutSeguro(qtde!, semMetrica)).not.toThrow();
    const valor = tryParseSelect(
      "SELECT SUM(p.valor) AS total FROM pedido p INNER JOIN item i ON i.pedido = p.id",
      "mssql",
    );
    expect(() => assertFanoutSeguro(valor!, semMetrica)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.FANOUT_NAO_DECLARADO }),
    );
  });

  it("bloqueia o mesmo padrão no sqlModelo (consulta exemplo)", () => {
    const ast = tryParseSelect(
      "SELECT SUM(p.valor) AS total FROM pedido p INNER JOIN item i ON i.pedido = p.id",
      "mssql",
    );
    expect(() => assertFanoutSeguro(ast!, escopoNn)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.FANOUT_NAO_DECLARADO }),
    );
  });
});
