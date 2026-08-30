import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Skill, TipoParametroSkill } from "../../domain/entities/skill.js";
import { DIALETOS, isDialeto } from "../../domain/entities/dialeto.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { SkillRepositoryPort } from "../../domain/ports/skill-repository.port.js";
import { extractNamedParams } from "../../application/use-cases/shared/sql-modelo.js";
import { guiaDialeto } from "../../application/use-cases/shared/guia-dialeto.js";
import { currentAccountId } from "./account-context.js";
import { PRE_TREINO_SESSAO } from "./server-instructions.js";
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

const zodForParamTipo = (tipo: TipoParametroSkill | undefined): z.ZodTypeAny => {
  switch (tipo) {
    case "number":
    case "integer":
      return z.number();
    case "decimal":
      return z.string().describe("decimal como string segura");
    case "boolean":
      return z.boolean();
    case "datetime":
    case "date":
      return z.string().describe("ISO date (YYYY-MM-DD)");
    default:
      return z.string();
  }
};

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
      pergunta: z.string().describe("Pergunta do usuário (obrigatória)."),
    };
    for (const param of params) {
      const meta = skill.params.find((item) => item.nome === param);
      const field = zodForParamTipo(meta?.tipo);
      const described = meta?.descricao ? field.describe(meta.descricao) : field;
      shape[param] = meta?.obrigatorio === false ? described.optional() : described;
    }
    const existing = input.registered.get(name);
    existing?.remove();
    const registered = input.server.registerTool(
      name,
      {
        title: skill.nome,
        description:
          `${skill.nome}. ${skill.descricao} Executa somente sqlModelo; consulta elaborada usa consultar_dados.`.trim(),
        inputSchema: shape,
        annotations: queryAnnotations,
      },
      async (args: Record<string, unknown>) => {
        const pergunta = typeof args.pergunta === "string" ? args.pergunta : "";
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
            pergunta,
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

export const registerPreTreinoPrompt = (server: McpServer): void => {
  server.registerPrompt(
    "pre_treino",
    {
      description:
        "Persona de sessão: consultor de gestão; escreve SQL no escopo da skill publicada. Reaplique em chat novo na mesma conexão MCP.",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: PRE_TREINO_SESSAO,
          },
        },
      ],
    }),
  );
};

export const registerSkillCatalog = (server: McpServer, ports: SkillCatalogPorts): void => {
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
      const acessos = await ports.acessos.listByUsuario(uid);
      const dialeto =
        acessos.find((acesso) => acesso.agentId === skill.agentId)?.dialeto ?? "sybase";
      const avisos: { code: string; message: string }[] = [];
      if (skill.escopo.relacionamentos.some((rel) => rel.cardinalidade == null)) {
        avisos.push({
          code: "PERFIL_AUSENTE",
          message:
            "JOIN sem cardinalidade no pacote. Chame obter_skill e confirmar_relacionamento.",
        });
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
              params: skill.params,
              escopo: skill.escopo,
              consultaSemantica: skill.consultaSemantica,
              politicaConsulta: skill.politicaConsulta,
              guiaDialeto: guiaDialeto(dialeto),
              versao: skill.versao,
              pacoteVersao: skill.pacoteVersao,
              status: skill.status,
              avisos,
            }),
          },
        ],
      };
    },
  );

  server.registerResource(
    "guia-paginacao",
    "guia://paginacao",
    {
      description: "Regras de paginação MCP: consulta única limitada vs options.page + page_size.",
      mimeType: "text/plain",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: DIALETOS.map((dialeto) => {
            const guia = guiaDialeto(dialeto);
            return `${dialeto}: ${guia.paginacao}`;
          }).join("\n"),
        },
      ],
    }),
  );

  server.registerResource(
    "guia-dialeto",
    new ResourceTemplate("guia://dialeto/{dialeto}", {
      list: () => ({
        resources: DIALETOS.map((dialeto) => ({
          uri: `guia://dialeto/${dialeto}`,
          name: `Guia ${dialeto}`,
          description: `Datas, concatenação, cast e limite do dialeto ${dialeto}.`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      description: "Guia de dialeto (paginação, datas, concatenação, cast) sem round-trip ao ERP.",
      mimeType: "application/json",
    },
    (uri, variables) => {
      const raw = String(variables.dialeto ?? "").toLowerCase();
      if (!isDialeto(raw)) {
        return { contents: [] };
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(guiaDialeto(raw)),
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "consultar_com_skill",
    {
      description:
        "Fluxo de consulta ao ERP: ler o pacote da skill publicada e escrever SQL no escopo. Não invente tabela, coluna nem JOIN.",
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
              "Siga o pre-treino de sessão (prompt pre_treino / initialize.instructions).",
              "Consulte o ERP só com skill publicada.",
              `Pergunta: ${pergunta}`,
              acessoId ? `acessoId: ${acessoId}` : "Use listar_acessos se precisar do acessoId.",
              "Passos: buscar_contexto (reuse consultasAprendidas[].id em obter_skill.consultasExemplo; se houver consultaSemanticaSugerida, prefira consultar_dados.consultaSemantica) → listar_skills / obter_skill → validar_consulta se o SQL for novo → consultar_dados(skillIds, sql, params, pergunta). Se o usuário ensinou regra/dicionário, envie aprendizado[] ou chame registrar_aprendizado.",
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
              "Siga o pre-treino de sessão (prompt pre_treino / initialize.instructions).",
              "Explique o objetivo da skill ao usuário.",
              "1) Peça o SQL e chame treinar_com_sql (SELECT nomeado; JOIN se várias tabelas; colunas qualificadas).",
              "2) Mostre o fluxoTreino e peça nome/descrição → criar_skill (tabelas já no grafo).",
              "3) Se houver placeholders :nome/@nome, peça significado e tipo (string/number/integer/decimal/date/datetime/boolean) → atualizar_skill com params[{ nome, descricao, tipo }].",
              "4) Se fluxoTreino indicar conflitos, chame resolver_conflito.",
              "5) validar_skill (envelope vazio).",
              "6) Mostre o resumo e só chame publicar_skill com confirmadoPeloUsuario: true se o usuário confirmar. Sem confirmação, não publique.",
              "Não consulte o ERP pelo grafo. A consulta depois usa só a skill publicada.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
};
