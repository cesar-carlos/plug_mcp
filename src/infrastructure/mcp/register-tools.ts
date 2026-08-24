import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/env.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { currentAccountId } from "./account-context.js";
import { createToolRunner } from "./tool-result.js";
import type {
  AdicionarAcesso,
  AtualizarCredencialPlug,
  ListarAcessos,
  RegistrarAcesso,
  RemoverAcesso,
  RotacionarTokenMcp,
  VerificarAcesso,
} from "../../application/use-cases/cofre.js";
import type { TreinarComSql } from "../../application/use-cases/treinar-com-sql.js";
import type {
  BuscarContexto,
  ConsultarDados,
  ExplorarTabelas,
  MapearTabela,
  ResolverConflito,
} from "../../application/use-cases/consultar.js";
import type {
  AnotarGrafo,
  AtualizarSkill,
  ConfirmarColuna,
  CriarSkill,
  ListarAnotacoes,
  ListarSkills,
  ObterSkill,
  PublicarSkill,
  RemoverAnotacao,
  ValidarSkill,
} from "../../application/use-cases/skills.js";

export interface ToolUseCases {
  registrarAcesso: RegistrarAcesso;
  adicionarAcesso: AdicionarAcesso;
  listarAcessos: ListarAcessos;
  verificarAcesso: VerificarAcesso;
  removerAcesso: RemoverAcesso;
  atualizarCredencialPlug: AtualizarCredencialPlug;
  rotacionarTokenMcp: RotacionarTokenMcp;
  treinarComSql: TreinarComSql;
  consultarDados: ConsultarDados;
  explorarTabelas: ExplorarTabelas;
  mapearTabela: MapearTabela;
  buscarContexto: BuscarContexto;
  resolverConflito: ResolverConflito;
  criarSkill: CriarSkill;
  atualizarSkill: AtualizarSkill;
  validarSkill: ValidarSkill;
  publicarSkill: PublicarSkill;
  listarSkills: ListarSkills;
  obterSkill: ObterSkill;
  confirmarColuna: ConfirmarColuna;
  anotarGrafo: AnotarGrafo;
  listarAnotacoes: ListarAnotacoes;
  removerAnotacao: RemoverAnotacao;
}

import type { RateLimitStore } from "../http/rate-limit.js";
import { registerSkillCatalog, type SkillCatalogPorts } from "./skill-tools.js";

const emptyShape = {};

const readList = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const readWorld = { ...readList, openWorldHint: true } as const;
const writeLocal = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;
const writeWorld = { ...writeLocal, openWorldHint: true } as const;
const destroyLocal = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const paramSkillShape = z.object({
  nome: z.string(),
  descricao: z.string().optional(),
  obrigatorio: z.boolean().optional(),
  tipo: z.enum(["string", "number", "date", "boolean"]).optional(),
});

export const registerTools = (
  server: McpServer,
  config: AppConfig,
  useCases: ToolUseCases,
  logger: LoggerPort,
  options?: {
    bootstrapOnly?: boolean;
    catalog?: SkillCatalogPorts;
    rateLimit?: RateLimitStore;
    clientIp?: () => string | undefined;
    onSkillsChanged?: (usuarioId: string) => Promise<void>;
  },
): void => {
  const run = createToolRunner(config, logger, {
    rateLimit: options?.rateLimit,
    clientIp: options?.clientIp,
  });

  server.tool(
    "registrar_acesso",
    "Primeira tool, sem Bearer. Recebe e-mail/senha do Client no plug-server, agentId, dialeto e client_token. Devolve setupCode/setupUrl — o token MCP NÃO vem na resposta da tool.",
    {
      email: z.string().optional(),
      senha: z.string().optional(),
      agentId: z.string().optional(),
      dialeto: z.enum(["mssql", "sybase", "postgres", "firebird"]).optional(),
      clientToken: z.string().optional(),
      nomeAmigavel: z.string().optional(),
    },
    writeLocal,
    async (args) => run("registrar_acesso", () => useCases.registrarAcesso.execute(args)),
  );

  if (options?.bootstrapOnly) {
    return;
  }

  server.tool(
    "adicionar_acesso",
    "Com token MCP, adiciona outro agentId/client_token sem pedir senha de novo.",
    {
      agentId: z.string().optional(),
      dialeto: z.enum(["mssql", "sybase", "postgres", "firebird"]).optional(),
      clientToken: z.string().optional(),
      nomeAmigavel: z.string().optional(),
    },
    writeLocal,
    async (args) =>
      run("adicionar_acesso", () => useCases.adicionarAcesso.execute(currentAccountId(), args)),
  );

  server.tool(
    "listar_acessos",
    "Lista acessos do usuário autenticado (client_token mascarado).",
    emptyShape,
    readList,
    async () => run("listar_acessos", () => useCases.listarAcessos.execute(currentAccountId())),
  );

  server.tool(
    "verificar_acesso",
    "Consulta o status do pedido de acesso no plug-server. Não faça polling agressivo.",
    { acessoId: z.string().optional() },
    readWorld,
    async (args) =>
      run("verificar_acesso", () => useCases.verificarAcesso.execute(currentAccountId(), args)),
  );

  server.tool(
    "remover_acesso",
    "Remove o acesso do cofre. O grafo compartilhado do agentId permanece.",
    { acessoId: z.string().optional() },
    destroyLocal,
    async (args) =>
      run("remover_acesso", () => useCases.removerAcesso.execute(currentAccountId(), args)),
  );

  server.tool(
    "atualizar_credencial_plug",
    "Atualiza e-mail/senha do Client no cofre após o plug-server recusar login.",
    { email: z.string().optional(), senha: z.string().optional() },
    writeLocal,
    async (args) =>
      run("atualizar_credencial_plug", () =>
        useCases.atualizarCredencialPlug.execute(currentAccountId(), args),
      ),
  );

  server.tool(
    "rotacionar_token_mcp",
    "Invalida o token MCP atual e emite um setupCode para o usuário copiar o novo.",
    emptyShape,
    destroyLocal,
    async () =>
      run("rotacionar_token_mcp", () => useCases.rotacionarTokenMcp.execute(currentAccountId())),
  );

  server.tool(
    "treinar_com_sql",
    "Treina o grafo compartilhado do agentId com um SELECT nomeado. Proíbe SELECT *. Exige JOIN explícito se houver várias tabelas. Params nomeados opcionais para placeholders. Executa o SQL (amostra) e respeita a policy do client_token. Origem do fato: validado_execucao.",
    {
      acessoId: z.string().optional(),
      sql: z.string().optional(),
      params: z.record(z.unknown()).optional(),
    },
    writeWorld,
    async (args) =>
      run("treinar_com_sql", () => useCases.treinarComSql.execute(currentAccountId(), args)),
  );

  server.tool(
    "explorar_tabelas",
    "Lista tabelas/views do ERP via catálogo de sistema do dialeto do acesso.",
    { acessoId: z.string().optional(), filtro: z.string().optional() },
    readWorld,
    async (args) =>
      run("explorar_tabelas", () => useCases.explorarTabelas.execute(currentAccountId(), args)),
  );

  server.tool(
    "mapear_tabela",
    "Lê colunas de uma tabela no ERP e funde no grafo compartilhado (origem inferido).",
    { acessoId: z.string().optional(), tabela: z.string().optional() },
    writeWorld,
    async (args) =>
      run("mapear_tabela", () => useCases.mapearTabela.execute(currentAccountId(), args)),
  );

  server.tool(
    "buscar_contexto",
    "Busca skills, grafo e anotações deste agentId. Na pergunta de dados, priorize skills publicadas; sem skill capaz, não invente SQL.",
    { acessoId: z.string().optional(), query: z.string().optional() },
    readWorld,
    async (args) =>
      run("buscar_contexto", () => useCases.buscarContexto.execute(currentAccountId(), args)),
  );

  server.tool(
    "resolver_conflito",
    "Resolve conflito de fato no grafo com confirmação do usuário.",
    {
      acessoId: z.string().optional(),
      tabelaId: z.string().optional(),
      colunaId: z.string().optional(),
      relacionamentoId: z.string().optional(),
      descricao: z.string().optional(),
    },
    writeLocal,
    async (args) =>
      run("resolver_conflito", () => useCases.resolverConflito.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "consultar_dados",
    {
      description:
        "Executa o sqlModelo persistido de uma skill publicada. Sem parâmetro sql. Autorização = client_token. Sem skill capaz, não invente a consulta.",
      inputSchema: {
        acessoId: z.string().optional(),
        skillId: z.string(),
        params: z.record(z.unknown()).optional(),
        options: z
          .object({
            max_rows: z.number().int().positive().optional(),
            page: z.number().int().positive().optional(),
            page_size: z.number().int().positive().optional(),
            timeout_ms: z.number().int().positive().optional(),
          })
          .optional(),
      },
      outputSchema: {
        success: z.literal(true),
        skillId: z.string(),
        columns: z.array(z.string()),
        rows: z.array(z.record(z.string(), z.unknown())),
        rowCount: z.number(),
        maxRowsApplied: z.number(),
        truncated: z.boolean(),
        hint: z.string().optional(),
      },
      annotations: readWorld,
    },
    async (args) =>
      run("consultar_dados", () => useCases.consultarDados.execute(currentAccountId(), args)),
  );

  server.tool(
    "criar_skill",
    "Nomeia um SQL de negócio já treinado (tabelas precisam estar no grafo). Params com descrição fecham o checklist antes de publicar. A IA consulta o ERP pela skill publicada, não pelo grafo.",
    {
      acessoId: z.string().optional(),
      slug: z.string().optional(),
      nome: z.string().optional(),
      descricao: z.string().optional(),
      sqlModelo: z.string().optional(),
      params: z.array(paramSkillShape).optional(),
    },
    writeLocal,
    async (args) => run("criar_skill", () => useCases.criarSkill.execute(currentAccountId(), args)),
  );

  server.tool(
    "atualizar_skill",
    "Atualiza nome/descrição/SQL/params. Se o SQL mudar, as tabelas precisam estar no grafo e o status volta a rascunho. Patch só de nome/descrição/params mantém o status.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      nome: z.string().optional(),
      descricao: z.string().optional(),
      sqlModelo: z.string().optional(),
      params: z.array(paramSkillShape).optional(),
    },
    writeLocal,
    async (args) =>
      run("atualizar_skill", async () => {
        const result = await useCases.atualizarSkill.execute(currentAccountId(), args);
        const uid = currentAccountId();
        if (uid && options?.onSkillsChanged) {
          await options.onSkillsChanged(uid);
        }
        return result;
      }),
  );

  server.tool(
    "validar_skill",
    "Valida o sqlModelo com envelope vazio (sem ler dado). Recusa params sem descrição. Placeholders ausentes vão como null. Marca como validada.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      params: z.record(z.unknown()).optional(),
    },
    writeWorld,
    async (args) =>
      run("validar_skill", () => useCases.validarSkill.execute(currentAccountId(), args)),
  );

  server.tool(
    "publicar_skill",
    "Libera a skill só com checklist completo e confirmadoPeloUsuario: true. Mostre o resumo no chat antes de publicar.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      confirmadoPeloUsuario: z.boolean().optional(),
    },
    destroyLocal,
    async (args) =>
      run("publicar_skill", async () => {
        const result = await useCases.publicarSkill.execute(currentAccountId(), args);
        const uid = currentAccountId();
        if (uid && options?.onSkillsChanged) {
          await options.onSkillsChanged(uid);
        }
        return result;
      }),
  );

  server.tool(
    "listar_skills",
    "Lista skills do agentId do acesso.",
    { acessoId: z.string().optional() },
    readList,
    async (args) =>
      run("listar_skills", () => useCases.listarSkills.execute(currentAccountId(), args)),
  );

  server.tool(
    "obter_skill",
    "Obtém uma skill por id ou slug.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      slug: z.string().optional(),
    },
    readList,
    async (args) => run("obter_skill", () => useCases.obterSkill.execute(currentAccountId(), args)),
  );

  server.tool(
    "confirmar_coluna",
    "Confirma significado/dicionário de uma coluna no grafo compartilhado (origem confirmado_usuario).",
    {
      acessoId: z.string().optional(),
      tabela: z.string().optional(),
      coluna: z.string().optional(),
      descricao: z.string().optional(),
      dicionario: z.string().optional(),
    },
    writeLocal,
    async (args) =>
      run("confirmar_coluna", () => useCases.confirmarColuna.execute(currentAccountId(), args)),
  );

  server.tool(
    "anotar_grafo",
    "Grava nota/glossário no grafo compartilhado do agentId. Não invente significado.",
    {
      acessoId: z.string().optional(),
      tabela: z.string().optional(),
      tipo: z.string().optional(),
      titulo: z.string().optional(),
      texto: z.string().optional(),
    },
    writeLocal,
    async (args) =>
      run("anotar_grafo", () => useCases.anotarGrafo.execute(currentAccountId(), args)),
  );

  server.tool(
    "listar_anotacoes",
    "Lista anotações do agentId (opcionalmente de uma tabela).",
    { acessoId: z.string().optional(), tabelaId: z.string().nullable().optional() },
    readList,
    async (args) =>
      run("listar_anotacoes", () => useCases.listarAnotacoes.execute(currentAccountId(), args)),
  );

  server.tool(
    "remover_anotacao",
    "Remove uma anotação do grafo.",
    { acessoId: z.string().optional(), anotacaoId: z.string().optional() },
    destroyLocal,
    async (args) =>
      run("remover_anotacao", () => useCases.removerAnotacao.execute(currentAccountId(), args)),
  );

  if (options?.catalog) {
    registerSkillCatalog(server, options.catalog);
  }
};
