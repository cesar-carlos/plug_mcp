import { describe, expect, it } from "vitest";
import request from "supertest";
import { testConfig } from "../../src/config/env.js";
import { compose } from "../../src/composition/compose.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { parseMcpPayload } from "../helpers/mcp-rpc.js";

const agentId = "11111111-1111-4111-8111-111111111111";

describe("bootstrap MCP", () => {
  it("initialize e registrar_acesso sem Bearer; token só no GET /setup", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const { app, close } = await compose(testConfig(), { plug });
    try {
      const init = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "0" },
          },
        });
      expect(init.status).toBeLessThan(500);
      const sessionId = init.headers["mcp-session-id"];
      const initPayload = parseMcpPayload(init);
      const initResult = initPayload.result as {
        instructions?: string;
        capabilities?: { prompts?: unknown; resources?: unknown };
      };
      expect(initResult.instructions).toMatch(/especialista em SQL/i);
      expect(initResult.instructions).toMatch(/n[aã]o invente especialidade/i);
      expect(initResult.instructions).toMatch(/consultor de gestão\/KPI/);
      expect(initResult.instructions).toMatch(/vendedor/);
      expect(initResult.instructions).toMatch(/n[aã]o misture agentIds/i);
      expect(initResult.instructions).toContain("error.code");
      expect(initResult.instructions).toContain("error.source");
      expect(initResult.instructions).toContain("invalid_payload");
      expect(initResult.instructions).toMatch(/n[aã]o reescreva o SQL/i);
      expect(initResult.instructions).toMatch(/SQL recusado n[aã]o persiste/i);
      expect(initResult.instructions).not.toMatch(/^Você é consultor de gestão/i);
      expect(initResult.instructions).not.toMatch(/^Você é consultor/i);
      expect(initResult.instructions).not.toMatch(/^Você é vendedor/i);
      expect(initResult.instructions).not.toMatch(/consultor de gestão \(KPI/);
      expect(initResult.instructions).not.toMatch(/diagnóstico, recomenda[cç][aã]o/i);
      expect(initResult.instructions).toContain("SKILL_GAP");
      expect(initResult.instructions).toContain("MULTI_SKILL_PARAMS");
      expect(initResult.instructions).toContain("tipoJoin");
      expect(initResult.instructions).toMatch(/INNER vs LEFT/);
      expect(initResult.instructions).toMatch(/plug-server/i);
      expect(initResult.instructions).toContain("firebird");
      expect(initResult.instructions).toContain("guia://dialeto/");
      expect(initResult.instructions).toContain("skill://");
      expect(initResult.instructions).toContain("obter_skill");
      expect(initResult.instructions).toContain("explorar_tabelas");
      expect(initResult.instructions).toContain("atualizar_persona");
      expect(initResult.instructions).toMatch(/n[aã]o assuma mssql/i);
      expect(initResult.instructions).toMatch(/treino \+ esta IA/);
      expect(initResult.instructions).toMatch(/n[aã]o implementa linguagem SQL/);
      expect(initResult.instructions).toMatch(/n[aã]o espere o hub reescrever/);
      expect(initResult.instructions).not.toContain("Há vários acessos neste token");
      expect(initResult.instructions).not.toContain("ainda não cadastrada");
      expect(initResult.instructions).not.toContain("Persona deste acesso");
      expect(initResult.capabilities?.prompts).toEqual(expect.anything());
      expect(initResult.capabilities?.resources).toEqual(expect.anything());

      const toolsList = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", sessionId ?? "")
        .send({ jsonrpc: "2.0", id: 9, method: "tools/list", params: {} });
      expect(toolsList.status).toBeLessThan(500);
      const toolsResult = parseMcpPayload(toolsList).result as { tools?: { name: string }[] };
      const toolNames = toolsResult.tools?.map((tool) => tool.name) ?? [];
      expect(toolNames).toEqual(["registrar_acesso"]);
      expect(toolNames).not.toContain("consultar_dados");
      expect(toolNames).not.toContain("exportar_anexo");
      expect(toolNames).not.toContain("criar_skill");
      expect(toolNames).not.toContain("listar_skills");

      const prompts = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", sessionId ?? "")
        .send({ jsonrpc: "2.0", id: 10, method: "prompts/list", params: {} });
      expect(prompts.status).toBeLessThan(500);
      const promptList = parseMcpPayload(prompts).result as {
        prompts?: { name: string; description?: string }[];
      };
      const preTreino = promptList.prompts?.find((prompt) => prompt.name === "pre_treino");
      expect(preTreino).toBeDefined();
      expect(preTreino?.description).toMatch(/especialista em SQL/i);
      expect(preTreino?.description).toMatch(/plug-server/i);
      expect(preTreino?.description).toContain("guia://");
      expect(preTreino?.description).toMatch(/hub n[aã]o reescreve dialeto/);
      expect(preTreino?.description).not.toMatch(/consultor de gestão/i);
      const promptNames = promptList.prompts?.map((prompt) => prompt.name) ?? [];
      expect(promptNames).toEqual(
        expect.arrayContaining(["pre_treino", "consultar_com_skill", "cadastrar_skill"]),
      );

      const promptGet = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", sessionId ?? "")
        .send({
          jsonrpc: "2.0",
          id: 11,
          method: "prompts/get",
          params: { name: "pre_treino" },
        });
      expect(promptGet.status).toBeLessThan(500);
      const promptGetResult = parseMcpPayload(promptGet).result as {
        messages?: { content?: { text?: string } | { text?: string }[] }[];
      };
      const promptContent = promptGetResult.messages?.[0]?.content;
      const promptText = Array.isArray(promptContent)
        ? (promptContent[0]?.text ?? "")
        : (promptContent?.text ?? "");
      expect(promptText).toMatch(/especialista em SQL/i);
      expect(promptText).toMatch(/consultor de gestão\/KPI/);
      expect(promptText).toMatch(/vendedor/);
      expect(promptText).toMatch(/plug-server/i);
      expect(promptText).toMatch(/treino \+ esta IA/);
      expect(promptText).toMatch(/n[aã]o implementa linguagem SQL/);
      expect(promptText).toContain("firebird");
      expect(promptText).toContain("guia://paginacao");
      expect(promptText).toContain("MULTI_SKILL_PARAMS");
      expect(promptText).toContain("tipoJoin");
      expect(promptText).not.toMatch(/^Você é consultor/i);
      expect(promptText).not.toMatch(/^Você é vendedor/i);
      expect(promptText).not.toMatch(/consultor de gestão \(KPI/);
      expect(promptText).not.toMatch(/diagnóstico, recomenda[cç][aã]o/i);

      const resources = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", sessionId ?? "")
        .send({ jsonrpc: "2.0", id: 12, method: "resources/list", params: {} });
      expect(resources.status).toBeLessThan(500);
      const resourceList = parseMcpPayload(resources).result as {
        resources?: { uri?: string }[];
      };
      const uris = resourceList.resources?.map((item) => item.uri) ?? [];
      expect(uris).toEqual(
        expect.arrayContaining([
          "guia://paginacao",
          "guia://dialeto/mssql",
          "guia://dialeto/sybase",
          "guia://dialeto/postgres",
          "guia://dialeto/firebird",
        ]),
      );
      expect(uris.some((uri) => uri?.startsWith("skill://"))).toBe(false);
      expect(uris.some((uri) => uri?.startsWith("persona://"))).toBe(false);

      const skillLeak = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", sessionId ?? "")
        .send({
          jsonrpc: "2.0",
          id: 15,
          method: "resources/read",
          params: { uri: "skill://00000000-0000-4000-8000-000000000000/produtos" },
        });
      expect(skillLeak.status).toBeLessThan(500);
      const skillLeakPayload = parseMcpPayload(skillLeak);
      const skillLeakContents =
        (skillLeakPayload.result as { contents?: { text?: string }[] } | undefined)?.contents ?? [];
      expect(skillLeakPayload.error != null || skillLeakContents.length === 0).toBe(true);
      expect(JSON.stringify(skillLeakPayload)).not.toMatch(/sqlModelo/);

      const personaLeak = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", sessionId ?? "")
        .send({
          jsonrpc: "2.0",
          id: 16,
          method: "resources/read",
          params: { uri: "persona://11111111-1111-4111-8111-111111111111" },
        });
      expect(personaLeak.status).toBeLessThan(500);
      const personaLeakPayload = parseMcpPayload(personaLeak);
      const personaLeakContents =
        (personaLeakPayload.result as { contents?: { text?: string }[] } | undefined)?.contents ??
        [];
      expect(personaLeakPayload.error != null || personaLeakContents.length === 0).toBe(true);
      expect(JSON.stringify(personaLeakPayload)).not.toMatch(/instrucoesPersona/);

      const guiaRead = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", sessionId ?? "")
        .send({
          jsonrpc: "2.0",
          id: 13,
          method: "resources/read",
          params: { uri: "guia://dialeto/postgres" },
        });
      expect(guiaRead.status).toBeLessThan(500);
      const guiaContents = parseMcpPayload(guiaRead).result as {
        contents?: { text?: string }[];
      };
      const guiaJson = JSON.parse(guiaContents.contents?.[0]?.text ?? "{}") as {
        dialeto?: string;
      };
      expect(guiaJson.dialeto).toBe("postgres");

      const paginacaoRead = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", sessionId ?? "")
        .send({
          jsonrpc: "2.0",
          id: 14,
          method: "resources/read",
          params: { uri: "guia://paginacao" },
        });
      expect(paginacaoRead.status).toBeLessThan(500);
      const paginacaoContents = parseMcpPayload(paginacaoRead).result as {
        contents?: { text?: string }[];
      };
      const paginacaoText = paginacaoContents.contents?.[0]?.text ?? "";
      expect(paginacaoText).toContain("truncated");
      expect(paginacaoText).toContain("hasNextPage");
      expect(paginacaoText).toMatch(/max_rows/);

      const call = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", sessionId ?? "")
        .send({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "registrar_acesso",
            arguments: {
              email: "client@example.com",
              senha: "secret-pass",
              agentId,
              dialeto: "sybase",
              clientToken: "tok-sql-123456",
            },
          },
        });
      expect(call.status).toBeLessThan(500);
      const text = JSON.stringify(call.body) + (call.text ?? "");
      expect(text).not.toContain("secret-pass");

      const denied = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .send({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "listar_acessos", arguments: {} },
        });
      expect(denied.status).toBe(401);
    } finally {
      await close();
    }
  });
});
