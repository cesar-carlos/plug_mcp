import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { GrafoRepositoryPort } from "../../domain/ports/grafo-repository.port.js";
import type { QueryResultCachePort } from "../../domain/ports/query-result-cache.port.js";
import type { SkillRepositoryPort } from "../../domain/ports/skill-repository.port.js";
import type {
  PlugServerGatewayPort,
  UsuarioPlugSessionPort,
} from "../../domain/ports/plug-server-gateway.port.js";
import { uniaoEscopos, type EscopoSkill } from "../../domain/entities/escopo.js";
import { fingerprintPares } from "../../domain/entities/relacionamento.js";
import type { Skill, StatusSkill } from "../../domain/entities/skill.js";
import { requireAcesso, refreshAndRequireAcessoAprovado, requireUsuario } from "./shared/guards.js";
import { withHubAuth } from "./shared/hub-auth.js";
import { matchRelacionamentoEscopo } from "./shared/resolver-tipo-join.js";
import {
  bindNamedParams,
  coerceBoundParams,
  parseSqlModelo,
  sqlParaOdbc,
} from "./shared/sql-modelo.js";
import { persistirEscopoSeVazio } from "./shared/persistir-escopo.js";
import { escopoFromSqlModelo } from "./shared/escopo-from-modelo.js";
import { validarSqlNoEscopo, coletarAvisosValidacao } from "./shared/validar-escopo.js";
import { tryParseSelect, type SqlAstSelect } from "./shared/sql-ast.js";
import { mesclarParamsEscopo } from "./shared/escopo-filtro.js";
import { garantirLimiteInspecao, sqlStarDescoberta } from "./shared/expandir-star.js";
import { registroOperacoesGlobal } from "./shared/progresso-operacao.js";
import { aplicarDerivaEsquema, assinaturaTabela } from "./shared/schema-drift.js";
import { isIdentificadorSql } from "./shared/schema-introspection.js";
import {
  applySelectAliasHints,
  mergeColumnHints,
  normalizeColumnsMetadata,
  type ColumnMetadataHint,
  type ColumnMetadataItem,
} from "./shared/columns-metadata.js";
import type { AnexoHandlePort } from "../../domain/ports/anexo-handle.port.js";
import { avisoAnexos, sanitizarLinhasConsulta } from "./shared/sanitizar-linhas-consulta.js";
import { lookupSensibilidadeGrafo } from "./shared/mascarar-linhagem.js";

export const INSPECAO_MAX_ROWS = 100;
export const FINALIDADES_INSPECAO = [
  "validar_tipo",
  "avaliar_nulos",
  "verificar_join",
  "amostra_estrutura",
] as const;
export type FinalidadeInspecao = (typeof FINALIDADES_INSPECAO)[number];

const STATUS_INSPECAO: ReadonlySet<StatusSkill> = new Set([
  "publicada",
  "validada",
  "rascunho_revalidacao",
]);

const isFinalidade = (value: string): value is FinalidadeInspecao =>
  (FINALIDADES_INSPECAO as readonly string[]).includes(value);

const escopoDaSkill = (skill: Skill): EscopoSkill =>
  skill.escopo.tabelas.length > 0
    ? skill.escopo
    : escopoFromSqlModelo(parseSqlModelo(skill.sqlModelo));

const persistirColunasInspecao = async (input: {
  grafo: GrafoRepositoryPort;
  agentId: string;
  autorUsuarioId: string;
  ast: SqlAstSelect | null;
  columns: readonly string[];
  metadata: readonly ColumnMetadataItem[] | undefined;
}): Promise<string[]> => {
  const fisicas = (input.ast?.tabelas ?? []).filter(
    (tabela) => !tabela.isCte && !tabela.isSubquery,
  );
  const unica = fisicas[0];
  if (fisicas.length !== 1 || !unica) {
    return [];
  }
  const byMeta = new Map(
    (input.metadata ?? []).map((item) => [item.name.trim().toLowerCase(), item]),
  );
  const novas: string[] = [];
  await input.grafo.withAgentLock(input.agentId, async () => {
    const merged = await input.grafo.mergeTabela({
      agentId: input.agentId,
      nome: unica.nome,
      origem: "inferido",
      autorUsuarioId: input.autorUsuarioId,
    });
    const jaNoGrafo = await input.grafo.listColunas(merged.tabela.id);
    const conhecidas = new Set(jaNoGrafo.map((coluna) => coluna.nome.trim().toLowerCase()));
    for (const nome of input.columns) {
      const trimmed = nome.trim();
      if (!isIdentificadorSql(trimmed)) {
        continue;
      }
      const meta = byMeta.get(trimmed.toLowerCase());
      await input.grafo.mergeColuna({
        tabelaId: merged.tabela.id,
        nome: trimmed,
        tipo: meta?.type ?? null,
        nullable: meta?.nullable ?? null,
        origem: "inferido",
        autorUsuarioId: input.autorUsuarioId,
      });
      if (!conhecidas.has(trimmed.toLowerCase())) {
        novas.push(trimmed);
        conhecidas.add(trimmed.toLowerCase());
      }
    }
  });
  return novas;
};

export class InspecionarConsulta {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly crypto: CryptoPort,
    private readonly audit: AuditLogPort,
    private readonly extras: { anexos?: AnexoHandlePort } = {},
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      skillIds?: string[];
      sql?: string;
      tabela?: string;
      finalidade?: string;
      params?: Record<string, unknown>;
      options?: { timeout_ms?: number };
    },
  ): Promise<{
    success: true;
    finalidade: FinalidadeInspecao;
    columns: readonly string[];
    rows: readonly Record<string, unknown>[];
    rowCount: number;
    maxRowsApplied: number;
    truncated: boolean;
    colunasMascaradas: readonly string[];
    colunasNovasNoGrafo: readonly string[];
    columnsMetadata?: readonly ColumnMetadataItem[];
    sqlExecutado: string;
    avisos: { code: string; message: string }[];
    hint?: string;
  }> {
    const started = Date.now();
    const uid = requireUsuario(usuarioId);
    const finalidade = (input.finalidade ?? "").trim();
    if (!isFinalidade(finalidade)) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "finalidade é obrigatória.",
        hint: "Use validar_tipo, avaliar_nulos, verificar_join ou amostra_estrutura. Inspeção não serve para KPI.",
      });
    }
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
    const skillsPassadas: Skill[] = [];
    for (const id of ids) {
      const found = await this.skills.findById(id);
      if (found?.agentId !== acesso.agentId) {
        throw new DomainError({
          code: ERROR_CODES.SKILL_NOT_FOUND,
          message: "Skill não encontrada neste agentId.",
          hint: "Use listar_skills.",
        });
      }
      if (found.status === "rascunho") {
        throw new DomainError({
          code: ERROR_CODES.SKILL_NOT_PUBLISHED,
          message: "Skill em rascunho ainda não pode inspecionar o ERP.",
          hint: "Chame validar_skill (envelope vazio) antes. Inspeção aceita validada, rascunho_revalidacao ou publicada.",
        });
      }
      if (!STATUS_INSPECAO.has(found.status)) {
        throw new DomainError({
          code: ERROR_CODES.SKILL_NOT_PUBLISHED,
          message: "Só skill validada, em revalidação ou publicada pode inspecionar o ERP.",
          hint: "Valide a skill antes. Inspeção não lê rascunho sem envelope.",
        });
      }
      skillsPassadas.push(await persistirEscopoSeVazio(this.skills, found));
    }
    const elegiveis = (await this.skills.listByAgent(acesso.agentId)).filter((item) =>
      STATUS_INSPECAO.has(item.status),
    );
    if (elegiveis.length === 0) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_PUBLISHED,
        message: "Não há skill validada, em revalidação ou publicada para inspecionar.",
        hint: "Valide ou publique uma skill, ou passe skillId de uma skill já validada.",
      });
    }
    const escopo = uniaoEscopos(elegiveis.map(escopoDaSkill));
    const sqlInformado = input.sql?.trim() ?? "";
    const tabelaInformada = input.tabela?.trim() ?? "";
    const sqlLivre = sqlInformado.length > 0 || tabelaInformada.length > 0;
    if (acesso.dialeto === "firebird" && sqlLivre) {
      throw DomainError.pacote({
        code: ERROR_CODES.DIALECT_UNSUPPORTED,
        message: "Inspeção com SQL livre não é suportada neste dialeto.",
        hint: "Firebird só consulta exemplo (inspecionar_consulta sem sql). Não reenvie SQL livre neste dialeto.",
      });
    }
    let sql: string;
    if (sqlInformado) {
      sql = sqlInformado;
    } else if (tabelaInformada) {
      sql = sqlStarDescoberta(acesso.dialeto, tabelaInformada, INSPECAO_MAX_ROWS);
    } else {
      const ancora = skillsPassadas[0];
      if (!ancora) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Informe tabela, sql ou skillId.",
          hint: "Descoberta: tabela ou SELECT * cortado. Sem sql, passe skillId para a consulta exemplo.",
        });
      }
      sql = ancora.sqlModelo.trim();
    }
    let ast: SqlAstSelect | null = null;
    if (acesso.dialeto === "firebird") {
      ast = tryParseSelect(sql);
    } else {
      sql = garantirLimiteInspecao(sql, acesso.dialeto, INSPECAO_MAX_ROWS);
      ast = validarSqlNoEscopo(sql, acesso.dialeto, escopo, { modo: "inspecao" });
      sql = ast.sql;
    }
    const tabelasSql = ast
      ? ast.tabelas.map((tabela) => tabela.nome)
      : parseSqlModelo(sql).tabelas.map((tabela) => tabela.nome);
    const columnHints = new Map<string, ColumnMetadataHint>();
    for (const tabelaNome of tabelasSql) {
      const found = await this.grafo.findTabelaByNome(acesso.agentId, tabelaNome);
      if (!found) {
        continue;
      }
      const cols = await this.grafo.listColunas(found.id);
      mergeColumnHints(columnHints, cols);
    }
    if (ast) {
      applySelectAliasHints(columnHints, ast.colunas);
    }
    const contrato = (skillsPassadas.length > 0 ? skillsPassadas : elegiveis).flatMap(
      (item) => item.params,
    );
    const params = coerceBoundParams(
      bindNamedParams(sql, mesclarParamsEscopo(input.params ?? {}, acesso.escopoPadrao), contrato),
      contrato,
    );
    const timeoutMs = Math.min(input.options?.timeout_ms ?? 15_000, 15_000);
    const clientToken = this.crypto.decrypt(acesso.clientTokenEnc);
    const skillAudit = skillsPassadas[0] ?? elegiveis[0]!;
    try {
      const result = await withHubAuth(this.sessions, uid, (accessToken) =>
        this.plug.executeSql({
          accessToken,
          agentId: acesso.agentId,
          clientToken,
          sql: sqlParaOdbc(sql),
          params,
          options: { maxRows: INSPECAO_MAX_ROWS, timeoutMs },
        }),
      );
      const columns =
        result.columns.length > 0
          ? result.columns
          : (result.columnsMetadata?.map((item) => item.name) ?? []);
      const rows = result.rows.slice(0, INSPECAO_MAX_ROWS);
      const columnsMetadata = normalizeColumnsMetadata(
        columns,
        result.columnsMetadata,
        columnHints,
      );
      const columnTypes = new Map<string, string | null>(
        columnsMetadata.map((item) => [item.name.toLowerCase(), item.type]),
      );
      const lookup = await lookupSensibilidadeGrafo(this.grafo, acesso.agentId, tabelasSql);
      const sanitizadas = sanitizarLinhasConsulta({
        rows,
        columnTypes,
        anexos: this.extras.anexos,
        usuarioId: uid,
        acessoId: acesso.id,
        origem: "inspecionar_consulta",
        lookupSensibilidade: (coluna) => lookup(null, coluna),
      });
      const rowsSanitizadas = sanitizadas.rows;
      const avisoAnexo = avisoAnexos(sanitizadas.anexos, "inspecionar_consulta");
      const colunasNovasNoGrafo = await persistirColunasInspecao({
        grafo: this.grafo,
        agentId: acesso.agentId,
        autorUsuarioId: uid,
        ast,
        columns,
        metadata: columnsMetadata,
      });
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "inspecionar_consulta",
        sqlEnviado: `skill:${skillAudit.id};finalidade:${finalidade};cols:${String(columns.length)}`,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: rows.length,
        duracaoMs: Date.now() - started,
      });
      return {
        success: true,
        finalidade,
        columns,
        rows: rowsSanitizadas,
        rowCount: rowsSanitizadas.length,
        maxRowsApplied: INSPECAO_MAX_ROWS,
        truncated: result.rows.length >= INSPECAO_MAX_ROWS || result.truncated === true,
        colunasMascaradas: [],
        colunasNovasNoGrafo,
        columnsMetadata,
        sqlExecutado: sqlParaOdbc(sql),
        avisos: [
          ...(ast ? coletarAvisosValidacao(ast) : []),
          {
            code: "INSPECAO",
            message:
              "Amostra crua, sem cache e sem consulta_aprendida. Não use para KPI. Origem inferido não licencia SQL de negócio.",
          },
          ...(avisoAnexo ? [avisoAnexo] : []),
        ],
        hint:
          colunasNovasNoGrafo.length === 0
            ? undefined
            : (
                  skillsPassadas[0] ??
                  elegiveis.find((item) => item.status === "publicada") ??
                  skillAudit
                ).status === "publicada"
              ? "Colunas novas no grafo (inferido). Para consultar_dados, confirmar_coluna com skillId (skill publicada já consulta)."
              : "Colunas novas no grafo (inferido). Para consultar_dados, confirmar_coluna com skillId e republicar.",
      };
    } catch (error) {
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "inspecionar_consulta",
        sqlEnviado: `skill:${skillAudit.id};finalidade:${finalidade}`,
        sucesso: false,
        codigoErro: error instanceof DomainError ? error.code : ERROR_CODES.PLUG_SERVER_ERROR,
        linhasRetornadas: null,
        duracaoMs: Date.now() - started,
      });
      throw error;
    }
  }
}

export class DescobrirTabela {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly crypto: CryptoPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; tabela?: string },
  ): Promise<{
    success: true;
    tabela: string;
    colunas: {
      nome: string;
      tipo: string | null;
      nullable: boolean | null;
      papel: string | null;
      sensibilidade: string;
      chave: boolean;
    }[];
    relacionamentos: {
      destino: string;
      pares: { colunaOrigem: string; colunaDestino: string }[];
      cardinalidade: string | null;
    }[];
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await refreshAndRequireAcessoAprovado(
      this.acessos,
      this.plug,
      this.sessions,
      await requireAcesso(this.acessos, input.acessoId, uid),
      uid,
    );
    const tabelaNome = input.tabela?.trim() ?? "";
    if (!tabelaNome) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "tabela é obrigatória.",
        hint: "descobrir_tabela lista só estruturas de skills publicadas, sem linhas.",
      });
    }
    const publicadas = (await this.skills.listByAgent(acesso.agentId)).filter(
      (skill) => skill.status === "publicada",
    );
    const noEscopo = publicadas.some((skill) =>
      skill.escopo.tabelas.some((nome) => nome.toLowerCase() === tabelaNome.toLowerCase()),
    );
    if (!noEscopo) {
      throw new DomainError({
        code: ERROR_CODES.TABELA_FORA_DO_ESCOPO,
        message: "Tabela fora das skills publicadas.",
        hint: "No treino use explorar_tabelas/mapear_tabela. Na consulta, só o pacote publicado.",
        source: "mcp",
        stage: "descobrir_tabela",
      });
    }
    const policy = await withHubAuth(this.sessions, uid, (accessToken) =>
      this.plug.getClientTokenPolicy({
        accessToken,
        agentId: acesso.agentId,
        clientToken: this.crypto.decrypt(acesso.clientTokenEnc),
      }),
    );
    if (
      !policy.allTables &&
      !policy.tables.some((item) => item.toLowerCase() === tabelaNome.toLowerCase())
    ) {
      throw new DomainError({
        code: ERROR_CODES.PERMISSION_DENIED,
        message: "O client_token não cobre esta tabela.",
        hint: "Peça um client_token com a tabela no hub.",
      });
    }
    const pacote = uniaoEscopos(
      publicadas
        .filter((skill) =>
          skill.escopo.tabelas.some((nome) => nome.toLowerCase() === tabelaNome.toLowerCase()),
        )
        .map((skill) => skill.escopo),
    );
    const colunasDoPacote = (coluna: string): boolean => {
      const entry = Object.entries(pacote.colunasPorTabela).find(
        ([nome]) => nome.toLowerCase() === tabelaNome.toLowerCase(),
      );
      return (entry?.[1] ?? []).some((item) => item.toLowerCase() === coluna.toLowerCase());
    };
    const tabela = await this.grafo.findTabelaByNome(acesso.agentId, tabelaNome);
    if (!tabela) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Tabela ainda não está no grafo.",
        hint: "Treine com mapear_tabela / treinar_com_sql.",
      });
    }
    const colunas = await this.grafo.listColunas(tabela.id);
    const rels = await this.grafo.listRelacionamentos(acesso.agentId);
    const tabelas = await this.grafo.listTabelas(acesso.agentId);
    const nomeById = new Map(tabelas.map((item) => [item.id, item.nome]));
    return {
      success: true,
      tabela: tabela.nome,
      colunas: colunas
        .filter((coluna) => isIdentificadorSql(coluna.nome) && colunasDoPacote(coluna.nome))
        .map((coluna) => ({
          nome: coluna.nome,
          tipo: coluna.tipo,
          nullable: coluna.nullable,
          papel: coluna.papel,
          sensibilidade: coluna.sensibilidade,
          chave: coluna.papel === "chave",
        })),
      relacionamentos: rels
        .filter((rel) => rel.tabelaOrigemId === tabela.id || rel.tabelaDestinoId === tabela.id)
        .map((rel) => ({
          origemNome: nomeById.get(rel.tabelaOrigemId) ?? "",
          destinoNome: nomeById.get(rel.tabelaDestinoId) ?? "",
          destino:
            rel.tabelaOrigemId === tabela.id
              ? (nomeById.get(rel.tabelaDestinoId) ?? "")
              : (nomeById.get(rel.tabelaOrigemId) ?? ""),
          pares: [...rel.pares],
          cardinalidade: rel.cardinalidade,
        }))
        .filter(
          (rel) =>
            rel.origemNome &&
            rel.destinoNome &&
            matchRelacionamentoEscopo(
              pacote.relacionamentos,
              rel.origemNome,
              rel.destinoNome,
              rel.pares,
            ),
        )
        .map(({ destino, pares, cardinalidade }) => ({ destino, pares, cardinalidade })),
    };
  }
}

export class DetectarDerivaEsquema {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly cache?: QueryResultCachePort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; tabela?: string },
  ): Promise<{
    success: true;
    tabela: string;
    drifted: boolean;
    anterior: string | null;
    skillsAfetadas: { id: string; slug: string; status: string }[];
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const tabelaNome = input.tabela?.trim() ?? "";
    if (!tabelaNome) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "tabela é obrigatória.",
        hint: "Detecta deriva da assinatura mapeada. O servidor não repara schema automaticamente.",
      });
    }
    const tabela = await this.grafo.findTabelaByNome(acesso.agentId, tabelaNome);
    if (!tabela) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Tabela ainda não está no grafo.",
        hint: "Mapeie a tabela antes de comparar a assinatura.",
      });
    }
    const cols = await this.grafo.listColunas(tabela.id);
    const rels = await this.grafo.listRelacionamentos(acesso.agentId);
    const tabelas = await this.grafo.listTabelas(acesso.agentId);
    const nomeById = new Map(tabelas.map((item) => [item.id, item.nome]));
    const assinatura = assinaturaTabela({
      colunas: cols.map((coluna) => ({
        nome: coluna.nome,
        tipo: coluna.tipo,
        nullable: coluna.nullable,
      })),
      relacionamentos: rels
        .filter((rel) => rel.tabelaOrigemId === tabela.id || rel.tabelaDestinoId === tabela.id)
        .map((rel) => ({
          destino:
            rel.tabelaOrigemId === tabela.id
              ? (nomeById.get(rel.tabelaDestinoId) ?? "")
              : (nomeById.get(rel.tabelaOrigemId) ?? ""),
          fingerprint: fingerprintPares(rel.pares),
        })),
    });
    const result = await aplicarDerivaEsquema({
      grafo: this.grafo,
      skills: this.skills,
      cache: this.cache,
      agentId: acesso.agentId,
      tabelaNome: tabela.nome,
      assinatura,
    });
    return {
      success: true,
      tabela: tabela.nome,
      drifted: result.drifted,
      anterior: result.anterior,
      skillsAfetadas: result.skillsAfetadas,
    };
  }
}

export class CancelarOperacao {
  execute(
    usuarioId: string | undefined,
    input: { operacaoId?: string },
  ): Promise<{ success: true; cancelado: boolean }> {
    const uid = requireUsuario(usuarioId);
    const operacaoId = input.operacaoId?.trim() ?? "";
    if (!operacaoId) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "operacaoId é obrigatório.",
        hint: "Use o operacaoId devolvido pelo perfilamento/descoberta.",
      });
    }
    return Promise.resolve({
      success: true,
      cancelado: registroOperacoesGlobal.cancelar(uid, operacaoId),
    });
  }
}
