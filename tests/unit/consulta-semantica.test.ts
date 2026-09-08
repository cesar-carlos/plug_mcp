import { describe, expect, it } from "vitest";
import {
  compilarConsultaSemantica,
  keywordJoinDoPacote,
} from "../../src/application/use-cases/shared/compilar-consulta-semantica.js";
import { parseConsultaSemantica } from "../../src/domain/entities/consulta-semantica.js";
import { parseEscopoSkill } from "../../src/domain/entities/escopo.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";

describe("consulta semântica", () => {
  it("keywordJoinDoPacote honra left e default inner", () => {
    expect(keywordJoinDoPacote("left")).toBe("LEFT JOIN");
    expect(keywordJoinDoPacote("LEFT OUTER JOIN")).toBe("LEFT JOIN");
    expect(keywordJoinDoPacote("inner")).toBe("INNER JOIN");
    expect(keywordJoinDoPacote(undefined)).toBe("INNER JOIN");
    expect(keywordJoinDoPacote("")).toBe("INNER JOIN");
  });

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

  it("emite LEFT JOIN quando tipoJoin do pacote é left", () => {
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
          tipoJoin: "left",
          cardinalidade: "N:1",
        },
      ],
    });
    const compiled = compilarConsultaSemantica(
      { versao: 1, metrica: "total", dimensoes: ["nome"] },
      multi,
    );
    expect(compiled.sql).toMatch(/LEFT JOIN cliente ON receber\.codcli = cliente\.codcli/i);
    expect(compiled.sql).not.toMatch(/INNER JOIN/i);
  });

  it("emite LEFT JOIN quando tipoJoin do pacote é LEFT JOIN", () => {
    const multi = parseEscopoSkill({
      tabelas: ["receber", "cliente"],
      colunasPorTabela: {
        receber: ["valor", "codcli"],
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
          tipoJoin: "LEFT JOIN",
          cardinalidade: "N:1",
        },
      ],
    });
    const compiled = compilarConsultaSemantica(
      { versao: 1, metrica: "total", dimensoes: ["nome"] },
      multi,
    );
    expect(compiled.sql).toMatch(/LEFT JOIN cliente ON receber\.codcli = cliente\.codcli/i);
  });

  it("emite INNER JOIN quando tipoJoin está ausente no pacote", () => {
    const multi = parseEscopoSkill({
      tabelas: ["receber", "cliente"],
      colunasPorTabela: {
        receber: ["valor", "codcli"],
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
          cardinalidade: "N:1",
        },
      ],
    });
    const compiled = compilarConsultaSemantica(
      { versao: 1, metrica: "total", dimensoes: ["nome"] },
      multi,
    );
    expect(compiled.sql).toMatch(/INNER JOIN cliente ON receber\.codcli = cliente\.codcli/i);
    expect(compiled.sql).not.toMatch(/LEFT JOIN/i);
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
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.JOIN_DESCONHECIDO, source: "sql" }));
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

  it("inclui tabelas de filtros e período na listagem v2", () => {
    const multi = parseEscopoSkill({
      tabelas: ["receber", "cliente"],
      colunasPorTabela: {
        receber: ["codcli", "vencimento"],
        cliente: ["codcli", "nome"],
      },
      graoResultado: ["nome"],
      metricasSaida: [],
      relacionamentos: [
        {
          tabelaOrigem: "receber",
          colunaOrigem: "codcli",
          tabelaDestino: "cliente",
          colunaDestino: "codcli",
          pares: [{ colunaOrigem: "codcli", colunaDestino: "codcli" }],
          tipoJoin: "inner",
        },
      ],
    });
    const compiled = compilarConsultaSemantica(
      {
        versao: 2,
        modo: "listagem",
        dimensoes: ["nome"],
        filtros: [{ coluna: "vencimento", op: "is_not_null" }],
      },
      multi,
    );
    expect(compiled.sql).toMatch(/FROM cliente INNER JOIN receber/i);
    expect(compiled.sql).toMatch(/receber\.vencimento IS NOT NULL/i);
  });

  it("normaliza e compila IR v2 de agregação com múltiplas métricas", () => {
    const escopoV2 = parseEscopoSkill({
      tabelas: ["receber"],
      colunasPorTabela: { receber: ["valor", "empresa"] },
      graoResultado: ["empresa"],
      metricasSaida: [
        { alias: "total", expr: "SUM(receber.valor)" },
        { alias: "qtde", expr: "COUNT(*)" },
      ],
      relacionamentos: [],
    });
    const consulta = parseConsultaSemantica({
      versao: 2,
      modo: "agregacao",
      metricas: ["total", "qtde"],
      dimensoes: ["empresa"],
      filtros: [{ coluna: "empresa", op: "=", param: "empresa" }],
    });
    expect(consulta).toMatchObject({
      versao: 2,
      modo: "agregacao",
      metricas: ["total", "qtde"],
    });
    const compiled = compilarConsultaSemantica(consulta!, escopoV2);
    expect(compiled.sql).toMatch(/SUM\(receber\.valor\) AS total/i);
    expect(compiled.sql).toMatch(/COUNT\(\*\) AS qtde/i);
    expect(compiled.sql).toMatch(/GROUP BY empresa/i);
  });

  it("normaliza e compila IR v2 de listagem sem inventar métrica", () => {
    const consulta = parseConsultaSemantica({
      versao: 2,
      modo: "listagem",
      dimensoes: ["empresa"],
      ordenacao: [{ coluna: "empresa", dir: "desc" }],
      limite: 10,
    });
    expect(consulta).toMatchObject({
      versao: 2,
      modo: "listagem",
      dimensoes: ["empresa"],
    });
    const compiled = compilarConsultaSemantica(consulta!, escopo, undefined, {
      dialeto: "postgres",
    });
    expect(compiled.sql).toMatch(/SELECT empresa FROM receber/i);
    expect(compiled.sql).not.toMatch(/SUM\(|COUNT\(/i);
    expect(compiled.sql).toMatch(/ORDER BY empresa DESC/i);
    expect(compiled.sql).toMatch(/LIMIT 10/i);
  });

  it("recusa campos de agregação no modo listagem v2", () => {
    expect(
      parseConsultaSemantica({
        versao: 2,
        modo: "listagem",
        dimensoes: ["empresa"],
        metricas: ["total"],
      }),
    ).toBeNull();
    expect(
      parseConsultaSemantica({
        versao: 2,
        modo: "listagem",
        dimensoes: ["empresa"],
        having: [{ metrica: "total", op: ">", param: "piso" }],
      }),
    ).toBeNull();
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
