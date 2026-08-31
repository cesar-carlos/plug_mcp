import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/env.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import { currentAccountId } from "./account-context.js";
import { createToolRunner } from "./tool-result.js";
import { columnMetadataItemSchema } from "../../application/use-cases/shared/columns-metadata.js";
import type {
  AdicionarAcesso,
  AtualizarCredencialPlug,
  AtualizarDialeto,
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
  ListarConflitos,
  MapearTabela,
  ResolverConflito,
  ValidarConsulta,
} from "../../application/use-cases/consultar.js";
import type {
  CancelarOperacao,
  DescobrirTabela,
  DetectarDerivaEsquema,
  InspecionarConsulta,
} from "../../application/use-cases/inspecionar.js";
import type {
  AnotarGrafo,
  AtualizarSkill,
  ConfirmarColuna,
  ConfirmarRelacionamento,
  CriarSkill,
  DespublicarSkill,
  ExpandirEscopo,
  ListarAnotacoes,
  ListarSkills,
  ObterSkill,
  PublicarSkill,
  RemoverAnotacao,
  RemoverRelacionamento,
  RemoverSkill,
  ValidarSkill,
} from "../../application/use-cases/skills.js";
import type {
  AtualizarEscopoPadrao,
  HerdarCatalogo,
  ListarAuditoria,
  ListarLacunas,
  ListarMetricasAgente,
  RegistrarAprendizado,
  RegistrarLacunaFerramenta,
  SalvarConsulta,
} from "../../application/use-cases/aprendizado.js";

export interface ToolUseCases {
  registrarAcesso: RegistrarAcesso;
  adicionarAcesso: AdicionarAcesso;
  listarAcessos: ListarAcessos;
  verificarAcesso: VerificarAcesso;
  removerAcesso: RemoverAcesso;
  atualizarCredencialPlug: AtualizarCredencialPlug;
  rotacionarTokenMcp: RotacionarTokenMcp;
  atualizarDialeto: AtualizarDialeto;
  treinarComSql: TreinarComSql;
  consultarDados: ConsultarDados;
  explorarTabelas: ExplorarTabelas;
  mapearTabela: MapearTabela;
  buscarContexto: BuscarContexto;
  resolverConflito: ResolverConflito;
  listarConflitos: ListarConflitos;
  validarConsulta: ValidarConsulta;
  criarSkill: CriarSkill;
  atualizarSkill: AtualizarSkill;
  validarSkill: ValidarSkill;
  publicarSkill: PublicarSkill;
  despublicarSkill: DespublicarSkill;
  removerSkill: RemoverSkill;
  listarSkills: ListarSkills;
  obterSkill: ObterSkill;
  expandirEscopo: ExpandirEscopo;
  confirmarRelacionamento: ConfirmarRelacionamento;
  removerRelacionamento: RemoverRelacionamento;
  confirmarColuna: ConfirmarColuna;
  anotarGrafo: AnotarGrafo;
  listarAnotacoes: ListarAnotacoes;
  removerAnotacao: RemoverAnotacao;
  salvarConsulta: SalvarConsulta;
  registrarAprendizado: RegistrarAprendizado;
  atualizarEscopoPadrao: AtualizarEscopoPadrao;
  herdarCatalogo: HerdarCatalogo;
  listarAuditoria: ListarAuditoria;
  listarMetricasAgente: ListarMetricasAgente;
  registrarLacunaFerramenta: RegistrarLacunaFerramenta;
  listarLacunas: ListarLacunas;
  inspecionarConsulta: InspecionarConsulta;
  descobrirTabela: DescobrirTabela;
  detectarDerivaEsquema: DetectarDerivaEsquema;
  cancelarOperacao: CancelarOperacao;
}

import type { RateLimitStore } from "../http/rate-limit.js";
import {
  registerPreTreinoPrompt,
  registerSkillCatalog,
  type SkillCatalogPorts,
} from "./skill-tools.js";

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
  tipo: z
    .enum(["string", "number", "integer", "decimal", "date", "datetime", "boolean"])
    .optional(),
});

const metricaSaidaShape = z.object({
  alias: z.string(),
  expr: z.string().optional(),
  definicao: z.string().optional(),
  grao: z.string().optional(),
  dimensoesPermitidas: z.array(z.string()).optional(),
  statusIncluidos: z.array(z.string()).optional(),
  statusExcluidos: z.array(z.string()).optional(),
  colunaData: z.string().optional(),
});

const consultaSemanticaShape = z.object({
  versao: z.literal(1).optional(),
  metrica: z.string().optional(),
  metricas: z.array(z.string()).optional(),
  dimensoes: z.array(z.string()).optional(),
  filtros: z
    .array(
      z.object({
        coluna: z.string(),
        op: z.enum([
          "=",
          "!=",
          ">",
          ">=",
          "<",
          "<=",
          "in",
          "like",
          "is_null",
          "is_not_null",
          "between",
        ]),
        param: z.string().optional(),
        param2: z.string().optional(),
      }),
    )
    .optional(),
  having: z
    .array(
      z.object({
        metrica: z.string(),
        op: z.enum(["=", "!=", ">", ">=", "<", "<="]),
        param: z.string(),
      }),
    )
    .optional(),
  periodo: z
    .object({
      coluna: z.string(),
      de: z.string(),
      ate: z.string(),
    })
    .optional(),
  ordenacao: z
    .array(z.object({ coluna: z.string(), dir: z.enum(["asc", "desc"]).optional() }))
    .optional(),
  limite: z.number().int().positive().optional(),
});

const politicaConsultaShape = z.object({
  maxRows: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  exigirRecorteTemporal: z.boolean().optional(),
  maxTabelas: z.number().int().positive().optional(),
  modoPreferencial: z.enum(["agregado", "detalhe"]).optional(),
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
    "Primeira tool, sem Bearer. Recebe e-mail/senha do Client no plug-server, agentId, dialeto e client_token. Devolve setupCode/setupUrl — o token MCP NÃO vem na resposta da tool. Não ecoe senha nem client_token no chat.",
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

  registerPreTreinoPrompt(server);

  if (options?.bootstrapOnly) {
    return;
  }

  server.tool(
    "adicionar_acesso",
    "Com token MCP, adiciona outro agentId/client_token sem pedir senha de novo. Não ecoe o client_token no chat.",
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
    "Lista acessos do usuário autenticado (client_token mascarado). sqlAccessState vem só do cofre (approved → unknown).",
    emptyShape,
    readList,
    async () => run("listar_acessos", () => useCases.listarAcessos.execute(currentAccountId())),
  );

  server.tool(
    "verificar_acesso",
    "Consulta o status do pedido de acesso no plug-server e a prontidão SQL (hub + policy). Não faça polling agressivo. hasClientToken false no hub não prova token morto.",
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
    "Atualiza e-mail/senha do Client no cofre após o plug-server recusar login. Não ecoe a senha no chat.",
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
    "atualizar_dialeto",
    "Muda o dialeto do acesso e do grafo do agentId. Skills deixam de estar publicadas (voltam a rascunho) porque o SQL pode não valer no dialeto novo. Exige confirmadoPeloUsuario: true.",
    {
      acessoId: z.string().optional(),
      dialeto: z.enum(["mssql", "sybase", "postgres", "firebird"]).optional(),
      confirmadoPeloUsuario: z.boolean().optional(),
    },
    writeLocal,
    async (args) =>
      run("atualizar_dialeto", () => useCases.atualizarDialeto.execute(currentAccountId(), args)),
  );

  server.tool(
    "treinar_com_sql",
    "Treina o grafo compartilhado do agentId com um SELECT nomeado. Proíbe SELECT *. Exige JOIN explícito se houver várias tabelas. Params nomeados opcionais. Origem: validado_execucao. enriquecer=completo (opt-in) perfila cardinalidade, tipo/formato, min/max/nulos e candidatos a dicionário (teto de 16 queries; falha vira aviso).",
    {
      acessoId: z.string().optional(),
      sql: z.string().optional(),
      params: z.record(z.unknown()).optional(),
      enriquecer: z.enum(["basico", "completo"]).optional(),
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
    "Lê colunas de uma tabela no ERP e funde no grafo (origem inferido). Infere papel/formato. Vários tipos por coluna viram aviso CATALOGO_TIPOS_AMBIGUOS (SQL Server → atualizar_dialeto para mssql).",
    { acessoId: z.string().optional(), tabela: z.string().optional() },
    writeWorld,
    async (args) =>
      run("mapear_tabela", () => useCases.mapearTabela.execute(currentAccountId(), args)),
  );

  server.tool(
    "buscar_contexto",
    "Candidatos com cobertura certificada (nome/slug/descrição/params/metricasSaida, não SQL nem corpo de regra). consultaPermitida só se cobertura completa. conhecimentos[] é evidência FTS/ILIKE (não embeddings/RAG); stem une inflexão na cobertura; não autoriza SQL. Envelope sem sqlModelo nem SQL aprendido — use obter_skill.consultasExemplo pelo id de consultasAprendidas. Se consultaPermitida e houver KPI de agregação (não CAST), consultaSemanticaSugerida (sem SQL). Skill em treino que cobre a pergunta: blockingReason SKILL_NOT_PUBLISHED. Cobertura parcial: registrar_aprendizado tipo=sinonimo se o usuário confirmar o termo. SKILL_GAP: não registre sinônimo; não cruze sem JOIN publicado; fluxoTreino só com skill em andamento. grafoParaTreino só no fluxo de gap.",
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

  server.tool(
    "listar_conflitos",
    "Lista fatos em conflito do agentId (kind, ids, nomes, hint) para resolver_conflito. Sem SQL e sem linhas de ERP.",
    { acessoId: z.string().optional() },
    readList,
    async (args) =>
      run("listar_conflitos", () => useCases.listarConflitos.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "consultar_dados",
    {
      description:
        "Consulta o ERP no escopo publicado. pergunta obrigatória. skillIds opcional (omitido = união das publicadas do agentId; se vierem, recortam). Sem sql: consulta exemplo (exige uma skill âncora). sql no allowlist, consultaSemantica (uma skill) ou consultaAprendidaId. JOIN só se estiver em algum pacote. Página: ORDER BY + options.page e page_size, sem TOP/LIMIT.",
      inputSchema: {
        acessoId: z.string().optional(),
        skillId: z.string().optional(),
        skillIds: z.array(z.string()).optional(),
        sql: z.string().optional(),
        consultaSemantica: consultaSemanticaShape.optional(),
        consultaAprendidaId: z.string().optional(),
        pergunta: z.string(),
        aprendizado: z
          .array(
            z.object({
              tipo: z.string().optional(),
              titulo: z.string().optional(),
              texto: z.string().optional(),
              tabela: z.string().optional(),
              skillId: z.string().optional(),
            }),
          )
          .optional(),
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
        skillIds: z.array(z.string()),
        columns: z.array(z.string()),
        columnsMetadata: z.array(columnMetadataItemSchema).optional(),
        rows: z.array(z.record(z.string(), z.unknown())),
        rowCount: z.number(),
        maxRowsApplied: z.number(),
        truncated: z.boolean(),
        sqlExecutado: z.string(),
        paramsUsados: z.record(z.string(), z.unknown()),
        asOf: z.string(),
        recorte: z.array(
          z.object({
            tipoJoin: z.string(),
            tabela: z.string(),
            on: z.string().nullable(),
          }),
        ),
        escopoAplicado: z.object({
          empresa: z.string().optional(),
          filial: z.string().optional(),
          consolidado: z.boolean(),
        }),
        avisos: z.array(z.object({ code: z.string(), message: z.string() })),
        aprendizadoGravado: z
          .object({
            consultaId: z.string(),
            execucoes: z.number(),
            nova: z.boolean(),
            perguntaUsada: z.string(),
            itens: z.number(),
          })
          .optional(),
        hint: z.string().optional(),
        paginacao: z
          .object({
            page: z.number(),
            pageSize: z.number(),
            hasNextPage: z.boolean(),
            hasPreviousPage: z.boolean(),
          })
          .optional(),
      },
      annotations: readWorld,
    },
    async (args) =>
      run("consultar_dados", () => useCases.consultarDados.execute(currentAccountId(), args)),
  );

  server.tool(
    "criar_skill",
    "Nomeia um SQL de negócio já treinado (tabelas precisam estar no grafo). Pacote mínimo: uma tabela, colunas nomeadas, WHERE ou agregação, params com descricao; JOIN/KPI só se o usuário pedir. Params com descrição fecham o checklist antes de publicar. metricasSaida overlaya definição/grão/status só de aliases já no pacote. A IA consulta o ERP pela skill publicada, não pelo grafo.",
    {
      acessoId: z.string().optional(),
      slug: z.string().optional(),
      nome: z.string().optional(),
      descricao: z.string().optional(),
      sqlModelo: z.string().optional(),
      params: z.array(paramSkillShape).optional(),
      consultaSemantica: consultaSemanticaShape.optional(),
      politicaConsulta: politicaConsultaShape.optional(),
      metricasSaida: z.array(metricaSaidaShape).optional(),
    },
    writeLocal,
    async (args) => run("criar_skill", () => useCases.criarSkill.execute(currentAccountId(), args)),
  );

  server.tool(
    "atualizar_skill",
    "Atualiza nome/descrição/SQL/params/KPI. Se o SQL mudar, as tabelas precisam estar no grafo e o status volta a rascunho. Patch só de nome/descrição/params/KPI/slug mantém o status. Renomear slug exige confirmadoPeloUsuario.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      nome: z.string().optional(),
      descricao: z.string().optional(),
      slug: z.string().optional(),
      sqlModelo: z.string().optional(),
      params: z.array(paramSkillShape).optional(),
      consultaSemantica: consultaSemanticaShape.optional(),
      politicaConsulta: politicaConsultaShape.optional(),
      metricasSaida: z.array(metricaSaidaShape).optional(),
      confirmadoPeloUsuario: z.boolean().optional(),
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
    "Valida o sqlModelo com envelope vazio (sem ler dado). Recusa params sem descrição. Placeholders ausentes vão como null. Skill já publicada permanece publicada. enriquecer=completo (opt-in) perfila o sqlModelo no grafo.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      params: z.record(z.unknown()).optional(),
      enriquecer: z.enum(["basico", "completo"]).optional(),
    },
    writeWorld,
    async (args) =>
      run("validar_skill", () => useCases.validarSkill.execute(currentAccountId(), args)),
  );

  server.tool(
    "publicar_skill",
    "Libera a skill só com checklist completo e confirmadoPeloUsuario: true. Sem confirmação devolve publicado:false, resumoPublicacao e faltas[] — não invente o resumo.",
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
    "despublicar_skill",
    "Rebaixa skill publicada para validada sem apagar pacote, params nem consultas aprendidas. Exige confirmadoPeloUsuario: true. Consulta volta a SKILL_NOT_PUBLISHED. Não confundir com remover_skill.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      confirmadoPeloUsuario: z.boolean().optional(),
    },
    destroyLocal,
    async (args) =>
      run("despublicar_skill", async () => {
        const result = await useCases.despublicarSkill.execute(currentAccountId(), args);
        const uid = currentAccountId();
        if (uid && options?.onSkillsChanged) {
          await options.onSkillsChanged(uid);
        }
        return result;
      }),
  );

  server.tool(
    "remover_skill",
    "Apaga a skill (pacote e sqlModelo) deste agentId. Exige confirmadoPeloUsuario: true. O grafo permanece; consultas aprendidas ficam desvinculadas. Mostre nome/slug/status no chat antes.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      slug: z.string().optional(),
      confirmadoPeloUsuario: z.boolean().optional(),
    },
    destroyLocal,
    async (args) =>
      run("remover_skill", async () => {
        const result = await useCases.removerSkill.execute(currentAccountId(), args);
        const uid = currentAccountId();
        if (uid && options?.onSkillsChanged) {
          await options.onSkillsChanged(uid);
        }
        return result;
      }),
  );

  server.tool(
    "listar_skills",
    "Lista skills do agentId (id, slug, nome, status, versao, motivoRevalidacao, podeLiberar, fluxoTreino, faltas[]). Sem sqlModelo — use obter_skill para o pacote.",
    { acessoId: z.string().optional() },
    readList,
    async (args) =>
      run("listar_skills", () => useCases.listarSkills.execute(currentAccountId(), args)),
  );

  server.tool(
    "obter_skill",
    "Obtém o pacote da skill: escopo, colunas, relacionamentos, regras/métricas, consultas aprendidas, guia de dialeto e faltas[] (kind, alvo, nextAction). Aviso PERFIL_AUSENTE se tipo/formato/cardinalidade estiverem vazios.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      slug: z.string().optional(),
    },
    readList,
    async (args) => run("obter_skill", () => useCases.obterSkill.execute(currentAccountId(), args)),
  );

  server.tool(
    "expandir_escopo",
    "Acrescenta tabelas já treinadas ao escopo da skill. Exige confirmadoPeloUsuario: true.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      tabelas: z.array(z.string()).optional(),
      confirmadoPeloUsuario: z.boolean().optional(),
    },
    writeLocal,
    async (args) =>
      run("expandir_escopo", () => useCases.expandirEscopo.execute(currentAccountId(), args)),
  );

  server.tool(
    "confirmar_relacionamento",
    "Confirma um JOIN no grafo (origem confirmado_usuario). pares[] para chave composta; colunaOrigem/colunaDestino continuam válidos (um par). Com skillId, persiste no pacote da skill — só o grafo não libera consulta.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      tabelaOrigem: z.string().optional(),
      colunaOrigem: z.string().optional(),
      tabelaDestino: z.string().optional(),
      colunaDestino: z.string().optional(),
      pares: z.array(z.object({ colunaOrigem: z.string(), colunaDestino: z.string() })).optional(),
      tipoJoin: z.string().optional(),
      cardinalidade: z.enum(["1:1", "1:N", "N:1", "N:N"]).optional(),
    },
    writeLocal,
    async (args) =>
      run("confirmar_relacionamento", () =>
        useCases.confirmarRelacionamento.execute(currentAccountId(), args),
      ),
  );

  server.tool(
    "remover_relacionamento",
    "Remove um JOIN (fingerprint dos pares) do grafo e, com skillId, do pacote. Um relacionamento por chamada. Exige confirmadoPeloUsuario: true.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      tabelaOrigem: z.string().optional(),
      tabelaDestino: z.string().optional(),
      pares: z.array(z.object({ colunaOrigem: z.string(), colunaDestino: z.string() })).optional(),
      colunaOrigem: z.string().optional(),
      colunaDestino: z.string().optional(),
      confirmadoPeloUsuario: z.boolean().optional(),
    },
    writeLocal,
    async (args) =>
      run("remover_relacionamento", () =>
        useCases.removerRelacionamento.execute(currentAccountId(), args),
      ),
  );

  server.tool(
    "validar_consulta",
    "Dry-run: valida o SQL contra o escopo publicado (skillIds opcional = união das publicadas) e executa envelope vazio no ERP (sem ler dado). Placeholders ausentes ligam-se a null.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      skillIds: z.array(z.string()).optional(),
      sql: z.string().optional(),
      params: z.record(z.unknown()).optional(),
    },
    readWorld,
    async (args) =>
      run("validar_consulta", () => useCases.validarConsulta.execute(currentAccountId(), args)),
  );

  server.tool(
    "confirmar_coluna",
    "Confirma significado/dicionário de coluna(s) no grafo (origem confirmado_usuario). colunas[] ou tabela+coluna. Com skillId, entra no pacote. sensibilidade só com confirmadoPeloUsuario: true.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      tabela: z.string().optional(),
      coluna: z.string().optional(),
      descricao: z.string().optional(),
      dicionario: z.string().optional(),
      sensibilidade: z.enum(["livre", "pessoal", "sensivel", "segredo"]).optional(),
      colunas: z
        .array(
          z.object({
            tabela: z.string(),
            coluna: z.string(),
            descricao: z.string().optional(),
            dicionario: z.string().optional(),
            sensibilidade: z.enum(["livre", "pessoal", "sensivel", "segredo"]).optional(),
          }),
        )
        .optional(),
      confirmadoPeloUsuario: z.boolean().optional(),
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

  server.tool(
    "salvar_consulta",
    "Promove/renomeia um SQL que funcionou a exemplo reutilizável (consulta aprendida). consultar_dados já grava o SQL; use esta tool para amarrar a pergunta do usuário. Exige confirmadoPeloUsuario: true.",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      pergunta: z.string().optional(),
      sql: z.string().optional(),
      confirmadoPeloUsuario: z.boolean().optional(),
    },
    writeLocal,
    async (args) =>
      run("salvar_consulta", () => useCases.salvarConsulta.execute(currentAccountId(), args)),
  );

  server.tool(
    "registrar_aprendizado",
    "Obrigatório quando o usuário ensinar regra, métrica, glossário, dicionário ou sinônimo. Grava na base de conhecimento (anotacao_grafo / sinonimo). Também aceito em consultar_dados.aprendizado[].",
    {
      acessoId: z.string().optional(),
      skillId: z.string().optional(),
      tipo: z.string().optional(),
      titulo: z.string().optional(),
      texto: z.string().optional(),
      tabela: z.string().optional(),
    },
    writeLocal,
    async (args) =>
      run("registrar_aprendizado", () =>
        useCases.registrarAprendizado.execute(currentAccountId(), args),
      ),
  );

  server.tool(
    "atualizar_escopo_padrao",
    "Define empresa/filial default e timezone do acesso. Exige confirmadoPeloUsuario: true. Consultas passam a recortar esse escopo.",
    {
      acessoId: z.string().optional(),
      empresa: z.string().optional(),
      filial: z.string().optional(),
      timezone: z.string().optional(),
      confirmadoPeloUsuario: z.boolean().optional(),
    },
    writeLocal,
    async (args) =>
      run("atualizar_escopo_padrao", () =>
        useCases.atualizarEscopoPadrao.execute(currentAccountId(), args),
      ),
  );

  server.tool(
    "herdar_catalogo",
    "Copia o template ilustrativo Se7e (empresa/filial/cliente/produto/receber/pagar, JOINs simples e compostos empresa+filial) para o grafo. Envelope: origem inferido, publicaSkill false — não autoriza consultar_dados. Treino com SQL real continua obrigatório. Exige confirmadoPeloUsuario: true.",
    {
      acessoId: z.string().optional(),
      confirmadoPeloUsuario: z.boolean().optional(),
    },
    writeLocal,
    async (args) =>
      run("herdar_catalogo", () => useCases.herdarCatalogo.execute(currentAccountId(), args)),
  );

  server.tool(
    "listar_auditoria",
    "Lista as últimas execuções de tools deste acesso (sem SQL completo nem segredos). buscar_contexto inclui telemetria (counts/enums, sem a pergunta).",
    { acessoId: z.string().optional(), limite: z.number().int().positive().optional() },
    readList,
    async (args) =>
      run("listar_auditoria", () => useCases.listarAuditoria.execute(currentAccountId(), args)),
  );

  server.tool(
    "listar_metricas_agente",
    "Agrega auditoria por tool e código de erro (duração, linhas, bloqueios). Campo busca: totais de buscar_contexto (permitida, SKILL_GAP, SKILL_NOT_PUBLISHED, slot narrativo). Sem SQL, params ou linhas de ERP.",
    { acessoId: z.string().optional(), limite: z.number().int().positive().optional() },
    readList,
    async (args) =>
      run("listar_metricas_agente", () =>
        useCases.listarMetricasAgente.execute(currentAccountId(), args),
      ),
  );

  server.tool(
    "registrar_lacuna_ferramenta",
    "Registra contrato da tool que falta (objetivo, entradas, saídas, permissão, teto, aceite) sem inventar SQL.",
    {
      acessoId: z.string().optional(),
      objetivo: z.string().optional(),
      entradas: z.string().optional(),
      saidas: z.string().optional(),
      permissao: z.string().optional(),
      teto: z.string().optional(),
      aceite: z.string().optional(),
    },
    writeLocal,
    async (args) =>
      run("registrar_lacuna_ferramenta", () =>
        useCases.registrarLacunaFerramenta.execute(currentAccountId(), args),
      ),
  );

  server.tool(
    "listar_lacunas",
    "Lista lacunas abertas de skill (SKILL_GAP) e de ferramenta deste agentId. status=arquivada lista o que o treino já cobriu. SKILL_GAP da busca não grava lacuna se já houver skill publicada.",
    {
      acessoId: z.string().optional(),
      limite: z.number().int().positive().optional(),
      status: z.enum(["aberta", "arquivada"]).optional(),
    },
    readList,
    async (args) =>
      run("listar_lacunas", () => useCases.listarLacunas.execute(currentAccountId(), args)),
  );

  const requireFlag = (enabled: boolean, tool: string): void => {
    if (!enabled) {
      throw new DomainError({
        code: ERROR_CODES.FEATURE_DESLIGADA,
        message: `Tool ${tool} está desligada.`,
        hint: "Desligue só para rollback. Religue a flag correspondente no servidor.",
      });
    }
  };

  if (config.MCP_INSPECTION_ENABLED) {
    server.tool(
      "inspecionar_consulta",
      "Amostra estrutural (máx. 100 linhas) de skill validada, rascunho_revalidacao ou publicada. SELECT * cru de uma tabela do allowlist do agente (sem WHERE; servidor injeta TOP/LIMIT). Sem máscara. Colunas novas vão ao grafo como inferido — confirmar_coluna para consultar_dados. JOIN inventado recusado. Firebird: só consulta exemplo. Sem cache, paginação gerenciada ou consulta_aprendida.",
      {
        acessoId: z.string().optional(),
        skillId: z.string().optional(),
        skillIds: z.array(z.string()).optional(),
        sql: z.string().optional(),
        tabela: z.string().optional(),
        finalidade: z.enum([
          "validar_tipo",
          "avaliar_nulos",
          "verificar_join",
          "amostra_estrutura",
        ]),
        params: z.record(z.unknown()).optional(),
        options: z.object({ timeout_ms: z.number().int().positive().optional() }).optional(),
      },
      readWorld,
      async (args) =>
        run("inspecionar_consulta", () => {
          requireFlag(config.MCP_INSPECTION_ENABLED, "inspecionar_consulta");
          return useCases.inspecionarConsulta.execute(currentAccountId(), args);
        }),
    );
  }

  if (config.MCP_DISCOVERY_QUERY_ENABLED) {
    server.tool(
      "descobrir_tabela",
      "Estrutura (colunas físicas, tipos, chaves, sensibilidade, relacionamentos) só de tabelas em skills publicadas. Sem linhas, contagens, DDL, valores nem título de anotação como coluna.",
      { acessoId: z.string().optional(), tabela: z.string().optional() },
      readList,
      async (args) =>
        run("descobrir_tabela", () => {
          requireFlag(config.MCP_DISCOVERY_QUERY_ENABLED, "descobrir_tabela");
          return useCases.descobrirTabela.execute(currentAccountId(), args);
        }),
    );
  }

  if (config.MCP_SCHEMA_DRIFT_ENABLED) {
    server.tool(
      "detectar_deriva_esquema",
      "Compara a assinatura mapeada da tabela com a última versão. Lista skills afetadas, invalida cache e move só essas skills para revalidação. Não repara schema automaticamente.",
      { acessoId: z.string().optional(), tabela: z.string().optional() },
      writeLocal,
      async (args) =>
        run("detectar_deriva_esquema", () => {
          requireFlag(config.MCP_SCHEMA_DRIFT_ENABLED, "detectar_deriva_esquema");
          return useCases.detectarDerivaEsquema.execute(currentAccountId(), args);
        }),
    );
  }

  server.tool(
    "cancelar_operacao",
    "Cancela perfilamento/descoberta longa pelo operacaoId. Estado parcial não inclui dados sensíveis.",
    { operacaoId: z.string().optional() },
    writeLocal,
    async (args) =>
      run("cancelar_operacao", () => useCases.cancelarOperacao.execute(currentAccountId(), args)),
  );

  if (options?.catalog) {
    registerSkillCatalog(server, options.catalog);
  }
};
