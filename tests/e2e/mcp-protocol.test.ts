import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { compose } from "../../src/composition/compose.js";
import { testConfig } from "../../src/config/env.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { mcpRpc, payloadText, toolJson } from "../helpers/mcp-rpc.js";
import { oauthLoginAndToken } from "../helpers/oauth.js";

const AGENT = "3183a9f2-429b-46d6-a339-3580e5e5cb31";

type App = Awaited<ReturnType<typeof compose>>["app"];

describe("e2e MCP protocol", () => {
  const plug = new FakePlugServer();
  let close: () => Promise<void> = async () => undefined;
  let app: App;

  it("health + oauth metadata", async () => {
    const composed = await compose(testConfig(), { plug });
    app = composed.app;
    close = composed.close;
    const health = await request(app).get("/health");
    expect(health.body.status).toBe("ok");
    const as = await request(app).get("/.well-known/oauth-authorization-server");
    expect(as.body.authorization_endpoint).toContain("/oauth/authorize");
    const pr = await request(app).get("/.well-known/oauth-protected-resource");
    expect(pr.body.resource).toContain("/mcp");
  });

  it("initialize, tools/list, conectar, catalogo e consultar_dados", async () => {
    const composed = await compose(testConfig(), { plug });
    app = composed.app;
    close = composed.close;

    const token = await oauthLoginAndToken(app);
    const init = await mcpRpc(app, token, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "e2e", version: "0.1.0" },
      },
    });
    expect(init.res.status).toBe(200);
    expect(payloadText(init.payload)).toContain("testar_sql");
    expect(payloadText(init.payload)).toContain("registrar_fonte");
    expect(payloadText(init.payload)).toContain("colunasCodigo");
    expect(payloadText(init.payload)).toContain("buscar_contexto");
    expect(payloadText(init.payload)).toContain("salvar_consulta");
    expect(payloadText(init.payload)).toContain("anotar_fonte");
    expect(payloadText(init.payload)).toContain("adicionar_relacionamento");
    expect(payloadText(init.payload)).toContain("base de conhecimento");
    expect(payloadText(init.payload)).toContain("mantenha-a atualizada");
    const sessionId = init.sessionId;

    await mcpRpc(app, token, { jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);

    const listed = await mcpRpc(
      app,
      token,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      sessionId,
    );
    expect(payloadText(listed.payload)).toContain("consultar_dados");
    expect(payloadText(listed.payload)).toContain("desconectar_ambiente");
    expect(payloadText(listed.payload)).toContain("registrar_fonte");
    expect(payloadText(listed.payload)).toContain("atualizar_fonte");
    expect(payloadText(listed.payload)).toContain("remover_fonte");
    expect(payloadText(listed.payload)).toContain("explorar_tabelas");
    expect(payloadText(listed.payload)).toContain("descrever_tabela");
    expect(payloadText(listed.payload)).toContain("testar_sql");
    expect(payloadText(listed.payload)).toContain("buscar_contexto");
    expect(payloadText(listed.payload)).toContain("anotar_fonte");
    expect(payloadText(listed.payload)).toContain("adicionar_relacionamento");
    expect(payloadText(listed.payload)).toContain("listar_anotacoes");
    expect(payloadText(listed.payload)).toContain("salvar_consulta");

    const call = async (id: number, name: string, args: Record<string, unknown>) =>
      mcpRpc(
        app,
        token,
        { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } },
        sessionId,
      );

    const conectar = await call(3, "conectar_ambiente", {
      agentId: AGENT,
      dialeto: "mssql",
      nomeAmigavel: "Matriz",
    });
    const conectarJson = toolJson(conectar.payload);
    expect(JSON.stringify(conectarJson)).toContain("Matriz");
    const ambiente = conectarJson.ambiente as { id?: string } | undefined;
    const ambienteId = ambiente?.id;
    expect(ambienteId).toBeTruthy();

    plug.approve(AGENT);

    const status = await call(4, "verificar_status_ambiente", { ambienteId });
    expect(JSON.stringify(toolJson(status.payload))).toContain("approved");

    const tokenSet = await call(5, "configurar_client_token", {
      ambienteId,
      clientToken: "erp-token-xyz",
    });
    expect(JSON.stringify(toolJson(tokenSet.payload))).toContain("hasClientToken");

    const fonte = await call(6, "obter_fonte", { ambienteId, fonteId: "vendas" });
    const fonteJson = toolJson(fonte.payload);
    expect(JSON.stringify(fonteJson)).toContain("sql_base");
    expect(JSON.stringify(fonteJson)).toContain("ValorTotal");
    expect(JSON.stringify(fonteJson)).toContain("Faturamento");

    const anotada = await call(8, "anotar_fonte", {
      ambienteId,
      fonteId: "vendas",
      tipo: "uso",
      texto: "Não somar vendas da filial 99.",
    });
    expect(JSON.stringify(toolJson(anotada.payload))).toContain("anotacaoId");

    const contexto = await call(9, "buscar_contexto", {
      ambienteId,
      pergunta: "vendas filial",
    });
    expect(JSON.stringify(toolJson(contexto.payload))).toContain("filial 99");

    const fonte2 = await call(10, "obter_fonte", { ambienteId, fonteId: "vendas" });
    expect(JSON.stringify(toolJson(fonte2.payload))).toContain("filial 99");

    const consulta = await call(7, "consultar_dados", {
      ambienteId,
      sql: "SELECT SUM(ValorTotal) AS TotalVendas FROM Venda WHERE Cancelada = 0",
    });
    expect(JSON.stringify(toolJson(consulta.payload))).toContain("1854321.87");
  });

  afterAll(async () => {
    await close();
  });
});
