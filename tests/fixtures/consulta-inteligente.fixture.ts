/**
 * Fixture sintética, sem dados de ERP, usada pelos gates de consulta e contrato.
 * IDs e aliases são deliberadamente estáveis para a suíte não depender de ordem.
 */
export const CONSULTA_INTELIGENTE_FIXTURE = {
  acesso: {
    id: "00000000-0000-4000-8000-000000000001",
    usuarioId: "00000000-0000-4000-8000-000000000002",
    timezone: "America/Cuiaba",
    dialeto: "postgres",
  },
  escopo: {
    tabelas: ["receber"],
    colunasPorTabela: {
      receber: ["valor", "empresa", "vencimento", "situacao"],
    },
    graoResultado: ["empresa"],
    metricasSaida: [
      { alias: "total", expr: "SUM(receber.valor)" },
      { alias: "quantidade", expr: "COUNT(*)" },
    ],
    relacionamentos: [],
  },
  agregacaoV2: {
    versao: 2 as const,
    modo: "agregacao" as const,
    metricas: ["total", "quantidade"],
    dimensoes: ["empresa"],
    filtros: [{ coluna: "situacao", op: "=", param: "situacao" as const }],
    periodo: { coluna: "vencimento", de: "inicio", ate: "fim" },
  },
  listagemV2: {
    versao: 2 as const,
    modo: "listagem" as const,
    dimensoes: ["empresa", "situacao"],
    ordenacao: [{ coluna: "empresa", dir: "asc" as const }],
    limite: 25,
  },
  telemetry: {
    origem: "semantica" as const,
    skillIds: ["skill-sintetica"],
    agregado: true,
    cacheHit: false,
    tabelas: 1,
    truncated: false,
    paginada: false,
    maxRows: 25,
    stage: "preflight" as const,
  },
} as const;
