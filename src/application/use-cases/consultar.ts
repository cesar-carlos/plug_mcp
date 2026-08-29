import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { ConsultaAprendida } from "../../domain/entities/aprendizado.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { AprendizadoRepositoryPort } from "../../domain/ports/aprendizado-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { GrafoRepositoryPort } from "../../domain/ports/grafo-repository.port.js";
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
import type { TabelaGrafo } from "../../domain/entities/grafo.js";
import type { Skill } from "../../domain/entities/skill.js";
import { parseConsultaSemantica } from "../../domain/entities/consulta-semantica.js";
import { compilarConsultaSemantica } from "./shared/compilar-consulta-semantica.js";
import { assertFanoutSeguro } from "./shared/assert-fanout.js";
import { assertPrivacidadeAntesDoHub } from "./shared/assert-privacidade.js";
import { assertOrcamentoConsulta } from "./shared/assert-orcamento.js";
import { avisosKpiDesalinhado } from "./shared/avisos-kpi.js";
import { lookupSensibilidadeGrafo } from "./shared/mascarar-linhagem.js";
import { aplicarDerivaTabelaNoGrafo } from "./shared/schema-drift.js";
import { sincronizarEscopoComGrafo } from "./shared/sincronizar-escopo.js";
import { uniaoEscopos } from "../../domain/entities/escopo.js";
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
} from "./shared/sql-modelo.js";
import { tryParseSelect } from "./shared/sql-ast.js";
import { hintComProximos } from "./shared/sugestoes.js";
import { escopoFromSqlModelo } from "./shared/escopo-from-modelo.js";
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
import { persistirEscopoSeVazio } from "./shared/persistir-escopo.js";
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
import { inferirFormatoColuna, inferirPapelColuna } from "./shared/inferir-papel.js";
import { inferirSensibilidadeColuna } from "../../domain/entities/privacidade.js";

const QUERY_CELL_MAX_CHARS = 2_048;

const PERIODO_NA_PERGUNTA =
  /\b(per[ií]odo|ano|m[eê]s|yoy|versus|compar(ar|ação|acao)|trimestre|semestre)\b/i;

const hintConsultasAprendidas = (
  query: string,
  consultas: readonly ConsultaAprendida[],
): string | undefined => {
  if (consultas.length === 0) {
    return undefined;
  }
  const base =
    "Reutilize estes SQLs em consultasAprendidas (já comprovados neste agentId). Adapte params; não invente tabela, coluna nem JOIN.";
  if (PERIODO_NA_PERGUNTA.test(query)) {
    return `${base} Pergunta de período: reutilize esses SQLs (params de data ou OVER/LAG); não reinventar a comparação.`;
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
  readonly columnsMetadata?: readonly { name: string; type?: string; nullable?: boolean }[];
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
              (item): item is { name: string; type?: string; nullable?: boolean } =>
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
    columnsMetadata?: readonly { name: string; type?: string; nullable?: boolean }[];
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
    const ids = [
      ...new Set(
        [...(input.skillIds ?? []), input.skillId ?? ""]
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    ];
    if (ids.length === 0) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "skillId é obrigatório.",
        hint: "Use buscar_contexto / listar_skills / obter_skill. SQL só no escopo de skill publicada.",
      });
    }
    const skillsPublicadas: Skill[] = [];
    for (const id of ids) {
      const found = await this.skills.findById(id);
      if (found?.agentId !== acesso.agentId) {
        const conhecidas = await this.skills.listByAgent(acesso.agentId);
        throw new DomainError({
          code: ERROR_CODES.SKILL_NOT_FOUND,
          message: "Skill não encontrada neste agentId.",
          hint: hintComProximos(
            "Confira skillId com listar_skills no mesmo acesso.",
            id,
            conhecidas.flatMap((item) => [item.slug, item.id]),
          ),
        });
      }
      if (found.status !== "publicada") {
        throw new DomainError({
          code: ERROR_CODES.SKILL_NOT_PUBLISHED,
          message: "Só skill publicada pode consultar o ERP.",
          hint:
            found.status === "validada"
              ? "Chame publicar_skill antes de consultar_dados."
              : "Valide e publique a skill (validar_skill → publicar_skill).",
        });
      }
      skillsPublicadas.push(found);
    }
    const skillsComEscopo: Skill[] = [];
    for (const published of skillsPublicadas) {
      skillsComEscopo.push(await persistirEscopoSeVazio(this.skills, published));
    }
    const skill = skillsComEscopo[0]!;
    const sqlLivre = input.sql?.trim() ?? "";
    let sqlSemantico: string | null = null;
    let avisoSemantico: { code: string; message: string } | null = null;
    const consultaSemantica = parseConsultaSemantica(input.consultaSemantica);
    if (consultaSemantica) {
      if (this.extras.semanticQueryEnabled === false) {
        throw new DomainError({
          code: ERROR_CODES.FEATURE_DESLIGADA,
          message: "Consulta semântica está desligada.",
          hint: "Use SQL livre validado ou ligue MCP_SEMANTIC_QUERY_ENABLED.",
        });
      }
      if (skillsComEscopo.length !== 1) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Consulta semântica vale para uma skill.",
          hint: "Cruze skills com SQL livre no escopo unido.",
        });
      }
      const compiled = compilarConsultaSemantica(
        consultaSemantica,
        skillsComEscopo[0]!.escopo.tabelas.length > 0
          ? skillsComEscopo[0]!.escopo
          : escopoFromSqlModelo(parseSqlModelo(skillsComEscopo[0]!.sqlModelo)),
        {
          empresa: Boolean(acesso.escopoPadrao?.empresa),
          filial: Boolean(acesso.escopoPadrao?.filial),
        },
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
    if (skillsComEscopo.length > 1 && !sqlLivre) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Cruzar skills exige SQL customizado.",
        hint: "Passe skillIds de todos os domínios e o SELECT no escopo unido. Sem sql só a consulta exemplo da primeira skill rodaria.",
      });
    }
    const contratoParams = unirContratosParams(skillsComEscopo);
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
    let sqlExecutar = skill.sqlModelo;
    let modelo = parseSqlModelo(sqlExecutar);
    const sqlParaValidar = sqlLivre.length > 0 ? sqlLivre : (sqlSemantico ?? "");
    const escopoConsulta = uniaoEscopos(
      skillsComEscopo.map((item) =>
        item.escopo.tabelas.length > 0
          ? item.escopo
          : escopoFromSqlModelo(parseSqlModelo(item.sqlModelo)),
      ),
    );
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
    } else {
      const astModelo = tryParseSelect(sqlExecutar, acesso.dialeto);
      if (astModelo) {
        assertFanoutSeguro(astModelo, escopoConsulta);
      }
    }
    const colunasDasTabelas: Record<string, string[]> = {};
    if (this.extras.grafo) {
      for (const tabela of modelo.tabelas) {
        const found = await this.extras.grafo.findTabelaByNome(acesso.agentId, tabela.nome);
        if (!found) {
          continue;
        }
        const cols = await this.extras.grafo.listColunas(found.id);
        colunasDasTabelas[tabela.nome] = cols.map((coluna) => coluna.nome);
      }
      const astPriv = tryParseSelect(sqlExecutar, acesso.dialeto);
      if (astPriv) {
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
      for (const nota of notas) {
        if (
          (nota.tipo === "regra" || nota.tipo === "metrica") &&
          (!nota.skillId || skillsComEscopo.some((item) => item.id === nota.skillId))
        ) {
          avisos.push({ code: nota.tipo.toUpperCase(), message: `${nota.titulo}: ${nota.texto}` });
        }
      }
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
      politica: skillsComEscopo[0]?.politicaConsulta ?? null,
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
      skillIds: skillsComEscopo.map((item) => item.id),
      skillVersoes: skillsComEscopo.map((item) => item.versao),
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
              extras: this.extras,
              agentId: acesso.agentId,
              skillIds: skillsComEscopo.map((item) => item.id),
              pergunta: perguntaUsada,
              sql: sqlNoFio,
              paramsContrato: contratoParams,
              autorUsuarioId: uid,
              itens: itensAprendizado,
            });
            return {
              success: true,
              skillId: skill.id,
              skillIds: skillsComEscopo.map((item) => item.id),
              columns: parsed.columns,
              rows: parsed.rows,
              rowCount: parsed.rows.length,
              maxRowsApplied: maxRows,
              truncated: parsed.truncated,
              sqlExecutado: sqlNoFio,
              paramsUsados: params,
              asOf: parsed.asOf,
              recorte,
              columnsMetadata: parsed.columnsMetadata,
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
      if (cacheable && this.extras.cache) {
        await this.extras.cache.set(
          cacheKey,
          JSON.stringify({
            columns:
              result.columns.length > 0
                ? result.columns
                : (result.columnsMetadata?.map((item) => item.name) ?? []),
            rows,
            asOf,
            servidoEm: asOf,
            truncated,
            columnsMetadata: result.columnsMetadata,
          }),
          this.extras.cacheTtlMs ?? 60_000,
        );
      }
      const loop = await gravarAprendizadoDaConsulta({
        extras: this.extras,
        agentId: acesso.agentId,
        skillIds: skillsComEscopo.map((item) => item.id),
        pergunta: perguntaUsada,
        sql: sqlNoFio,
        paramsContrato: contratoParams,
        autorUsuarioId: uid,
        itens: itensAprendizado,
      });
      return {
        success: true,
        skillId: skill.id,
        skillIds: skillsComEscopo.map((item) => item.id),
        columns:
          result.columns.length > 0
            ? result.columns
            : (result.columnsMetadata?.map((item) => item.name) ?? []),
        rows,
        rowCount: rows.length,
        maxRowsApplied: maxRows,
        truncated,
        sqlExecutado: sqlNoFio,
        paramsUsados: params,
        asOf,
        recorte,
        columnsMetadata: result.columnsMetadata,
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
    const ids = [
      ...new Set(
        [...(input.skillIds ?? []), input.skillId ?? ""]
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    ];
    const sql = input.sql?.trim() ?? "";
    if (ids.length === 0 || !sql) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "skillId e sql são obrigatórios.",
        hint: "Passe as skills publicadas e o SELECT a validar.",
      });
    }
    const skillsPublicadas: Skill[] = [];
    for (const id of ids) {
      const found = await this.skills.findById(id);
      if (found?.agentId !== acesso.agentId || found.status !== "publicada") {
        throw new DomainError({
          code: ERROR_CODES.SKILL_NOT_PUBLISHED,
          message: "Só skill publicada entra no escopo da validação.",
          hint: "Confira listar_skills.",
        });
      }
      skillsPublicadas.push(found);
    }
    const skillsComEscopo: Skill[] = [];
    for (const published of skillsPublicadas) {
      skillsComEscopo.push(await persistirEscopoSeVazio(this.skills, published));
    }
    const escopo = uniaoEscopos(
      skillsComEscopo.map((item) =>
        item.escopo.tabelas.length > 0
          ? item.escopo
          : escopoFromSqlModelo(parseSqlModelo(item.sqlModelo)),
      ),
    );
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
    }[];
    skillsPublicadas: readonly Skill[];
    skillsParaTreino: readonly Skill[];
    consultasAprendidas: readonly ConsultaAprendida[];
    grafoParaTreino?: { tabelas: readonly TabelaGrafo[]; anotacoes: readonly unknown[] };
    fluxoTreino?: FluxoTreino;
    gap?: { code: "SKILL_GAP"; hint: string };
    blockingReason?: "SKILL_NOT_PUBLISHED";
    nextAction?: string;
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
    const extras: string[] = [];
    const lower = query.toLowerCase();
    for (const item of sinonimos) {
      if (lower.includes(item.termo.toLowerCase())) {
        extras.push(item.alvoId);
      }
    }
    const expanded = extras.length > 0 ? `${query} ${extras.join(" ")}` : query;
    const policy = await withHubAuth(this.sessions, uid, (accessToken) =>
      this.plug.getClientTokenPolicy({
        accessToken,
        agentId: acesso.agentId,
        clientToken: this.crypto.decrypt(acesso.clientTokenEnc),
      }),
    );
    const [tabelas, skillsPublicadas, skillsParaTreino, notas, consultasAprendidas] =
      await Promise.all([
        this.grafo.buscar(acesso.agentId, expanded, 12),
        this.skills.buscar(acesso.agentId, expanded, 8, "publicada"),
        this.skills.buscar(acesso.agentId, expanded, 8, [
          "rascunho",
          "validada",
          "rascunho_revalidacao",
        ]),
        this.anotacoes.buscar(acesso.agentId, expanded, 8),
        this.aprendizado
          ? this.aprendizado.buscarConsultas(acesso.agentId, expanded, 5)
          : Promise.resolve([] as ConsultaAprendida[]),
      ]);
    const tokens = query
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((item) => item.length >= 2);
    const haystack = (skill: Skill): string => {
      const synTermos = sinonimos
        .filter((item) => {
          const alvo = item.alvoId.toLowerCase();
          return (
            item.alvoId === skill.id ||
            alvo === skill.slug.toLowerCase() ||
            skill.nome.toLowerCase().includes(alvo)
          );
        })
        .map((item) => item.termo);
      return `${skill.nome} ${skill.descricao} ${skill.slug} ${skill.sqlModelo} ${synTermos.join(" ")}`.toLowerCase();
    };
    const candidatos = skillsPublicadas.map((skill) => {
      const text = haystack(skill);
      const termosEncontrados = tokens.filter((token) => text.includes(token));
      const cobertura: "completa" | "parcial" | "desconhecida" =
        tokens.length === 0
          ? "desconhecida"
          : termosEncontrados.length === tokens.length
            ? "completa"
            : termosEncontrados.length > 0
              ? "parcial"
              : "desconhecida";
      return {
        skillId: skill.id,
        slug: skill.slug,
        nome: skill.nome,
        cobertura,
        termosEncontrados,
      };
    });
    const coberturaGeral = candidatos.some((item) => item.cobertura === "completa")
      ? "completa"
      : candidatos.some((item) => item.cobertura === "parcial")
        ? "parcial"
        : "desconhecida";
    const consultaPermitida = coberturaGeral === "completa";
    const todas = await this.skills.listByAgent(acesso.agentId);
    const publicadasNoAgent = todas.filter((item) => item.status === "publicada");
    const emAndamento = pickSkillInProgress(skillsParaTreino);
    const fluxoTreino = await fluxoForAgentSkill(this.grafo, acesso.agentId, emAndamento);
    const precisaListar = !consultaPermitida && publicadasNoAgent.length > 0;
    const gapHint = emAndamento
      ? `Há skill em andamento "${emAndamento.nome}" (${emAndamento.status}). Continue o fluxo: ${fluxoTreino.proximoPasso ?? "validar_skill"}. Não chame consultar_dados.`
      : precisaListar
        ? "A busca por termos não prova ausência. Chame listar_skills antes de desistir. Não invente tabela, coluna nem JOIN."
        : "Não há skill publicada capaz (dado ou cruzamento). Não chame consultar_dados. Oriente treinar_com_sql → criar_skill → validar_skill → publicar_skill.";
    const lacunaElegivel = query.trim().length >= 8 && tokens.length >= 2;
    const treinoCobre =
      skillsParaTreino.length > 0 &&
      (Boolean(emAndamento) ||
        skillsParaTreino.some((item) => {
          const text = haystack(item);
          return tokens.some((token) => text.includes(token));
        }));
    const skillNaoPublicada = !consultaPermitida && treinoCobre;
    if (!consultaPermitida && !precisaListar && !skillNaoPublicada && lacunaElegivel && this.aprendizado) {
      await this.aprendizado.registrarLacuna(acesso.agentId, query);
    }
    return {
      success: true as const,
      consultaPermitida,
      cobertura: coberturaGeral,
      candidatos,
      skillsPublicadas,
      skillsParaTreino,
      consultasAprendidas,
      grafoParaTreino: consultaPermitida
        ? undefined
        : {
            tabelas: tabelas.filter((tabela) => allowedByPolicy(tabela.nome, policy)),
            anotacoes: notas,
          },
      fluxoTreino,
      blockingReason: skillNaoPublicada ? "SKILL_NOT_PUBLISHED" : undefined,
      nextAction: skillNaoPublicada ? (fluxoTreino.proximoPasso ?? "publicar_skill") : undefined,
      gap:
        consultaPermitida || skillNaoPublicada
          ? undefined
          : {
              code: "SKILL_GAP",
              hint: gapHint,
            },
      hint: hintConsultasAprendidas(query, consultasAprendidas),
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
