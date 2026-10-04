import type { Treinamento } from "../../application/use-cases/treinamento.js";
import { registerTrainingTools } from "./training-tools.js";
import type { SetupOperations } from "../../application/use-cases/setup-operation.js";
import { z } from "zod";
import { obterTreinamentoBase } from "../../application/use-cases/shared/treinamento-base.js";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  INSTRUCOES_PERSONA_MAX_CHARS,
  NOME_PERSONA_MAX_CHARS,
} from "../../domain/entities/acesso.js";
import type { AppConfig } from "../../config/env.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import { currentAccountId, currentAcessoId } from "./account-context.js";
import { createToolRunner } from "./tool-result.js";
import { columnMetadataItemSchema } from "../../application/use-cases/shared/columns-metadata.js";
import type {
  AdicionarAcesso,
  AtualizarCredencialPlug,
  AtualizarDialeto,
  AtualizarPersona,
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
import type { ExportarAnexo } from "../../application/use-cases/exportar-anexo.js";
import type {
  AnotarGrafo,
  AtualizarAnotacao,
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
import type {
  ConfigurarWebhookOperacional,
  ListarAlertasOperacionais,
  RearmarWebhookOperacional,
  ReconhecerAlertaOperacional,
} from "../../application/use-cases/operacoes.js";

export interface ToolUseCases {
  treinamento?: Treinamento;
  setupOperations?: SetupOperations;
  registrarAcesso: RegistrarAcesso;
  adicionarAcesso: AdicionarAcesso;
  listarAcessos: ListarAcessos;
  verificarAcesso: VerificarAcesso;
  removerAcesso: RemoverAcesso;
  atualizarCredencialPlug: AtualizarCredencialPlug;
  rotacionarTokenMcp: RotacionarTokenMcp;
  atualizarDialeto: AtualizarDialeto;
  atualizarPersona: AtualizarPersona;
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
  atualizarAnotacao: AtualizarAnotacao;
  removerAnotacao: RemoverAnotacao;
  salvarConsulta: SalvarConsulta;
  registrarAprendizado: RegistrarAprendizado;
  atualizarEscopoPadrao: AtualizarEscopoPadrao;
  herdarCatalogo: HerdarCatalogo;
  listarAuditoria: ListarAuditoria;
  listarMetricasAgente: ListarMetricasAgente;
  listarAlertasOperacionais: ListarAlertasOperacionais;
  reconhecerAlertaOperacional: ReconhecerAlertaOperacional;
  configurarWebhookOperacional: ConfigurarWebhookOperacional;
  rearmarWebhookOperacional: RearmarWebhookOperacional;
  registrarLacunaFerramenta: RegistrarLacunaFerramenta;
  listarLacunas: ListarLacunas;
  inspecionarConsulta: InspecionarConsulta;
  exportarAnexo: ExportarAnexo;
  descobrirTabela: DescobrirTabela;
  detectarDerivaEsquema: DetectarDerivaEsquema;
  cancelarOperacao: CancelarOperacao;
}

import type { RateLimitStore } from "../http/rate-limit.js";
import {
  registerGuias,
  registerPersonaCatalog,
  registerPreTreinoPrompt,
  registerSkillCatalog,
  registerSkillWorkflowPrompts,
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
  unidade: z.string().optional(),
  moeda: z.string().optional(),
  arredondamento: z
    .strictObject({ casas: z.number().int().min(0).max(12), modo: z.enum(["documental", "round"]) })
    .optional(),
  tratamentoNulos: z.enum(["preservar", "zero"]).optional(),
  aditividade: z.enum(["aditiva", "semi_aditiva", "nao_aditiva"]).optional(),
  calendarioNegocio: z.string().optional(),
});

const consultaSemanticaComumShape = {
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
};

const consultaSemanticaV1Shape = z.object({
  versao: z.literal(1).optional(),
  metrica: z.string().optional(),
  metricas: z.array(z.string()).optional(),
  dimensoes: z.array(z.string()).optional(),
  having: z
    .array(
      z.object({
        metrica: z.string(),
        op: z.enum(["=", "!=", ">", ">=", "<", "<="]),
        param: z.string(),
      }),
    )
    .optional(),
  ...consultaSemanticaComumShape,
});

const consultaSemanticaV2AgregacaoShape = z
  .object({
    versao: z.literal(2),
    modo: z.literal("agregacao"),
    metricas: z.array(z.string()).min(1),
    dimensoes: z.array(z.string()).optional(),
    having: z
      .array(
        z.object({
          metrica: z.string(),
          op: z.enum(["=", "!=", ">", ">=", "<", "<="]),
          param: z.string(),
        }),
      )
      .optional(),
    ...consultaSemanticaComumShape,
  })
  .strict();

const consultaSemanticaV2ListagemShape = z
  .object({
    versao: z.literal(2),
    modo: z.literal("listagem"),
    dimensoes: z.array(z.string()).min(1),
    ...consultaSemanticaComumShape,
  })
  .strict();

const consultaSemanticaShape = z.union([
  consultaSemanticaV1Shape,
  consultaSemanticaV2AgregacaoShape,
  consultaSemanticaV2ListagemShape,
]);

const recomendacaoConsultaShape = z.object({
  code: z.enum(["AGREGAR", "RECORTAR_PERIODO", "REDUZIR_JOINS", "PAGINAR"]),
  motivo: z.string(),
  bloqueante: z.boolean(),
  nextAction: z.enum(["ajustar_sql", "usar_consulta_semantica", "reduzir_recorte"]),
});

const politicaConsultaShape = z.object({
  maxRows: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  exigirRecorteTemporal: z.boolean().optional(),
  maxTabelas: z.number().int().positive().optional(),
  modoPreferencial: z.enum(["agregado", "detalhe"]).optional(),
});

const planoConsultaShape = z.object({
  treinamentoBase: z
    .object({
      versao: z.string(),
      hash: z.string(),
      contratoHubRef: z.string(),
      contratoHubHash: z.string(),
    })
    .optional(),
  aplicacaoSemantica: z.string().optional(),

  origem: z.enum(["sql", "semantica", "aprendida", "modelo"]),
  dialeto: z.string(),
  politicaAplicada: politicaConsultaShape.nullable(),
  skillIds: z.array(z.string()),
  tabelas: z.array(z.string()),
  agregado: z.boolean(),
  metricas: z.array(z.string()),
  dimensoes: z.array(z.string()),
  filtros: z.array(z.string()),
  paginacao: z.object({
    modo: z.enum(["unica", "pagina"]),
    maxRows: z.number(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
  }),
  recomendacoes: z.array(recomendacaoConsultaShape),
});

const planoValidacaoShape = planoConsultaShape;

const governancaConhecimentoShape = z
  .object({
    fonteTipo: z.enum(["usuario", "erp", "documento", "importacao", "legado", "outro"]).optional(),
    fonteReferencia: z.string().nullable().optional(),
    responsavel: z.string().nullable().optional(),
    validadoEm: z.string().nullable().optional(),
    vigenteDe: z.string().nullable().optional(),
    vigenteAte: z.string().nullable().optional(),
    revisarEm: z.string().nullable().optional(),
    periodoRevisaoDias: z.number().int().min(1).max(3650).nullable().optional(),
    status: z.enum(["vigente", "obsoleta"]).optional(),
  })
  .optional();

export const EXPORTAR_ANEXO_TOOL_DESCRIPTION =
  "Rebusca/converte um anexo (foto, PDF) a partir do handle do stub kind=anexo de consultar_dados. Handle de inspecionar_consulta não é exportável. Não invente bytes. mimeDestino: image/jpeg, image/png ou application/pdf. Mesmos portões de consultar_dados. Foto pessoal: PRIVACIDADE_NEGADA — não use inspeção como segunda via. Omita acessoId — o Bearer já amarra a persona; handle de outro acesso → MIDIA_ORIGEM_INVALIDA.";

export const CONSULTAR_DADOS_TOOL_DESCRIPTION =
  "Consulta o ERP via plug-server no escopo publicado e no dialeto do acesso. pergunta obrigatória. skillIds opcional (omitido = união das publicadas desta persona; se vierem, recortam). Sem sql: consulta exemplo (exige uma skill âncora). sql no allowlist (fail-closed), consultaSemantica (uma skill) ou consultaAprendidaId. IR v2: modo agregacao usa metricas[] certificadas; modo listagem usa dimensoes[] certificadas. JOIN só se estiver em algum pacote. Firebird: só consulta exemplo, sem SQL livre. Página: ORDER BY + options.page e page_size, sem TOP/LIMIT. Omita acessoId — o Bearer autentica um único acesso.";

export const OBTER_SKILL_TOOL_DESCRIPTION =
  "Obtém o pacote da skill (mesmo conteúdo que skill://): escopo, colunas, relacionamentos, regras/métricas, consultas aprendidas, guia de dialeto e faltas[] (kind, alvo, nextAction). Aviso PERFIL_AUSENTE se tipo/formato/cardinalidade estiverem vazios. Não invente schema — leia daqui. Omita acessoId — o Bearer já amarra esta persona.";

export const VALIDAR_CONSULTA_TOOL_DESCRIPTION =
  "Dry-run: valida exatamente um entre sql e consultaSemantica contra o escopo publicado (fail-closed; skillIds opcional = união das publicadas deste acesso), devolve planoConsulta e executa envelope vazio no ERP (sem ler dado). options aplicam as mesmas regras de consultar_dados. Placeholders ausentes ligam-se a null. Firebird: recusa SQL livre.";

export const ATUALIZAR_PERSONA_TOOL_DESCRIPTION =
  "Grava nomePersona (curto) e instrucoesPersona no acesso (usuário+agentId+token). Orienta tom/uso; não recorta skills nem licencia tabela, coluna, JOIN ou consultaPermitida. Em conflito vale o pacote. Exige confirmadoPeloUsuario: true. Recusa texto que pareça senha, token ou JWT. String vazia ou null limpa o campo.";

export const TREINAR_COM_SQL_TOOL_DESCRIPTION =
  "Treina o grafo deste acesso/persona com um SELECT nomeado. Proíbe SELECT *. Exige JOIN explícito se houver várias tabelas. Params nomeados opcionais. Origem: validado_execucao. enriquecer=completo (opt-in) perfila cardinalidade, tipo/formato, min/max/nulos e candidatos a dicionário (teto de 16 queries; falha vira aviso). Firebird: treino NÃO é DIALECT_UNSUPPORTED; não coloque FIRST/TOP/LIMIT no SQL (amostra FIRST é wrap do servidor). Aviso PAGINACAO_MODELO se o SQL já declara TOP/LIMIT/FIRST. Depois de publicar: só consultar_dados / inspecionar_consulta sem sql. Omita acessoId — o Bearer já amarra esta persona.";

export const VALIDAR_SKILL_TOOL_DESCRIPTION =
  "Valida o sqlModelo com envelope vazio (sem ler dado). Recusa params sem descrição. Placeholders ausentes vão como null. Skill já publicada permanece publicada. enriquecer=completo (opt-in) perfila o sqlModelo no grafo. Une o sqlModelo ao escopo persistido. Firebird: treino NÃO é DIALECT_UNSUPPORTED; não coloque FIRST/TOP/LIMIT no sqlModelo (amostra é wrap do servidor). Aviso PAGINACAO_MODELO se o modelo já declara TOP/LIMIT/FIRST. SQL livre depois de publicar continua DIALECT_UNSUPPORTED. A validação altera só o rascunho; publicação ativa permanece.";

export const EXPLORAR_TABELAS_TOOL_DESCRIPTION =
  "Lista tabelas/views do ERP via catálogo de sistema do dialeto do acesso. Só no treino (descobrir estrutura); não licencia consultar_dados. Não invente nomes de tabela.";

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
    onSkillsChanged?: (usuarioId: string, acessoId: string) => Promise<void>;
  },
): void => {
  const run = createToolRunner(config, logger, {
    rateLimit: options?.rateLimit,
    clientIp: options?.clientIp,
  });
  server.registerTool(
    "obter_treinamento_base",
    {
      description:
        "Camada comum de SQL e plug_server para todas as personas. Sem credenciais, sem catálogo, não autoriza dados.",
      inputSchema: z.strictObject({
        modulo: z.enum(["sql", "dialetos", "plug-server", "procedimento"]).optional(),
        dialeto: z.enum(["mssql", "sybase", "postgres", "firebird"]).optional(),
      }),
      annotations: readList,
    },
    async (args) =>
      run("obter_treinamento_base", () => Promise.resolve(obterTreinamentoBase(args))),
  );

  server.registerTool(
    "registrar_acesso",
    {
      description:
        "Retorna uma URL de cadastro no navegador (15 minutos). Sem argumentos. Senha e tokens são recusados nos argumentos e preenchidos somente no formulário.",
      inputSchema: z.strictObject({}),
      annotations: writeLocal,
    },
    async () =>
      run("registrar_acesso", () => {
        if (!useCases.setupOperations) {
          throw new DomainError({
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Operação de navegador indisponível.",
            hint: "Configure o serviço de setup seguro.",
          });
        }
        return useCases.setupOperations.begin("registrar", currentAccountId());
      }),
  );

  registerPreTreinoPrompt(server, options?.catalog?.acessos);
  registerGuias(server);
  registerSkillWorkflowPrompts(server);

  if (options?.bootstrapOnly) {
    return;
  }

  if (useCases.treinamento) registerTrainingTools(server, useCases.treinamento, run);

  server.registerTool(
    "adicionar_acesso",
    {
      description:
        "Retorna uma URL de cadastro de outra persona no navegador. A nova persona começa vazia e recebe Bearer próprio; esta sessão permanece no acesso atual. Sem argumentos ou segredos.",
      inputSchema: z.strictObject({}),
      annotations: writeLocal,
    },
    async () =>
      run("adicionar_acesso", () => {
        if (!useCases.setupOperations) {
          throw new DomainError({
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Operação de navegador indisponível.",
            hint: "Configure o serviço de setup seguro.",
          });
        }
        return useCases.setupOperations.begin("adicionar", currentAccountId());
      }),
  );

  server.registerTool(
    "listar_acessos",
    {
      description:
        "Lista só o acesso deste Bearer (client_token mascarado; nomePersona e instrucoesPersona). Sem sessão ALS recusa (VALIDATION_ERROR) — não lista todos os chapéus. sqlAccessState vem só do cofre (approved → unknown). Outras personas usam o token MCP delas. Persona não licencia SQL.",
      inputSchema: z.object(emptyShape),
      annotations: readList,
    },
    async () => run("listar_acessos", () => useCases.listarAcessos.execute(currentAccountId())),
  );

  server.registerTool(
    "verificar_acesso",
    {
      description:
        "Consulta o status do pedido de acesso no plug-server e a prontidão SQL (hub + policy). Devolve nomePersona/instrucoesPersona. Não faça polling agressivo. hasClientToken false no hub não prova token morto.",
      inputSchema: z.object({ acessoId: z.string().optional() }),
      annotations: readWorld,
    },
    async (args) =>
      run("verificar_acesso", () => useCases.verificarAcesso.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "remover_acesso",
    {
      description:
        "Remove o acesso **deste** Bearer do cofre. O catálogo (skills/grafo) desta persona é apagado; o token atual deixa de valer. Não apaga outra persona por id.",
      inputSchema: z.object({ acessoId: z.string().optional() }),
      annotations: destroyLocal,
    },
    async (args) =>
      run("remover_acesso", () => useCases.removerAcesso.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "atualizar_credencial_plug",
    {
      description:
        "Retorna URL para atualizar credenciais no navegador, mediante reautenticação no hub. Sem argumentos ou segredos.",
      inputSchema: z.strictObject({}),
      annotations: writeLocal,
    },
    async () =>
      run("atualizar_credencial_plug", () => {
        if (!useCases.setupOperations) {
          throw new DomainError({
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Operação de navegador indisponível.",
            hint: "Configure o serviço de setup seguro.",
          });
        }
        return useCases.setupOperations.begin("credenciais", currentAccountId());
      }),
  );

  server.registerTool(
    "rotacionar_token_mcp",
    {
      description:
        "Retorna URL de rotação no navegador. O Bearer atual permanece válido até a conclusão confirmada por POST; o novo é mostrado uma única vez. Sem argumentos.",
      inputSchema: z.strictObject({}),
      annotations: writeLocal,
    },
    async () =>
      run("rotacionar_token_mcp", () => {
        if (!useCases.setupOperations) {
          throw new DomainError({
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Operação de navegador indisponível.",
            hint: "Configure o serviço de setup seguro.",
          });
        }
        return useCases.setupOperations.begin("rotacionar", currentAccountId());
      }),
  );

  server.registerTool(
    "atualizar_dialeto",
    {
      description:
        "Muda o dialeto deste acesso e do grafo da persona. Skills deste acesso deixam de estar publicadas (voltam a rascunho) porque o SQL pode não valer no dialeto novo. Exige confirmadoPeloUsuario: true.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        dialeto: z.enum(["mssql", "sybase", "postgres", "firebird"]).optional(),
        confirmadoPeloUsuario: z.boolean().optional(),
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("atualizar_dialeto", () => useCases.atualizarDialeto.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "atualizar_persona",
    {
      description: ATUALIZAR_PERSONA_TOOL_DESCRIPTION,
      inputSchema: z.object({
        acessoId: z.string().optional(),
        nomePersona: z.string().max(NOME_PERSONA_MAX_CHARS).nullable().optional(),
        instrucoesPersona: z.string().max(INSTRUCOES_PERSONA_MAX_CHARS).nullable().optional(),
        confirmadoPeloUsuario: z.boolean().optional(),
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("atualizar_persona", () => useCases.atualizarPersona.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "treinar_com_sql",
    {
      description: TREINAR_COM_SQL_TOOL_DESCRIPTION,
      inputSchema: z.object({
        acessoId: z.string().optional(),
        sql: z.string().optional(),
        params: z.record(z.string(), z.unknown()).optional(),
        enriquecer: z.enum(["basico", "completo"]).optional(),
      }),
      annotations: writeWorld,
    },
    async (args) =>
      run("treinar_com_sql", () => useCases.treinarComSql.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "explorar_tabelas",
    {
      description: EXPLORAR_TABELAS_TOOL_DESCRIPTION,
      inputSchema: z.object({ acessoId: z.string().optional(), filtro: z.string().optional() }),
      annotations: readWorld,
    },
    async (args) =>
      run("explorar_tabelas", () => useCases.explorarTabelas.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "mapear_tabela",
    {
      description:
        "Lê colunas de uma tabela no ERP e funde no grafo (origem inferido). Só no treino; não licencia consultar_dados. Infere papel/formato. Vários tipos por coluna viram aviso CATALOGO_TIPOS_AMBIGUOS (SQL Server → atualizar_dialeto para mssql). Não invente coluna.",
      inputSchema: z.object({ acessoId: z.string().optional(), tabela: z.string().optional() }),
      annotations: writeWorld,
    },
    async (args) =>
      run("mapear_tabela", () => useCases.mapearTabela.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "buscar_contexto",
    {
      description:
        "Candidatos com cobertura certificada (nome/slug/descrição/params/metricasSaida, não SQL nem corpo de regra; negação na descrição — inclusive lista após não autoriza cruzar — não conta). consultaPermitida se cobertura completa ou composta (fatias[] = várias consultar_dados, não um SELECT cruzado). conhecimentos[] é evidência FTS/ILIKE (não embeddings/RAG); stem une inflexão na cobertura; tokens de calendário não baixam cobertura; não autoriza SQL. Envelope sem sqlModelo nem SQL aprendido — use obter_skill.consultasExemplo pelo id de consultasAprendidas. Se consultaPermitida: consultaSemanticaSugerida (KPI de agregação, ou listagem só com dimensões/filtros; CAST não entra) e metricasSemOverlay[] se a medida não tem definicao. Skill em treino que cobre a pergunta: blockingReason SKILL_NOT_PUBLISHED. Cobertura parcial: registrar_aprendizado tipo=sinonimo se o usuário confirmar o termo. SKILL_GAP: não registre sinônimo; não cruze sem JOIN publicado; fluxoTreino só com skill em andamento. grafoParaTreino só no fluxo de gap.",
      inputSchema: z.object({ acessoId: z.string().optional(), query: z.string().optional() }),
      annotations: readWorld,
    },
    async (args) =>
      run("buscar_contexto", () => useCases.buscarContexto.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "resolver_conflito",
    {
      description: "Resolve conflito de fato no grafo com confirmação do usuário.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        tabelaId: z.string().optional(),
        colunaId: z.string().optional(),
        relacionamentoId: z.string().optional(),
        descricao: z.string().optional(),
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("resolver_conflito", () => useCases.resolverConflito.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "listar_conflitos",
    {
      description:
        "Lista fatos em conflito do grafo deste acesso (kind, ids, nomes, hint) para resolver_conflito. Sem SQL e sem linhas de ERP.",
      inputSchema: z.object({ acessoId: z.string().optional() }),
      annotations: readList,
    },
    async (args) =>
      run("listar_conflitos", () => useCases.listarConflitos.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "consultar_dados",
    {
      description: CONSULTAR_DADOS_TOOL_DESCRIPTION,
      inputSchema: z.object({
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
              governanca: governancaConhecimentoShape,
            }),
          )
          .optional(),
        params: z.record(z.string(), z.unknown()).optional(),
        options: z
          .object({
            max_rows: z.number().int().positive().optional(),
            page: z.number().int().positive().optional(),
            page_size: z.number().int().positive().optional(),
            timeout_ms: z.number().int().positive().optional(),
          })
          .optional(),
      }),
      outputSchema: z.object({
        success: z.literal(true),
        consultaExecucaoId: z.string().uuid().optional(),
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
            estado: z.string().optional(),
            consultaId: z.string(),
            execucoes: z.number(),
            nova: z.boolean(),
            perguntaUsada: z.string(),
            itens: z.number(),
          })
          .optional(),
        hint: z.string().optional(),
        planoConsulta: planoConsultaShape,
        paginacao: z
          .object({
            page: z.number(),
            pageSize: z.number(),
            hasNextPage: z.boolean(),
            hasPreviousPage: z.boolean(),
          })
          .optional(),
      }),
      annotations: readWorld,
    },
    async (args) =>
      run("consultar_dados", () => useCases.consultarDados.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "exportar_anexo",
    {
      description: EXPORTAR_ANEXO_TOOL_DESCRIPTION,
      inputSchema: z.object({
        acessoId: z.string().optional(),
        handle: z.string(),
        mimeDestino: z.enum(["image/jpeg", "image/png", "application/pdf"]).optional(),
      }),
      annotations: readWorld,
    },
    async (args) =>
      run("exportar_anexo", () => useCases.exportarAnexo.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "criar_skill",
    {
      description:
        "Nomeia um SQL de negócio já treinado (tabelas precisam estar no grafo). Pacote mínimo: uma tabela, colunas nomeadas, WHERE ou agregação, params com descricao; JOIN/KPI só se o usuário pedir. Params com descrição fecham o checklist antes de publicar. metricasSaida overlaya definição/grão/status só de aliases já no pacote. Firebird: parseia o sqlModelo (não DIALECT_UNSUPPORTED); FIRST/TOP/LIMIT no modelo → INVALID_SQL. A IA consulta o ERP pela skill publicada, não pelo grafo.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        slug: z.string().optional(),
        nome: z.string().optional(),
        descricao: z.string().optional(),
        sqlModelo: z.string().optional(),
        params: z.array(paramSkillShape).optional(),
        consultaSemantica: consultaSemanticaShape.optional(),
        politicaConsulta: politicaConsultaShape.optional(),
        metricasSaida: z.array(metricaSaidaShape).optional(),
      }),
      annotations: writeLocal,
    },
    async (args) => run("criar_skill", () => useCases.criarSkill.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "atualizar_skill",
    {
      description:
        "Atualiza nome/descrição/SQL/params/KPI. Se o SQL mudar, une o novo sqlModelo ao pacote persistido (não apaga confirmar_coluna / confirmar_relacionamento / expandir_escopo), as tabelas do SQL precisam estar no grafo e o status volta a rascunho. Grafo inferido não entra. Patch só de nome/descrição/params/KPI/slug mantém o status. Renomear slug exige confirmadoPeloUsuario. Firebird: FIRST/TOP/LIMIT no sqlModelo → INVALID_SQL (não DIALECT_UNSUPPORTED).",
      inputSchema: z.object({
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
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("atualizar_skill", async () => {
        const result = await useCases.atualizarSkill.execute(currentAccountId(), args);
        const uid = currentAccountId();
        const acessoId = currentAcessoId();
        if (uid && acessoId && options?.onSkillsChanged) {
          await options.onSkillsChanged(uid, acessoId);
        }
        return result;
      }),
  );

  server.registerTool(
    "validar_skill",
    {
      description: VALIDAR_SKILL_TOOL_DESCRIPTION,
      inputSchema: z.object({
        acessoId: z.string().optional(),
        skillId: z.string().optional(),
        params: z.record(z.string(), z.unknown()).optional(),
        enriquecer: z.enum(["basico", "completo"]).optional(),
      }),
      annotations: writeWorld,
    },
    async (args) =>
      run("validar_skill", () => useCases.validarSkill.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "publicar_skill",
    {
      description:
        "Libera a skill só com checklist completo. Primeiro chame sem confirmação para receber diffPublicacao e confirmacaoHash; depois envie confirmadoPeloUsuario:true com o mesmo hash. Sem hash, a chamada legada devolve novo preview sem publicar.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        skillId: z.string().optional(),
        confirmadoPeloUsuario: z.boolean().optional(),
        confirmacaoHash: z.string().optional(),
      }),
      annotations: destroyLocal,
    },
    async (args) =>
      run("publicar_skill", async () => {
        const result = await useCases.publicarSkill.execute(currentAccountId(), args);
        const uid = currentAccountId();
        const acessoId = currentAcessoId();
        if (result.publicado && uid && acessoId && options?.onSkillsChanged) {
          await options.onSkillsChanged(uid, acessoId);
        }
        return result;
      }),
  );

  server.registerTool(
    "despublicar_skill",
    {
      description:
        "Rebaixa skill publicada para validada sem apagar pacote, params nem consultas aprendidas. Exige confirmadoPeloUsuario: true. Consulta volta a SKILL_NOT_PUBLISHED. Não confundir com remover_skill.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        skillId: z.string().optional(),
        confirmadoPeloUsuario: z.boolean().optional(),
      }),
      annotations: destroyLocal,
    },
    async (args) =>
      run("despublicar_skill", async () => {
        const result = await useCases.despublicarSkill.execute(currentAccountId(), args);
        const uid = currentAccountId();
        const acessoId = currentAcessoId();
        if (uid && acessoId && options?.onSkillsChanged) {
          await options.onSkillsChanged(uid, acessoId);
        }
        return result;
      }),
  );

  server.registerTool(
    "remover_skill",
    {
      description:
        "Apaga a skill (pacote e sqlModelo) deste acesso/persona. Exige confirmadoPeloUsuario: true. O grafo do acesso permanece; consultas aprendidas ficam desvinculadas. Mostre nome/slug/status no chat antes.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        skillId: z.string().optional(),
        slug: z.string().optional(),
        confirmadoPeloUsuario: z.boolean().optional(),
      }),
      annotations: destroyLocal,
    },
    async (args) =>
      run("remover_skill", async () => {
        const result = await useCases.removerSkill.execute(currentAccountId(), args);
        const uid = currentAccountId();
        const acessoId = currentAcessoId();
        if (uid && acessoId && options?.onSkillsChanged) {
          await options.onSkillsChanged(uid, acessoId);
        }
        return result;
      }),
  );

  server.registerTool(
    "listar_skills",
    {
      description:
        "Lista skills desta persona (id, slug, nome, status, versao, motivoRevalidacao, podeLiberar, fluxoTreino, faltas[]). Sem sqlModelo — use obter_skill para o pacote. Omita acessoId — o Bearer já amarra o catálogo.",
      inputSchema: z.object({ acessoId: z.string().optional() }),
      annotations: readList,
    },
    async (args) =>
      run("listar_skills", () => useCases.listarSkills.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "obter_skill",
    {
      description: OBTER_SKILL_TOOL_DESCRIPTION,
      inputSchema: z.object({
        revisao: z.enum(["publicada", "rascunho"]).optional(),
        acessoId: z.string().optional(),
        skillId: z.string().optional(),
        slug: z.string().optional(),
      }),
      annotations: readList,
    },
    async (args) => run("obter_skill", () => useCases.obterSkill.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "expandir_escopo",
    {
      description:
        "Acrescenta tabelas já treinadas ao escopo da skill. Exige confirmadoPeloUsuario: true. Sem JOIN coluna=coluna: nextAction confirmar_coluna (tabela isolada); não invente igualdade. Skill publicada só une JOIN confirmado_usuario/validado_execucao — herdar_catalogo inferido não licencia o validador.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        skillId: z.string().optional(),
        tabelas: z.array(z.string()).optional(),
        confirmadoPeloUsuario: z.boolean().optional(),
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("expandir_escopo", () => useCases.expandirEscopo.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "confirmar_relacionamento",
    {
      description:
        "Confirma um JOIN no grafo (origem confirmado_usuario). pares[] para chave composta; colunaOrigem/colunaDestino continuam válidos (um par). Pergunte cardinalidade e tipo de JOIN (INNER vs LEFT). Passe tipoJoin — omitir preserva o tipo já inferido do SQL/grafo (não grava inner por cima de LEFT). Com skillId, persiste no pacote da skill — só o grafo não libera consulta. Sem skillId o validador publicado não vê o JOIN até ele entrar no pacote.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        skillId: z.string().optional(),
        tabelaOrigem: z.string().optional(),
        colunaOrigem: z.string().optional(),
        tabelaDestino: z.string().optional(),
        colunaDestino: z.string().optional(),
        pares: z
          .array(z.object({ colunaOrigem: z.string(), colunaDestino: z.string() }))
          .optional(),
        tipoJoin: z.string().optional(),
        cardinalidade: z.enum(["1:1", "1:N", "N:1", "N:N"]).optional(),
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("confirmar_relacionamento", () =>
        useCases.confirmarRelacionamento.execute(currentAccountId(), args),
      ),
  );

  server.registerTool(
    "remover_relacionamento",
    {
      description:
        "Remove um JOIN (fingerprint dos pares) do grafo e, com skillId, do pacote. Um relacionamento por chamada. Exige confirmadoPeloUsuario: true.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        skillId: z.string().optional(),
        tabelaOrigem: z.string().optional(),
        tabelaDestino: z.string().optional(),
        pares: z
          .array(z.object({ colunaOrigem: z.string(), colunaDestino: z.string() }))
          .optional(),
        colunaOrigem: z.string().optional(),
        colunaDestino: z.string().optional(),
        confirmadoPeloUsuario: z.boolean().optional(),
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("remover_relacionamento", () =>
        useCases.removerRelacionamento.execute(currentAccountId(), args),
      ),
  );

  server.registerTool(
    "validar_consulta",
    {
      description: VALIDAR_CONSULTA_TOOL_DESCRIPTION,
      inputSchema: z.object({
        acessoId: z.string().optional(),
        skillId: z.string().optional(),
        skillIds: z.array(z.string()).optional(),
        sql: z.string().optional(),
        consultaSemantica: consultaSemanticaShape.optional(),
        params: z.record(z.string(), z.unknown()).optional(),
        options: z
          .object({
            max_rows: z.number().int().positive().optional(),
            page: z.number().int().positive().optional(),
            page_size: z.number().int().positive().optional(),
            timeout_ms: z.number().int().positive().optional(),
          })
          .optional(),
      }),
      outputSchema: z.object({
        success: z.literal(true),
        valido: z.literal(true),
        dialeto: z.string(),
        tabelas: z.array(z.string()),
        avisos: z.array(z.object({ code: z.string(), message: z.string() })),
        planoConsulta: planoValidacaoShape,
      }),
      annotations: readWorld,
    },
    async (args) =>
      run("validar_consulta", () => useCases.validarConsulta.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "confirmar_coluna",
    {
      description:
        "Confirma significado/dicionário de coluna(s) no grafo (origem confirmado_usuario). colunas[] ou tabela+coluna. Com skillId, entra no pacote. sensibilidade só com confirmadoPeloUsuario: true; aplica a classe mesmo se a origem atual for validado_execucao (perfil não apaga depois).",
      inputSchema: z.object({
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
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("confirmar_coluna", () => useCases.confirmarColuna.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "anotar_grafo",
    {
      description: "Grava nota/glossário no grafo deste acesso. Não invente significado.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        tabela: z.string().optional(),
        skillId: z.string().optional(),
        tipo: z.string().optional(),
        titulo: z.string().optional(),
        texto: z.string().optional(),
        governanca: governancaConhecimentoShape,
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("anotar_grafo", () => useCases.anotarGrafo.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "listar_anotacoes",
    {
      description:
        "Lista histórico de anotações deste acesso; cada item informa ativaAgora e fila de revisão. Use somenteRevisaoPendente para notas a revisar ou perto de vencer, sem alterar a autorização SQL.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        tabelaId: z.string().nullable().optional(),
        status: z.enum(["vigente", "obsoleta"]).optional(),
        somenteRevisaoPendente: z.boolean().optional(),
        janelaRevisaoDias: z.number().int().min(0).max(365).optional(),
      }),
      annotations: readList,
    },
    async (args) =>
      run("listar_anotacoes", () => useCases.listarAnotacoes.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "atualizar_anotacao",
    {
      description:
        "Atualiza texto ou governança de uma anotação desta persona. Exige confirmadoPeloUsuario: true e recusa segredos.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        anotacaoId: z.string().optional(),
        tipo: z.string().optional(),
        titulo: z.string().optional(),
        texto: z.string().optional(),
        governanca: governancaConhecimentoShape,
        confirmadoPeloUsuario: z.boolean().optional(),
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("atualizar_anotacao", () => useCases.atualizarAnotacao.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "remover_anotacao",
    {
      description: "Remove uma anotação do grafo.",
      inputSchema: z.object({ acessoId: z.string().optional(), anotacaoId: z.string().optional() }),
      annotations: destroyLocal,
    },
    async (args) =>
      run("remover_anotacao", () => useCases.removerAnotacao.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "salvar_consulta",
    {
      description:
        "Promove/renomeia um SQL que funcionou a exemplo reutilizável (consulta aprendida). consultar_dados captura somente candidata; esta tool confirma o exemplo parametrizado e o vincula à publicação vigente. Sem hash retorna preview; aprovação humana exige ID, hash vigente e confirmadoPeloUsuario: true. Não conta execução.",
      inputSchema: z.strictObject({
        acessoId: z.string().optional(),
        skillId: z.string().optional(),
        skillIds: z.array(z.string()).optional(),
        consultaAprendidaId: z.string().optional(),
        confirmacaoHash: z.string().optional(),
        pergunta: z.string().optional(),
        sql: z.string().optional(),
        confirmadoPeloUsuario: z.boolean().optional(),
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("salvar_consulta", () => useCases.salvarConsulta.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "registrar_aprendizado",
    {
      description:
        "Obrigatório quando o usuário ensinar regra, métrica, glossário, dicionário ou sinônimo. Grava na base de conhecimento (anotacao_grafo / sinonimo). Também aceito em consultar_dados.aprendizado[].",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        skillId: z.string().optional(),
        tipo: z.string().optional(),
        titulo: z.string().optional(),
        texto: z.string().optional(),
        tabela: z.string().optional(),
        governanca: governancaConhecimentoShape,
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("registrar_aprendizado", () =>
        useCases.registrarAprendizado.execute(currentAccountId(), args),
      ),
  );

  server.registerTool(
    "atualizar_escopo_padrao",
    {
      description:
        "Define empresa/filial default e timezone do acesso. Exige confirmadoPeloUsuario: true. Consultas passam a recortar esse escopo.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        empresa: z.string().optional(),
        filial: z.string().optional(),
        timezone: z.string().optional(),
        bindings: z
          .array(
            z.strictObject({
              tabela: z.string().min(1),
              coluna: z.string().min(1),
              param: z.enum(["empresa", "filial"]),
            }),
          )
          .max(256)
          .optional(),
        confirmadoPeloUsuario: z.boolean().optional(),
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("atualizar_escopo_padrao", () =>
        useCases.atualizarEscopoPadrao.execute(currentAccountId(), args),
      ),
  );

  server.registerTool(
    "herdar_catalogo",
    {
      description:
        "Copia o template ilustrativo Se7e (empresa/filial/cliente/produto/receber/pagar, JOINs simples e compostos empresa+filial) para o grafo. Envelope: origem inferido, publicaSkill false — não autoriza consultar_dados. Treino com SQL real continua obrigatório. Exige confirmadoPeloUsuario: true.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        confirmadoPeloUsuario: z.boolean().optional(),
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("herdar_catalogo", () => useCases.herdarCatalogo.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "listar_auditoria",
    {
      description:
        "Lista as últimas execuções de tools desta persona (sem SQL completo nem segredos). Omita acessoId — o Bearer já recorta. buscar_contexto inclui telemetria (counts/enums, sem a pergunta).",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        limite: z.number().int().positive().optional(),
      }),
      annotations: readList,
    },
    async (args) =>
      run("listar_auditoria", () => useCases.listarAuditoria.execute(currentAccountId(), args)),
  );

  server.registerTool(
    "listar_metricas_agente",
    {
      description:
        "Painel operacional da auditoria: duração p50/p95, cache, truncamentos, distribuição por skill/origem/erro e tendência anônima. Campo busca: totais de buscar_contexto. Sem SQL, params ou linhas de ERP. Omita acessoId — o Bearer já recorta.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        limite: z.number().int().positive().optional(),
      }),
      annotations: readList,
    },
    async (args) =>
      run("listar_metricas_agente", () =>
        useCases.listarMetricasAgente.execute(currentAccountId(), args),
      ),
  );

  server.registerTool(
    "listar_alertas_operacionais",
    {
      description:
        "Lista alertas operacionais desta persona (SLO e revisão), apenas com IDs, datas e métricas agregadas. Não contém SQL, perguntas, parâmetros ou resultados.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        limite: z.number().int().min(1).max(200).optional(),
        status: z.enum(["aberto", "reconhecido", "resolvido"]).optional(),
      }),
      annotations: readList,
    },
    async (args) =>
      run("listar_alertas_operacionais", () =>
        useCases.listarAlertasOperacionais.execute(currentAccountId(), args),
      ),
  );

  server.registerTool(
    "reconhecer_alerta_operacional",
    {
      description:
        "Marca um alerta aberto desta persona como reconhecido. Reconhecimento não altera skill, vigência ou autorização SQL.",
      inputSchema: z.object({ acessoId: z.string().optional(), alertaId: z.string().optional() }),
      annotations: writeLocal,
    },
    async (args) =>
      run("reconhecer_alerta_operacional", () =>
        useCases.reconhecerAlertaOperacional.execute(currentAccountId(), args),
      ),
  );

  server.registerTool(
    "configurar_webhook_operacional",
    {
      description:
        "Configura ou desativa o webhook opcional de alertas desta persona. Aceita apenas HTTPS público sem query/credenciais; o segredo é cifrado e nunca retornado. Exige confirmadoPeloUsuario: true.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        url: z.string().url().optional(),
        segredo: z.string().min(16).max(256).optional(),
        ativo: z.boolean().optional(),
        confirmadoPeloUsuario: z.boolean().optional(),
      }),
      annotations: writeWorld,
    },
    async (args) =>
      run("configurar_webhook_operacional", () =>
        useCases.configurarWebhookOperacional.execute(currentAccountId(), args),
      ),
  );

  server.registerTool(
    "rearmar_webhook_operacional",
    {
      description:
        "Rearma uma entrega de webhook em dead-letter desta persona. Exige confirmadoPeloUsuario: true; não revela URL, segredo ou corpo enviado.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        eventoId: z.string().optional(),
        confirmadoPeloUsuario: z.boolean().optional(),
      }),
      annotations: writeWorld,
    },
    async (args) =>
      run("rearmar_webhook_operacional", () =>
        useCases.rearmarWebhookOperacional.execute(currentAccountId(), args),
      ),
  );

  server.registerTool(
    "registrar_lacuna_ferramenta",
    {
      description:
        "Registra contrato da tool que falta (objetivo, entradas, saídas, permissão, teto, aceite) sem inventar SQL.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        objetivo: z.string().optional(),
        entradas: z.string().optional(),
        saidas: z.string().optional(),
        permissao: z.string().optional(),
        teto: z.string().optional(),
        aceite: z.string().optional(),
      }),
      annotations: writeLocal,
    },
    async (args) =>
      run("registrar_lacuna_ferramenta", () =>
        useCases.registrarLacunaFerramenta.execute(currentAccountId(), args),
      ),
  );

  server.registerTool(
    "listar_lacunas",
    {
      description:
        "Lista lacunas abertas de skill (SKILL_GAP) e de ferramenta deste acesso. status=arquivada lista o que o treino já cobriu. SKILL_GAP da busca não grava lacuna se já houver skill publicada.",
      inputSchema: z.object({
        acessoId: z.string().optional(),
        limite: z.number().int().positive().optional(),
        status: z.enum(["aberta", "arquivada"]).optional(),
      }),
      annotations: readList,
    },
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
    server.registerTool(
      "inspecionar_consulta",
      {
        description:
          "Amostra estrutural (máx. 100 linhas) de skill validada, rascunho_revalidacao ou publicada. SELECT * expandido para projeção segura de uma tabela do allowlist do agente (sem WHERE; servidor injeta TOP/LIMIT). Colunas pessoais, secretas e inferidas são omitidas. Colunas novas vão ao grafo como inferido — confirmar_coluna para consultar_dados. JOIN inventado recusado. Firebird: só consulta exemplo. Sem cache, paginação gerenciada ou consulta_aprendida.",
        inputSchema: z.object({
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
          params: z.record(z.string(), z.unknown()).optional(),
          options: z.object({ timeout_ms: z.number().int().positive().optional() }).optional(),
        }),
        annotations: readWorld,
      },
      async (args) =>
        run("inspecionar_consulta", () => {
          requireFlag(config.MCP_INSPECTION_ENABLED, "inspecionar_consulta");
          return useCases.inspecionarConsulta.execute(currentAccountId(), args);
        }),
    );
  }

  if (config.MCP_DISCOVERY_QUERY_ENABLED) {
    server.registerTool(
      "descobrir_tabela",
      {
        description:
          "Estrutura (colunas físicas, tipos, chaves, sensibilidade, relacionamentos) só do pacote publicado da tabela (fingerprints como obter_skill). Sem vizinhança extra do grafo, linhas, contagens, DDL, valores nem título de anotação como coluna.",
        inputSchema: z.object({ acessoId: z.string().optional(), tabela: z.string().optional() }),
        annotations: readList,
      },
      async (args) =>
        run("descobrir_tabela", () => {
          requireFlag(config.MCP_DISCOVERY_QUERY_ENABLED, "descobrir_tabela");
          return useCases.descobrirTabela.execute(currentAccountId(), args);
        }),
    );
  }

  if (config.MCP_SCHEMA_DRIFT_ENABLED) {
    server.registerTool(
      "detectar_deriva_esquema",
      {
        description:
          "Compara a assinatura mapeada da tabela com a última versão. Lista skills afetadas, invalida cache e move só essas skills para revalidação. Não repara schema automaticamente.",
        inputSchema: z.object({ acessoId: z.string().optional(), tabela: z.string().optional() }),
        annotations: writeLocal,
      },
      async (args) =>
        run("detectar_deriva_esquema", () => {
          requireFlag(config.MCP_SCHEMA_DRIFT_ENABLED, "detectar_deriva_esquema");
          return useCases.detectarDerivaEsquema.execute(currentAccountId(), args);
        }),
    );
  }

  server.registerTool(
    "cancelar_operacao",
    {
      description:
        "Cancela perfilamento/descoberta longa pelo operacaoId. Estado parcial não inclui dados sensíveis.",
      inputSchema: z.object({ operacaoId: z.string().optional() }),
      annotations: writeLocal,
    },
    async (args) =>
      run("cancelar_operacao", () => useCases.cancelarOperacao.execute(currentAccountId(), args)),
  );

  if (options?.catalog) {
    registerSkillCatalog(server, options.catalog);
    registerPersonaCatalog(server, options.catalog.acessos);
  }
};
