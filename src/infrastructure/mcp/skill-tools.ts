import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Skill, TipoParametroSkill } from "../../domain/entities/skill.js";
import { DIALETOS, isDialeto, type Dialeto } from "../../domain/entities/dialeto.js";
import { personaSessaoDeAcesso, type Acesso } from "../../domain/entities/acesso.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { SkillRepositoryPort } from "../../domain/ports/skill-repository.port.js";
import { extractNamedParams } from "../../application/use-cases/shared/sql-modelo.js";
import { guiaDialeto, type GuiaDialeto } from "../../application/use-cases/shared/guia-dialeto.js";
import { currentAccountId } from "./account-context.js";
import { montarPreTreinoSessao } from "./server-instructions.js";
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
  const out: Skill[] = [];
  for (const acesso of acessos) {
    const list = await ports.skills.listByAcesso(acesso.id);
    for (const skill of list) {
      if (skill.status === "publicada") {
        out.push(skill);
      }
    }
  }
  return out;
};

export const skillToolName = (skill: Skill, all: readonly Skill[]): string => {
  const slug = skill.slug.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
  const clash = all.filter((item) => item.slug === skill.slug).length > 1;
  if (clash) {
    return `skill_${slug}_${(skill.acessoId ?? skill.id).replace(/-/g, "").slice(0, 8)}`;
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
          `${skill.nome}. ${skill.descricao} Executa somente sqlModelo; consulta elaborada usa consultar_dados. N=1 omita acessoId; N>1 o skillId desta tool amarra o acesso.`.trim(),
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

export const PRE_TREINO_PROMPT_DESCRIPTION =
  "Pre-treino de sessão: especialista em SQL do plug-server no dialeto do GDBR deste acesso (sybase/mssql/postgres/firebird; identifique o GDBR e emita SQL compatível — treino+IA, o hub não reescreve dialeto; resources guia://paginacao, guia://dialeto/{dialeto}, skill://{acessoId}/{slug}). Papel (atendimento, vendedor, financeiro, gestor, consultor, etc.) vem das skills treinadas e do grafo deste acesso e, com Bearer, da persona do acesso (chapéu depois do SQL; não concatenar; relê o banco). Reaplique em chat novo na mesma conexão MCP.";

export const CONSULTAR_COM_SKILL_PROMPT_DESCRIPTION =
  "Fluxo de consulta via plug-server: ler obter_skill / skill:// e guia://dialeto do acesso; SQL no pacote publicado (fail-closed). Firebird: só consulta exemplo. Não invente tabela, coluna nem JOIN.";

export const CADASTRAR_SKILL_PROMPT_DESCRIPTION =
  "Fluxo de treino até publicar: estrutura via explorar_tabelas/mapear_tabela (não invente schema); SQL no dialeto do acesso (treino grava para aquele GDBR; o hub não reescreve dialeto). Firebird: treino parseia o sqlModelo (não DIALECT_UNSUPPORTED); não coloque FIRST/TOP/LIMIT no modelo; depois consultar_dados só com skill publicada (consulta exemplo).";

export const registerPreTreinoPrompt = (
  server: McpServer,
  acessos?: AcessoRepositoryPort,
): void => {
  server.registerPrompt(
    "pre_treino",
    {
      description: PRE_TREINO_PROMPT_DESCRIPTION,
    },
    async () => {
      const uid = currentAccountId();
      const lista = uid && acessos ? await acessos.listByUsuario(uid) : [];
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: montarPreTreinoSessao(lista.map(personaSessaoDeAcesso)),
            },
          },
        ],
      };
    },
  );
};

export const GUIA_PAGINACAO_URI = "guia://paginacao";

export const urisGuiaDialeto = (): readonly string[] =>
  DIALETOS.map((dialeto) => `guia://dialeto/${dialeto}`);

export interface AvisoSkillResource {
  readonly code: string;
  readonly message: string;
}

export interface EnvelopeSkillResource {
  readonly id: string;
  readonly acessoId: string | null;
  readonly agentId?: string;
  readonly slug: string;
  readonly nome: string;
  readonly descricao: string;
  readonly sqlModelo: string;
  readonly params: Skill["params"];
  readonly escopo: Skill["escopo"];
  readonly consultaSemantica: Skill["consultaSemantica"];
  readonly politicaConsulta: Skill["politicaConsulta"];
  readonly guiaDialeto?: GuiaDialeto;
  readonly versao: number;
  readonly pacoteVersao: number;
  readonly status: Skill["status"];
  readonly avisos: readonly AvisoSkillResource[];
}

export const dialetoDoAcesso = (
  acessos: readonly Pick<Acesso, "id" | "agentId" | "dialeto">[],
  acessoId: string,
): Dialeto | undefined => acessos.find((acesso) => acesso.id === acessoId)?.dialeto;

export const envelopeSkillResource = (
  skill: Skill,
  dialeto: Dialeto | undefined,
  agentId?: string,
): EnvelopeSkillResource => {
  const avisos: AvisoSkillResource[] = [];
  if (skill.escopo.relacionamentos.some((rel) => rel.cardinalidade == null)) {
    avisos.push({
      code: "PERFIL_AUSENTE",
      message: "JOIN sem cardinalidade no pacote. Chame obter_skill e confirmar_relacionamento.",
    });
  }
  if (dialeto == null) {
    avisos.push({
      code: "DIALETO_AUSENTE",
      message:
        "Sem acesso para este acessoId; guia de dialeto omitido. Não assuma sybase nem mssql. Leia listar_acessos e guia://dialeto/{dialeto} do acesso real.",
    });
  }
  return {
    id: skill.id,
    acessoId: skill.acessoId,
    ...(agentId != null ? { agentId } : {}),
    slug: skill.slug,
    nome: skill.nome,
    descricao: skill.descricao,
    sqlModelo: skill.sqlModelo,
    params: skill.params,
    escopo: skill.escopo,
    consultaSemantica: skill.consultaSemantica,
    politicaConsulta: skill.politicaConsulta,
    ...(dialeto != null ? { guiaDialeto: guiaDialeto(dialeto) } : {}),
    versao: skill.versao,
    pacoteVersao: skill.pacoteVersao,
    status: skill.status,
    avisos,
  };
};

export const registerGuias = (server: McpServer): void => {
  server.registerResource(
    "guia-paginacao",
    GUIA_PAGINACAO_URI,
    {
      description:
        "Regras de paginação MCP por dialeto (sybase/mssql/postgres/firebird): consulta única limitada vs options.page + page_size. Distingue truncated (teto max_rows, sem página) de paginacao.hasNextPage. Firebird: só consulta exemplo, sem paginação gerenciada.",
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
          description: `Datas, concatenação, cast e limite do SQL que o plug-server aceita no dialeto ${dialeto}. Firebird: só consulta exemplo.`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      description:
        "Guia de dialeto do GDBR (paginação, datas, concatenação, cast) sem round-trip ao ERP. URI: guia://dialeto/{mssql|sybase|postgres|firebird}. Não assuma mssql.",
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
};

export const registerSkillWorkflowPrompts = (server: McpServer): void => {
  server.registerPrompt(
    "consultar_com_skill",
    {
      description: CONSULTAR_COM_SKILL_PROMPT_DESCRIPTION,
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
              "Consulte o ERP via plug-server só com skill publicada, no dialeto do acesso (guia://dialeto/{dialeto}; não assuma mssql).",
              `Pergunta: ${pergunta}`,
              acessoId ? `acessoId: ${acessoId}` : "Use listar_acessos se precisar do acessoId.",
              "Estrutura: obter_skill ou skill:// (pacote = autoridade). Firebird: consultar_dados sem sql.",
              "Passos: resources guia://paginacao / guia://dialeto → buscar_contexto (reuse consultasAprendidas[].id em obter_skill.consultasExemplo; se houver consultaSemanticaSugerida, prefira consultar_dados.consultaSemantica) → listar_skills / obter_skill → validar_consulta se o SQL for novo → consultar_dados(skillIds, sql, params, pergunta). Se o usuário ensinou regra/dicionário, envie aprendizado[] ou chame registrar_aprendizado.",
              "Se consultaPermitida for false ou gap.code SKILL_GAP, não chame consultar_dados. Oriente treinar_com_sql → criar_skill → validar_skill → publicar_skill.",
              "Não invente tabela, coluna nem JOIN. SELECT livre só no allowlist do pacote.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "cadastrar_skill",
    {
      description: CADASTRAR_SKILL_PROMPT_DESCRIPTION,
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
              "SQL no dialeto do acesso (guia://dialeto/{dialeto}; não assuma mssql). Firebird: treino parseia o sqlModelo (não DIALECT_UNSUPPORTED); não coloque FIRST/TOP/LIMIT no modelo; só consulta exemplo depois de publicar. Aviso PAGINACAO_MODELO se o modelo já declara corte.",
              "Não invente schema: explorar_tabelas / mapear_tabela para estrutura que faltar.",
              "1) Peça o SQL e chame treinar_com_sql (SELECT nomeado; JOIN se várias tabelas; colunas qualificadas).",
              "2) Mostre o fluxoTreino e peça nome/descrição → criar_skill (tabelas já no grafo).",
              "3) Se houver placeholders :nome/@nome, peça significado e tipo (string/number/integer/decimal/date/datetime/boolean) → atualizar_skill com params[{ nome, descricao, tipo }].",
              "4) Se fluxoTreino indicar conflitos, chame resolver_conflito.",
              "5) validar_skill (une o sqlModelo ao escopo persistido; envelope vazio). atualizar_skill com SQL novo une o AST ao pacote (grafo inferido não entra).",
              "6) Mostre o resumo e só chame publicar_skill com confirmadoPeloUsuario: true se o usuário confirmar. Sem confirmação, não publique.",
              "Não consulte o ERP pelo grafo. A consulta depois usa só a skill publicada.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
};

export const registerSkillCatalog = (server: McpServer, ports: SkillCatalogPorts): void => {
  server.registerResource(
    "skill",
    new ResourceTemplate("skill://{acessoId}/{slug}", {
      list: async () => {
        const uid = currentAccountId();
        if (!uid) {
          return { resources: [] };
        }
        const published = await listPublishedSkillsForUsuario(ports, uid);
        return {
          resources: published
            .filter((skill) => skill.acessoId)
            .map((skill) => ({
              uri: `skill://${skill.acessoId}/${skill.slug}`,
              name: skill.nome,
              description: skill.descricao,
              mimeType: "application/json",
            })),
        };
      },
    }),
    {
      description:
        "Pacote da skill publicada (mesmo conteúdo que obter_skill): escopo, colunas, JOINs, params, sqlModelo, guia de dialeto. Só skill publicada. Não invente schema.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const uid = currentAccountId();
      if (!uid) {
        return { contents: [] };
      }
      const acessoId = String(variables.acessoId ?? "");
      const slug = String(variables.slug ?? "");
      const published = await listPublishedSkillsForUsuario(ports, uid);
      const skill = published.find((item) => item.acessoId === acessoId && item.slug === slug);
      if (!skill) {
        return { contents: [] };
      }
      const acessos = await ports.acessos.listByUsuario(uid);
      const dono = acessos.find((item) => item.id === acessoId);
      const dialeto = dono?.dialeto ?? dialetoDoAcesso(acessos, acessoId);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(envelopeSkillResource(skill, dialeto, dono?.agentId)),
          },
        ],
      };
    },
  );
};

export const uriPersona = (acessoId: string): string => `persona://${acessoId}`;

export const envelopePersonaResource = (
  acesso: Pick<Acesso, "id" | "agentId" | "nomePersona" | "instrucoesPersona">,
): {
  readonly acessoId: string;
  readonly agentId: string;
  readonly nomePersona: string | null;
  readonly instrucoesPersona: string | null;
} => ({
  acessoId: acesso.id,
  agentId: acesso.agentId,
  nomePersona: acesso.nomePersona,
  instrucoesPersona: acesso.instrucoesPersona,
});

export const registerPersonaCatalog = (server: McpServer, acessos: AcessoRepositoryPort): void => {
  server.registerResource(
    "persona",
    new ResourceTemplate("persona://{acessoId}", {
      list: async () => {
        const uid = currentAccountId();
        if (!uid) {
          return { resources: [] };
        }
        const lista = await acessos.listByUsuario(uid);
        return {
          resources: lista.map((item) => ({
            uri: uriPersona(item.id),
            name: item.nomePersona ?? item.nomeAmigavel,
            description: item.nomePersona
              ? `Persona ${item.nomePersona} (tom/uso; não licencia SQL)`
              : "Persona deste acesso (atualizar_persona). Não licencia consulta.",
            mimeType: "application/json",
          })),
        };
      },
    }),
    {
      description:
        "Persona do acesso (nomePersona + instrucoesPersona). Orienta tom/uso; não licencia tabela, coluna, JOIN nem consultaPermitida. Em conflito, vale o pacote.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const uid = currentAccountId();
      if (!uid) {
        return { contents: [] };
      }
      const acessoId = String(variables.acessoId ?? "");
      const acesso = await acessos.findByIdForUsuario(acessoId, uid);
      if (!acesso) {
        return { contents: [] };
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(envelopePersonaResource(acesso)),
          },
        ],
      };
    },
  );
};
