import { capturaSqlSegura, textoSeguro } from "./shared/curadoria-segura.js";
import { assertConsumerAuthorized, currentConsumerAuth } from "../session-context.js";
import { maxSensibilidade, parseSensibilidadeColuna } from "../../domain/entities/privacidade.js";
import type { PreparedQuery } from "./shared/prepared-query.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { ConsultaAprendida } from "../../domain/entities/aprendizado.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { AprendizadoRepositoryPort } from "../../domain/ports/aprendizado-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { AuditMetadata } from "../../domain/entities/audit-log.js";
import type {
  ConflitoGrafo,
  GrafoRepositoryPort,
} from "../../domain/ports/grafo-repository.port.js";
import type { QueryResultCachePort } from "../../domain/ports/query-result-cache.port.js";
import type { QuerySingleflightPort } from "../../domain/ports/query-singleflight.port.js";
import type {
  AnotacaoGrafoRepositoryPort,
  SkillRepositoryPort,
} from "../../domain/ports/skill-repository.port.js";
import type {
  ClientTokenPolicy,
  PlugServerGatewayPort,
  SqlExecuteResult,
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
import type { PlanoConsulta, OrigemConsulta } from "./shared/planejar-consulta.js";
import { montarPlanoConsulta } from "./shared/planejar-consulta.js";
import { avisosKpiDesalinhado } from "./shared/avisos-kpi.js";
import {
  lookupSensibilidadeGrafo,
  mascararLinhas,
  mascararParams,
} from "./shared/mascarar-linhagem.js";
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
  sqlParaOdbc,
  type SqlModelo,
} from "./shared/sql-modelo.js";
import { recusarSqlLivreFirebird, tryParseSelect } from "./shared/sql-ast.js";
import {
  validarSqlNoEscopo,
  coletarAvisosValidacao,
  exigirPaginacaoEstavel,
  assertParPaginacao,
} from "./shared/validar-escopo.js";
import { promoverFatosDaExecucao } from "./shared/promover-fatos.js";
import {
  exigirFiltroEscopoPadrao,
  mesclarParamsEscopo,
  avisosPlaceholderEscopo,
} from "./shared/escopo-filtro.js";
import { queryCacheKey, policyFingerprint, canonicalJson } from "./shared/query-cache-key.js";
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
import type { ItemAprendizadoInput } from "./shared/persistir-aprendizado.js";
import {
  fluxoForAcessoSkill,
  pickSkillInProgress,
  type FluxoTreino,
} from "./shared/fluxo-treino.js";
import {
  coberturaDeSkill,
  tokensCapacidade,
  comporFatiasBusca,
  type FatiaContexto,
} from "./shared/cobertura-skill.js";
import { stemsNegadosNaDescricao } from "../../domain/entities/negacao-cobertura.js";
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
  metricasSemOverlayDasSkills,
  type ConsultaSemanticaSugerida,
  type MetricaSemOverlay,
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
import {
  inferirSensibilidadeColuna,
  type SensibilidadeColuna,
} from "../../domain/entities/privacidade.js";
import {
  applySelectAliasHints,
  mergeColumnHints,
  normalizeColumnsMetadata,
  type ColumnMetadataHint,
  type ColumnMetadataItem,
} from "./shared/columns-metadata.js";
import type { AnexoHandlePort } from "../../domain/ports/anexo-handle.port.js";
import { avisoAnexos, sanitizarLinhasConsulta } from "./shared/sanitizar-linhas-consulta.js";
import { analisarCelulaBinaria } from "./shared/detectar-celula-binaria.js";

const PERIODO_NA_PERGUNTA =
  /\b(per[ií]odo|ano|m[eê]s|yoy|versus|compar(ar|ação|acao)|trimestre|semestre)\b/i;

const HINT_IDS_MAX = 3;

const diaNoFusoDoAcesso = (timezone: string | null | undefined): Date => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone ?? "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const value = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
    return new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00.000Z`);
  } catch {
    return new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  }
};

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
  readonly estado?: string;
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
          hint: "O mesmo :nome tem tipo ou obrigatoriedade diferentes entre as skills do envelope. Recorte skillIds a um domínio, alinhe params nas skills ou use placeholders distintos. Não reenvie o mesmo cruzamento.",
        });
      }
      map.set(param.nome, prev ?? param);
    }
  }
  return [...map.values()];
};

const gravarAprendizadoDaConsulta = async (input: {
  extras: {
    acessos?: AcessoRepositoryPort;
    grafo?: GrafoRepositoryPort;
    aprendizado?: AprendizadoRepositoryPort;
    anotacoes?: AnotacaoGrafoRepositoryPort;
    skills?: SkillRepositoryPort;
  };
  acessoId: string;
  skillIds: readonly string[];
  publicacoes: NonNullable<ConsultaAprendida["publicacoes"]>;
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
  try {
    const access = await input.extras.skills?.findById(input.skillIds[0] ?? "");
    const published = await Promise.all(
      input.skillIds.map((id) => input.extras.skills!.findPublicadaById(id)),
    );
    const dialect = (await input.extras.acessos?.findById(input.acessoId))?.dialeto;
    if (
      !textoSeguro(input.pergunta) ||
      !access ||
      !dialect ||
      !capturaSqlSegura(
        input.sql,
        dialect,
        published.filter((s): s is Skill => s !== null),
      )
    )
      return {
        avisos: [
          {
            code: "APRENDIZADO_IGNORADO",
            message: "Captura omitida: valores concretos ou constantes não aprovadas.",
          },
        ],
      };
    const consulta = await input.extras.aprendizado.salvarConsulta({
      acessoId: input.acessoId,
      skillIds: input.skillIds,
      pergunta: input.pergunta,
      sql: input.sql,
      paramsContrato: input.paramsContrato,
      autorUsuarioId: input.autorUsuarioId,
      status: "candidata",
      publicacoes: input.publicacoes,
    });
    if (input.itens.length) {
      avisos.push({
        code: "APRENDIZADO_PENDENTE",
        message:
          "Conhecimento de negócio exige confirmação explícita por registrar_aprendizado; a execução não o confirma.",
      });
    }
    return {
      gravado: {
        estado: consulta.status,
        consultaId: consulta.id,
        execucoes: consulta.execucoes,
        nova: consulta.execucoes === 1,
        perguntaUsada: consulta.pergunta,
        itens: 0,
      },
      avisos,
    };
  } catch {
    return {
      avisos: [
        {
          code: "APRENDIZADO_IGNORADO",
          message: "A consulta funcionou, mas a captura candidata não pôde ser persistida.",
        },
      ],
    };
  }
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
    throw error.withHint(hintCatalogoSistemaNegado());
  }
  throw error;
};

const origemErroAuditoria = (source: string | undefined): AuditMetadata["errorSource"] =>
  source === "mcp"
    ? "mcp_preflight"
    : source === "sql" ||
        source === "sql_engine" ||
        source === "client_token_rpc" ||
        source === "plug_server_http" ||
        source === "mcp_preflight"
      ? source
      : undefined;

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
      singleflight?: QuerySingleflightPort;
      cacheTtlMs?: number;
      semanticQueryEnabled?: boolean;
      schemaDriftEnabled?: boolean;
      anexos?: AnexoHandlePort;
      timingsSamplePercent?: number;
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
    modo: "consultar_dados" | "validar_consulta" = "consultar_dados",
  ): Promise<{
    consultaExecucaoId?: string;
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
    planoConsulta: PlanoConsulta;
  }> {
    const started = Date.now();
    const uid = requireUsuario(usuarioId);
    const acesso = await refreshAndRequireAcessoAprovado(
      this.acessos,
      this.plug,
      this.sessions,
      await requireAcesso(this.acessos, input.acessoId, uid, {
        skills: this.skills,
        skillId: input.skillId,
        skillIds: input.skillIds,
      }),
      uid,
    );
    const ids = idsSkillDaChamada(input);
    const consultaAprendidaId = input.consultaAprendidaId?.trim() ?? "";
    const sqlInformado = input.sql?.trim() ?? "";
    const consultaSemantica = parseConsultaSemantica(input.consultaSemantica);
    const registrarFalhaPreflight = async (error: unknown, skillIds = ids): Promise<void> => {
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: modo,
        sqlEnviado: `skills:${skillIds.join(",") || "resolucao"}`,
        sucesso: false,
        codigoErro: error instanceof DomainError ? error.code : ERROR_CODES.PLUG_SERVER_ERROR,
        linhasRetornadas: null,
        duracaoMs: Date.now() - started,
        metadata: {
          origem: consultaSemantica ? "semantica" : consultaAprendidaId ? "aprendida" : "sql",
          skillIds,
          cacheHit: false,
          stage: "preflight",
          ...(error instanceof DomainError && error.source
            ? { errorSource: origemErroAuditoria(error.source) }
            : {}),
        },
      });
    };
    const preflight = async <T>(work: () => Promise<T> | T, skillIds = ids): Promise<T> => {
      try {
        return await work();
      } catch (error) {
        await registrarFalhaPreflight(error, skillIds);
        throw error;
      }
    };
    const fontes = [
      sqlInformado.length > 0,
      Boolean(consultaSemantica),
      consultaAprendidaId.length > 0,
    ].filter(Boolean).length;
    if (fontes > 1) {
      const error = new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Use só uma fonte de SQL: sql, consultaSemantica ou consultaAprendidaId.",
        hint: "consultaAprendidaId reusa o SELECT gravado. Não misture com sql nem IR.",
      });
      await registrarFalhaPreflight(error);
      throw error;
    }
    const allowlist = await preflight(() => resolverSkillsConsulta(this.skills, acesso.id, ids));
    let aprendida: ConsultaAprendida | null = null;
    if (consultaAprendidaId) {
      aprendida = await preflight(async () => {
        if (!this.extras.aprendizado) {
          throw new DomainError({
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Consulta aprendida indisponível neste servidor.",
            hint: "Passe sql ou consultaSemantica. Em Postgres o cofre precisa estar ligado.",
          });
        }
        const encontrada = await this.extras.aprendizado.obterConsulta(
          acesso.id,
          consultaAprendidaId,
        );
        if (encontrada?.status !== "confirmada") {
          throw new DomainError({
            code: ERROR_CODES.APRENDIZADO_NAO_CONFIRMADO,
            message: "Consulta aprendida não confirmada ou inativa.",
            hint: "Reuse o id de buscar_contexto em obter_skill.consultasExemplo e consulte de novo.",
          });
        }
        if (
          !encontrada.publicacoes?.length ||
          encontrada.publicacoes.some(
            (origin) =>
              !allowlist.some(
                (pub) =>
                  pub.id === origin.skillId &&
                  pub.publicacaoAtivaId === origin.id &&
                  pub.publicacaoHash === origin.hash,
              ),
          )
        ) {
          throw new DomainError({
            code: ERROR_CODES.APRENDIZADO_NAO_CONFIRMADO,
            message: "Confirmação não corresponde ao pacote vigente.",
            hint: "Revalide e confirme a candidata no pacote atual.",
          });
        }
        return encontrada;
      });
    }
    const sqlLivre = aprendida ? aprendida.sql.trim() : sqlInformado;
    const origemConsulta: OrigemConsulta = consultaSemantica
      ? "semantica"
      : aprendida
        ? "aprendida"
        : sqlLivre.length > 0
          ? "sql"
          : "modelo";
    if (acesso.dialeto === "firebird" && (sqlLivre.length > 0 || Boolean(consultaSemantica))) {
      await preflight(() => recusarSqlLivreFirebird());
    }
    let sqlSemantico: string | null = null;
    let avisoSemantico: { code: string; message: string } | null = null;
    let ancoraSemantica: Skill | null = null;
    if (consultaSemantica) {
      await preflight(() => {
        if (this.extras.semanticQueryEnabled === false) {
          throw new DomainError({
            code: ERROR_CODES.FEATURE_DESLIGADA,
            message: "Consulta semântica está desligada.",
            hint: "Use SQL livre validado ou ligue MCP_SEMANTIC_QUERY_ENABLED.",
          });
        }
        if (
          consultaSemantica.limite != null &&
          (input.options?.page != null || input.options?.page_size != null)
        ) {
          throw new DomainError({
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "consultaSemantica.limite não combina com options.page.",
            hint: "Não misture os dois padrões: use limite (TOP/LIMIT) sem página, ou pagine com ORDER BY + page e page_size sem limite no IR.",
          });
        }
        ancoraSemantica = ancoraConsultaSemantica(
          allowlist,
          aliasesMetricas(consultaSemantica),
          ids,
        );
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
      });
    }
    const perguntaInformada = input.pergunta?.trim() ?? "";
    const perguntaUsada =
      perguntaInformada.length > 0
        ? perguntaInformada
        : modo === "validar_consulta"
          ? "Validação"
          : "";
    if (!perguntaUsada) {
      const error = new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "pergunta é obrigatória.",
        hint: "Envie a pergunta do usuário em consultar_dados. O servidor grava o SQL que funcionou.",
      });
      await registrarFalhaPreflight(error);
      throw error;
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
      const ast = await preflight(() => {
        const parsed = validarSqlNoEscopo(sqlParaValidar, acesso.dialeto, escopoConsulta, {
          page: input.options?.page,
          pageSize: input.options?.page_size,
        });
        assertFanoutSeguro(parsed, escopoConsulta);
        return parsed;
      }, ids);
      avisos.push(...coletarAvisosValidacao(ast));
      sqlExecutar = ast.sql;
      modelo = await preflight(() => parseSqlModelo(sqlParaValidar, acesso.dialeto), ids);
      avisos.push(...avisosKpiDesalinhado(ast, escopoConsulta));
      atribuidas = await preflight(
        () =>
          ancoraSemantica
            ? [ancoraSemantica]
            : atribuirSkillsPorSql(
                allowlist,
                sqlExecutar,
                acesso.dialeto,
                aprendida?.skillIds ?? [],
              ),
        ids,
      );
    } else {
      const ancora = await preflight(() => ancoraSqlModelo(allowlist, ids), ids);
      sqlExecutar = ancora.sqlModelo;
      modelo = await preflight(() => parseSqlModelo(sqlExecutar, acesso.dialeto), ids);
      atribuidas = [ancora];
      await preflight(() => {
        const astModelo = validarSqlNoEscopo(sqlExecutar, acesso.dialeto, escopoConsulta);
        assertFanoutSeguro(astModelo, escopoConsulta);
      }, ids);
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
    const colunasDasTabelas: Record<string, string[]> = Object.fromEntries(
      Object.entries(escopoConsulta.colunasPorTabela).map(([table, columns]) => [
        table,
        [...columns],
      ]),
    );
    const lookupRestricoes = async () => {
      const current = this.extras.grafo
        ? await lookupSensibilidadeGrafo(
            this.extras.grafo,
            acesso.id,
            modelo.tabelas.map((table) => table.nome),
          )
        : () => null;
      const published = atribuidas.flatMap((item) => item.conhecimentoPublicado?.colunas ?? []);
      return (table: string | null, column: string): SensibilidadeColuna | null => {
        const live = current(table, column);
        const frozen = published
          .filter(
            (col) =>
              col.nome.toLowerCase() === column.toLowerCase() &&
              (!table || col.tabela.toLowerCase() === table.toLowerCase()),
          )
          .map((col) => parseSensibilidadeColuna(col.sensibilidade));
        return live !== null || frozen.length
          ? maxSensibilidade([...(live ? [live] : []), ...frozen])
          : null;
      };
    };
    const columnHints = new Map<string, ColumnMetadataHint>();
    let lookupAnexo: ((coluna: string) => SensibilidadeColuna | null) | undefined;
    if (this.extras.grafo) {
      await preflight(async () => {
        for (const tabela of modelo.tabelas) {
          const found = await this.extras.grafo!.findTabelaByNome(acesso.id, tabela.nome);
          if (!found) {
            continue;
          }
          const cols = await this.extras.grafo!.listColunas(acesso.id, found.id);
          colunasDasTabelas[tabela.nome] = cols.map((coluna) => coluna.nome);
          mergeColumnHints(columnHints, cols);
        }
        const astPriv = tryParseSelect(sqlExecutar, acesso.dialeto);
        if (astPriv) {
          applySelectAliasHints(columnHints, astPriv.colunas);
          const lookup = await lookupSensibilidadeGrafo(
            this.extras.grafo!,
            acesso.id,
            astPriv.tabelas.map((item) => item.nome),
          );
          assertPrivacidadeAntesDoHub({ ast: astPriv, lookup, negar: ["segredo", "pessoal"] });
          lookupAnexo = (coluna) => lookup(null, coluna);
        }
      }, ids);
    }
    await preflight(async () => {
      const ast = tryParseSelect(sqlExecutar, acesso.dialeto);
      const lookup = await lookupRestricoes();
      if (ast) assertPrivacidadeAntesDoHub({ ast, lookup, negar: ["pessoal", "segredo"] });
      lookupAnexo = (coluna) => lookup(null, coluna);
    }, ids);
    await preflight(() =>
      exigirFiltroEscopoPadrao({
        sql: sqlExecutar,
        colunasDasTabelas,
        escopoPadrao: acesso.escopoPadrao,
        dialeto: acesso.dialeto,
      }),
    );
    avisos.push(
      ...avisosPlaceholderEscopo({
        sql: sqlExecutar,
        colunasDasTabelas,
        escopoPadrao: acesso.escopoPadrao,
      }),
    );
    if (this.extras.anotacoes) {
      const notas = [
        ...new Map(
          atribuidas
            .flatMap((item) => [
              ...(item.conhecimentoPublicado?.regras ?? []),
              ...(item.conhecimentoPublicado?.metricas ?? []),
            ])
            .map((nota) => [nota.id, nota]),
        ).values(),
      ];
      const diaVigente = diaNoFusoDoAcesso(acesso.timezone).toISOString().slice(0, 10);
      const notasVigentes = notas.filter(
        (nota) =>
          nota.status !== "obsoleta" &&
          (!nota.vigenteDe || nota.vigenteDe <= diaVigente) &&
          (!nota.vigenteAte || nota.vigenteAte >= diaVigente),
      );
      const tabelasSql = new Set(modelo.tabelas.map((tabela) => tabela.nome.toLowerCase()));
      const aliasesSql = [
        ...modelo.tabelas.flatMap((tabela) => (tabela.alias ? [tabela.alias] : [])),
        ...modelo.colunas.map((coluna) => coluna.alias),
      ];
      const skillIds = new Set(atribuidas.map((item) => item.id));
      const tabelaNomePorId = new Map<string, string>();
      if (this.extras.grafo && notas.some((nota) => Boolean(nota.tabelaId))) {
        const todasTabelas = await this.extras.grafo.listTabelas(acesso.id);
        for (const tabela of todasTabelas) {
          tabelaNomePorId.set(tabela.id, tabela.nome);
        }
      }
      avisos.push(
        ...coletarAvisosAnotacaoConsulta({
          notas: notasVigentes,
          skillIds,
          tabelasSql,
          tabelaNomePorId,
          aliasesSql,
        }),
      );
    }
    const mergedParams = mesclarParamsEscopo(input.params ?? {}, acesso.escopoPadrao);
    const expandido = await preflight(() => expandirInListas(sqlExecutar, mergedParams), ids);
    sqlExecutar = expandido.sql;
    const params = await preflight(
      () =>
        coerceBoundParams(
          bindNamedParams(sqlExecutar, expandido.params, contratoParams),
          contratoParams,
        ),
      ids,
    );
    const requested = input.options?.max_rows ?? this.defaultMaxRows;
    const politicaConsulta = politicaMaisRestrita(atribuidas);
    const astOrcamento = tryParseSelect(sqlExecutar, acesso.dialeto);
    const maxRowsSolicitado = Math.min(Math.max(1, requested), this.absoluteMaxRows);
    let orcamento: ReturnType<typeof assertOrcamentoConsulta>;
    try {
      orcamento = assertOrcamentoConsulta({
        ast: astOrcamento,
        politica: politicaConsulta,
        maxRows: maxRowsSolicitado,
        timeoutMs: input.options?.timeout_ms,
      });
    } catch (error) {
      await registrarFalhaPreflight(
        error,
        atribuidas.map((item) => item.id),
      );
      throw error;
    }
    const maxRows = orcamento.maxRows;
    const page = input.options?.page;
    const pageSize = input.options?.page_size;
    await preflight(
      () => assertParPaginacao({ page, pageSize }),
      atribuidas.map((item) => item.id),
    );
    if (pageSize !== undefined && pageSize > maxRows) {
      const error = new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "page_size não pode exceder max_rows.",
        hint: `Use page_size <= ${String(maxRows)}.`,
      });
      await registrarFalhaPreflight(
        error,
        atribuidas.map((item) => item.id),
      );
      throw error;
    }
    const paginar = Boolean(page && pageSize);
    const planoConsulta = montarPlanoConsulta({
      origem: origemConsulta,
      dialeto: acesso.dialeto,
      skillIds: atribuidas.map((item) => item.id),
      tabelas: modelo.tabelas.map((item) => item.nome),
      publicacoes: atribuidas.map((item) => ({
        skillId: item.id,
        id: item.publicacaoAtivaId ?? null,
        hash: item.publicacaoHash ?? null,
      })),
      ast: astOrcamento,
      consultaSemantica,
      politica: politicaConsulta,
      maxRows: orcamento.maxRows,
      maxRowsSolicitado,
      paginacao: { page, pageSize },
    });
    if (paginar && acesso.dialeto === "firebird") {
      const error = DomainError.pacote({
        code: ERROR_CODES.DIALECT_UNSUPPORTED,
        message: "Firebird não pagina via options.page.",
        hint: "Firebird: só consulta exemplo da skill, sem SQL livre nem paginação gerenciada. Não reenvie options.page neste dialeto.",
      });
      await registrarFalhaPreflight(
        error,
        atribuidas.map((item) => item.id),
      );
      throw error;
    }
    const fetchMax = paginar ? maxRows : Math.min(maxRows + 1, this.absoluteMaxRows + 1);
    const clientToken = this.crypto.decrypt(acesso.clientTokenEnc);
    let policy: ClientTokenPolicy;
    try {
      policy = await withHubAuth(this.sessions, uid, (accessToken) =>
        this.plug.getClientTokenPolicy({
          accessToken,
          agentId: acesso.agentId,
          clientToken,
        }),
      );
    } catch (error) {
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "consultar_dados",
        sqlEnviado: `skill:${atribuidas[0]?.id ?? "resolucao"}`,
        sucesso: false,
        codigoErro: error instanceof DomainError ? error.code : ERROR_CODES.PLUG_SERVER_ERROR,
        linhasRetornadas: null,
        duracaoMs: Date.now() - started,
        metadata: {
          origem: origemConsulta,
          skillIds: atribuidas.map((item) => item.id),
          cacheHit: false,
          tabelas: modelo.tabelas.length,
          stage: "hub",
          ...(error instanceof DomainError && origemErroAuditoria(error.source)
            ? { errorSource: origemErroAuditoria(error.source) }
            : {}),
        },
      });
      throw error;
    }
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
    const mascararSaida = async (
      rows: readonly Record<string, unknown>[],
      columns: readonly string[],
    ): Promise<Record<string, unknown>[]> => {
      const lookup = await lookupRestricoes();
      const masked = mascararLinhas({ rows, columns, ast: astLivre, sessaoId: acesso.id, lookup });
      for (const count of astLivre?.colunas.filter(
        (col) =>
          col.isAggregate &&
          /\bCOUNT\s*\(/i.test(col.expr) &&
          !/\b(SUM|AVG|MIN|MAX)\s*\(/i.test(col.expr),
      ) ?? []) {
        const name = count.alias || count.column;
        if (name)
          masked.rows.forEach((row, index) => {
            row[name] = rows[index]?.[name];
          });
      }
      return masked.rows;
    };
    await preflight(() => exigirPaginacaoEstavel(sqlExecutar, astLivre, { page, pageSize }), ids);
    const sqlNoFio = sqlParaOdbc(sqlExecutar);
    const prepared: PreparedQuery = {
      sql: sqlNoFio,
      params,
      acessoId: acesso.id,
      usuarioId: uid,
      publicacoes: planoConsulta.publicacoes ?? [],
      maxRows,
      timeoutMs: orcamento.timeoutMs,
      planoConsulta,
    };
    const assertAutorizacaoAtual = async (): Promise<void> => {
      await assertConsumerAuthorized();
      const local = await this.acessos.findById(acesso.id);
      const current = local
        ? await refreshAndRequireAcessoAprovado(this.acessos, this.plug, this.sessions, local, uid)
        : null;
      if (
        current?.usuarioId !== uid ||
        current.clientTokenHash !== acesso.clientTokenHash ||
        current.tokenHash !== acesso.tokenHash ||
        canonicalJson(current.escopoPadrao) !== canonicalJson(acesso.escopoPadrao) ||
        current.timezone !== acesso.timezone ||
        current.statusAcesso !== "approved"
      ) {
        throw new DomainError({
          code: ERROR_CODES.ACCESS_REVOKED,
          message: "Autorização do acesso mudou durante a operação.",
          hint: "Autentique o acesso novamente.",
        });
      }
      for (const origin of atribuidas) {
        const active = await this.skills.findPublicadaById(origin.id);
        if (
          !active ||
          active.publicacaoAtivaId !== origin.publicacaoAtivaId ||
          active.publicacaoHash !== origin.publicacaoHash
        ) {
          throw new DomainError({
            code: ERROR_CODES.SKILL_NOT_PUBLISHED,
            message: "A publicação usada na consulta mudou.",
            hint: "Prepare a consulta novamente com o pacote vigente.",
          });
        }
      }
      const fresh = await withHubAuth(this.sessions, uid, (accessToken) =>
        this.plug.getClientTokenPolicy({ accessToken, agentId: acesso.agentId, clientToken }),
      );
      if (modelo.tabelas.some((table) => !allowedByPolicy(table.nome, fresh))) {
        throw new DomainError({
          code: ERROR_CODES.PERMISSION_DENIED,
          message: "A policy vigente não autoriza a consulta.",
          hint: "Revise a autorização no hub.",
        });
      }
      if (astLivre) {
        const lookup = await lookupRestricoes();
        assertPrivacidadeAntesDoHub({ ast: astLivre, lookup, negar: ["pessoal", "segredo"] });
      }
      const finalLocal = await this.acessos.findById(acesso.id);
      if (
        finalLocal?.tokenHash !== acesso.tokenHash ||
        finalLocal.clientTokenHash !== acesso.clientTokenHash ||
        finalLocal.statusAcesso !== "approved" ||
        canonicalJson(finalLocal.escopoPadrao) !== canonicalJson(acesso.escopoPadrao)
      )
        throw new DomainError({
          code: ERROR_CODES.ACCESS_REVOKED,
          message: "Autorização local mudou antes da entrega.",
          hint: "Prepare novamente a operação no acesso vigente.",
        });
    };
    if (modelo.tabelas.some((table) => !allowedByPolicy(table.nome, policy))) {
      throw new DomainError({
        code: ERROR_CODES.PERMISSION_DENIED,
        message: "Tabela não autorizada pela policy vigente.",
        hint: "Revise a autorização no hub.",
      });
    }
    if (modo === "validar_consulta") {
      await withHubAuth(this.sessions, uid, (accessToken) =>
        this.plug.executeSql({
          accessToken,
          agentId: acesso.agentId,
          clientToken,
          sql: sqlValidacaoVazia(acesso.dialeto, prepared.sql),
          params: { ...prepared.params },
          options: { maxRows: 1, timeoutMs: prepared.timeoutMs },
        }),
      );
      await assertAutorizacaoAtual();
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: modo,
        sqlEnviado: `skills:${atribuidas.map((item) => item.id).join(",")}`,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: 0,
        duracaoMs: Date.now() - started,
        metadata: { skillIds: atribuidas.map((item) => item.id), stage: "hub", cacheHit: false },
      });
      return {
        success: true,
        skillId: skill.id,
        skillIds: atribuidas.map((item) => item.id),
        columns: [],
        rows: [],
        rowCount: 0,
        maxRowsApplied: maxRows,
        truncated: false,
        sqlExecutado: sqlNoFio,
        paramsUsados: mascararParams(params, inferirSensibilidadeColuna, acesso.id),
        asOf,
        recorte,
        escopoAplicado: {
          empresa: acesso.escopoPadrao?.empresa,
          filial: acesso.escopoPadrao?.filial,
          consolidado: !acesso.escopoPadrao?.empresa && !acesso.escopoPadrao?.filial,
        },
        avisos,
        planoConsulta,
      };
    }
    const cacheable = Boolean(astLivre?.temAgregacao && this.extras.cache && !paginar);
    const cacheKey = queryCacheKey({
      usuarioId: uid,
      acessoId: acesso.id,
      clientTokenHash: acesso.clientTokenHash,
      agentId: acesso.agentId,
      skillIds: atribuidas.map((item) => item.id),
      skillVersoes: atribuidas.map((item) => item.versao),
      publicacoes: planoConsulta.publicacoes,
      sql: sqlNoFio,
      params,
      maxRows,
      timezone: acesso.timezone,
      escopoEmpresa: acesso.escopoPadrao?.empresa,
      escopoFilial: acesso.escopoPadrao?.filial,
      policyFingerprint: policyFingerprint(policy),
    });
    const solicitarTimings =
      (this.extras.timingsSamplePercent ?? 10) > 0 &&
      Math.random() * 100 < (this.extras.timingsSamplePercent ?? 10);
    const responderCache = async (
      parsed: CachedQueryPayload,
      coalescencia?: { role: "leader" | "waiter"; waitMs: number },
    ) => {
      await assertAutorizacaoAtual();
      const loop = await gravarAprendizadoDaConsulta({
        extras: { ...this.extras, skills: this.skills, acessos: this.acessos },
        acessoId: acesso.id,
        skillIds: atribuidas.map((item) => item.id),
        publicacoes: atribuidas.flatMap((item) =>
          item.publicacaoAtivaId && item.publicacaoHash
            ? [{ skillId: item.id, id: item.publicacaoAtivaId, hash: item.publicacaoHash }]
            : [],
        ),
        pergunta: perguntaUsada,
        sql: sqlNoFio,
        paramsContrato: contratoParams,
        autorUsuarioId: uid,
        itens: itensAprendizado,
      });
      const execucaoCache = await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "consultar_dados",
        sqlEnviado: `skill:${skill.id}`,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: parsed.rows.length,
        duracaoMs: Date.now() - started,
        metadata: {
          origem: origemConsulta,
          publicacoes: atribuidas.flatMap((item) =>
            item.publicacaoAtivaId && item.publicacaoHash
              ? [{ skillId: item.id, id: item.publicacaoAtivaId, hash: item.publicacaoHash }]
              : [],
          ),
          skillIds: atribuidas.map((item) => item.id),
          agregado: true,
          cacheHit: true,
          tabelas: modelo.tabelas.length,
          truncated: parsed.truncated,
          maxRows,
          stage: "cache",
          timingsSolicitados: false,
          timingsDevolvidos: false,
          ...(coalescencia
            ? {
                coalescencia: coalescencia.role,
                esperaCoalescenciaMs: coalescencia.waitMs,
              }
            : {}),
        },
      });
      const protectedCacheRows = await mascararSaida(parsed.rows, parsed.columns);
      await assertAutorizacaoAtual();
      return {
        consultaExecucaoId: execucaoCache.id,
        success: true as const,
        skillId: skill.id,
        skillIds: atribuidas.map((item) => item.id),
        columns: parsed.columns,
        rows: protectedCacheRows,
        rowCount: parsed.rows.length,
        maxRowsApplied: maxRows,
        truncated: parsed.truncated,
        sqlExecutado: sqlNoFio,
        paramsUsados: mascararParams(params, inferirSensibilidadeColuna, acesso.id),
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
        planoConsulta,
      };
    };
    const provenienciaAnexo = (name: string) => {
      const selected = astLivre?.colunas.find(
        (column) =>
          ((column.alias.length > 0 ? column.alias : column.column) ?? "").toLowerCase() ===
          name.toLowerCase(),
      );
      if (selected?.refs.length !== 1) {
        return undefined;
      }
      const ref = selected.refs[0]!;
      const table = ref.table
        ? astLivre?.tabelas.find(
            (table) => (table.alias ?? table.nome).toLowerCase() === ref.table?.toLowerCase(),
          )
        : astLivre?.tabelas.length === 1
          ? astLivre.tabelas[0]
          : undefined;
      const origins =
        table && !table.isCte && !table.isSubquery
          ? atribuidas
              .filter((skill) =>
                Object.entries(skill.escopo.colunasPorTabela).some(
                  ([physical, cols]) =>
                    physical.toLowerCase() === table.nome.toLowerCase() &&
                    cols.some((col) => col.toLowerCase() === ref.column.toLowerCase()),
                ),
              )
              .flatMap((skill) =>
                skill.publicacaoAtivaId && skill.publicacaoHash
                  ? [{ skillId: skill.id, id: skill.publicacaoAtivaId, hash: skill.publicacaoHash }]
                  : [],
              )
          : [];
      return table && origins.length
        ? {
            tabela: table.nome,
            coluna: ref.column,
            bearerHash: acesso.tokenHash,
            grantId:
              currentConsumerAuth()?.kind === "oauth"
                ? (currentConsumerAuth() as { grantId: string }).grantId
                : undefined,
            clientTokenHash: acesso.clientTokenHash,
            publicacoes: origins,
          }
        : undefined;
    };
    const salvarResultadoNoCache = async (result: SqlExecuteResult): Promise<void> => {
      if (!cacheable || !this.extras.cache) return;
      const pageRows = result.rows.slice(0, maxRows);
      const columns =
        result.columns.length > 0
          ? result.columns
          : (result.columnsMetadata?.map((item) => item.name) ?? []);
      const columnsMetadata = normalizeColumnsMetadata(
        columns,
        result.columnsMetadata,
        columnHints,
      );
      const columnTypes = new Map<string, string | null>(
        columnsMetadata.map((item) => [item.name.toLowerCase(), item.type]),
      );
      const temAnexo = pageRows.some((row) =>
        Object.entries(row).some(([coluna, valor]) =>
          Boolean(analisarCelulaBinaria(valor, columnTypes.get(coluna.toLowerCase()))),
        ),
      );
      if (temAnexo) return;
      await assertAutorizacaoAtual();
      const sanitizadas = sanitizarLinhasConsulta({
        rows: pageRows,
        columnTypes,
        usuarioId: uid,
        acessoId: acesso.id,
        origem: "consultar_dados",
        proveniencia: provenienciaAnexo,
        lookupSensibilidade: (coluna) =>
          lookupAnexo?.(coluna) ?? inferirSensibilidadeColuna(coluna),
      });
      await this.extras.cache.set(
        cacheKey,
        JSON.stringify({
          columns,
          rows: await mascararSaida(sanitizadas.rows, columns),
          asOf,
          servidoEm: asOf,
          truncated: result.rows.length > maxRows || result.truncated === true,
          columnsMetadata,
        }),
        this.extras.cacheTtlMs ?? 60_000,
      );
    };
    try {
      if (cacheable && this.extras.cache) {
        const cached = await this.extras.cache.get(cacheKey);
        if (cached) {
          const parsed = parseCachedQuery(cached);
          if (parsed) {
            return responderCache(parsed);
          }
        }
      }
      const executeHub = () =>
        withHubAuth(this.sessions, uid, (accessToken) =>
          this.plug.executeSql({
            accessToken,
            agentId: acesso.agentId,
            clientToken,
            sql: prepared.sql,
            params: { ...prepared.params },
            options: {
              maxRows: fetchMax,
              page: paginar ? input.options?.page : undefined,
              pageSize: paginar ? input.options?.page_size : undefined,
              timeoutMs: orcamento.timeoutMs ?? input.options?.timeout_ms,
              requestServerTimings: solicitarTimings,
            },
          }),
        );
      const executeHubOuCache = (): Promise<SqlExecuteResult | CachedQueryPayload> => executeHub();
      const singleflight =
        cacheable && this.extras.singleflight
          ? await this.extras.singleflight.run(cacheKey, executeHubOuCache, {
              onLeaderResult: async (resultado) => {
                if ("asOf" in resultado) return;
                try {
                  await salvarResultadoNoCache(resultado);
                } catch {
                  // Cache é otimização: falhar ao persistir não bloqueia a leitura autorizada.
                }
              },
              readShared: async () => {
                try {
                  const cached = await this.extras.cache?.get(cacheKey);
                  const parsed = cached ? parseCachedQuery(cached) : null;
                  return parsed ?? undefined;
                } catch {
                  return undefined;
                }
              },
              waitMs: Math.max(
                0,
                (orcamento.timeoutMs ?? input.options?.timeout_ms ?? 35_000) -
                  (Date.now() - started),
              ),
            })
          : { value: await executeHubOuCache(), role: "leader" as const, waitMs: 0 };
      if ("asOf" in singleflight.value) {
        return responderCache(singleflight.value, {
          role: singleflight.role,
          waitMs: singleflight.waitMs,
        });
      }
      const result = singleflight.value;
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
      const paginacao =
        paginar && page !== undefined && pageSize !== undefined && result.pagination
          ? {
              page: result.pagination.page,
              pageSize: result.pagination.pageSize,
              hasNextPage: result.pagination.hasNextPage,
              hasPreviousPage: result.pagination.hasPreviousPage,
            }
          : undefined;
      const columns =
        result.columns.length > 0
          ? result.columns
          : (result.columnsMetadata?.map((item) => item.name) ?? []);
      const columnsMetadata = normalizeColumnsMetadata(
        columns,
        result.columnsMetadata,
        columnHints,
      );
      const columnTypes = new Map<string, string | null>(
        columnsMetadata.map((item) => [item.name.toLowerCase(), item.type]),
      );
      await assertAutorizacaoAtual();
      const sanitizadas = sanitizarLinhasConsulta({
        rows: pageRows,
        columnTypes,
        anexos: this.extras.anexos,
        usuarioId: uid,
        acessoId: acesso.id,
        origem: "consultar_dados",
        proveniencia: provenienciaAnexo,
        lookupSensibilidade: (coluna) =>
          lookupAnexo?.(coluna) ?? inferirSensibilidadeColuna(coluna),
      });
      const rows = await mascararSaida(sanitizadas.rows, columns);
      const avisoAnexo = avisoAnexos(sanitizadas.anexos, "consultar_dados");
      const execucao = await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "consultar_dados",
        sqlEnviado: `skill:${skill.id}`,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: rows.length,
        duracaoMs: Date.now() - started,
        metadata: {
          origem: origemConsulta,
          publicacoes: atribuidas.flatMap((item) =>
            item.publicacaoAtivaId && item.publicacaoHash
              ? [{ skillId: item.id, id: item.publicacaoAtivaId, hash: item.publicacaoHash }]
              : [],
          ),
          skillIds: atribuidas.map((item) => item.id),
          agregado: Boolean(astLivre?.temAgregacao),
          cacheHit: false,
          coalescencia: singleflight.role,
          esperaCoalescenciaMs: singleflight.waitMs,
          tabelas: modelo.tabelas.length,
          truncated,
          paginada: Boolean(paginacao),
          maxRows,
          stage: "hub",
          timingsSolicitados: solicitarTimings,
          timingsDevolvidos: Boolean(result.serverTimings),
          ...(result.serverTimings ? { timings: result.serverTimings } : {}),
          ...(result.sqlHandlingMode ? { sqlHandlingMode: result.sqlHandlingMode } : {}),
          ...(result.maxRowsHandling ? { maxRowsHandling: result.maxRowsHandling } : {}),
          ...(result.effectiveMaxRows != null ? { effectiveMaxRows: result.effectiveMaxRows } : {}),
        },
      });
      if (this.extras.grafo) {
        await promoverFatosDaExecucao({
          grafo: this.extras.grafo,
          acessoId: acesso.id,
          autorUsuarioId: uid,
          modelo,
        });
      }
      if (consultaSemantica && !skill.consultaSemantica) {
        await this.skills.update(skill.id, { consultaSemantica });
      }
      if (cacheable && this.extras.cache && !this.extras.singleflight && sanitizadas.anexos === 0) {
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
        extras: { ...this.extras, skills: this.skills, acessos: this.acessos },
        acessoId: acesso.id,
        skillIds: atribuidas.map((item) => item.id),
        publicacoes: atribuidas.flatMap((item) =>
          item.publicacaoAtivaId && item.publicacaoHash
            ? [{ skillId: item.id, id: item.publicacaoAtivaId, hash: item.publicacaoHash }]
            : [],
        ),
        pergunta: perguntaUsada,
        sql: sqlNoFio,
        paramsContrato: contratoParams,
        autorUsuarioId: uid,
        itens: itensAprendizado,
      });
      await assertAutorizacaoAtual();
      return {
        consultaExecucaoId: execucao.id,
        success: true,
        skillId: skill.id,
        skillIds: atribuidas.map((item) => item.id),
        columns,
        rows,
        rowCount: rows.length,
        maxRowsApplied: maxRows,
        truncated,
        sqlExecutado: sqlNoFio,
        paramsUsados: mascararParams(params, inferirSensibilidadeColuna, acesso.id),
        asOf,
        recorte,
        columnsMetadata,
        escopoAplicado: {
          empresa: acesso.escopoPadrao?.empresa,
          filial: acesso.escopoPadrao?.filial,
          consolidado: !acesso.escopoPadrao?.empresa && !acesso.escopoPadrao?.filial,
        },
        avisos: [...avisos, ...(avisoAnexo ? [avisoAnexo] : []), ...loop.avisos],
        aprendizadoGravado: loop.gravado,
        paginacao,
        hint: paginacao?.hasNextPage
          ? "Há próxima página. Incremente options.page com o mesmo ORDER BY e page_size."
          : truncated
            ? "Resultado possivelmente incompleto (atingiu max_rows). Agregue no SQL ou pagine com ORDER BY."
            : loop.gravado
              ? "SQL gravado. Se o usuário ensinou regra, dicionário ou sinônimo, envie em aprendizado[] ou chame registrar_aprendizado."
              : undefined,
        planoConsulta,
      };
    } catch (error) {
      if (cacheable && this.extras.cache) {
        try {
          await this.extras.cache.deleteByPrefix(cacheKey);
        } catch {
          // A remoção de otimização não pode esconder o erro original da consulta.
        }
      }
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "consultar_dados",
        sqlEnviado: `skill:${skill.id}`,
        sucesso: false,
        codigoErro: error instanceof DomainError ? error.code : ERROR_CODES.PLUG_SERVER_ERROR,
        linhasRetornadas: null,
        duracaoMs: Date.now() - started,
        metadata: {
          origem: origemConsulta,
          skillIds: atribuidas.map((item) => item.id),
          agregado: Boolean(astLivre?.temAgregacao),
          cacheHit: false,
          tabelas: modelo.tabelas.length,
          maxRows,
          stage: "hub",
          timingsSolicitados: solicitarTimings,
          timingsDevolvidos: false,
          ...(error instanceof DomainError && origemErroAuditoria(error.source)
            ? { errorSource: origemErroAuditoria(error.source) }
            : {}),
        },
      });
      if (error instanceof DomainError && isSqlClassificationDenial(error)) {
        throw error.withHint(
          `${hintSqlNaoClassificavel(modelo.tabelas.map((tabela) => tabela.nome))} Não persista este SQL.`,
        );
      }
      throw error;
    }
  }
}

export class ValidarConsulta {
  private readonly consultar: ConsultarDados;
  constructor(
    acessos: AcessoRepositoryPort,
    skills: SkillRepositoryPort,
    plug: PlugServerGatewayPort,
    sessions: UsuarioPlugSessionPort,
    crypto: CryptoPort,
    options: {
      defaultMaxRows?: number;
      absoluteMaxRows?: number;
      grafo?: GrafoRepositoryPort;
      audit?: AuditLogPort;
      timingsSamplePercent?: number;
      aprendizado?: AprendizadoRepositoryPort;
    } = {},
  ) {
    const audit: AuditLogPort = options.audit ?? {
      append: (entry) => Promise.resolve({ ...entry, id: "unpersisted", createdAt: new Date() }),
      listByUsuario: () => Promise.resolve([]),
      listByAcesso: () => Promise.resolve([]),
      purgeOlderThan: () => Promise.resolve(0),
    };
    this.consultar = new ConsultarDados(
      acessos,
      skills,
      plug,
      sessions,
      crypto,
      audit,
      options.defaultMaxRows ?? 500,
      options.absoluteMaxRows ?? 5000,
      options,
    );
  }
  async execute(
    usuarioId: string | undefined,
    input: Parameters<ConsultarDados["execute"]>[1],
  ): Promise<{
    success: true;
    valido: true;
    dialeto: string;
    tabelas: string[];
    avisos: { code: string; message: string }[];
    planoConsulta: PlanoConsulta;
  }> {
    const result = await this.consultar.execute(usuarioId, input, "validar_consulta");
    return {
      success: true,
      valido: true,
      dialeto: result.planoConsulta.dialeto,
      tabelas: [...result.planoConsulta.tabelas],
      avisos: result.avisos,
      planoConsulta: result.planoConsulta,
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
        // Keep legacy field as a safe operation tag; never persist catalog SQL.
        sqlEnviado: `catalogo;dialeto:${acesso.dialeto}`,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: tabelas.length,
        duracaoMs: 0,
        metadata: {
          origem: "sql",
          cacheHit: false,
          tabelas: 1,
          truncated: tabelas.length >= EXPLORAR_TABELAS_MAX_ROWS,
          maxRows: EXPLORAR_TABELAS_MAX_ROWS,
          stage: "hub",
        },
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
      await this.grafo.withAcessoLock(acesso.id, async () => {
        const locked = await this.grafo.getDialeto(acesso.id);
        if (!locked) {
          await this.grafo.setDialeto(acesso.id, acesso.dialeto);
        } else if (locked.dialeto !== acesso.dialeto) {
          throw new DomainError({
            code: ERROR_CODES.DIALECT_CONFLICT,
            message: "Este acesso já foi treinado em outro dialeto.",
            hint: `Grafo travado em ${locked.dialeto}. Chame atualizar_dialeto com confirmadoPeloUsuario: true para mudar o dialeto (skills voltam a rascunho).`,
          });
        }
        const tabela = await this.grafo.mergeTabela({
          acessoId: acesso.id,
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
            acessoId: acesso.id,
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
        await sincronizarEscopoComGrafo(this.extras.skills, this.grafo, acesso.id, {
          tabelas: [ident.tabela],
        });
      }
      if (this.extras.schemaDriftEnabled !== false && this.extras.skills) {
        const deriva = await aplicarDerivaTabelaNoGrafo({
          grafo: this.grafo,
          skills: this.extras.skills,
          cache: this.extras.cache,
          acessoId: acesso.id,
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
    cobertura: "completa" | "parcial" | "desconhecida" | "composta";
    candidatos: {
      skillId: string;
      slug: string;
      nome: string;
      cobertura: "completa" | "parcial" | "desconhecida";
      termosEncontrados: string[];
      termosAusentes: string[];
    }[];
    fatias?: readonly FatiaContexto[];
    skillsPublicadas: readonly SkillResumoContexto[];
    skillsParaTreino: readonly SkillResumoContexto[];
    consultasAprendidas: readonly ConsultaAprendidaResumo[];
    conhecimentos: readonly HitConhecimento[];
    consultaSemanticaSugerida?: ConsultaSemanticaSugerida;
    metricasSemOverlay?: readonly MetricaSemOverlay[];
    grafoParaTreino?: { tabelas: readonly TabelaGrafo[]; anotacoes: readonly unknown[] };
    fluxoTreino?: FluxoTreino;
    gap?: { code: "SKILL_GAP"; hint: string; termosAusentes?: readonly string[] };
    blockingReason?: "SKILL_NOT_PUBLISHED";
    nextAction?: string;
    hint?: string;
    diagnosticoCobertura: {
      status: "executavel" | "composicao" | "treino_pendente" | "lacuna_parcial" | "lacuna_total";
      skillsRelacionadas: readonly {
        skillId: string;
        slug: string;
        status: StatusSkill;
      }[];
      termosAusentes: readonly string[];
      proximaAcao: string | null;
      necessidades: readonly {
        kind: "capacidade" | "publicacao" | "pacote" | "composicao" | "metrica";
        alvo: string;
        bloqueante: boolean;
        nextAction: string;
        skillId?: string;
        termos?: readonly string[];
      }[];
      planoTreino: readonly { ordem: number; tool: string; motivo: string; skillId?: string }[];
    };
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
    const sinonimos = this.aprendizado ? await this.aprendizado.listarSinonimos(acesso.id) : [];
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
      this.grafo.buscar(acesso.id, query, 12),
      this.skills.buscarPublicadas(acesso.id, query, 8),
      this.skills.buscar(acesso.id, query, 8, ["rascunho", "validada", "rascunho_revalidacao"]),
      this.anotacoes.buscar(acesso.id, query, 8, {
        ativasEm: diaNoFusoDoAcesso(acesso.timezone),
      }),
      this.aprendizado
        ? this.aprendizado.buscarConsultas(acesso.id, query, 5)
        : Promise.resolve([]),
      Promise.all([
        this.skills.listByAcesso(acesso.id),
        this.skills.listPublicadas(acesso.id),
      ]).then(([drafts, active]) => [
        ...active,
        ...drafts.filter((draft) => !active.some((pub) => pub.id === draft.id)),
      ]),
    ]);
    const tabelas = tabelasHits.map((hit) => hit.item);
    const notas = notasHits.map((hit) => hit.item);
    const consultasAprendidas = consultasHits
      .map((hit) => hit.item)
      .filter(
        (item) =>
          item.status === "confirmada" &&
          Boolean(item.publicacoes?.length) &&
          item.publicacoes!.every((origin) =>
            todas.some(
              (skill) =>
                skill.id === origin.skillId &&
                skill.publicacaoAtivaId === origin.id &&
                skill.publicacaoHash === origin.hash,
            ),
          ),
      )
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
    const consultasPorSkill = new Map<string, string[]>();
    for (const consulta of consultasAprendidas) {
      for (const skillId of consulta.skillIds) {
        const lista = consultasPorSkill.get(skillId) ?? [];
        lista.push(consulta.id);
        consultasPorSkill.set(skillId, lista);
      }
    }
    const publicadasNoAgent = todas.filter((item) => item.status === "publicada");
    const composicao = comporFatiasBusca(publicadasNoAgent, query, sinonimos, consultasPorSkill);
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
    const coberturaGeral = composicao.cobertura;
    const consultaPermitida = composicao.consultaPermitida;
    const capazesTreino = skillsParaTreinoUnidas.filter(
      (item) => coberturaDeSkill(item, query, sinonimos).cobertura === "completa",
    );
    const idsFatias = new Set(composicao.fatias.map((item) => item.skillId));
    const skillsCompletas = publicadasNoAgent.filter((skill) =>
      composicao.fatias.some(
        (fatia) => fatia.skillId === skill.id && fatia.cobertura === "completa",
      ),
    );
    const skillsFatias = publicadasNoAgent.filter((skill) => idsFatias.has(skill.id));
    const skillsParaEsqueleto = skillsCompletas.length > 0 ? skillsCompletas : skillsFatias;
    const emAndamento = pickSkillInProgress(capazesTreino);
    const skillFluxo =
      coberturaGeral === "completa"
        ? (skillsCompletas[0] ?? null)
        : coberturaGeral === "composta"
          ? null
          : emAndamento;
    const fluxoTreino = skillFluxo
      ? await fluxoForAcessoSkill(this.grafo, acesso.id, skillFluxo)
      : undefined;
    const precisaListar =
      !consultaPermitida && coberturaGeral !== "composta" && publicadasNoAgent.length > 0;
    const hintCruzamento = perguntaPareceCruzamento(query) ? ` ${HINT_SKILL_GAP_CRUZAMENTO}` : "";
    const gapHintComposta =
      composicao.termosSemSkill.length > 0
        ? `Eixos sem skill (${composicao.termosSemSkill.slice(0, 6).join(", ")}): SKILL_GAP só desses termos. Orquestre consultar_dados por fatia; não cruze skills num SELECT. Não invente JOIN.`
        : "Orquestre consultar_dados por fatia (skillIds de cada fatia). Não cruze skills num SELECT só. Não invente JOIN.";
    const gapHint = emAndamento
      ? `Há skill em andamento "${emAndamento.nome}" (${emAndamento.status}). Continue o fluxo: ${fluxoTreino?.proximoPasso ?? "validar_skill"}. Não chame consultar_dados.`
      : coberturaGeral === "composta"
        ? gapHintComposta
        : precisaListar
          ? `A busca por termos não prova ausência. Chame listar_skills antes de desistir.${hintCruzamento} Não invente tabela, coluna nem JOIN.`
          : "Não há skill publicada capaz (dado ou cruzamento). Não chame consultar_dados. Oriente treinar_com_sql → criar_skill → validar_skill → publicar_skill.";
    const lacunaElegivel = query.trim().length >= 8 && tokens.length >= 1;
    const skillNaoPublicada = !consultaPermitida && capazesTreino.length > 0;
    if (this.aprendizado) {
      if (consultaPermitida || skillNaoPublicada) {
        await this.aprendizado.arquivarLacunaSkillGap(acesso.id, query);
      } else if (!precisaListar && lacunaElegivel) {
        await this.aprendizado.registrarLacuna(acesso.id, query);
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
      const todasTabelas = await this.grafo.listTabelas(acesso.id);
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
    const stemsNegados = new Set(
      publicadasNoAgent.flatMap((skill) => [...stemsNegadosNaDescricao(skill.descricao)]),
    );
    const omitirSinonimoPorNegacao = termosAusentesHint.some((termo) => stemsNegados.has(termo));
    const hintRegra =
      coberturaGeral === "composta"
        ? undefined
        : hintRegraParcial(
            coberturaGeral,
            conhecimentos,
            candidatos.length > 0,
            termosAusentesHint,
            query,
            omitirSinonimoPorNegacao,
          );
    const consultaSemanticaSugerida = consultaPermitida
      ? esqueletoDaPrimeiraSkillComKpi(skillsParaEsqueleto, query)
      : undefined;
    const metricasSemOverlay = consultaPermitida
      ? metricasSemOverlayDasSkills(skillsParaEsqueleto)
      : [];
    const hintComposta =
      coberturaGeral === "composta"
        ? "Cobertura composta: chame consultar_dados por fatia (não um SELECT cruzado). Não cruze skills. Não invente JOIN entre skills."
        : undefined;
    const hintSemantico = consultaSemanticaSugerida
      ? consultaSemanticaSugerida.modo === "listagem"
        ? "Listagem certificada: consultaSemanticaSugerida traz dimensões/filtros (sem métrica de soma). Não invente definicao de KPI. SQL livre se faltar elemento certificado."
        : "Prefira consultar_dados.consultaSemantica com metrica/dimensões do esqueleto; SQL livre só se faltar elemento certificado."
      : undefined;
    const hintOverlay =
      metricasSemOverlay.length > 0 && !consultaSemanticaSugerida
        ? "Medida no pacote sem overlay (metricasSemOverlay): não invente definicao; overlay só com atualizar_skill / registrar_aprendizado tipo=metrica confirmado."
        : undefined;
    const hint =
      [hintAprendidas, hintComposta, hintRegra, hintSemantico, hintOverlay]
        .filter(Boolean)
        .join(" ") || undefined;
    const necessidadesDiagnostico: {
      kind: "capacidade" | "publicacao" | "pacote" | "composicao" | "metrica";
      alvo: string;
      bloqueante: boolean;
      nextAction: string;
      skillId?: string;
      termos?: readonly string[];
    }[] = [];
    if (coberturaGeral === "composta") {
      necessidadesDiagnostico.push({
        kind: "composicao",
        alvo: "fatias certificadas",
        bloqueante: false,
        nextAction: "consultar_dados",
        termos: composicao.termosSemSkill,
      });
    }
    if (skillNaoPublicada && emAndamento) {
      necessidadesDiagnostico.push({
        kind: "publicacao",
        alvo: emAndamento.nome,
        bloqueante: true,
        nextAction: fluxoTreino?.proximoPasso ?? "publicar_skill",
        skillId: emAndamento.id,
      });
    }
    const termosSemSkill =
      coberturaGeral === "composta"
        ? composicao.termosSemSkill
        : [...new Set(candidatos.flatMap((item) => item.termosAusentes))];
    if (!consultaPermitida && termosSemSkill.length > 0) {
      necessidadesDiagnostico.push({
        kind: "capacidade",
        alvo: "capacidade ainda não certificada",
        bloqueante: true,
        nextAction: emAndamento
          ? (fluxoTreino?.proximoPasso ?? "validar_skill")
          : "treinar_com_sql",
        termos: termosSemSkill,
        ...(emAndamento ? { skillId: emAndamento.id } : {}),
      });
    }
    if (emAndamento && fluxoTreino?.proximoPasso && !skillNaoPublicada) {
      necessidadesDiagnostico.push({
        kind: "pacote",
        alvo: emAndamento.nome,
        bloqueante: true,
        nextAction: fluxoTreino.proximoPasso,
        skillId: emAndamento.id,
      });
    }
    for (const metrica of metricasSemOverlay) {
      necessidadesDiagnostico.push({
        kind: "metrica",
        alvo: metrica.alias,
        bloqueante: false,
        nextAction: metrica.nextAction,
        skillId: metrica.skillId,
      });
    }
    const statusDiagnostico:
      "executavel" | "composicao" | "treino_pendente" | "lacuna_parcial" | "lacuna_total" =
      consultaPermitida
        ? coberturaGeral === "composta"
          ? "composicao"
          : "executavel"
        : skillNaoPublicada
          ? "treino_pendente"
          : candidatos.some((item) => item.cobertura === "parcial")
            ? "lacuna_parcial"
            : "lacuna_total";
    const diagnosticoCobertura = {
      status: statusDiagnostico,
      skillsRelacionadas: [
        ...new Map(
          [...skillsPublicadas, ...skillsParaTreinoUnidas].map((skill) => [
            skill.id,
            { skillId: skill.id, slug: skill.slug, status: skill.status },
          ]),
        ).values(),
      ],
      termosAusentes: termosSemSkill,
      proximaAcao: necessidadesDiagnostico[0]?.nextAction ?? null,
      necessidades: necessidadesDiagnostico,
      planoTreino: necessidadesDiagnostico
        .filter((item) => item.bloqueante)
        .map((item, index) => ({
          ordem: index + 1,
          tool: item.nextAction,
          motivo: item.alvo,
          ...(item.skillId ? { skillId: item.skillId } : {}),
        })),
    };
    const gapCode: GapBusca = skillNaoPublicada
      ? "SKILL_NOT_PUBLISHED"
      : consultaPermitida &&
          (coberturaGeral !== "composta" || composicao.termosSemSkill.length === 0)
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
      ...(coberturaGeral === "composta" ? { fatias: composicao.fatias } : {}),
      skillsPublicadas: skillsPublicadas.map(resumoSkill),
      skillsParaTreino: capazesTreino.map(resumoSkill),
      consultasAprendidas: consultasAprendidas.map(resumoConsulta),
      conhecimentos,
      consultaSemanticaSugerida,
      ...(metricasSemOverlay.length > 0 ? { metricasSemOverlay } : {}),
      grafoParaTreino: consultaPermitida
        ? undefined
        : {
            tabelas: tabelasPolicy,
            anotacoes: filtrarAnotacoes(notas, filtroConhecimentos),
          },
      fluxoTreino,
      blockingReason: skillNaoPublicada ? "SKILL_NOT_PUBLISHED" : undefined,
      nextAction: skillNaoPublicada ? (fluxoTreino?.proximoPasso ?? "publicar_skill") : undefined,
      gap: skillNaoPublicada
        ? undefined
        : coberturaGeral === "composta" && composicao.termosSemSkill.length > 0
          ? {
              code: "SKILL_GAP" as const,
              hint: gapHintComposta,
              termosAusentes: composicao.termosSemSkill,
            }
          : consultaPermitida
            ? undefined
            : {
                code: "SKILL_GAP" as const,
                hint: gapHint,
              },
      hint,
      diagnosticoCobertura,
    };
  }
}

const conflitoForaDesteAcesso = (): DomainError =>
  new DomainError({
    code: ERROR_CODES.VALIDATION_ERROR,
    message: "Conflito não encontrado neste acesso.",
    hint: "Use listar_conflitos no mesmo acessoId. Ids de outro catálogo não se aplicam.",
  });

const assertConflitoPertenceAoAcesso = async (
  grafo: GrafoRepositoryPort,
  acessoId: string,
  input: { tabelaId?: string; colunaId?: string; relacionamentoId?: string },
): Promise<void> => {
  const tabelaId = input.tabelaId?.trim() ?? "";
  const colunaId = input.colunaId?.trim() ?? "";
  const relacionamentoId = input.relacionamentoId?.trim() ?? "";
  if (!tabelaId && !colunaId && !relacionamentoId) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Informe tabelaId, colunaId ou relacionamentoId.",
      hint: "Chame listar_conflitos neste acesso e passe um dos ids.",
    });
  }
  const tabelas = await grafo.listTabelas(acessoId);
  const idsTabela = new Set(tabelas.map((item) => item.id));
  if (tabelaId && !idsTabela.has(tabelaId)) {
    throw conflitoForaDesteAcesso();
  }
  if (relacionamentoId) {
    const rels = await grafo.listRelacionamentos(acessoId);
    if (!rels.some((item) => item.id === relacionamentoId)) {
      throw conflitoForaDesteAcesso();
    }
  }
  if (colunaId) {
    let encontrada = false;
    for (const tabela of tabelas) {
      const colunas = await grafo.listColunas(acessoId, tabela.id);
      if (colunas.some((item) => item.id === colunaId)) {
        encontrada = true;
        break;
      }
    }
    if (!encontrada) {
      throw conflitoForaDesteAcesso();
    }
  }
};

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
    await assertConflitoPertenceAoAcesso(this.grafo, acesso.id, input);
    await this.grafo.resolverConflito({
      acessoId: acesso.id,
      tabelaId: input.tabelaId,
      colunaId: input.colunaId,
      relacionamentoId: input.relacionamentoId,
      origem: "confirmado_usuario",
      descricao: input.descricao,
      autorUsuarioId: uid,
    });
    return {
      success: true,
      fluxoTreino: await fluxoForAcessoSkill(this.grafo, acesso.id, null),
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
    const conflitos = await this.grafo.listConflitos(acesso.id);
    return {
      success: true,
      conflitos,
      fluxoTreino: await fluxoForAcessoSkill(this.grafo, acesso.id, null),
    };
  }
}
