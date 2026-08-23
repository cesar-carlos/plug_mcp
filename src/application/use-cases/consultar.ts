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
      sql?: string;
      params?: Record<string, unknown>;
      options?: { max_rows?: number; page?: number; page_size?: number; timeout_ms?: number };
    },
  ): Promise<{
    success: true;
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
    const sql = input.sql?.trim();
    if (!sql) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "sql é obrigatório.",
        hint: "Use obter_skill e execute o sqlModelo publicado. Se não houver skill capaz (incluindo cruzamento), não invente SQL — oriente treinar_com_sql e criar_skill. Prefira agregação. Params nomeados para literais.",
      });
    }
    const requested = input.options?.max_rows ?? this.defaultMaxRows;
    const maxRows = Math.min(Math.max(1, requested), this.absoluteMaxRows);
    const clientToken = this.crypto.decrypt(acesso.clientTokenEnc);
    const accessToken = await this.sessions.getAccessToken(uid);
    try {
      const result = await this.plug.executeSql({
        accessToken,
        agentId: acesso.agentId,
        clientToken,
        sql,
        params: input.params,
        options: {
          maxRows,
          page: input.options?.page,
          pageSize: input.options?.page_size,
          timeoutMs: input.options?.timeout_ms,
        },
      });
      const truncated = result.rows.length >= maxRows;
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "consultar_dados",
        sqlEnviado: sql,
        sucesso: true,
        codigoErro: null,
        linhasRetornadas: result.rows.length,
        duracaoMs: Date.now() - started,
      });
      return {
        success: true,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rows.length,
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
        sqlEnviado: sql,
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
    tabelas: readonly TabelaGrafo[];
    skills: readonly unknown[];
    anotacoes: readonly unknown[];
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
    return {
      success: true as const,
      tabelas: tabelas.filter((tabela) => allowedByPolicy(tabela.nome, policy)),
      skills: skillHits,
      anotacoes: notas,
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
