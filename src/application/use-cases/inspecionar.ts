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
import { uniaoEscopos } from "../../domain/entities/escopo.js";
import { fingerprintPares } from "../../domain/entities/relacionamento.js";
import { requireAcesso, refreshAndRequireAcessoAprovado, requireUsuario } from "./shared/guards.js";
import { withHubAuth } from "./shared/hub-auth.js";
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
import { exigirFiltroEscopoPadrao, mesclarParamsEscopo } from "./shared/escopo-filtro.js";
import { expandirStarDoEscopo } from "./shared/expandir-star.js";
import { mascararLinhas, lookupSensibilidadeGrafo } from "./shared/mascarar-linhagem.js";
import { assertPrivacidadeAntesDoHub } from "./shared/assert-privacidade.js";
import { registroOperacoesGlobal } from "./shared/progresso-operacao.js";
import { aplicarDerivaEsquema, assinaturaTabela } from "./shared/schema-drift.js";
import {
  applySelectAliasHints,
  mergeColumnHints,
  normalizeColumnsMetadata,
  type ColumnMetadataHint,
  type ColumnMetadataItem,
} from "./shared/columns-metadata.js";

export const INSPECAO_MAX_ROWS = 100;
export const FINALIDADES_INSPECAO = [
  "validar_tipo",
  "avaliar_nulos",
  "verificar_join",
  "amostra_estrutura",
] as const;
export type FinalidadeInspecao = (typeof FINALIDADES_INSPECAO)[number];

const isFinalidade = (value: string): value is FinalidadeInspecao =>
  (FINALIDADES_INSPECAO as readonly string[]).includes(value);

export class InspecionarConsulta {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly crypto: CryptoPort,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      skillIds?: string[];
      sql?: string;
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
    columnsMetadata?: readonly ColumnMetadataItem[];
    sqlExecutado: string;
    avisos: { code: string; message: string }[];
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
    if (ids.length === 0) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "skillId é obrigatório.",
        hint: "Inspeção no escopo de skill validada, rascunho_revalidacao ou publicada.",
      });
    }
    const skillsInspecao = [];
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
      if (
        found.status !== "publicada" &&
        found.status !== "validada" &&
        found.status !== "rascunho_revalidacao"
      ) {
        throw new DomainError({
          code: ERROR_CODES.SKILL_NOT_PUBLISHED,
          message: "Só skill validada, em revalidação ou publicada pode inspecionar o ERP.",
          hint: "Valide a skill antes. Inspeção não lê rascunho sem envelope.",
        });
      }
      skillsInspecao.push(await persistirEscopoSeVazio(this.skills, found));
    }
    const skill = skillsInspecao[0]!;
    const escopo = uniaoEscopos(
      skillsInspecao.map((item) =>
        item.escopo.tabelas.length > 0
          ? item.escopo
          : escopoFromSqlModelo(parseSqlModelo(item.sqlModelo)),
      ),
    );
    const sqlInformado = input.sql?.trim() ?? "";
    const sqlLivre = sqlInformado.length > 0;
    let sql = (sqlLivre ? sqlInformado : skill.sqlModelo).trim();
    if (acesso.dialeto === "firebird" && sqlLivre) {
      throw new DomainError({
        code: ERROR_CODES.DIALECT_UNSUPPORTED,
        message: "Inspeção com SQL livre não é suportada neste dialeto.",
        hint: "Firebird só consulta exemplo (inspecionar_consulta sem sql).",
      });
    }
    if (acesso.dialeto !== "firebird") {
      sql = expandirStarDoEscopo(sql, acesso.dialeto, escopo);
    }
    let ast: SqlAstSelect | null = null;
    if (acesso.dialeto === "firebird") {
      ast = tryParseSelect(sql);
    } else {
      ast = validarSqlNoEscopo(sql, acesso.dialeto, escopo);
      sql = ast.sql;
    }
    const tabelasSql = ast
      ? ast.tabelas.map((tabela) => tabela.nome)
      : parseSqlModelo(sql).tabelas.map((tabela) => tabela.nome);
    const colunasDasTabelas: Record<string, string[]> = {};
    const columnHints = new Map<string, ColumnMetadataHint>();
    for (const tabelaNome of tabelasSql) {
      const found = await this.grafo.findTabelaByNome(acesso.agentId, tabelaNome);
      if (!found) {
        continue;
      }
      const cols = await this.grafo.listColunas(found.id);
      colunasDasTabelas[tabelaNome] = cols.map((coluna) => coluna.nome);
      mergeColumnHints(columnHints, cols);
    }
    if (ast) {
      applySelectAliasHints(columnHints, ast.colunas);
    }
    exigirFiltroEscopoPadrao({
      sql,
      colunasDasTabelas,
      escopoPadrao: acesso.escopoPadrao,
      dialeto: acesso.dialeto,
    });
    const contrato = skillsInspecao.flatMap((item) => item.params);
    const params = coerceBoundParams(
      bindNamedParams(sql, mesclarParamsEscopo(input.params ?? {}, acesso.escopoPadrao), contrato),
      contrato,
    );
    const timeoutMs = Math.min(input.options?.timeout_ms ?? 15_000, 15_000);
    const clientToken = this.crypto.decrypt(acesso.clientTokenEnc);
    const lookup = await lookupSensibilidadeGrafo(this.grafo, acesso.agentId, tabelasSql);
    if (ast) {
      assertPrivacidadeAntesDoHub({ ast, lookup, negar: ["segredo"] });
    }
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
      const masked = mascararLinhas({
        columns,
        rows: result.rows.slice(0, INSPECAO_MAX_ROWS),
        ast,
        sessaoId: uid,
        lookup,
      });
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "inspecionar_consulta",
        sqlEnviado: `skill:${skill.id};finalidade:${finalidade};cols:${String(columns.length)}`,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: masked.rows.length,
        duracaoMs: Date.now() - started,
      });
      return {
        success: true,
        finalidade,
        columns,
        rows: masked.rows,
        rowCount: masked.rows.length,
        maxRowsApplied: INSPECAO_MAX_ROWS,
        truncated: result.rows.length >= INSPECAO_MAX_ROWS || result.truncated === true,
        colunasMascaradas: masked.colunasMascaradas,
        columnsMetadata: normalizeColumnsMetadata(columns, result.columnsMetadata, columnHints),
        sqlExecutado: sqlParaOdbc(sql),
        avisos: [
          ...(ast ? coletarAvisosValidacao(ast) : []),
          {
            code: "INSPECAO",
            message: "Amostra mascarada, sem cache e sem aprendizado. Não use para KPI.",
          },
        ],
      };
    } catch (error) {
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "inspecionar_consulta",
        sqlEnviado: `skill:${skill.id};finalidade:${finalidade}`,
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
      colunas: colunas.map((coluna) => ({
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
          destino:
            rel.tabelaOrigemId === tabela.id
              ? (nomeById.get(rel.tabelaDestinoId) ?? "")
              : (nomeById.get(rel.tabelaOrigemId) ?? ""),
          pares: [...rel.pares],
          cardinalidade: rel.cardinalidade,
        })),
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
