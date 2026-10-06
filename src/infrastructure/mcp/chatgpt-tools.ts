import { createHash } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  currentConsumerAuth,
  sessionContext,
  assertConsumerAuthorized,
} from "../../application/session-context.js";
import type { ChatGptOAuth } from "../../application/use-cases/chatgpt-oauth.js";
import { obterTreinamentoBase } from "../../application/use-cases/shared/treinamento-base.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import { personaSessaoDeAcesso } from "../../domain/entities/acesso.js";
import { oauthUnauthorized } from "../../domain/errors/oauth-error.js";
import type { ToolRunner } from "./tool-result.js";
import { guiaDialeto } from "../../application/use-cases/shared/guia-dialeto.js";

const securitySchemes = [{ type: "oauth2", scopes: ["se7e:access"] }];
/** Decora o handler público do SDK, preservando seu catálogo e paginação. */
const installToolListAuth = (server: McpServer): void => {
  const protocol = server.server;
  const register = protocol.setRequestHandler.bind(protocol);
  protocol.setRequestHandler = (method: string, ...args: unknown[]): void => {
    if (method === "tools/list") {
      const handler = args[args.length - 1];
      if (typeof handler !== "function") throw new TypeError("tools/list handler ausente");
      args[args.length - 1] = async (...inputs: unknown[]): Promise<unknown> => {
        const result = (await Reflect.apply(handler, protocol, inputs)) as {
          tools: Record<string, unknown>[];
        };
        return {
          ...result,
          tools: result.tools.map((tool) => ({
            ...tool,
            securitySchemes,
            _meta: { ...((tool._meta as Record<string, unknown>) ?? {}), securitySchemes },
          })),
        };
      };
    }
    Reflect.apply(register, protocol, [method, ...args]);
  };
};
const effects = new Set([
  "verificar_acesso",
  "consultar_dados",
  "mapear_tabela",
  "explorar_tabelas",
  "inspecionar_consulta",
  "descobrir_tabela",
  "detectar_deriva_esquema",
]);
/** Decora todos os produtores, inclusive tools dinâmicas e de treinamento. */
export const chatGptServer = (server: McpServer): McpServer => {
  installToolListAuth(server);
  return new Proxy(server, {
    get(target, property) {
      if (property === "registerTool")
        return (...args: unknown[]): unknown => {
          const [name, options, ...rest] = args;
          const config = options as Record<string, unknown>;
          const annotations = config.annotations as Record<string, unknown> | undefined;
          return Reflect.apply(target.registerTool.bind(target), target, [
            name,
            {
              ...config,
              securitySchemes,
              _meta: { ...((config._meta as Record<string, unknown>) ?? {}), securitySchemes },
              ...(typeof name === "string" && (effects.has(name) || name.startsWith("skill_"))
                ? { annotations: { ...annotations, readOnlyHint: false, idempotentHint: false } }
                : {}),
            },
            ...rest,
          ]);
        };
      if (property === "registerResource" || property === "registerPrompt")
        return (...args: unknown[]): unknown => {
          const callback = args[args.length - 1];
          if (typeof callback === "function")
            args[args.length - 1] = async (...inputs: unknown[]): Promise<unknown> => {
              await assertConsumerAuthorized();
              const result: unknown = await Reflect.apply(callback, target, inputs);
              await assertConsumerAuthorized();
              return result;
            };
          return Reflect.apply(target[property].bind(target), target, args);
        };
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? (value.bind(target) as unknown) : value;
    },
  });
};

export const registerChatGptTools = (
  server: McpServer,
  oauth: ChatGptOAuth,
  accesses: AcessoRepositoryPort,
  run: ToolRunner,
): void => {
  const profileSchema = z.strictObject({
    id: z.string().min(1).regex(/\S/),
    name: z.string().optional(),
  });
  server.registerTool(
    "get_profile",
    {
      description: "Perfil da conexão atual. ID opaco estável por acesso/persona.",
      inputSchema: z.strictObject({}),
      outputSchema: profileSchema,
      _meta: { "openai/profile": true },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const result = await run("get_profile", async () => {
        const auth = currentConsumerAuth();
        if (auth?.kind !== "oauth") throw oauthUnauthorized();
        const acesso = await accesses.findByIdForUsuario(auth.acessoId, auth.usuarioId);
        if (!acesso) throw oauthUnauthorized();
        return {
          id: createHash("sha256").update(`se7e:profile:v1:${acesso.id}`).digest("hex"),
          name: acesso.nomePersona ?? acesso.nomeAmigavel,
        };
      });
      if (!result.isError)
        result.structuredContent = JSON.parse(
          result.content[0]?.type === "text" ? result.content[0].text : "{}",
        ) as Record<string, unknown>;
      return result;
    },
  );
  server.registerTool(
    "obter_contexto_sessao",
    {
      description:
        "Base canônica, persona e guia do dialeto desta conexão; não expõe grafo nem autoriza SQL.",
      inputSchema: z.strictObject({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      run("obter_contexto_sessao", async () => {
        const auth = currentConsumerAuth();
        if (auth?.kind !== "oauth") throw oauthUnauthorized();
        const acesso = await accesses.findByIdForUsuario(auth.acessoId, auth.usuarioId);
        if (!acesso) throw oauthUnauthorized();
        return {
          ...obterTreinamentoBase({ dialeto: acesso.dialeto }),
          persona: personaSessaoDeAcesso(acesso),
          guiaPaginacao: { uri: "guia://paginacao", texto: guiaDialeto(acesso.dialeto).paginacao },
        };
      }),
  );
  server.registerTool(
    "revogar_conexao_chatgpt",
    {
      description: "Encerra somente esta conexão ChatGPT após confirmação humana explícita.",
      inputSchema: z.strictObject({ confirmadoPeloUsuario: z.literal(true) }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      run("revogar_conexao_chatgpt", async () => {
        const auth = currentConsumerAuth();
        if (auth?.kind !== "oauth") throw oauthUnauthorized();
        await oauth.revokeGrant(auth.grantId);
        const context = sessionContext.getStore();
        if (context) context.terminal = true;
        return { success: true, revogada: true };
      }),
  );
};
