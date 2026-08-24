import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Skill } from "../../domain/entities/skill.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { SkillRepositoryPort } from "../../domain/ports/skill-repository.port.js";
import { extractNamedParams } from "../../application/use-cases/shared/sql-modelo.js";
import { currentAccountId } from "./account-context.js";
import type { ToolRunner } from "./tool-result.js";
import type { ConsultarDados } from "../../application/use-cases/consultar.js";

export interface SkillCatalogPorts {
  readonly acessos: AcessoRepositoryPort;
  readonly skills: SkillRepositoryPort;
}

export const listPublishedSkillsForUsuario = async (
  ports: SkillCatalogPorts,
  usuarioId: string,
): Promise<readonly Skill[]> => {
  const acessos = await ports.acessos.listByUsuario(usuarioId);
  const byId = new Map<string, Skill>();
  const seenAgents = new Set<string>();
  for (const acesso of acessos) {
    if (seenAgents.has(acesso.agentId)) {
      continue;
    }
    seenAgents.add(acesso.agentId);
    const list = await ports.skills.listByAgent(acesso.agentId);
    for (const skill of list) {
      if (skill.status === "publicada") {
        byId.set(skill.id, skill);
      }
    }
  }
  return [...byId.values()];
};

export const skillToolName = (skill: Skill, all: readonly Skill[]): string => {
  const slug = skill.slug.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
  const clash = all.filter((item) => item.slug === skill.slug).length > 1;
  if (clash) {
    return `skill_${slug}_${skill.agentId.replace(/-/g, "").slice(0, 8)}`;
  }
  return `skill_${slug}`;
};

const queryAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const syncSkillTools = async (input: {
  server: McpServer;
  ports: SkillCatalogPorts;
  consultarDados: ConsultarDados;
  run: ToolRunner;
  usuarioId: string;
  registered: Map<string, { remove: () => void }>;
}): Promise<void> => {
  const published = await listPublishedSkillsForUsuario(input.ports, input.usuarioId);
  const wanted = new Set<string>();
  for (const skill of published) {
    const name = skillToolName(skill, published);
    wanted.add(name);
    const params = extractNamedParams(skill.sqlModelo);
    const shape: Record<string, z.ZodTypeAny> = {
      acessoId: z.string().optional(),
    };
    for (const param of params) {
      shape[param] = z.union([z.string(), z.number(), z.boolean(), z.null()]).optional();
    }
    const existing = input.registered.get(name);
    existing?.remove();
    const registered = input.server.registerTool(
      name,
      {
        title: skill.nome,
        description: `${skill.nome}. ${skill.descricao}`.trim(),
        inputSchema: shape,
        annotations: queryAnnotations,
      },
      async (args: Record<string, unknown>) => {
        const acessoId = typeof args.acessoId === "string" ? args.acessoId : undefined;
        const bound: Record<string, unknown> = {};
        for (const param of params) {
          if (Object.prototype.hasOwnProperty.call(args, param)) {
            bound[param] = args[param];
          }
        }
        return input.run(name, () =>
          input.consultarDados.execute(currentAccountId(), {
            acessoId,
            skillId: skill.id,
            params: bound,
          }),
        );
      },
    );
    input.registered.set(name, registered);
  }
  for (const [name, handle] of input.registered) {
    if (!wanted.has(name)) {
      handle.remove();
      input.registered.delete(name);
    }
  }
  if (input.server.isConnected()) {
    input.server.sendToolListChanged();
  }
};

export const registerSkillCatalog = (
  server: McpServer,
  ports: SkillCatalogPorts,
): void => {
  server.registerResource(
    "skill",
    new ResourceTemplate("skill://{agentId}/{slug}", {
      list: async () => {
        const uid = currentAccountId();
        if (!uid) {
          return { resources: [] };
        }
        const published = await listPublishedSkillsForUsuario(ports, uid);
        return {
          resources: published.map((skill) => ({
            uri: `skill://${skill.agentId}/${skill.slug}`,
            name: skill.nome,
            description: skill.descricao,
            mimeType: "application/json",
          })),
        };
      },
    }),
    {
      description: "Skills publicadas dos agentId dos acessos do Bearer (somente leitura).",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const uid = currentAccountId();
      if (!uid) {
        return { contents: [] };
      }
      const agentId = String(variables.agentId ?? "");
      const slug = String(variables.slug ?? "");
      const published = await listPublishedSkillsForUsuario(ports, uid);
      const skill = published.find((item) => item.agentId === agentId && item.slug === slug);
      if (!skill) {
        return { contents: [] };
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({
              id: skill.id,
              agentId: skill.agentId,
              slug: skill.slug,
              nome: skill.nome,
              descricao: skill.descricao,
              sqlModelo: skill.sqlModelo,
              versao: skill.versao,
              status: skill.status,
            }),
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "consultar_com_skill",
    {
      description:
        "Fluxo de consulta ao ERP: descobrir skill publicada e chamar consultar_dados. Não invente SQL.",
      argsSchema: {
        pergunta: z.string(),
        acessoId: z.string().optional(),
      },
    },
    ({ pergunta, acessoId }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Consulte o ERP só com skill publicada.",
              `Pergunta: ${pergunta}`,
              acessoId ? `acessoId: ${acessoId}` : "Use listar_acessos se precisar do acessoId.",
              "Passos: buscar_contexto → listar_skills / resources skill:// → obter_skill → consultar_dados(skillId, params).",
              "Se consultaPermitida for false ou gap.code SKILL_GAP, não chame consultar_dados. Oriente treinar_com_sql → criar_skill → validar_skill → publicar_skill.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "cadastrar_skill",
    {
      description: "Fluxo de treino até publicar a skill que a IA usará depois.",
      argsSchema: {
        objetivo: z.string(),
      },
    },
    ({ objetivo }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Cadastre uma skill para: ${objetivo}`,
              "Passos: treinar_com_sql (SELECT nomeado, JOIN se várias tabelas) → criar_skill → validar_skill → publicar_skill.",
              "Não consulte o ERP pelo grafo. A consulta depois usa só a skill publicada.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
};
