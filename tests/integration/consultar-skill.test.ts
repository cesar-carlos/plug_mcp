import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { testConfig } from "../../src/config/env.js";
import { compose } from "../../src/composition/compose.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { mcpRpc, parseMcpPayload, readToolResult } from "../helpers/mcp-rpc.js";

const initialize = async (app: Awaited<ReturnType<typeof compose>>["app"], token?: string) => {
  const req = request(app)
    .post("/mcp")
    .set("Accept", "application/json, text/event-stream")
    .set("Content-Type", "application/json");
  if (token) {
    req.set("Authorization", `Bearer ${token}`);
  }
  const init = await req.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    },
  });
  const rawSession = init.headers["mcp-session-id"];
  return {
    status: init.status,
    sessionId: typeof rawSession === "string" ? rawSession : undefined,
  };
};

describe("consultar_dados só com skill", () => {
  it("sem skillId falha; com skill publicada envia só o SQL da skill ao plug", async () => {
    const agentId = randomUUID();
    const plug = new FakePlugServer();
    plug.approve(agentId);
    plug.sqlImpl = async () => ({ columns: ["codigo"], rows: [{ codigo: 1 }] });
    const { app, close, useCases } = await compose(testConfig(), { plug });
    try {
      const boot = await initialize(app);
      const registrar = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", boot.sessionId ?? "")
        .send({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "registrar_acesso",
            arguments: {
              email: `client-${agentId.slice(0, 8)}@example.com`,
              senha: "secret-pass",
              agentId,
              dialeto: "sybase",
              clientToken: `tok-sql-${agentId}`,
            },
          },
        });
      const registered = readToolResult(parseMcpPayload(registrar));
      expect(registered.ok).toBe(true);
      if (!registered.ok) {
        return;
      }
      const setupCode = registered.json.setupCode as string;
      const setup = await request(app).get(`/setup/${setupCode}`);
      const token = /<pre>([^<]+)<\/pre>/.exec(setup.text)?.[1];
      expect(token).toBeTruthy();

      const authed = await initialize(app, token);
      const toolsList = await mcpRpc(
        app,
        token!,
        { jsonrpc: "2.0", id: 21, method: "tools/list", params: {} },
        authed.sessionId,
      );
      const tools = toolsList.payload.result as {
        tools?: {
          name: string;
          outputSchema?: unknown;
          inputSchema?: { properties?: Record<string, unknown> };
        }[];
      };
      const names = tools.tools?.map((tool) => tool.name) ?? [];
      expect(names).toEqual(
        expect.arrayContaining([
          "despublicar_skill",
          "listar_conflitos",
          "remover_relacionamento",
          "inspecionar_consulta",
          "exportar_anexo",
          "descobrir_tabela",
          "detectar_deriva_esquema",
          "cancelar_operacao",
          "atualizar_persona",
        ]),
      );
      const confirmar = tools.tools?.find((tool) => tool.name === "confirmar_relacionamento");
      expect(confirmar?.inputSchema?.properties).toHaveProperty("pares");
      expect(confirmar?.inputSchema?.properties).toHaveProperty("cardinalidade");
      const criar = tools.tools?.find((tool) => tool.name === "criar_skill");
      expect(criar?.inputSchema?.properties).toHaveProperty("metricasSaida");
      const consultarTool = tools.tools?.find((tool) => tool.name === "consultar_dados");
      expect(consultarTool).toBeDefined();
      expect(consultarTool?.outputSchema).toBeDefined();

      const promptList = await mcpRpc(
        app,
        token!,
        { jsonrpc: "2.0", id: 20, method: "prompts/list", params: {} },
        authed.sessionId,
      );
      const prompts = promptList.payload.result as { prompts?: { name: string }[] };
      expect(prompts.prompts?.some((prompt) => prompt.name === "pre_treino")).toBe(true);
      expect(prompts.prompts?.some((prompt) => prompt.name === "consultar_com_skill")).toBe(true);
      expect(prompts.prompts?.some((prompt) => prompt.name === "cadastrar_skill")).toBe(true);

      const resourcesList = await mcpRpc(
        app,
        token!,
        { jsonrpc: "2.0", id: 22, method: "resources/list", params: {} },
        authed.sessionId,
      );
      const resources = resourcesList.payload.result as {
        resources?: { uri?: string }[];
      };
      const uris = resources.resources?.map((item) => item.uri) ?? [];
      expect(uris).toEqual(
        expect.arrayContaining([
          "guia://paginacao",
          "guia://dialeto/mssql",
          "guia://dialeto/sybase",
          "guia://dialeto/postgres",
          "guia://dialeto/firebird",
        ]),
      );
      expect(uris.some((uri) => uri?.startsWith("persona://"))).toBe(true);

      const firebirdRead = await mcpRpc(
        app,
        token!,
        {
          jsonrpc: "2.0",
          id: 23,
          method: "resources/read",
          params: { uri: "guia://dialeto/firebird" },
        },
        authed.sessionId,
      );
      const firebirdContents = firebirdRead.payload.result as {
        contents?: { text?: string }[];
      };
      const firebirdGuia = JSON.parse(firebirdContents.contents?.[0]?.text ?? "{}") as {
        dialeto?: string;
      };
      expect(firebirdGuia.dialeto).toBe("firebird");

      const missing = await mcpRpc(
        app,
        token!,
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "consultar_dados",
            arguments: { acessoId: registered.json.acessoId, sql: "SELECT 1 AS x" },
          },
        },
        authed.sessionId,
      );
      const missingResult = readToolResult(missing.payload);
      expect(missingResult.ok).toBe(false);

      await useCases.treinarComSql.execute(registered.json.usuarioId as string, {
        acessoId: registered.json.acessoId as string,
        sql: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
        params: { codigo: 10 },
      });
      const created = await useCases.criarSkill.execute(registered.json.usuarioId as string, {
        acessoId: registered.json.acessoId as string,
        slug: "produtos",
        nome: "Produtos",
        descricao: "Lista produtos",
        sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
        params: [{ nome: "codigo", descricao: "Código do produto", tipo: "number" }],
      });
      await useCases.validarSkill.execute(registered.json.usuarioId as string, {
        acessoId: registered.json.acessoId as string,
        skillId: created.skill.id,
        params: { codigo: 10 },
      });
      expect(plug.lastSql).toMatch(/_validacao/i);
      await useCases.publicarSkill.execute(registered.json.usuarioId as string, {
        acessoId: registered.json.acessoId as string,
        skillId: created.skill.id,
        confirmadoPeloUsuario: true,
      });

      plug.lastSql = null;
      const ok = await mcpRpc(
        app,
        token!,
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "consultar_dados",
            arguments: {
              acessoId: registered.json.acessoId,
              skillId: created.skill.id,
              pergunta: "produtos por codigo",
              params: { codigo: 10 },
            },
          },
        },
        authed.sessionId,
      );
      const okResult = readToolResult(ok.payload);
      expect(okResult.ok).toBe(true);
      expect(plug.lastSql).toContain("produto");
      expect(plug.lastSql).not.toMatch(/select \*/i);
      expect(plug.lastParams).toEqual({ codigo: 10 });

      const skillRead = await mcpRpc(
        app,
        token!,
        {
          jsonrpc: "2.0",
          id: 24,
          method: "resources/read",
          params: { uri: `skill://${registered.json.acessoId as string}/produtos` },
        },
        authed.sessionId,
      );
      const skillContents = skillRead.payload.result as {
        contents?: { text?: string }[];
      };
      const skillBody = JSON.parse(skillContents.contents?.[0]?.text ?? "{}") as {
        guiaDialeto?: { dialeto?: string };
        avisos?: { code?: string }[];
      };
      expect(skillBody.guiaDialeto?.dialeto).toBe("sybase");
      expect(skillBody.avisos?.map((aviso) => aviso.code)).not.toContain("DIALETO_AUSENTE");

      const bootLeak = await initialize(app);
      const skillLeak = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", bootLeak.sessionId ?? "")
        .send({
          jsonrpc: "2.0",
          id: 25,
          method: "resources/read",
          params: { uri: `skill://${registered.json.acessoId as string}/produtos` },
        });
      expect(skillLeak.status).toBeLessThan(500);
      const skillLeakPayload = parseMcpPayload(skillLeak);
      const skillLeakContents =
        (skillLeakPayload.result as { contents?: { text?: string }[] } | undefined)?.contents ?? [];
      expect(skillLeakPayload.error != null || skillLeakContents.length === 0).toBe(true);
      expect(JSON.stringify(skillLeakPayload)).not.toMatch(/sqlModelo/);
      const bootList = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", bootLeak.sessionId ?? "")
        .send({ jsonrpc: "2.0", id: 26, method: "resources/list", params: {} });
      const bootUris =
        (
          parseMcpPayload(bootList).result as { resources?: { uri?: string }[] } | undefined
        )?.resources?.map((item) => item.uri) ?? [];
      expect(bootUris.some((uri) => uri?.startsWith("skill://"))).toBe(false);
      expect(bootUris.some((uri) => uri?.startsWith("persona://"))).toBe(false);
    } finally {
      await close();
    }
  });
});
