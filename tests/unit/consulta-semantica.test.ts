import { describe, expect, it } from "vitest";
import { compilarConsultaSemantica } from "../../src/application/use-cases/shared/compilar-consulta-semantica.js";
import { parseEscopoSkill } from "../../src/domain/entities/escopo.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";

describe("consulta semântica", () => {
  const escopo = parseEscopoSkill({
    tabelas: ["receber"],
    colunasPorTabela: { receber: ["valor", "empresa", "vencimento"] },
    graoResultado: ["empresa"],
    metricasSaida: [{ alias: "total", expr: "SUM(receber.valor)" }],
    relacionamentos: [],
  });

  it("compila só elementos certificados", () => {
    const compiled = compilarConsultaSemantica(
      {
        versao: 1,
        metrica: "total",
        dimensoes: ["empresa"],
        periodo: { coluna: "vencimento", de: "dataInicio", ate: "dataFim" },
      },
      escopo,
    );
    expect(compiled.sql).toMatch(/SUM\(receber\.valor\) AS total/i);
    expect(compiled.sql).toMatch(/GROUP BY empresa/i);
    expect(compiled.sql).toMatch(/vencimento >= :dataInicio/i);
    expect(compiled.elementos).toEqual(
      expect.arrayContaining(["metrica:total", "dimensao:empresa", "periodo:vencimento"]),
    );
  });

  it("recusa métrica fora do pacote", () => {
    expect(() => compilarConsultaSemantica({ versao: 1, metrica: "inventada" }, escopo)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO }),
    );
  });

  it("emite JOIN a partir de pares[] quando há mais de uma tabela", () => {
    const multi = parseEscopoSkill({
      tabelas: ["receber", "cliente"],
      colunasPorTabela: {
        receber: ["valor", "codcli", "empresa"],
        cliente: ["codcli", "nome"],
      },
      graoResultado: ["nome"],
      metricasSaida: [{ alias: "total", expr: "SUM(receber.valor)" }],
      relacionamentos: [
        {
          tabelaOrigem: "receber",
          colunaOrigem: "codcli",
          tabelaDestino: "cliente",
          colunaDestino: "codcli",
          pares: [{ colunaOrigem: "codcli", colunaDestino: "codcli" }],
          tipoJoin: "inner",
          cardinalidade: "N:1",
        },
      ],
    });
    const compiled = compilarConsultaSemantica(
      { versao: 1, metrica: "total", dimensoes: ["nome"] },
      multi,
      { empresa: true },
    );
    expect(compiled.sql).toMatch(/INNER JOIN cliente ON receber\.codcli = cliente\.codcli/i);
    expect(compiled.sql).toMatch(/GROUP BY cliente\.nome/i);
    expect(compiled.sql).toMatch(/receber\.empresa = :empresa/i);
  });

  it("falha sem caminho de JOIN no pacote", () => {
    const isolado = parseEscopoSkill({
      tabelas: ["receber", "cliente"],
      colunasPorTabela: {
        receber: ["valor"],
        cliente: ["nome"],
      },
      graoResultado: ["nome"],
      metricasSaida: [{ alias: "total", expr: "SUM(receber.valor)" }],
      relacionamentos: [],
    });
    expect(() =>
      compilarConsultaSemantica({ versao: 1, metrica: "total", dimensoes: ["nome"] }, isolado),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.JOIN_DESCONHECIDO }));
  });

  it("emite IN (:param) para filtro in (expansão de lista no binder)", () => {
    const compiled = compilarConsultaSemantica(
      {
        versao: 1,
        metrica: "total",
        filtros: [{ coluna: "empresa", op: "in", param: "empresas" }],
      },
      escopo,
    );
    expect(compiled.sql).toMatch(/empresa IN \(:empresas\)/i);
  });

  it("compila duas métricas, like, is_null, between e HAVING", () => {
    const rico = parseEscopoSkill({
      tabelas: ["receber"],
      colunasPorTabela: { receber: ["valor", "empresa", "nome", "vencimento"] },
      graoResultado: ["empresa"],
      metricasSaida: [
        { alias: "total", expr: "SUM(receber.valor)" },
        { alias: "qtde", expr: "COUNT(*)" },
      ],
      relacionamentos: [],
    });
    const compiled = compilarConsultaSemantica(
      {
        versao: 1,
        metrica: "total",
        metricas: ["total", "qtde"],
        dimensoes: ["empresa"],
        filtros: [
          { coluna: "nome", op: "like", param: "trecho" },
          { coluna: "nome", op: "is_null" },
          { coluna: "valor", op: "between", param: "minVal", param2: "maxVal" },
        ],
        having: [{ metrica: "total", op: ">", param: "piso" }],
      },
      rico,
    );
    expect(compiled.sql).toMatch(/SUM\(receber\.valor\) AS total/i);
    expect(compiled.sql).toMatch(/COUNT\(\*\) AS qtde/i);
    expect(compiled.sql).toMatch(/nome LIKE :trecho/i);
    expect(compiled.sql).toMatch(/nome IS NULL/i);
    expect(compiled.sql).toMatch(/valor BETWEEN :minVal AND :maxVal/i);
    expect(compiled.sql).toMatch(/HAVING SUM\(receber\.valor\) > :piso/i);
  });

  it("injeta LIMIT e recusa uso conceitual com page no caller", () => {
    const compiled = compilarConsultaSemantica(
      { versao: 1, metrica: "total", limite: 20 },
      escopo,
      undefined,
      { dialeto: "postgres" },
    );
    expect(compiled.sql).toMatch(/LIMIT 20/i);
  });

  it("qualifica colunas quando o pacote tem mais de uma tabela", () => {
    const multi = parseEscopoSkill({
      tabelas: ["receber", "cliente"],
      colunasPorTabela: {
        receber: ["valor", "codcli", "empresa"],
        cliente: ["codcli", "nome"],
      },
      graoResultado: ["nome"],
      metricasSaida: [{ alias: "total", expr: "SUM(receber.valor)" }],
      relacionamentos: [
        {
          tabelaOrigem: "receber",
          colunaOrigem: "codcli",
          tabelaDestino: "cliente",
          colunaDestino: "codcli",
          pares: [{ colunaOrigem: "codcli", colunaDestino: "codcli" }],
          tipoJoin: "inner",
          cardinalidade: "N:1",
        },
      ],
    });
    const compiled = compilarConsultaSemantica(
      {
        versao: 1,
        metrica: "total",
        dimensoes: ["nome"],
        filtros: [{ coluna: "empresa", op: "in", param: "empresas" }],
      },
      multi,
    );
    expect(compiled.sql).toMatch(/receber\.empresa IN \(:empresas\)/i);
    expect(compiled.sql).toMatch(/GROUP BY cliente\.nome/i);
  });

  it("reescreve alias do sqlModelo na expr certificada para o nome físico da tabela", () => {
    const receber = parseEscopoSkill({
      tabelas: ["ContaReceber"],
      colunasPorTabela: { ContaReceber: ["DataVencimento", "CodEmpresa"] },
      graoResultado: [],
      metricasSaida: [{ alias: "DataVencimento", expr: "CAST([cr].[DataVencimento] AS DATE)" }],
      relacionamentos: [],
    });
    const compiled = compilarConsultaSemantica({ versao: 1, metrica: "DataVencimento" }, receber);
    expect(compiled.sql).not.toMatch(/\bcr\b/i);
    expect(compiled.sql).toMatch(/CAST\(ContaReceber\.DataVencimento AS DATE\) AS DataVencimento/i);
    expect(compiled.sql).toMatch(/FROM ContaReceber\b/i);
  });
});
