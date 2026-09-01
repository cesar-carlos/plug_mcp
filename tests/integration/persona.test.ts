import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { testConfig } from "../../src/config/env.js";
import { compose } from "../../src/composition/compose.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { mcpRpc, parseMcpPayload, readToolResult } from "../helpers/mcp-rpc.js";
import { PRE_TREINO_SESSAO } from "../../src/infrastructure/mcp/server-instructions.js";

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
  const payload = parseMcpPayload(init);
  const rawSession = init.headers["mcp-session-id"];
  return {
    status: init.status,
    sessionId: typeof rawSession === "string" ? rawSession : undefined,
    instructions: (payload.result as { instructions?: string } | undefined)?.instructions ?? "",
  };
};

const registrarEObterToken = async (
  app: Awaited<ReturnType<typeof compose>>["app"],
  plug: FakePlugServer,
  agentId: string,
): Promise<{ token: string; usuarioId: string; acessoId: string }> => {
  plug.approve(agentId);
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
  if (!registered.ok) {
    throw new Error("registrar_acesso falhou");
  }
  const setupCode = registered.json.setupCode as string;
  const setup = await request(app).get(`/setup/${setupCode}`);
  const token = /<pre>([^<]+)<\/pre>/.exec(setup.text)?.[1];
  if (!token) {
    throw new Error("token MCP ausente no setup");
  }
  return {
    token,
    usuarioId: registered.json.usuarioId as string,
    acessoId: registered.json.acessoId as string,
  };
};

const promptTextOf = (payload: Record<string, unknown>): string => {
  const result = payload.result as {
    messages?: { content?: { text?: string } | { text?: string }[] }[];
  };
  const content = result.messages?.[0]?.content;
  return Array.isArray(content) ? (content[0]?.text ?? "") : (content?.text ?? "");
};

const resourceContents = (payload: Record<string, unknown>): { text?: string }[] => {
  const result = payload.result as { contents?: { text?: string }[] } | undefined;
  return result?.contents ?? [];
};

const resourceJson = (payload: Record<string, unknown>): Record<string, unknown> | undefined => {
  const text = resourceContents(payload)[0]?.text;
  if (typeof text !== "string" || text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

const expectResourceEmpty = (payload: Record<string, unknown>): void => {
  expect(resourceJson(payload)).toBeUndefined();
  expect(JSON.stringify(payload)).not.toMatch(/sqlModelo/);
};

describe("persona no initialize autenticado", () => {
  it("um acesso injeta o chapéu depois do SQL; vários não concatenam", async () => {
    const agentId = randomUUID();
    const agentId2 = randomUUID();
    const plug = new FakePlugServer();
    const { app, close, useCases } = await compose(testConfig(), { plug });
    try {
      const { token, usuarioId, acessoId } = await registrarEObterToken(app, plug, agentId);
      await useCases.atualizarPersona.execute(usuarioId, {
        acessoId,
        nomePersona: "Atendimento financeiro",
        instrucoesPersona: "Tom formal. Nunca invente JOIN.",
        confirmadoPeloUsuario: true,
      });

      const authed = await initialize(app, token);
      expect(authed.instructions.startsWith(PRE_TREINO_SESSAO)).toBe(true);
      expect(authed.instructions).toContain("Atendimento financeiro");
      expect(authed.instructions).toContain("Tom formal. Nunca invente JOIN.");
      expect(authed.instructions).toMatch(/instru[cç][oõ]es do usu[aá]rio/i);
      expect(authed.instructions).toMatch(/n[aã]o override do SQL/i);
      expect(authed.instructions).toMatch(/at[eé] reconectar/);
      expect(authed.instructions.indexOf("Atendimento financeiro")).toBeGreaterThan(
        PRE_TREINO_SESSAO.length,
      );
      expect(authed.instructions).not.toContain("Há vários acessos neste token");

      const listed = await useCases.listarAcessos.execute(usuarioId);
      expect(listed.acessos).toHaveLength(1);
      expect(listed.acessos[0]?.nomePersona).toBe("Atendimento financeiro");
      expect(listed.acessos[0]?.instrucoesPersona).toBe("Tom formal. Nunca invente JOIN.");

      const promptGet = await mcpRpc(
        app,
        token,
        { jsonrpc: "2.0", id: 11, method: "prompts/get", params: { name: "pre_treino" } },
        authed.sessionId,
      );
      const promptText = promptTextOf(promptGet.payload);
      expect(promptText.startsWith(PRE_TREINO_SESSAO)).toBe(true);
      expect(promptText).toContain("Atendimento financeiro");

      plug.approve(agentId2);
      const added = await useCases.adicionarAcesso.execute(usuarioId, {
        agentId: agentId2,
        dialeto: "postgres",
        clientToken: `tok-sql-${agentId2}`,
        nomeAmigavel: "outro",
      });
      await useCases.atualizarPersona.execute(usuarioId, {
        acessoId: added.acesso.id,
        nomePersona: "Vendedor",
        instrucoesPersona: "Chapéu que não deve aparecer concatenado.",
        confirmadoPeloUsuario: true,
      });

      const promptAposSegundo = await mcpRpc(
        app,
        token,
        { jsonrpc: "2.0", id: 12, method: "prompts/get", params: { name: "pre_treino" } },
        authed.sessionId,
      );
      const preTreinoN = promptTextOf(promptAposSegundo.payload);
      expect(preTreinoN.startsWith(PRE_TREINO_SESSAO)).toBe(true);
      expect(preTreinoN).toContain("Há vários acessos neste token");
      expect(preTreinoN).toMatch(/n[aã]o concatenar chap[eé]us/i);
      expect(preTreinoN).not.toContain("Atendimento financeiro");
      expect(preTreinoN).not.toContain("Tom formal. Nunca invente JOIN.");
      expect(preTreinoN).not.toContain("Vendedor");
      expect(preTreinoN).not.toContain("Chapéu que não deve aparecer concatenado.");

      const multi = await initialize(app, token);
      expect(multi.instructions.startsWith(PRE_TREINO_SESSAO)).toBe(true);
      expect(multi.instructions).toContain("Há vários acessos neste token");
      expect(multi.instructions).toMatch(/n[aã]o concatenar chap[eé]us/i);
      expect(multi.instructions).toMatch(/at[eé] reconectar/);
      expect(multi.instructions).not.toContain("Tom formal. Nunca invente JOIN.");
      expect(multi.instructions).not.toContain("Chapéu que não deve aparecer concatenado.");
    } finally {
      await close();
    }
  });

  it("resources/read persona:// devolve JSON; IDOR de outro usuarioId fica vazio", async () => {
    const agentId = randomUUID();
    const plug = new FakePlugServer();
    const { app, close, useCases } = await compose(testConfig(), { plug });
    try {
      const { token, usuarioId, acessoId } = await registrarEObterToken(app, plug, agentId);
      await useCases.atualizarPersona.execute(usuarioId, {
        acessoId,
        nomePersona: "Atendimento financeiro",
        instrucoesPersona: "Tom formal. Nunca invente JOIN.",
        confirmadoPeloUsuario: true,
      });
      const authed = await initialize(app, token);

      const listed = await mcpRpc(
        app,
        token,
        { jsonrpc: "2.0", id: 20, method: "resources/list", params: {} },
        authed.sessionId,
      );
      const uris =
        (listed.payload.result as { resources?: { uri?: string }[] } | undefined)?.resources?.map(
          (item) => item.uri,
        ) ?? [];
      expect(uris).toContain(`persona://${acessoId}`);

      const ok = await mcpRpc(
        app,
        token,
        {
          jsonrpc: "2.0",
          id: 21,
          method: "resources/read",
          params: { uri: `persona://${acessoId}` },
        },
        authed.sessionId,
      );
      const body = resourceJson(ok.payload);
      expect(body).toMatchObject({
        acessoId,
        agentId,
        nomePersona: "Atendimento financeiro",
        instrucoesPersona: "Tom formal. Nunca invente JOIN.",
      });
      expect(JSON.stringify(body)).not.toMatch(/tok-sql|secret-pass|clientToken/);

      const other = await registrarEObterToken(app, plug, randomUUID());
      const otherInit = await initialize(app, other.token);
      const idor = await mcpRpc(
        app,
        other.token,
        {
          jsonrpc: "2.0",
          id: 22,
          method: "resources/read",
          params: { uri: `persona://${acessoId}` },
        },
        otherInit.sessionId,
      );
      expectResourceEmpty(idor.payload);
      const otherList = await mcpRpc(
        app,
        other.token,
        { jsonrpc: "2.0", id: 23, method: "resources/list", params: {} },
        otherInit.sessionId,
      );
      const otherUris =
        (
          otherList.payload.result as { resources?: { uri?: string }[] } | undefined
        )?.resources?.map((item) => item.uri) ?? [];
      expect(otherUris).not.toContain(`persona://${acessoId}`);
    } finally {
      await close();
    }
  });
});
