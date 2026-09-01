import { describe, expect, it } from "vitest";
import { parseEscopoSkill, PACOTE_VERSAO_ATUAL } from "../../src/domain/entities/escopo.js";
import { validarSqlNoEscopo } from "../../src/application/use-cases/shared/validar-escopo.js";
import { escopoFromSqlModelo } from "../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../src/application/use-cases/shared/sql-modelo.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";

describe("relacionamento composto", () => {
  const sql =
    "SELECT r.valor FROM receber r INNER JOIN cliente c ON c.codcli = r.codcli AND c.empresa = r.empresa WHERE r.valor > 0";

  it("agrupa igualdades de um JOIN em um relacionamento com pares[]", () => {
    const escopo = escopoFromSqlModelo(parseSqlModelo(sql));
    expect(escopo.relacionamentos).toHaveLength(1);
    expect(escopo.relacionamentos[0]?.pares).toHaveLength(2);
    expect(escopo.pacoteVersao).toBe(PACOTE_VERSAO_ATUAL);
  });

  it("aceita pacote v1 de par único (legado)", () => {
    const legado = parseEscopoSkill({
      tabelas: ["receber", "cliente"],
      colunasPorTabela: {
        receber: ["valor", "codcli", "empresa"],
        cliente: ["codcli", "empresa"],
      },
      relacionamentos: [
        {
          tabelaOrigem: "receber",
          colunaOrigem: "codcli",
          tabelaDestino: "cliente",
          colunaDestino: "codcli",
          tipoJoin: "inner",
        },
        {
          tabelaOrigem: "receber",
          colunaOrigem: "empresa",
          tabelaDestino: "cliente",
          colunaDestino: "empresa",
          tipoJoin: "inner",
        },
      ],
      pacoteVersao: 1,
    });
    expect(legado.relacionamentos).toHaveLength(2);
    expect(legado.relacionamentos[0]?.pares).toHaveLength(1);
    expect(() => validarSqlNoEscopo(sql, "mssql", legado)).not.toThrow();
  });

  it("recusa ON incompleto quando o pacote tem JOIN composto (pares[])", () => {
    const composto = parseEscopoSkill({
      tabelas: ["receber", "cliente"],
      colunasPorTabela: {
        receber: ["valor", "codcli", "empresa"],
        cliente: ["codcli", "empresa"],
      },
      relacionamentos: [
        {
          tabelaOrigem: "receber",
          colunaOrigem: "codcli",
          tabelaDestino: "cliente",
          colunaDestino: "codcli",
          pares: [
            { colunaOrigem: "codcli", colunaDestino: "codcli" },
            { colunaOrigem: "empresa", colunaDestino: "empresa" },
          ],
          tipoJoin: "inner",
        },
      ],
    });
    const incompleto =
      "SELECT r.valor FROM receber r INNER JOIN cliente c ON c.codcli = r.codcli WHERE r.valor > 0";
    expect(() => validarSqlNoEscopo(incompleto, "mssql", composto)).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.JOIN_DESCONHECIDO,
        source: "sql",
        hint: expect.stringMatching(/n[aã]o invente nem repita/i),
      }),
    );
    try {
      validarSqlNoEscopo(incompleto, "mssql", composto);
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      const json = (error as DomainError).toJson();
      expect(json.error.source).toBe("sql");
      expect(json.error.nextAction).toBe("obter_skill");
      expect(json.error.nextAction).not.toBe("confirmar_relacionamento");
    }
    expect(() => validarSqlNoEscopo(sql, "mssql", composto)).not.toThrow();
  });

  it("recusa JOIN composto se só um par do conjunto está no escopo", () => {
    const parcial = parseEscopoSkill({
      tabelas: ["receber", "cliente"],
      colunasPorTabela: {
        receber: ["valor", "codcli", "empresa"],
        cliente: ["codcli", "empresa"],
      },
      relacionamentos: [
        {
          tabelaOrigem: "receber",
          colunaOrigem: "codcli",
          tabelaDestino: "cliente",
          colunaDestino: "codcli",
          tipoJoin: "inner",
        },
      ],
    });
    expect(() => validarSqlNoEscopo(sql, "mssql", parcial)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.JOIN_DESCONHECIDO, source: "sql" }),
    );
  });
});
