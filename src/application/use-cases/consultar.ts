import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { GrafoRepositoryPort } from "../../domain/ports/grafo-repository.port.js";
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
import { requireAcesso, requireAcessoAprovado, requireUsuario } from "./shared/guards.js";
import { bindNamedParams, parseSqlModelo } from "./shared/sql-modelo.js";
import {
  cell,
  DESCREVER_TABELA_MAX_ROWS,
  EXPLORAR_TABELAS_MAX_ROWS,
  hintCatalogoSistemaNegado,
  likeFiltro,
  parseIdentificadorTabela,
  sqlDescreverTabela,
  sqlExplorarTabelas,
} from "./shared/schema-introspection.js";

const QUERY_CELL_MAX_CHARS = 2_048;

const truncateCell = (value: unknown): unknown => {
  if (typeof value !== "string" || value.length <= QUERY_CELL_MAX_CHARS) {
    return value;
  }
  return `${value.slice(0, QUERY_CELL_MAX_CHARS)}…`;
};

const sanitizeQueryRows = (
  rows: readonly Record<string, unknown>[],
): Record<string, unknown>[] =>
  rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      next[key] = truncateCell(value);
    }
    return next;
  });

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
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      sql?: string;
      params?: Record<string, unknown>;
      options?: { max_rows?: number; page?: number; page_size?: number; timeout_ms?: number };
    },
  ): Promise<{
    success: true;
    skillId: string;
    columns: readonly string[];
    rows: readonly Record<string, unknown>[];
    rowCount: number;
    maxRowsApplied: number;
    truncated: boolean;
    hint?: string;
  }> {
    const started = Date.now();
    const uid = requireUsuario(usuarioId);
    const acesso = requireAcessoAprovado(await requireAcesso(this.acessos, input.acessoId, uid));
    if (input.sql?.trim()) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "consultar_dados não aceita SQL solto.",
        hint: "Passe skillId de uma skill publicada. Sem skill capaz, treine e publique (treinar_com_sql → criar_skill → validar_skill → publicar_skill).",
      });
    }
    const skillId = input.skillId?.trim() ?? "";
    if (!skillId) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "skillId é obrigatório.",
        hint: "Use buscar_contexto / listar_skills / obter_skill e execute só skill publicada. Não invente SQL.",
      });
    }
    const skill = await this.skills.findById(skillId);
    if (skill?.agentId !== acesso.agentId) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste agentId.",
        hint: "Confira skillId com listar_skills no mesmo acesso.",
      });
    }
    if (skill.status !== "publicada") {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_PUBLISHED,
        message: "Só skill publicada pode consultar o ERP.",
        hint:
          skill.status === "validada"
            ? "Chame publicar_skill antes de consultar_dados."
            : "Valide e publique a skill (validar_skill → publicar_skill).",
      });
    }
    const modelo = parseSqlModelo(skill.sqlModelo);
    const params = bindNamedParams(modelo.sql, input.params);
    const requested = input.options?.max_rows ?? this.defaultMaxRows;
    const maxRows = Math.min(Math.max(1, requested), this.absoluteMaxRows);
    const clientToken = this.crypto.decrypt(acesso.clientTokenEnc);
    const accessToken = await this.sessions.getAccessToken(uid);
    const paramKeys = Object.keys(params).sort().join(",");
    try {
      const result = await this.plug.executeSql({
        accessToken,
        agentId: acesso.agentId,
        clientToken,
        sql: modelo.sql,
        params,
        options: {
          maxRows,
          page: input.options?.page,
          pageSize: input.options?.page_size,
          timeoutMs: input.options?.timeout_ms,
        },
      });
      const truncated = result.rows.length >= maxRows;
      const rows = sanitizeQueryRows(result.rows);
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
      return {
        success: true,
        skillId: skill.id,
        columns: result.columns,
        rows,
        rowCount: rows.length,
        maxRowsApplied: maxRows,
        truncated,
        hint: truncated
          ? "Resultado possivelmente incompleto (atingiu max_rows). Agregue no SQL ou pagine com ORDER BY."
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
      throw error;
    }
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
    const acesso = requireAcessoAprovado(await requireAcesso(this.acessos, input.acessoId, uid));
    const sql = sqlExplorarTabelas(acesso.dialeto);
    try {
      const result = await this.plug.executeSql({
        accessToken: await this.sessions.getAccessToken(uid),
        agentId: acesso.agentId,
        clientToken: this.crypto.decrypt(acesso.clientTokenEnc),
        sql,
        params: { filtro: likeFiltro(input.filtro) },
        options: { maxRows: EXPLORAR_TABELAS_MAX_ROWS },
      });
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
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; tabela?: string },
  ): Promise<{
    success: true;
    tabela: string;
    colunas: { nome: string; tipo: string; nullable: string }[];
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = requireAcessoAprovado(await requireAcesso(this.acessos, input.acessoId, uid));
    const ident = parseIdentificadorTabela(input.tabela);
    const sql = sqlDescreverTabela(acesso.dialeto, Boolean(ident.schema));
    try {
      const result = await this.plug.executeSql({
        accessToken: await this.sessions.getAccessToken(uid),
        agentId: acesso.agentId,
        clientToken: this.crypto.decrypt(acesso.clientTokenEnc),
        sql,
        params: { tabela: ident.tabela, schema: ident.schema ?? undefined },
        options: { maxRows: DESCREVER_TABELA_MAX_ROWS },
      });
      await this.grafo.withAgentLock(acesso.agentId, async () => {
        const locked = await this.grafo.getDialeto(acesso.agentId);
        if (!locked) {
          await this.grafo.setDialeto(acesso.agentId, acesso.dialeto);
        } else if (locked.dialeto !== acesso.dialeto) {
          throw new DomainError({
            code: ERROR_CODES.DIALECT_CONFLICT,
            message: "Este agentId já foi treinado em outro dialeto.",
            hint: `Grafo travado em ${locked.dialeto}.`,
          });
        }
        const tabela = await this.grafo.mergeTabela({
          agentId: acesso.agentId,
          nome: ident.tabela,
          origem: "inferido",
          autorUsuarioId: uid,
        });
        for (const row of result.rows) {
          await this.grafo.mergeColuna({
            tabelaId: tabela.tabela.id,
            nome: cell(row, "column_name"),
            tipo: cell(row, "data_type") || null,
            origem: "inferido",
            autorUsuarioId: uid,
          });
        }
      });
      return {
        success: true,
        tabela: ident.tabela,
        colunas: result.rows.map((row) => ({
          nome: cell(row, "column_name"),
          tipo: cell(row, "data_type"),
          nullable: cell(row, "is_nullable"),
        })),
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
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; query?: string },
  ): Promise<{
    success: true;
    consultaPermitida: boolean;
    skillsPublicadas: readonly unknown[];
    grafoParaTreino: { tabelas: readonly TabelaGrafo[]; anotacoes: readonly unknown[] };
    gap?: { code: "SKILL_GAP"; hint: string };
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const query = input.query?.trim() ?? "";
    if (query.length < 2) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "query é obrigatória.",
        hint: "Descreva o assunto de negócio (ex.: pedido de venda, saldo em aberto).",
      });
    }
    const policy = await this.plug.getClientTokenPolicy({
      accessToken: await this.sessions.getAccessToken(uid),
      agentId: acesso.agentId,
      clientToken: this.crypto.decrypt(acesso.clientTokenEnc),
    });
    const [tabelas, skillHits, notas] = await Promise.all([
      this.grafo.buscar(acesso.agentId, query, 12),
      this.skills.buscar(acesso.agentId, query, 8),
      this.anotacoes.buscar(acesso.agentId, query, 8),
    ]);
    const skillsPublicadas = skillHits.filter((skill) => skill.status === "publicada");
    const consultaPermitida = skillsPublicadas.length > 0;
    return {
      success: true as const,
      consultaPermitida,
      skillsPublicadas,
      grafoParaTreino: {
        tabelas: tabelas.filter((tabela) => allowedByPolicy(tabela.nome, policy)),
        anotacoes: notas,
      },
      gap: consultaPermitida
        ? undefined
        : {
            code: "SKILL_GAP",
            hint: "Não há skill publicada capaz (dado ou cruzamento). Não chame consultar_dados. Oriente treinar_com_sql → criar_skill → validar_skill → publicar_skill.",
          },
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
  ): Promise<{ success: true }> {
    const uid = requireUsuario(usuarioId);
    await requireAcesso(this.acessos, input.acessoId, uid);
    await this.grafo.resolverConflito({
      tabelaId: input.tabelaId,
      colunaId: input.colunaId,
      relacionamentoId: input.relacionamentoId,
      origem: "confirmado_usuario",
      descricao: input.descricao,
      autorUsuarioId: uid,
    });
    return { success: true };
  }
}
