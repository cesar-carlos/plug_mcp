import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compose } from "../../src/composition/compose.js";
import { testConfig } from "../../src/config/env.js";
import { PlugServerRestAdapter } from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { ServiceTokenManager } from "../../src/infrastructure/plug-server/token-manager.js";
import { ConsoleTestLogger } from "../helpers/console-logger.js";
import { getLiveEnv } from "../helpers/live-env.js";
import { mcpRpc, readToolResult, requireToolOk } from "../helpers/mcp-rpc.js";
import { oauthLoginAndToken } from "../helpers/oauth.js";

/**
 * SQL que o usuário entregou para cadastrar a fonte (contas a receber).
 * ValorRecebido duplicado de propósito — a IA deve notar e corrigir antes de gravar.
 */
const SQL_USUARIO = `SELECT
	cr.CodEmpresa,
	cr.CodFilial,
	f.Nome NomeFilial,
	cr.CodCliente,
	c.Nome NomeCliente,
	cr.Status,
	cr.CodTipoTitulo,
	cr.Valor,
	cr.ValorRecebido,
	cr.ValorRecebido
FROM ContaReceber cr
INNER JOIN Cliente c ON
	c.CodCliente = cr.CodCliente
INNER JOIN Filial f ON
	f.CodEmpresa = cr.CodEmpresa
AND f.CodFilial = cr.CodFilial`;

const SLUG = "e2e_contas_receber";
const PERGUNTA =
  "qual o valor total liquido que tenho a receber no mes DataVencimento = '2026/09/01'";

const pickName = (names: readonly string[], ...wanted: string[]): string | undefined => {
  const map = new Map(names.map((name) => [name.toLowerCase(), name]));
  for (const candidate of wanted) {
    const hit = map.get(candidate.toLowerCase());
    if (hit) {
      return hit;
    }
  }
  return undefined;
};

const flattenSql = (sql: string): string => sql.replace(/\s+/g, " ").trim();

const colunasDe = (payload: Record<string, unknown>): string[] => {
  const fromColumns = payload.columns;
  if (Array.isArray(fromColumns)) {
    return fromColumns.filter((item): item is string => typeof item === "string");
  }
  const estrutura = payload.estrutura;
  if (Array.isArray(estrutura)) {
    return estrutura
      .map((item) =>
        typeof item === "object" && item !== null ? (item as { nome?: string }).nome : undefined,
      )
      .filter((item): item is string => typeof item === "string");
  }
  return [];
};

const liveEnv = getLiveEnv();

/**
 * Live: protocolo MCP + plug-server real. Catálogo fica in-memory (NODE_ENV=test) para o
 * registrar_fonte não poluir o Postgres do MCP; no afterAll a fonte é removida.
 * Não executa DML no ERP — só SELECT / SUM.
 */
describe.skipIf(!liveEnv)("live: fonte contas a receber e total líquido", () => {
  const env = liveEnv!;
  const logger = new ConsoleTestLogger();
  const tokens = new ServiceTokenManager(
    env.PLUG_SERVER_BASE_URL,
    env.E2E_CLIENT_EMAIL,
    env.E2E_CLIENT_PASSWORD,
    logger,
  );
  const plug = new PlugServerRestAdapter(env.PLUG_SERVER_BASE_URL, tokens, logger);

  let close: () => Promise<void> = async () => undefined;
  let app: Awaited<ReturnType<typeof compose>>["app"];
  let bearer = "";
  let sessionId: string | undefined;
  let ambienteId = "";

  const rpcCall = async (id: number, name: string, args: Record<string, unknown>) =>
    mcpRpc(
      app,
      bearer,
      { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } },
      sessionId,
    );

  const call = async (id: number, name: string, args: Record<string, unknown>) =>
    requireToolOk((await rpcCall(id, name, args)).payload, name);

  const tryCall = async (id: number, name: string, args: Record<string, unknown>) =>
    readToolResult((await rpcCall(id, name, args)).payload);

  beforeAll(async () => {
    const composed = await compose(testConfig({ PLUG_SERVER_HTTP_TIMEOUT_MS: 60_000 }), {
      plug,
      logger,
    });
    app = composed.app;
    close = composed.close;
    bearer = await oauthLoginAndToken(app, "live-fonte@test.local", "password1");
    const init = await mcpRpc(app, bearer, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "live-fonte", version: "0.1.0" },
      },
    });
    sessionId = init.sessionId;
    await mcpRpc(app, bearer, { jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);

    const conectar = await call(3, "conectar_ambiente", {
      agentId: env.E2E_AGENT_ID,
      dialeto: env.E2E_DIALETO,
      nomeAmigavel: "Live E2E contas receber",
    });
    const ambiente = conectar.ambiente as { id?: string; statusAcesso?: string } | undefined;
    ambienteId = ambiente?.id ?? "";
    expect(ambienteId).toBeTruthy();

    const status = await call(4, "verificar_status_ambiente", { ambienteId });
    const statusAmbiente = status.ambiente as { statusAcesso?: string } | undefined;
    expect(statusAmbiente?.statusAcesso).toBe("approved");

    await call(5, "configurar_client_token", {
      ambienteId,
      clientToken: env.E2E_CLIENT_TOKEN,
    });
  }, 90_000);

  afterAll(async () => {
    if (ambienteId && bearer && sessionId) {
      try {
        await call(99, "remover_fonte", { ambienteId, slug: SLUG });
      } catch {
        // Fonte pode não ter sido gravada se uma fase anterior falhou.
      }
    }
    await close();
  });

  it(`cadastra o SQL do usuário, responde "${PERGUNTA}" com SUM (sem grid) e apaga a fonte`, async () => {
    const fontesAntes = await call(10, "listar_fontes", { ambienteId });
    const listaAntes = fontesAntes.fontes as { id?: string }[] | undefined;
    expect(listaAntes?.some((fonte) => fonte.id === SLUG)).toBe(false);

    let tabelaConta = "ContaReceber";
    const explorada = await tryCall(11, "explorar_tabelas", {
      ambienteId,
      filtro: "Receber",
    });
    if (explorada.ok) {
      const tabelas = (explorada.json.tabelas as { table_name?: string }[] | undefined) ?? [];
      const hit =
        tabelas.find((row) => row.table_name?.toLowerCase() === "contareceber") ??
        tabelas.find((row) => /receber/i.test(row.table_name ?? ""));
      if (hit?.table_name) {
        tabelaConta = hit.table_name;
      }
    }

    const sqlUsuarioFlat = flattenSql(SQL_USUARIO).replace(
      /FROM ContaReceber/i,
      `FROM ${tabelaConta}`,
    );
    await tryCall(12, "testar_sql", { ambienteId, sql: sqlUsuarioFlat });

    let nomesErp: string[] = [];
    const descritas = await tryCall(13, "descrever_tabela", {
      ambienteId,
      tabela: tabelaConta,
    });
    if (descritas.ok) {
      const cols = descritas.json.colunas as { nome?: string }[] | undefined;
      nomesErp =
        cols?.map((col) => col.nome).filter((nome): nome is string => typeof nome === "string") ??
        [];
    }

    const dataVenc =
      pickName(nomesErp, "DataVencimento", "DtVencimento", "Data_Vencimento") ?? "DataVencimento";
    const valor = pickName(nomesErp, "Valor") ?? "Valor";
    const valorRecebido = pickName(nomesErp, "ValorRecebido", "Valor_Recebido") ?? "ValorRecebido";
    const valorLiquidoNativo = pickName(
      nomesErp,
      "ValorLiquido",
      "Valor_Liquido",
      "VlrLiquido",
      "ValorLiq",
    );
    const exprLiquido = valorLiquidoNativo
      ? `cr.${valorLiquidoNativo} AS ValorLiquido`
      : `(cr.${valor} - cr.${valorRecebido}) AS ValorLiquido`;

    const sqlJoin = flattenSql(`
      SELECT cr.CodEmpresa, cr.CodFilial, f.Nome AS NomeFilial, cr.CodCliente, c.Nome AS NomeCliente,
        cr.Status, cr.CodTipoTitulo, cr.${valor}, cr.${valorRecebido}, ${exprLiquido}, cr.${dataVenc}
      FROM ${tabelaConta} cr
      INNER JOIN Cliente c ON c.CodCliente = cr.CodCliente
      INNER JOIN Filial f ON f.CodEmpresa = cr.CodEmpresa AND f.CodFilial = cr.CodFilial
    `);
    const sqlSimples = flattenSql(`
      SELECT cr.CodEmpresa, cr.CodFilial, cr.CodCliente, cr.Status, cr.CodTipoTitulo,
        cr.${valor}, cr.${valorRecebido}, ${exprLiquido}, cr.${dataVenc}
      FROM ${tabelaConta} cr
    `);

    const testeJoin = await tryCall(14, "testar_sql", { ambienteId, sql: sqlJoin });
    const sqlFonte = testeJoin.ok ? sqlJoin : sqlSimples;
    const testeFonte = testeJoin.ok
      ? testeJoin.json
      : await call(15, "testar_sql", { ambienteId, sql: sqlFonte });
    expect(testeFonte.valido).toBe(true);
    const colunasFonte = colunasDe(testeFonte);
    expect(pickName(colunasFonte, "ValorLiquido")).toBeTruthy();
    expect(pickName(colunasFonte, dataVenc, "DataVencimento")).toBeTruthy();

    const estrutura =
      (testeFonte.estrutura as { nome: string; tipoInferido: string }[] | undefined) ?? [];
    const tipoDe = (nome: string): string =>
      estrutura.find((col) => col.nome.toLowerCase() === nome.toLowerCase())?.tipoInferido ??
      "text";

    const colunasRegistro = colunasFonte.map((nome) => ({
      nome,
      tipo: tipoDe(nome),
      descricao:
        nome.toLowerCase() === "status"
          ? "Código de situação do título."
          : nome.toLowerCase() === "valorliquido"
            ? "Saldo líquido a receber."
            : `Coluna ${nome} da consulta de contas a receber.`,
      regraNegocio:
        nome.toLowerCase() === "status"
          ? "Dicionário de letras informado pelo usuário; não inventar significado."
          : undefined,
    }));

    await call(16, "registrar_fonte", {
      ambienteId,
      slug: SLUG,
      nome: "Contas a receber",
      descricao: "Títulos a receber do ERP com valor líquido e vencimento.",
      sqlBase: sqlFonte,
      confirmado: true,
      colunas: colunasRegistro,
    });

    const listar = await call(17, "listar_fontes", { ambienteId });
    const minhas = listar.fontes as { id?: string; origem?: string }[] | undefined;
    expect(minhas?.find((fonte) => fonte.id === SLUG)?.origem).toBe("minha");

    const detalhe = await call(18, "obter_fonte", { ambienteId, fonteId: SLUG });
    const sqlBase = detalhe.sql_base as string;
    expect(sqlBase.toLowerCase()).toContain(tabelaConta.toLowerCase());
    expect(sqlBase.toLowerCase()).toContain("valorliquido");

    const colData = pickName(colunasFonte, dataVenc) ?? dataVenc;
    const exprSum = valorLiquidoNativo ?? `(${valor} - ${valorRecebido})`;
    const sumExpr =
      env.E2E_DIALETO === "sybase" || env.E2E_DIALETO === "mssql"
        ? `ISNULL(SUM(${exprSum}), 0)`
        : `COALESCE(SUM(${exprSum}), 0)`;
    const sqlAgregado = flattenSql(`
      SELECT ${sumExpr} AS TotalLiquido
      FROM ${tabelaConta}
      WHERE ${colData} >= '20260901' AND ${colData} < '20261001'
    `);

    const consulta = await call(19, "consultar_dados", {
      ambienteId,
      sql: sqlAgregado,
      options: { max_rows: 5 },
    });

    expect(consulta.truncated).not.toBe(true);
    expect(consulta.rowCount).toBe(1);
    const rows = consulta.rows as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    const colunasConsulta =
      colunasDe(consulta).length > 0 ? colunasDe(consulta) : Object.keys(rows[0] ?? {});
    if (colunasConsulta.length === 0) {
      throw new Error(
        `SUM não devolveu nome de coluna. sql=${sqlAgregado} columns=${JSON.stringify(consulta.columns)} rows=${JSON.stringify(consulta.rows)}`,
      );
    }
    expect(colunasConsulta.length).toBeLessThanOrEqual(2);
    expect(pickName(colunasConsulta, "NomeCliente", "CodEmpresa", "Status")).toBeUndefined();
    const totalKey =
      pickName(Object.keys(rows[0] ?? {}), "TotalLiquido", "col_0") ?? colunasConsulta[0];
    expect(totalKey).toBeTruthy();
    const total = rows[0]?.[totalKey ?? ""];
    expect(total === null || typeof total === "number" || typeof total === "string").toBe(true);

    const removida = await call(20, "remover_fonte", { ambienteId, slug: SLUG });
    expect(removida.success).toBe(true);
    const depois = await call(21, "listar_fontes", { ambienteId });
    const listaDepois = depois.fontes as { id?: string }[] | undefined;
    expect(listaDepois?.some((fonte) => fonte.id === SLUG)).toBe(false);
  }, 90_000);
});
