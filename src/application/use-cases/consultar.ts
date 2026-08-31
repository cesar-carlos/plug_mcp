import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { ConsultaAprendida } from "../../domain/entities/aprendizado.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { AprendizadoRepositoryPort } from "../../domain/ports/aprendizado-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type {
  ConflitoGrafo,
  GrafoRepositoryPort,
} from "../../domain/ports/grafo-repository.port.js";
import type { QueryResultCachePort } from "../../domain/ports/query-result-cache.port.js";
import type {
  AnotacaoGrafoRepositoryPort,
  SkillRepositoryPort,
} from "../../domain/ports/skill-repository.port.js";
import type {
  ClientTokenPolicy,
  PlugServerGatewayPort,
  UsuarioPlugSessionPort,
} from "../../domain/ports/plug-server-gateway.port.js";
import type {
  ConsultaAprendidaResumo,
  HitConhecimento,
  SkillResumoContexto,
} from "../../domain/entities/conhecimento.js";
import { TIPOS_NARRATIVA_COM_SKILL } from "../../domain/entities/conhecimento.js";
import type { TabelaGrafo } from "../../domain/entities/grafo.js";
import type { Skill, StatusSkill } from "../../domain/entities/skill.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import {
  parseConsultaSemantica,
  aliasesMetricas,
} from "../../domain/entities/consulta-semantica.js";
import { compilarConsultaSemantica } from "./shared/compilar-consulta-semantica.js";
import { assertFanoutSeguro } from "./shared/assert-fanout.js";
import { assertPrivacidadeAntesDoHub } from "./shared/assert-privacidade.js";
import { assertOrcamentoConsulta } from "./shared/assert-orcamento.js";
import { avisosKpiDesalinhado } from "./shared/avisos-kpi.js";
import { lookupSensibilidadeGrafo } from "./shared/mascarar-linhagem.js";
import { aplicarDerivaTabelaNoGrafo } from "./shared/schema-drift.js";
import { sincronizarEscopoComGrafo } from "./shared/sincronizar-escopo.js";
import { requireAcesso, refreshAndRequireAcessoAprovado, requireUsuario } from "./shared/guards.js";
import { withHubAuth } from "./shared/hub-auth.js";
import {
  bindNamedParams,
  coerceBoundParams,
  expandirInListas,
  parseSqlModelo,
  sqlValidacaoVazia,
  bindParamsForValidation,
  sqlParaOdbc,
  type SqlModelo,
} from "./shared/sql-modelo.js";
import { tryParseSelect } from "./shared/sql-ast.js";
import {
  validarSqlNoEscopo,
  coletarAvisosValidacao,
  exigirPaginacaoEstavel,
} from "./shared/validar-escopo.js";
import { promoverFatosDaExecucao } from "./shared/promover-fatos.js";
import {
  exigirFiltroEscopoPadrao,
  mesclarParamsEscopo,
  avisosPlaceholderEscopo,
} from "./shared/escopo-filtro.js";
import { queryCacheKey, policyFingerprint } from "./shared/query-cache-key.js";
import {
  ancoraConsultaSemantica,
  ancoraSqlModelo,
  atribuirSkillsPorSql,
  idsSkillDaChamada,
  politicaMaisRestrita,
  resolverSkillsConsulta,
  uniaoEscoposPublicados,
  escopoDaSkillPublicada,
} from "./shared/resolver-skills-consulta.js";
import { formatAsOf } from "./shared/format-as-of.js";
import {
  hintSqlNaoClassificavel,
  isSqlClassificationDenial,
} from "./shared/sql-classification-hint.js";
import {
  persistirConsultaExecutada,
  persistirItensAprendizado,
  type ItemAprendizadoInput,
} from "./shared/persistir-aprendizado.js";
import {
  fluxoForAgentSkill,
  pickSkillInProgress,
  type FluxoTreino,
} from "./shared/fluxo-treino.js";
import { coberturaDeSkill, tokensCapacidade } from "./shared/cobertura-skill.js";
import { resolverSkillsPorSinonimos } from "./shared/resolver-sinonimos.js";
import {
  consultaAprendidaRelevante,
  filtrarAnotacoes,
  HINT_SKILL_GAP_CRUZAMENTO,
  hintRegraParcial,
  montarConhecimentos,
  perguntaPareceCruzamento,
} from "./shared/montar-conhecimentos.js";
import {
  esqueletoDaPrimeiraSkillComKpi,
  type ConsultaSemanticaSugerida,
} from "./shared/esqueleto-semantico.js";
import {
  formatarTagsTelemetriaBusca,
  type GapBusca,
  type TelemetriaBusca,
} from "./shared/telemetria-busca.js";
import {
  agruparColunasCatalogo,
  cell,
  DESCREVER_TABELA_MAX_ROWS,
  EXPLORAR_TABELAS_MAX_ROWS,
  hintCatalogoSistemaNegado,
  likeFiltro,
  parseIdentificadorTabela,
  sqlDescreverTabela,
  sqlExplorarTabelas,
} from "./shared/schema-introspection.js";
import { coletarAvisosAnotacaoConsulta } from "./shared/avisos-anotacao-consulta.js";
import { inferirFormatoColuna, inferirPapelColuna } from "./shared/inferir-papel.js";
import { inferirSensibilidadeColuna } from "../../domain/entities/privacidade.js";
import {
  applySelectAliasHints,
  mergeColumnHints,
  normalizeColumnsMetadata,
  type ColumnMetadataHint,
  type ColumnMetadataItem,
} from "./shared/columns-metadata.js";

const QUERY_CELL_MAX_CHARS = 2_048;

const PERIODO_NA_PERGUNTA =
  /\b(per[ií]odo|ano|m[eê]s|yoy|versus|compar(ar|ação|acao)|trimestre|semestre)\b/i;

const HINT_IDS_MAX = 3;

const hintConsultasAprendidas = (
  query: string,
  consultas: readonly ConsultaAprendida[],
): string | undefined => {
  if (consultas.length === 0) {
    return undefined;
  }
  const ids = consultas
    .slice(0, HINT_IDS_MAX)
    .map((item) => item.id)
    .join(", ");
  const base =
    `Reutilize consultasAprendidas[].id (${ids}) em obter_skill.pacote.consultasExemplo com o mesmo id. ` +
    "Adapte params; não invente tabela, coluna nem JOIN. Não reinvente o SELECT.";
  if (PERIODO_NA_PERGUNTA.test(query)) {
    return `${base} Pergunta de período: reutilize a pergunta (params de data ou OVER/LAG); não reinventar a comparação.`;
  }
  return base;
};

interface AprendizadoGravado {
  readonly consultaId: string;
  readonly execucoes: number;
  readonly nova: boolean;
  readonly perguntaUsada: string;
  readonly itens: number;
}

interface CachedQueryPayload {
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, unknown>[];
  readonly asOf: string;
  readonly servidoEm: string;
  readonly truncated: boolean;
  readonly columnsMetadata?: readonly {
    name: string;
    type?: string | null;
    nullable?: boolean | null;
  }[];
}

const parseCachedQuery = (raw: string): CachedQueryPayload | null => {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") {
      return null;
    }
    const rec = value as Record<string, unknown>;
    if (!Array.isArray(rec.columns) || !Array.isArray(rec.rows) || typeof rec.asOf !== "string") {
      return null;
    }
    return {
      columns: rec.columns.filter((item): item is string => typeof item === "string"),
      rows: rec.rows.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
      ),
      asOf: rec.asOf,
      servidoEm: typeof rec.servidoEm === "string" ? rec.servidoEm : rec.asOf,
      truncated: rec.truncated === true,
      ...(Array.isArray(rec.columnsMetadata)
        ? {
            columnsMetadata: rec.columnsMetadata.filter(
              (item): item is { name: string; type?: string | null; nullable?: boolean | null } =>
                Boolean(item) &&
                typeof item === "object" &&
                typeof (item as { name?: unknown }).name === "string",
            ),
          }
        : {}),
    };
  } catch {
    return null;
  }
};

const unirContratosParams = (skills: readonly Skill[]): Skill["params"] => {
  const map = new Map<string, Skill["params"][number]>();
  for (const item of skills) {
    for (const param of item.params) {
      const prev = map.get(param.nome);
      if (prev && (prev.tipo !== param.tipo || prev.obrigatorio !== param.obrigatorio)) {
        throw new DomainError({
          code: ERROR_CODES.MULTI_SKILL_PARAMS,
          message: `Param ${param.nome} conflita entre skills (tipo/obrigatoriedade).`,
          hint: "Alinhe o contrato nas skills ou use nomes distintos no SQL.",
        });
      }
      map.set(param.nome, prev ?? param);
    }
  }
  return [...map.values()];
};

const truncateCell = (value: unknown): unknown => {
  if (typeof value !== "string" || value.length <= QUERY_CELL_MAX_CHARS) {
    return value;
  }
  return `${value.slice(0, QUERY_CELL_MAX_CHARS)}…`;
};

const sanitizeQueryRows = (rows: readonly Record<string, unknown>[]): Record<string, unknown>[] =>
  rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      next[key] = truncateCell(value);
    }
    return next;
  });

const gravarAprendizadoDaConsulta = async (input: {
  extras: {
    grafo?: GrafoRepositoryPort;
    aprendizado?: AprendizadoRepositoryPort;
    anotacoes?: AnotacaoGrafoRepositoryPort;
    skills?: SkillRepositoryPort;
  };
  agentId: string;
  skillIds: readonly string[];
  pergunta: string;
  sql: string;
  paramsContrato: Skill["params"];
  autorUsuarioId: string;
  itens: readonly ItemAprendizadoInput[];
}): Promise<{ gravado?: AprendizadoGravado; avisos: { code: string; message: string }[] }> => {
  const avisos: { code: string; message: string }[] = [];
  if (!input.extras.aprendizado) {
    return { avisos };
  }
  const consulta = await persistirConsultaExecutada({
    aprendizado: input.extras.aprendizado,
    agentId: input.agentId,
    skillIds: input.skillIds,
    pergunta: input.pergunta,
    sql: input.sql,
    paramsContrato: input.paramsContrato,
    autorUsuarioId: input.autorUsuarioId,
  });
  let itens = 0;
  if (input.itens.length > 0 && input.extras.anotacoes && input.extras.grafo) {
    const extra = await persistirItensAprendizado({
      agentId: input.agentId,
      autorUsuarioId: input.autorUsuarioId,
      itens: input.itens,
      grafo: input.extras.grafo,
      anotacoes: input.extras.anotacoes,
      aprendizado: input.extras.aprendizado,
      skills: input.extras.skills,
      strictMetricas: false,
    });
    avisos.push(...extra.avisos);
    itens = extra.anotacoes.length + extra.sinonimos;
  } else if (input.itens.length > 0) {
    avisos.push({
      code: "APRENDIZADO_IGNORADO",
      message: "Itens de aprendizado não gravados: grafo/anotações indisponíveis.",
    });
  }
  return {
    gravado: {
      consultaId: consulta.id,
      execucoes: consulta.execucoes,
      nova: consulta.execucoes === 1,
      perguntaUsada: consulta.pergunta,
      itens,
    },
    avisos,
  };
};

const allowedByPolicy = (table: string, policy: ClientTokenPolicy): boolean => {
  if (policy.allTables) {
    return true;
  }
  const wanted = table.toLowerCase();
  return policy.tables.some((item) => item.toLowerCase() === wanted);
};

const rethrowCatalogDenied = (error: unknown): never => {
  if (
    error instanceof DomainError &&
    (error.code === ERROR_CODES.PERMISSION_DENIED || error.code === ERROR_CODES.ACCESS_REVOKED)
  ) {
    throw new DomainError({
      code: error.code,
      message: error.message,
      hint: hintCatalogoSistemaNegado(),
    });
  }
  throw error;
};

export class ConsultarDados {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly crypto: CryptoPort,
    private readonly audit: AuditLogPort,
    private readonly defaultMaxRows: number,
    private readonly absoluteMaxRows: number,
    private readonly extras: {
      grafo?: GrafoRepositoryPort;
      aprendizado?: AprendizadoRepositoryPort;
      anotacoes?: AnotacaoGrafoRepositoryPort;
      cache?: QueryResultCachePort;
      cacheTtlMs?: number;
      semanticQueryEnabled?: boolean;
      schemaDriftEnabled?: boolean;
    } = {},
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      skillIds?: string[];
      sql?: string;
      consultaSemantica?: unknown;
      consultaAprendidaId?: string;
      pergunta?: string;
      aprendizado?: readonly ItemAprendizadoInput[];
      params?: Record<string, unknown>;
      options?: { max_rows?: number; page?: number; page_size?: number; timeout_ms?: number };
    },
  ): Promise<{
    success: true;
    skillId: string;
    skillIds: string[];
    columns: readonly string[];
    rows: readonly Record<string, unknown>[];
    rowCount: number;
    maxRowsApplied: number;
    truncated: boolean;
    sqlExecutado: string;
    paramsUsados: Record<string, unknown>;
    asOf: string;
    recorte: { tipoJoin: string; tabela: string; on: string | null; opcional?: boolean }[];
    columnsMetadata?: readonly ColumnMetadataItem[];
    escopoAplicado: { empresa?: string; filial?: string; consolidado: boolean };
    avisos: { code: string; message: string }[];
    aprendizadoGravado?: AprendizadoGravado;
    paginacao?: {
      page: number;
      pageSize: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
    hint?: string;
  }> {
    const started = Date.now();
    const uid = requireUsuario(usuarioId);
    const acesso = await refreshAndRequireAcessoAprovado(
      this.acessos,
      this.plug,
      this.sessions,
      await requireAcesso(this.acessos, input.acessoId, uid),
      uid,
    );
    const ids = idsSkillDaChamada(input);
    const consultaAprendidaId = input.consultaAprendidaId?.trim() ?? "";
    const sqlInformado = input.sql?.trim() ?? "";
    const consultaSemantica = parseConsultaSemantica(input.consultaSemantica);
    const fontes = [
      sqlInformado.length > 0,
      Boolean(consultaSemantica),
      consultaAprendidaId.length > 0,
    ].filter(Boolean).length;
    if (fontes > 1) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Use só uma fonte de SQL: sql, consultaSemantica ou consultaAprendidaId.",
        hint: "consultaAprendidaId reusa o SELECT gravado. Não misture com sql nem IR.",
      });
    }
    const allowlist = await resolverSkillsConsulta(this.skills, acesso.agentId, ids);
    let aprendida: ConsultaAprendida | null = null;
    if (consultaAprendidaId) {
      if (!this.extras.aprendizado) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Consulta aprendida indisponível neste servidor.",
          hint: "Passe sql ou consultaSemantica. Em Postgres o cofre precisa estar ligado.",
        });
      }
      aprendida = await this.extras.aprendizado.obterConsulta(acesso.agentId, consultaAprendidaId);
      if (aprendida?.status !== "ativa") {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Consulta aprendida não encontrada ou inativa.",
          hint: "Reuse o id de buscar_contexto em obter_skill.consultasExemplo e consulte de novo.",
        });
      }
    }
    const sqlLivre = aprendida ? aprendida.sql.trim() : sqlInformado;
    let sqlSemantico: string | null = null;
    let avisoSemantico: { code: string; message: string } | null = null;
    let ancoraSemantica: Skill | null = null;
    if (consultaSemantica) {
      if (this.extras.semanticQueryEnabled === false) {
        throw new DomainError({
          code: ERROR_CODES.FEATURE_DESLIGADA,
          message: "Consulta semântica está desligada.",
          hint: "Use SQL livre validado ou ligue MCP_SEMANTIC_QUERY_ENABLED.",
        });
      }
      if (consultaSemantica.limite != null && input.options?.page != null) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "consultaSemantica.limite não combina com options.page.",
          hint: "Use limite (TOP/LIMIT) sem página, ou pagine com ORDER BY + page e page_size sem limite no IR.",
        });
      }
      ancoraSemantica = ancoraConsultaSemantica(allowlist, aliasesMetricas(consultaSemantica), ids);
      const compiled = compilarConsultaSemantica(
        consultaSemantica,
        escopoDaSkillPublicada(ancoraSemantica),
        {
          empresa: Boolean(acesso.escopoPadrao?.empresa),
          filial: Boolean(acesso.escopoPadrao?.filial),
        },
        { dialeto: acesso.dialeto, maxLimite: this.absoluteMaxRows },
      );
      sqlSemantico = compiled.sql;
      avisoSemantico = {
        code: "CONSULTA_SEMANTICA",
        message: `SQL compilado dos elementos certificados: ${compiled.elementos.join(", ")}.`,
      };
    }
    const perguntaUsada = input.pergunta?.trim() ?? "";
    if (!perguntaUsada) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "pergunta é obrigatória.",
        hint: "Envie a pergunta do usuário em consultar_dados. O servidor grava o SQL que funcionou.",
      });
    }
    const avisos: { code: string; message: string }[] = [];
    if (avisoSemantico) {
      avisos.push(avisoSemantico);
    }
    if (!acesso.escopoPadrao?.empresa && !acesso.escopoPadrao?.filial) {
      avisos.push({
        code: "ESCOPO_CONSOLIDADO",
        message:
          "Sem empresa/filial default no acesso; o número é consolidado de todas as empresas visíveis.",
      });
    }
    let sqlExecutar: string;
    let modelo: SqlModelo;
    const sqlParaValidar = sqlLivre.length > 0 ? sqlLivre : (sqlSemantico ?? "");
    const escopoConsulta = uniaoEscoposPublicados(allowlist);
    let atribuidas: Skill[];
    if (sqlParaValidar) {
      const ast = validarSqlNoEscopo(sqlParaValidar, acesso.dialeto, escopoConsulta, {
        page: input.options?.page,
        pageSize: input.options?.page_size,
      });
      avisos.push(...coletarAvisosValidacao(ast));
      sqlExecutar = ast.sql;
      modelo = parseSqlModelo(sqlParaValidar);
      assertFanoutSeguro(ast, escopoConsulta);
      avisos.push(...avisosKpiDesalinhado(ast, escopoConsulta));
      atribuidas = ancoraSemantica
        ? [ancoraSemantica]
        : atribuirSkillsPorSql(allowlist, sqlExecutar, acesso.dialeto, aprendida?.skillIds ?? []);
    } else {
      const ancora = ancoraSqlModelo(allowlist, ids);
      sqlExecutar = ancora.sqlModelo;
      modelo = parseSqlModelo(sqlExecutar);
      atribuidas = [ancora];
      const astModelo = tryParseSelect(sqlExecutar, acesso.dialeto);
      if (astModelo) {
        assertFanoutSeguro(astModelo, escopoConsulta);
      }
    }
    const skill = atribuidas[0]!;
    const contratoBase = unirContratosParams(atribuidas);
    const contratoParams =
      aprendida?.paramsContrato && aprendida.paramsContrato.length > 0
        ? (() => {
            const map = new Map(contratoBase.map((param) => [param.nome, param]));
            for (const param of aprendida.paramsContrato) {
              if (!map.has(param.nome)) {
                map.set(param.nome, param);
              }
            }
            return [...map.values()];
          })()
        : contratoBase;
    const colunasDasTabelas: Record<string, string[]> = {};
    const columnHints = new Map<string, ColumnMetadataHint>();
    if (this.extras.grafo) {
      for (const tabela of modelo.tabelas) {
        const found = await this.extras.grafo.findTabelaByNome(acesso.agentId, tabela.nome);
        if (!found) {
          continue;
        }
        const cols = await this.extras.grafo.listColunas(found.id);
        colunasDasTabelas[tabela.nome] = cols.map((coluna) => coluna.nome);
        mergeColumnHints(columnHints, cols);
      }
      const astPriv = tryParseSelect(sqlExecutar, acesso.dialeto);
      if (astPriv) {
        applySelectAliasHints(columnHints, astPriv.colunas);
        const lookup = await lookupSensibilidadeGrafo(
          this.extras.grafo,
          acesso.agentId,
          astPriv.tabelas.map((item) => item.nome),
        );
        assertPrivacidadeAntesDoHub({ ast: astPriv, lookup, negar: ["segredo", "pessoal"] });
      }
    }
    exigirFiltroEscopoPadrao({
      sql: sqlExecutar,
      colunasDasTabelas,
      escopoPadrao: acesso.escopoPadrao,
      dialeto: acesso.dialeto,
    });
    avisos.push(
      ...avisosPlaceholderEscopo({
        sql: sqlExecutar,
        colunasDasTabelas,
        escopoPadrao: acesso.escopoPadrao,
      }),
    );
    if (this.extras.anotacoes) {
      const notas = await this.extras.anotacoes.list(acesso.agentId);
      const tabelasSql = new Set(modelo.tabelas.map((tabela) => tabela.nome.toLowerCase()));
      const aliasesSql = [
        ...modelo.tabelas.flatMap((tabela) => (tabela.alias ? [tabela.alias] : [])),
        ...modelo.colunas.map((coluna) => coluna.alias),
      ];
      const skillIds = new Set(atribuidas.map((item) => item.id));
      const tabelaNomePorId = new Map<string, string>();
      if (this.extras.grafo && notas.some((nota) => Boolean(nota.tabelaId))) {
        const todasTabelas = await this.extras.grafo.listTabelas(acesso.agentId);
        for (const tabela of todasTabelas) {
          tabelaNomePorId.set(tabela.id, tabela.nome);
        }
      }
      avisos.push(
        ...coletarAvisosAnotacaoConsulta({
          notas,
          skillIds,
          tabelasSql,
          tabelaNomePorId,
          aliasesSql,
        }),
      );
    }
    const mergedParams = mesclarParamsEscopo(input.params ?? {}, acesso.escopoPadrao);
    const expandido = expandirInListas(sqlExecutar, mergedParams);
    sqlExecutar = expandido.sql;
    const params = coerceBoundParams(
      bindNamedParams(sqlExecutar, expandido.params, contratoParams),
      contratoParams,
    );
    const requested = input.options?.max_rows ?? this.defaultMaxRows;
    const orcamento = assertOrcamentoConsulta({
      ast: tryParseSelect(sqlExecutar, acesso.dialeto),
      politica: politicaMaisRestrita(atribuidas),
      maxRows: Math.min(Math.max(1, requested), this.absoluteMaxRows),
      timeoutMs: input.options?.timeout_ms,
    });
    const maxRows = orcamento.maxRows;
    const page = input.options?.page;
    const pageSize = input.options?.page_size;
    if (
      (page !== undefined && pageSize === undefined) ||
      (page === undefined && pageSize !== undefined)
    ) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Paginação exige options.page e options.page_size juntos.",
        hint: "Envie os dois, com ORDER BY no SELECT externo e sem TOP/LIMIT.",
      });
    }
    if (pageSize !== undefined && pageSize > maxRows) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "page_size não pode exceder max_rows.",
        hint: `Use page_size <= ${String(maxRows)}.`,
      });
    }
    const paginar = Boolean(page && pageSize);
    if (paginar && acesso.dialeto === "firebird") {
      throw new DomainError({
        code: ERROR_CODES.DIALECT_UNSUPPORTED,
        message: "Firebird não pagina via options.page.",
        hint: "Use só a consulta exemplo da skill, sem SQL livre nem paginação gerenciada.",
      });
    }
    const fetchMax = paginar ? maxRows : Math.min(maxRows + 1, this.absoluteMaxRows + 1);
    const clientToken = this.crypto.decrypt(acesso.clientTokenEnc);
    const policy = await withHubAuth(this.sessions, uid, (accessToken) =>
      this.plug.getClientTokenPolicy({
        accessToken,
        agentId: acesso.agentId,
        clientToken,
      }),
    );
    const paramKeys = Object.keys(params).sort().join(",");
    const recorte = modelo.relacionamentos.map((rel) => ({
      tipoJoin: rel.tipoJoin,
      tabela: rel.tabela,
      on: rel.on,
      opcional: rel.tipoJoin.includes("left") || rel.tipoJoin.includes("outer"),
    }));
    const asOfInfo = formatAsOf(new Date(), acesso.timezone);
    if (asOfInfo.aviso) {
      avisos.push({ code: "TIMEZONE_INVALIDO", message: asOfInfo.aviso });
    }
    const asOf = asOfInfo.asOf;
    const itensAprendizado = input.aprendizado ?? [];
    const astLivre = tryParseSelect(sqlExecutar, acesso.dialeto);
    exigirPaginacaoEstavel(sqlExecutar, astLivre, {
      page,
      pageSize,
    });
    const sqlNoFio = sqlParaOdbc(sqlExecutar);
    const cacheable = Boolean(astLivre?.temAgregacao && this.extras.cache && !paginar);
    const cacheKey = queryCacheKey({
      usuarioId: uid,
      acessoId: acesso.id,
      clientTokenHash: acesso.clientTokenHash,
      agentId: acesso.agentId,
      skillIds: atribuidas.map((item) => item.id),
      skillVersoes: atribuidas.map((item) => item.versao),
      sql: sqlNoFio,
      params,
      maxRows,
      timezone: acesso.timezone,
      escopoEmpresa: acesso.escopoPadrao?.empresa,
      escopoFilial: acesso.escopoPadrao?.filial,
      policyFingerprint: policyFingerprint(policy),
    });
    try {
      if (cacheable && this.extras.cache) {
        const cached = await this.extras.cache.get(cacheKey);
        if (cached) {
          const parsed = parseCachedQuery(cached);
          if (parsed) {
            const loop = await gravarAprendizadoDaConsulta({
              extras: { ...this.extras, skills: this.skills },
              agentId: acesso.agentId,
              skillIds: atribuidas.map((item) => item.id),
              pergunta: perguntaUsada,
              sql: sqlNoFio,
              paramsContrato: contratoParams,
              autorUsuarioId: uid,
              itens: itensAprendizado,
            });
            return {
              success: true,
              skillId: skill.id,
              skillIds: atribuidas.map((item) => item.id),
              columns: parsed.columns,
              rows: parsed.rows,
              rowCount: parsed.rows.length,
              maxRowsApplied: maxRows,
              truncated: parsed.truncated,
              sqlExecutado: sqlNoFio,
              paramsUsados: params,
              asOf: parsed.asOf,
              recorte,
              columnsMetadata: normalizeColumnsMetadata(
                parsed.columns,
                parsed.columnsMetadata,
                columnHints,
              ),
              escopoAplicado: {
                empresa: acesso.escopoPadrao?.empresa,
                filial: acesso.escopoPadrao?.filial,
                consolidado: !acesso.escopoPadrao?.empresa && !acesso.escopoPadrao?.filial,
              },
              avisos: [
                ...avisos,
                ...loop.avisos,
                {
                  code: "CACHE",
                  message: `Resultado agregado do cache (dataDoResultado=${parsed.asOf}; servidoEm=${parsed.servidoEm}). Não trate como leitura ao vivo.`,
                },
              ],
              aprendizadoGravado: loop.gravado,
            };
          }
        }
      }
      const result = await withHubAuth(this.sessions, uid, (accessToken) =>
        this.plug.executeSql({
          accessToken,
          agentId: acesso.agentId,
          clientToken,
          sql: sqlNoFio,
          params,
          options: {
            maxRows: fetchMax,
            page: paginar ? input.options?.page : undefined,
            pageSize: paginar ? input.options?.page_size : undefined,
            timeoutMs: orcamento.timeoutMs ?? input.options?.timeout_ms,
          },
        }),
      );
      if (paginar && !result.pagination) {
        throw new DomainError({
          code: ERROR_CODES.METADATA_CONTRATO,
          message: "Paginação sem metadata do agente.",
          hint: "O hub precisa devolver pagination.page, page_size e has_next_page. Não assuma fim dos dados.",
        });
      }
      const pageRows =
        paginar && pageSize !== undefined
          ? result.rows.slice(0, pageSize)
          : result.rows.slice(0, maxRows);
      const truncated = paginar ? false : result.rows.length > maxRows || result.truncated === true;
      const rows = sanitizeQueryRows(pageRows);
      const paginacao =
        paginar && page !== undefined && pageSize !== undefined && result.pagination
          ? {
              page: result.pagination.page,
              pageSize: result.pagination.pageSize,
              hasNextPage: result.pagination.hasNextPage,
              hasPreviousPage: result.pagination.hasPreviousPage,
            }
          : undefined;
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "consultar_dados",
        sqlEnviado: `skill:${skill.id};params:${paramKeys}`,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: rows.length,
        duracaoMs: Date.now() - started,
      });
      if (this.extras.grafo) {
        await promoverFatosDaExecucao({
          grafo: this.extras.grafo,
          agentId: acesso.agentId,
          autorUsuarioId: uid,
          modelo,
        });
      }
      if (consultaSemantica && !skill.consultaSemantica) {
        await this.skills.update(skill.id, { consultaSemantica });
      }
      const columns =
        result.columns.length > 0
          ? result.columns
          : (result.columnsMetadata?.map((item) => item.name) ?? []);
      const columnsMetadata = normalizeColumnsMetadata(
        columns,
        result.columnsMetadata,
        columnHints,
      );
      if (cacheable && this.extras.cache) {
        await this.extras.cache.set(
          cacheKey,
          JSON.stringify({
            columns,
            rows,
            asOf,
            servidoEm: asOf,
            truncated,
            columnsMetadata,
          }),
          this.extras.cacheTtlMs ?? 60_000,
        );
      }
      const loop = await gravarAprendizadoDaConsulta({
        extras: { ...this.extras, skills: this.skills },
        agentId: acesso.agentId,
        skillIds: atribuidas.map((item) => item.id),
        pergunta: perguntaUsada,
        sql: sqlNoFio,
        paramsContrato: contratoParams,
        autorUsuarioId: uid,
        itens: itensAprendizado,
      });
      return {
        success: true,
        skillId: skill.id,
        skillIds: atribuidas.map((item) => item.id),
        columns,
        rows,
        rowCount: rows.length,
        maxRowsApplied: maxRows,
        truncated,
        sqlExecutado: sqlNoFio,
        paramsUsados: params,
        asOf,
        recorte,
        columnsMetadata,
        escopoAplicado: {
          empresa: acesso.escopoPadrao?.empresa,
          filial: acesso.escopoPadrao?.filial,
          consolidado: !acesso.escopoPadrao?.empresa && !acesso.escopoPadrao?.filial,
        },
        avisos: [...avisos, ...loop.avisos],
        aprendizadoGravado: loop.gravado,
        paginacao,
        hint: paginacao?.hasNextPage
          ? "Há próxima página. Incremente options.page com o mesmo ORDER BY e page_size."
          : truncated
            ? "Resultado possivelmente incompleto (atingiu max_rows). Agregue no SQL ou pagine com ORDER BY."
            : loop.gravado
              ? "SQL gravado. Se o usuário ensinou regra, dicionário ou sinônimo, envie em aprendizado[] ou chame registrar_aprendizado."
              : undefined,
      };
    } catch (error) {
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "consultar_dados",
        sqlEnviado: `skill:${skill.id};params:${paramKeys}`,
        sucesso: false,
        codigoErro: error instanceof DomainError ? error.code : ERROR_CODES.PLUG_SERVER_ERROR,
        linhasRetornadas: null,
        duracaoMs: Date.now() - started,
      });
      if (error instanceof DomainError && isSqlClassificationDenial(error)) {
        throw new DomainError({
          code: error.code,
          message: error.message,
          hint: hintSqlNaoClassificavel(modelo.tabelas.map((tabela) => tabela.nome)),
          retryable: error.retryable,
          retryAfterMs: error.retryAfterMs,
        });
      }
      throw error;
    }
  }
}

export class ValidarConsulta {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly crypto: CryptoPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      skillIds?: string[];
      sql?: string;
      params?: Record<string, unknown>;
    },
  ): Promise<{
    success: true;
    valido: true;
    dialeto: string;
    tabelas: string[];
    avisos: { code: string; message: string }[];
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await refreshAndRequireAcessoAprovado(
      this.acessos,
      this.plug,
      this.sessions,
      await requireAcesso(this.acessos, input.acessoId, uid),
      uid,
    );
    const ids = idsSkillDaChamada(input);
    const sql = input.sql?.trim() ?? "";
    if (!sql) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "sql é obrigatório.",
        hint: "Passe o SELECT a validar. skillId é opcional: omitido usa todas as publicadas do agentId.",
      });
    }
    const allowlist = await resolverSkillsConsulta(this.skills, acesso.agentId, ids);
    const escopo = uniaoEscoposPublicados(allowlist);
    const ast = validarSqlNoEscopo(sql, acesso.dialeto, escopo);
    await withHubAuth(this.sessions, uid, (accessToken) =>
      this.plug.executeSql({
        accessToken,
        agentId: acesso.agentId,
        clientToken: this.crypto.decrypt(acesso.clientTokenEnc),
        sql: sqlValidacaoVazia(acesso.dialeto, sqlParaOdbc(ast.sql)),
        params: bindParamsForValidation(ast.sql, input.params),
        options: { maxRows: 1 },
      }),
    );
    return {
      success: true,
      valido: true,
      dialeto: acesso.dialeto,
      tabelas: [...ast.tabelas.map((tabela) => tabela.nome)],
      avisos: coletarAvisosValidacao(ast),
    };
  }
}

export class ExplorarTabelas {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly crypto: CryptoPort,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; filtro?: string },
  ): Promise<{
    success: true;
    dialeto: string;
    tabelas: { schema: string | null; table_name: string; object_type: string }[];
    truncated: boolean;
    hint?: string;
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await refreshAndRequireAcessoAprovado(
      this.acessos,
      this.plug,
      this.sessions,
      await requireAcesso(this.acessos, input.acessoId, uid),
      uid,
    );
    const sql = sqlExplorarTabelas(acesso.dialeto);
    try {
      const result = await withHubAuth(this.sessions, uid, (accessToken) =>
        this.plug.executeSql({
          accessToken,
          agentId: acesso.agentId,
          clientToken: this.crypto.decrypt(acesso.clientTokenEnc),
          sql,
          params: { filtro: likeFiltro(input.filtro) },
          options: { maxRows: EXPLORAR_TABELAS_MAX_ROWS },
        }),
      );
      const tabelas = result.rows.map((row) => ({
        schema: cell(row, "schema_name") || null,
        table_name: cell(row, "table_name"),
        object_type: cell(row, "object_type") || "table",
      }));
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "explorar_tabelas",
        sqlEnviado: sql,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: tabelas.length,
        duracaoMs: 0,
      });
      return {
        success: true,
        dialeto: acesso.dialeto,
        tabelas,
        truncated: tabelas.length >= EXPLORAR_TABELAS_MAX_ROWS,
        hint:
          tabelas.length >= EXPLORAR_TABELAS_MAX_ROWS
            ? `Lista truncada em ${EXPLORAR_TABELAS_MAX_ROWS}. Passe filtro.`
            : undefined,
      };
    } catch (error) {
      return rethrowCatalogDenied(error);
    }
  }
}

export class MapearTabela {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly crypto: CryptoPort,
    private readonly extras: {
      skills?: SkillRepositoryPort;
      cache?: QueryResultCachePort;
      schemaDriftEnabled?: boolean;
    } = {},
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; tabela?: string },
  ): Promise<{
    success: true;
    tabela: string;
    colunas: {
      nome: string;
      tipo: string;
      nullable: string;
      papel: string;
      formato: "date" | "number" | null;
      sensibilidade: string;
    }[];
    avisos: { code: string; message: string }[];
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await refreshAndRequireAcessoAprovado(
      this.acessos,
      this.plug,
      this.sessions,
      await requireAcesso(this.acessos, input.acessoId, uid),
      uid,
    );
    const ident = parseIdentificadorTabela(input.tabela);
    const sql = sqlDescreverTabela(acesso.dialeto, Boolean(ident.schema));
    try {
      const result = await withHubAuth(this.sessions, uid, (accessToken) =>
        this.plug.executeSql({
          accessToken,
          agentId: acesso.agentId,
          clientToken: this.crypto.decrypt(acesso.clientTokenEnc),
          sql,
          params: { tabela: ident.tabela, schema: ident.schema ?? undefined },
          options: { maxRows: DESCREVER_TABELA_MAX_ROWS },
        }),
      );
      const agrupado = agruparColunasCatalogo(result.rows);
      const avisos: { code: string; message: string }[] = [];
      if (agrupado.ambiguas) {
        avisos.push({
          code: "CATALOGO_TIPOS_AMBIGUOS",
          message:
            "O catálogo devolveu vários tipos por coluna. Se a base for SQL Server, chame atualizar_dialeto para mssql e mapeie de novo. Não grave geometry/xml como tipo da coluna.",
        });
      }
      await this.grafo.withAgentLock(acesso.agentId, async () => {
        const locked = await this.grafo.getDialeto(acesso.agentId);
        if (!locked) {
          await this.grafo.setDialeto(acesso.agentId, acesso.dialeto);
        } else if (locked.dialeto !== acesso.dialeto) {
          throw new DomainError({
            code: ERROR_CODES.DIALECT_CONFLICT,
            message: "Este agentId já foi treinado em outro dialeto.",
            hint: `Grafo travado em ${locked.dialeto}. Chame atualizar_dialeto com confirmadoPeloUsuario: true para mudar o dialeto (skills voltam a rascunho).`,
          });
        }
        const tabela = await this.grafo.mergeTabela({
          agentId: acesso.agentId,
          nome: ident.tabela,
          origem: "inferido",
          autorUsuarioId: uid,
        });
        for (const coluna of agrupado.colunas) {
          if (!coluna.nome) {
            continue;
          }
          const tipo = coluna.tipo || null;
          await this.grafo.mergeColuna({
            tabelaId: tabela.tabela.id,
            nome: coluna.nome,
            tipo,
            papel: inferirPapelColuna(coluna.nome, tipo),
            formato: inferirFormatoColuna(tipo),
            sensibilidade: inferirSensibilidadeColuna(coluna.nome, tipo),
            origem: "inferido",
            autorUsuarioId: uid,
          });
        }
      });
      if (this.extras.skills) {
        await sincronizarEscopoComGrafo(this.extras.skills, this.grafo, acesso.agentId, {
          tabelas: [ident.tabela],
        });
      }
      if (this.extras.schemaDriftEnabled !== false && this.extras.skills) {
        const deriva = await aplicarDerivaTabelaNoGrafo({
          grafo: this.grafo,
          skills: this.extras.skills,
          cache: this.extras.cache,
          agentId: acesso.agentId,
          tabelaNome: ident.tabela,
        });
        if (deriva.drifted) {
          avisos.push({
            code: "SCHEMA_DRIFT",
            message: `Assinatura de ${ident.tabela} mudou. Skills ${deriva.skillsAfetadas.map((item) => item.slug).join(", ") || "(nenhuma)"} foram para revalidação.`,
          });
        }
      }
      return {
        success: true,
        tabela: ident.tabela,
        colunas: agrupado.colunas.map((coluna) => {
          const tipo = coluna.tipo || "";
          return {
            nome: coluna.nome,
            tipo,
            nullable: coluna.nullable,
            papel: inferirPapelColuna(coluna.nome, tipo || null),
            formato: inferirFormatoColuna(tipo || null),
            sensibilidade: inferirSensibilidadeColuna(coluna.nome, tipo || null),
          };
        }),
        avisos,
      };
    } catch (error) {
      return rethrowCatalogDenied(error);
    }
  }
}

const STATUS_TREINO: ReadonlySet<StatusSkill> = new Set([
  "rascunho",
  "validada",
  "rascunho_revalidacao",
]);

const resumoSkill = (skill: Skill): SkillResumoContexto => ({
  id: skill.id,
  slug: skill.slug,
  nome: skill.nome,
  status: skill.status,
});

const resumoConsulta = (consulta: ConsultaAprendida): ConsultaAprendidaResumo => ({
  id: consulta.id,
  pergunta: consulta.pergunta,
  skillIds: consulta.skillIds,
  execucoes: consulta.execucoes,
  status: consulta.status,
});

const unirSkills = (
  encontradas: readonly Skill[],
  extras: readonly Skill[],
  statuses?: ReadonlySet<StatusSkill>,
): Skill[] => {
  const merged = new Map(encontradas.map((skill) => [skill.id, skill]));
  for (const skill of extras) {
    if (statuses && !statuses.has(skill.status)) {
      continue;
    }
    if (!merged.has(skill.id)) {
      merged.set(skill.id, skill);
    }
  }
  return [...merged.values()];
};

const unirSkillsPorNotas = (
  encontradas: readonly Skill[],
  todas: readonly Skill[],
  notas: readonly { skillId: string | null }[],
  statuses: ReadonlySet<StatusSkill>,
): Skill[] => {
  const merged = new Map(encontradas.map((skill) => [skill.id, skill]));
  const byId = new Map(todas.map((skill) => [skill.id, skill]));
  const ids = [
    ...new Set(notas.map((nota) => nota.skillId).filter((id): id is string => Boolean(id))),
  ];
  for (const skillId of ids) {
    const skill = byId.get(skillId);
    if (skill && statuses.has(skill.status) && !merged.has(skill.id)) {
      merged.set(skill.id, skill);
    }
  }
  return [...merged.values()];
};

export class BuscarContexto {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly anotacoes: AnotacaoGrafoRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly crypto: CryptoPort,
    private readonly aprendizado?: AprendizadoRepositoryPort,
    private readonly audit?: AuditLogPort,
    private readonly logger?: LoggerPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; query?: string },
  ): Promise<{
    success: true;
    consultaPermitida: boolean;
    cobertura: "completa" | "parcial" | "desconhecida";
    candidatos: {
      skillId: string;
      slug: string;
      nome: string;
      cobertura: "completa" | "parcial" | "desconhecida";
      termosEncontrados: string[];
      termosAusentes: string[];
    }[];
    skillsPublicadas: readonly SkillResumoContexto[];
    skillsParaTreino: readonly SkillResumoContexto[];
    consultasAprendidas: readonly ConsultaAprendidaResumo[];
    conhecimentos: readonly HitConhecimento[];
    consultaSemanticaSugerida?: ConsultaSemanticaSugerida;
    grafoParaTreino?: { tabelas: readonly TabelaGrafo[]; anotacoes: readonly unknown[] };
    fluxoTreino?: FluxoTreino;
    gap?: { code: "SKILL_GAP"; hint: string };
    blockingReason?: "SKILL_NOT_PUBLISHED";
    nextAction?: string;
    hint?: string;
  }> {
    const startedAt = Date.now();
    const uid = requireUsuario(usuarioId);
    const acesso = await refreshAndRequireAcessoAprovado(
      this.acessos,
      this.plug,
      this.sessions,
      await requireAcesso(this.acessos, input.acessoId, uid),
      uid,
    );
    const query = input.query?.trim() ?? "";
    if (query.length < 2) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "query é obrigatória.",
        hint: "Descreva o assunto de negócio (ex.: pedido de venda, saldo em aberto).",
      });
    }
    const sinonimos = this.aprendizado
      ? await this.aprendizado.listarSinonimos(acesso.agentId)
      : [];
    const policy = await withHubAuth(this.sessions, uid, (accessToken) =>
      this.plug.getClientTokenPolicy({
        accessToken,
        agentId: acesso.agentId,
        clientToken: this.crypto.decrypt(acesso.clientTokenEnc),
      }),
    );
    const [
      tabelasHits,
      skillsPublicadasHits,
      skillsParaTreinoHits,
      notasHits,
      consultasHits,
      todas,
    ] = await Promise.all([
      this.grafo.buscar(acesso.agentId, query, 12),
      this.skills.buscar(acesso.agentId, query, 8, "publicada"),
      this.skills.buscar(acesso.agentId, query, 8, [
        "rascunho",
        "validada",
        "rascunho_revalidacao",
      ]),
      this.anotacoes.buscar(acesso.agentId, query, 8),
      this.aprendizado
        ? this.aprendizado.buscarConsultas(acesso.agentId, query, 5)
        : Promise.resolve([]),
      this.skills.listByAgent(acesso.agentId),
    ]);
    const tabelas = tabelasHits.map((hit) => hit.item);
    const notas = notasHits.map((hit) => hit.item);
    const consultasAprendidas = consultasHits
      .map((hit) => hit.item)
      .filter((item) => consultaAprendidaRelevante(query, item.pergunta));
    const skillsPorSinonimo = resolverSkillsPorSinonimos(query, sinonimos, todas);
    const skillsPublicadas = unirSkills(
      unirSkillsPorNotas(
        skillsPublicadasHits.map((hit) => hit.item),
        todas,
        notas,
        new Set<StatusSkill>(["publicada"]),
      ),
      skillsPorSinonimo,
      new Set<StatusSkill>(["publicada"]),
    );
    const skillsParaTreinoUnidas = unirSkills(
      unirSkillsPorNotas(
        skillsParaTreinoHits.map((hit) => hit.item),
        todas,
        notas,
        STATUS_TREINO,
      ),
      skillsPorSinonimo,
      STATUS_TREINO,
    );
    const tokens = tokensCapacidade(query);
    const candidatos = skillsPublicadas.map((skill) => {
      const { cobertura, termosEncontrados, termosAusentes } = coberturaDeSkill(
        skill,
        query,
        sinonimos,
      );
      return {
        skillId: skill.id,
        slug: skill.slug,
        nome: skill.nome,
        cobertura,
        termosEncontrados,
        termosAusentes,
      };
    });
    const coberturaGeral = candidatos.some((item) => item.cobertura === "completa")
      ? "completa"
      : candidatos.some((item) => item.cobertura === "parcial")
        ? "parcial"
        : "desconhecida";
    const consultaPermitida = coberturaGeral === "completa";
    const publicadasNoAgent = todas.filter((item) => item.status === "publicada");
    const capazesTreino = skillsParaTreinoUnidas.filter(
      (item) => coberturaDeSkill(item, query, sinonimos).cobertura === "completa",
    );
    const idsCompletas = new Set(
      candidatos.filter((item) => item.cobertura === "completa").map((item) => item.skillId),
    );
    const skillsCompletas = skillsPublicadas.filter((skill) => idsCompletas.has(skill.id));
    const emAndamento = pickSkillInProgress(capazesTreino);
    const skillFluxo = consultaPermitida ? (skillsCompletas[0] ?? null) : emAndamento;
    const fluxoTreino = skillFluxo
      ? await fluxoForAgentSkill(this.grafo, acesso.agentId, skillFluxo)
      : undefined;
    const precisaListar = !consultaPermitida && publicadasNoAgent.length > 0;
    const hintCruzamento = perguntaPareceCruzamento(query) ? ` ${HINT_SKILL_GAP_CRUZAMENTO}` : "";
    const gapHint = emAndamento
      ? `Há skill em andamento "${emAndamento.nome}" (${emAndamento.status}). Continue o fluxo: ${fluxoTreino?.proximoPasso ?? "validar_skill"}. Não chame consultar_dados.`
      : precisaListar
        ? `A busca por termos não prova ausência. Chame listar_skills antes de desistir.${hintCruzamento} Não invente tabela, coluna nem JOIN.`
        : "Não há skill publicada capaz (dado ou cruzamento). Não chame consultar_dados. Oriente treinar_com_sql → criar_skill → validar_skill → publicar_skill.";
    const lacunaElegivel = query.trim().length >= 8 && tokens.length >= 1;
    const skillNaoPublicada = !consultaPermitida && capazesTreino.length > 0;
    if (this.aprendizado) {
      if (consultaPermitida || skillNaoPublicada) {
        await this.aprendizado.arquivarLacunaSkillGap(acesso.agentId, query);
      } else if (!precisaListar && lacunaElegivel) {
        await this.aprendizado.registrarLacuna(acesso.agentId, query);
      }
    }
    const tabelasPolicy = tabelas.filter((tabela) => allowedByPolicy(tabela.nome, policy));
    const skillIdsPermitidos = new Set(skillsPublicadas.map((skill) => skill.id));
    const skillIdsRecuperados = new Set([
      ...skillsPublicadasHits.map((hit) => hit.item.id),
      ...skillsParaTreinoHits.map((hit) => hit.item.id),
      ...skillsPorSinonimo.map((skill) => skill.id),
    ]);
    const anotacaoIdsRecuperados = new Set(notasHits.map((hit) => hit.item.id));
    const tabelaIdsRecuperados = new Set(tabelasHits.map((hit) => hit.item.id));
    const skillIdsCandidatos = new Set([
      ...skillsPublicadas.map((skill) => skill.id),
      ...skillsParaTreinoUnidas.map((skill) => skill.id),
    ]);
    const ranksPorId = new Map<string, number>();
    for (const hit of [
      ...tabelasHits,
      ...skillsPublicadasHits,
      ...skillsParaTreinoHits,
      ...notasHits,
      ...consultasHits,
    ]) {
      ranksPorId.set(hit.item.id, hit.rank);
    }
    const tabelaNomePorId = new Map(tabelas.map((tabela) => [tabela.id, tabela.nome]));
    const notasComTabela = notas.some((nota) => Boolean(nota.tabelaId));
    if (notasComTabela) {
      const todasTabelas = await this.grafo.listTabelas(acesso.agentId);
      for (const tabela of todasTabelas) {
        tabelaNomePorId.set(tabela.id, tabela.nome);
      }
    }
    const tabelasPermitidas = new Set(
      consultaPermitida
        ? skillsPublicadas.flatMap((skill) =>
            skill.escopo.tabelas.map((nome) => nome.toLowerCase()),
          )
        : notasComTabela
          ? [...tabelaNomePorId.values()]
              .filter((nome) => allowedByPolicy(nome, policy))
              .map((nome) => nome.toLowerCase())
          : tabelasPolicy.map((tabela) => tabela.nome.toLowerCase()),
    );
    const filtroConhecimentos = {
      consultaPermitida,
      skillIdsPermitidos,
      skillIdsCandidatos,
      tabelasPermitidas,
      tabelaNomePorId,
    };
    const conhecimentos = montarConhecimentos({
      query,
      skills: consultaPermitida
        ? skillsPublicadas
        : [...skillsPublicadas, ...skillsParaTreinoUnidas],
      anotacoes: notas,
      consultas: consultasAprendidas,
      tabelas: consultaPermitida ? tabelas : tabelasPolicy,
      filtro: filtroConhecimentos,
      skillIdsRecuperados,
      anotacaoIdsRecuperados,
      tabelaIdsRecuperados,
      sinonimos,
      ranksPorId,
    });
    const hintAprendidas = hintConsultasAprendidas(query, consultasAprendidas);
    const termosAusentesHint = [
      ...new Set(
        candidatos
          .filter((item) => item.cobertura === "parcial")
          .flatMap((item) => item.termosAusentes),
      ),
    ].slice(0, 3);
    const hintRegra = hintRegraParcial(
      coberturaGeral,
      conhecimentos,
      candidatos.length > 0,
      termosAusentesHint,
      query,
    );
    const consultaSemanticaSugerida = consultaPermitida
      ? esqueletoDaPrimeiraSkillComKpi(skillsCompletas, query)
      : undefined;
    const hintSemantico = consultaSemanticaSugerida
      ? "Prefira consultar_dados.consultaSemantica com metrica/dimensões do esqueleto; SQL livre só se faltar elemento certificado."
      : undefined;
    const hint = [hintAprendidas, hintRegra, hintSemantico].filter(Boolean).join(" ") || undefined;
    const gapCode: GapBusca = skillNaoPublicada
      ? "SKILL_NOT_PUBLISHED"
      : consultaPermitida
        ? "none"
        : "SKILL_GAP";
    const slotNarrativa = conhecimentos.some(
      (item) => TIPOS_NARRATIVA_COM_SKILL.has(item.tipo) && Boolean(item.skillId),
    );
    const telemetria: TelemetriaBusca = {
      conhecimentos: conhecimentos.length,
      slotNarrativa,
      cobertura: coberturaGeral,
      consultaPermitida,
      gap: gapCode,
      listarSkills: precisaListar,
    };
    const camposLog: Record<string, unknown> = { ...telemetria };
    this.logger?.info("buscar_contexto", camposLog);
    if (this.audit) {
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "buscar_contexto",
        sqlEnviado: formatarTagsTelemetriaBusca(telemetria),
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: conhecimentos.length,
        duracaoMs: Date.now() - startedAt,
      });
    }
    return {
      success: true as const,
      consultaPermitida,
      cobertura: coberturaGeral,
      candidatos,
      skillsPublicadas: skillsPublicadas.map(resumoSkill),
      skillsParaTreino: capazesTreino.map(resumoSkill),
      consultasAprendidas: consultasAprendidas.map(resumoConsulta),
      conhecimentos,
      consultaSemanticaSugerida,
      grafoParaTreino: consultaPermitida
        ? undefined
        : {
            tabelas: tabelasPolicy,
            anotacoes: filtrarAnotacoes(notas, filtroConhecimentos),
          },
      fluxoTreino,
      blockingReason: skillNaoPublicada ? "SKILL_NOT_PUBLISHED" : undefined,
      nextAction: skillNaoPublicada ? (fluxoTreino?.proximoPasso ?? "publicar_skill") : undefined,
      gap:
        consultaPermitida || skillNaoPublicada
          ? undefined
          : {
              code: "SKILL_GAP",
              hint: gapHint,
            },
      hint,
    };
  }
}

export class ResolverConflito {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      tabelaId?: string;
      colunaId?: string;
      relacionamentoId?: string;
      descricao?: string;
    },
  ): Promise<{ success: true; fluxoTreino: FluxoTreino }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    await this.grafo.resolverConflito({
      tabelaId: input.tabelaId,
      colunaId: input.colunaId,
      relacionamentoId: input.relacionamentoId,
      origem: "confirmado_usuario",
      descricao: input.descricao,
      autorUsuarioId: uid,
    });
    return {
      success: true,
      fluxoTreino: await fluxoForAgentSkill(this.grafo, acesso.agentId, null),
    };
  }
}

export class ListarConflitos {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string },
  ): Promise<{
    success: true;
    conflitos: readonly ConflitoGrafo[];
    fluxoTreino: FluxoTreino;
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const conflitos = await this.grafo.listConflitos(acesso.agentId);
    return {
      success: true,
      conflitos,
      fluxoTreino: await fluxoForAgentSkill(this.grafo, acesso.agentId, null),
    };
  }
}
