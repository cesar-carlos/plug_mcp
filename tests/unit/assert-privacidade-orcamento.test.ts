import { describe, expect, it } from "vitest";
import { assertPrivacidadeAntesDoHub } from "../../src/application/use-cases/shared/assert-privacidade.js";
import { assertOrcamentoConsulta } from "../../src/application/use-cases/shared/assert-orcamento.js";
import { avisosKpiDesalinhado } from "../../src/application/use-cases/shared/avisos-kpi.js";
import { tryParseSelect } from "../../src/application/use-cases/shared/sql-ast.js";
import { parseEscopoSkill } from "../../src/domain/entities/escopo.js";
import type { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";

describe("pré-check de privacidade e orçamento", () => {
  it("recusa PII projetado em consulta analítica", () => {
    const ast = tryParseSelect(
      "SELECT c.nome AS cliente FROM cliente c WHERE c.codcli > 0",
      "mssql",
    );
    expect(ast).not.toBeNull();
    expect(() =>
      assertPrivacidadeAntesDoHub({
        ast: ast!,
        lookup: () => "pessoal",
        negar: ["segredo", "pessoal"],
      }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.PRIVACIDADE_NEGADA }));
    try {
      assertPrivacidadeAntesDoHub({
        ast: ast!,
        lookup: () => "pessoal",
        negar: ["segredo", "pessoal"],
      });
    } catch (error) {
      const err = error as DomainError;
      expect(err.nextAction).toBe("consultar_dados");
      expect(err.nextAction).not.toBe("inspecionar_consulta");
      expect(err.hint).toMatch(/n[aã]o é amostra mascarada/i);
    }
  });

  it("inspeção só recusa segredo", () => {
    const ast = tryParseSelect(
      "SELECT c.nome AS cliente FROM cliente c WHERE c.codcli > 0",
      "mssql",
    );
    expect(() =>
      assertPrivacidadeAntesDoHub({
        ast: ast!,
        lookup: () => "pessoal",
        negar: ["segredo"],
      }),
    ).not.toThrow();
  });

  it("recusa MAX de segredo e MAX/MIN/SUM de pessoal", () => {
    const maxSegredo = tryParseSelect(
      "SELECT MAX(c.api_token) AS tok FROM cliente c WHERE c.codcli > 0",
      "mssql",
    );
    expect(() =>
      assertPrivacidadeAntesDoHub({
        ast: maxSegredo!,
        lookup: (_t, coluna) => (coluna.toLowerCase().includes("token") ? "segredo" : "livre"),
        negar: ["segredo", "pessoal"],
      }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.PRIVACIDADE_NEGADA }));

    const maxPessoal = tryParseSelect(
      "SELECT MAX(c.nome) AS n FROM cliente c WHERE c.codcli > 0",
      "mssql",
    );
    expect(() =>
      assertPrivacidadeAntesDoHub({
        ast: maxPessoal!,
        lookup: () => "pessoal",
        negar: ["segredo", "pessoal"],
      }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.PRIVACIDADE_NEGADA }));
  });

  it("permite COUNT de pessoal", () => {
    const ast = tryParseSelect(
      "SELECT COUNT(c.nome) AS n FROM cliente c WHERE c.codcli > 0",
      "mssql",
    );
    expect(() =>
      assertPrivacidadeAntesDoHub({
        ast: ast!,
        lookup: () => "pessoal",
        negar: ["segredo", "pessoal"],
      }),
    ).not.toThrow();
  });

  it("CONSULTA_ORCAMENTO quando max_rows excede a skill", () => {
    const ast = tryParseSelect("SELECT p.codprod FROM produto p WHERE p.codprod > 0", "mssql");
    expect(() =>
      assertOrcamentoConsulta({
        ast,
        politica: { maxRows: 50 },
        maxRows: 200,
      }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.CONSULTA_ORCAMENTO, source: "sql" }));
  });

  it("CONSULTA_ORCAMENTO quando maxTabelas estoura", () => {
    const ast = tryParseSelect(
      "SELECT p.codprod FROM produto p INNER JOIN filial f ON f.id = p.filial WHERE p.codprod > 0",
      "mssql",
    );
    expect(() =>
      assertOrcamentoConsulta({
        ast,
        politica: { maxTabelas: 1 },
        maxRows: 50,
      }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.CONSULTA_ORCAMENTO }));
  });

  it("política null não estoura orçamento", () => {
    const ast = tryParseSelect("SELECT p.codprod FROM produto p WHERE p.codprod > 0", "mssql");
    expect(
      assertOrcamentoConsulta({
        ast,
        politica: null,
        maxRows: 200,
      }).maxRows,
    ).toBe(200);
  });

  it("KPI_DESALINHADO se o SQL omite status declarado", () => {
    const ast = tryParseSelect(
      "SELECT SUM(r.valor) AS total FROM receber r WHERE r.empresa = :empresa",
      "mssql",
    );
    const avisos = avisosKpiDesalinhado(
      ast!,
      parseEscopoSkill({
        tabelas: ["receber"],
        colunasPorTabela: { receber: ["valor", "empresa", "status"] },
        metricasSaida: [{ alias: "total", expr: "SUM(r.valor)", statusIncluidos: ["A"] }],
      }),
    );
    expect(avisos.some((aviso) => aviso.code === "KPI_DESALINHADO")).toBe(true);
  });
});
