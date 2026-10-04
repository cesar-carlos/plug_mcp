import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { GrafoRepositoryPort } from "../../domain/ports/grafo-repository.port.js";
import type { QueryResultCachePort } from "../../domain/ports/query-result-cache.port.js";
import type { AprendizadoRepositoryPort } from "../../domain/ports/aprendizado-repository.port.js";
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
import {
  bindNamedParams,
  coerceBoundParams,
  parseSqlModelo,
  sqlParaOdbc,
} from "./shared/sql-modelo.js";
import { persistirEscopoSeVazio } from "./shared/persistir-escopo.js";
import { escopoFromSqlModelo } from "./shared/escopo-from-modelo.js";
import { validarSqlNoEscopo, coletarAvisosValidacao } from "./shared/validar-escopo.js";
import { recusarSqlLivreFirebird, tryParseSelect, type SqlAstSelect } from "./shared/sql-ast.js";
import {
  exigirFiltroEscopoPadrao,
  NOMES_COLUNA_EMPRESA,
  NOMES_COLUNA_FILIAL,
  mesclarParamsEscopo,
} from "./shared/escopo-filtro.js";
import { garantirLimiteInspecao, sqlStarDescoberta } from "./shared/expandir-star.js";
import { registroOperacoesGlobal } from "./shared/progresso-operacao.js";
import {
  aplicarDerivaEsquema,
  assinaturaTabela,
  type DeltaAssinaturaSchema,
} from "./shared/schema-drift.js";
import {
  cell,
  sqlDescreverTabela,
  DESCREVER_TABELA_MAX_ROWS,
  isIdentificadorSql,
} from "./shared/schema-introspection.js";
import {
  applySelectAliasHints,
  mergeColumnHints,
  normalizeColumnsMetadata,
  type ColumnMetadataHint,
  type ColumnMetadataItem,
} from "./shared/columns-metadata.js";
import type { AnexoHandlePort } from "../../domain/ports/anexo-handle.port.js";
import { avisoAnexos, sanitizarLinhasConsulta } from "./shared/sanitizar-linhas-consulta.js";
import { lookupSensibilidadeGrafo, mascararLinhas } from "./shared/mascarar-linhagem.js";

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
  acessoId: string;
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
  await input.grafo.withAcessoLock(input.acessoId, async () => {
    const merged = await input.grafo.mergeTabela({
      acessoId: input.acessoId,
      nome: unica.nome,
      origem: "inferido",
      autorUsuarioId: input.autorUsuarioId,
    });
    const jaNoGrafo = await input.grafo.listColunas(input.acessoId, merged.tabela.id);
    const conhecidas = new Set(jaNoGrafo.map((coluna) => coluna.nome.trim().toLowerCase()));
    for (const nome of input.columns) {
      const trimmed = nome.trim();
      if (!isIdentificadorSql(trimmed)) {
        continue;
      }
      const meta = byMeta.get(trimmed.toLowerCase());
      await input.grafo.mergeColuna({
        acessoId: input.acessoId,
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
    colunasOmitidas: readonly string[];
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
      await requireAcesso(this.acessos, input.acessoId, uid, {
        skills: this.skills,
        skillId: input.skillId,
        skillIds: input.skillIds,
      }),
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
      if (found?.acessoId !== acesso.id) {
        throw new DomainError({
          code: ERROR_CODES.SKILL_NOT_FOUND,
          message: "Skill não encontrada neste acesso.",
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
    const elegiveis = (await this.skills.listByAcesso(acesso.id)).filter((item) =>
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
      recusarSqlLivreFirebird();
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
    let ast: SqlAstSelect | null;
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
    const clientToken = this.crypto.decrypt(acesso.clientTokenEnc);
    const policy = await withHubAuth(this.sessions, uid, (accessToken) =>
      this.plug.getClientTokenPolicy({ accessToken, agentId: acesso.agentId, clientToken }),
    );
    if (
      tabelasSql.some(
        (table) =>
          !policy.allTables &&
          !policy.tables.some((allowed) => allowed.toLowerCase() === table.toLowerCase()),
      )
    ) {
      throw new DomainError({
        code: ERROR_CODES.PERMISSION_DENIED,
        message: "Inspeção fora da policy vigente.",
        hint: "Revise a autorização no hub.",
      });
    }
    const columnHints = new Map<string, ColumnMetadataHint>();
    const omitted: string[] = [];
    let discovered: string[] = [];
    const safeColumns = new Map<string, Set<string>>();
    const colsByTable: Record<string, string[]> = {};
    for (const tabelaNome of tabelasSql) {
      const found =
        (await this.grafo.findTabelaByNome(acesso.id, tabelaNome)) ??
        (
          await this.grafo.mergeTabela({
            acessoId: acesso.id,
            nome: tabelaNome,
            origem: "inferido",
            autorUsuarioId: uid,
          })
        ).tabela;
      if (!found) {
        continue;
      }
      if (ast?.temStar) {
        const metadata = await withHubAuth(this.sessions, uid, (accessToken) =>
          this.plug.executeSql({
            accessToken,
            agentId: acesso.agentId,
            clientToken,
            sql: sqlDescreverTabela(acesso.dialeto, false),
            params: { tabela: tabelaNome },
            options: { maxRows: DESCREVER_TABELA_MAX_ROWS },
          }),
        );
        const columns = metadata.rows.flatMap((row) => {
          const name = cell(row, "column_name");
          return name && isIdentificadorSql(name)
            ? [
                {
                  name,
                  type: cell(row, "data_type"),
                  nullable: cell(row, "is_nullable")?.toLowerCase() === "yes",
                },
              ]
            : [];
        });
        discovered = await persistirColunasInspecao({
          grafo: this.grafo,
          acessoId: acesso.id,
          autorUsuarioId: uid,
          ast,
          columns: columns.map((col) => col.name),
          metadata: columns,
        });
      }
      const cols = await this.grafo.listColunas(acesso.id, found.id);
      colsByTable[tabelaNome] = cols.map((col) => col.nome);
      mergeColumnHints(columnHints, cols);
      const safe = cols.filter(
        (col) =>
          col.origem === "confirmado_usuario" &&
          col.status === "vigente" &&
          col.sensibilidade !== "pessoal" &&
          col.sensibilidade !== "segredo" &&
          isIdentificadorSql(col.nome),
      );
      safeColumns.set(tabelaNome.toLowerCase(), new Set(safe.map((col) => col.nome.toLowerCase())));
      omitted.push(
        ...cols.filter((col) => !safe.some((item) => item.id === col.id)).map((col) => col.nome),
      );
    }
    if (ast?.temStar) {
      const table = ast.tabelas[0];
      if (
        !table ||
        ast.tabelas.length !== 1 ||
        ast.colunas.length !== 1 ||
        ast.subqueries.length ||
        ast.setBranches.length
      ) {
        throw new DomainError({
          code: ERROR_CODES.PRIVACIDADE_NEGADA,
          message: "Descoberta exige uma tabela e projeção simples.",
          hint: "Use tabela para descobrir metadados; confirme as colunas antes de amostrar valores.",
        });
      }
      const safe = [...(safeColumns.get(table.nome.toLowerCase()) ?? [])];
      if (!safe.length) {
        return {
          success: true,
          finalidade,
          columns: [],
          rows: [],
          rowCount: 0,
          maxRowsApplied: INSPECAO_MAX_ROWS,
          truncated: false,
          colunasMascaradas: [],
          colunasOmitidas: [...new Set(omitted)],
          colunasNovasNoGrafo: discovered,
          sqlExecutado: "",
          avisos: [
            {
              code: "INSPECAO_METADADOS",
              message:
                "Somente metadados: confirme classificação e sensibilidade antes de amostrar valores.",
            },
          ],
        };
      }
      sql = sql.replace(
        /^(\s*SELECT(?:\s+DISTINCT)?(?:\s+TOP\s+\(?\d+\)?)?\s+)(?:[\w]+\.)?\*/i,
        (_match, prefix: string) =>
          prefix + safe.map((col) => (table.alias ?? table.nome) + "." + col).join(", "),
      );
      if (!sqlInformado && acesso.escopoPadrao) {
        const predicates: string[] = [];
        for (const param of ["empresa", "filial"] as const) {
          if (acesso.escopoPadrao[param] === undefined) {
            continue;
          }
          const configured =
            acesso.escopoPadrao.bindings?.filter(
              (binding) =>
                binding.param === param &&
                binding.tabela.toLowerCase() === table.nome.toLowerCase(),
            ) ?? [];
          const columns = configured.length
            ? configured.map((binding) => binding.coluna)
            : (colsByTable[table.nome] ?? []).filter((col) =>
                (param === "empresa" ? NOMES_COLUNA_EMPRESA : NOMES_COLUNA_FILIAL).some(
                  (candidate) => candidate.toLowerCase() === col.toLowerCase(),
                ),
              );
          if (columns.length === 1 && isIdentificadorSql(columns[0]!)) {
            predicates.push((table.alias ?? table.nome) + "." + columns[0] + " = :" + param);
          }
        }
        if (predicates.length) {
          sql =
            sql.replace(/\s+LIMIT\s+\d+\s*$/i, "") +
            " WHERE " +
            predicates.join(" AND ") +
            (acesso.dialeto === "postgres" ? " LIMIT 100" : "");
        }
      }
      ast = tryParseSelect(sql, acesso.dialeto);
    }
    if (!ast) {
      throw new DomainError({
        code: ERROR_CODES.PRIVACIDADE_NEGADA,
        message: "Projeção não demonstrável.",
        hint: "Use colunas físicas classificadas.",
      });
    }
    for (const ref of ast.colunas.flatMap((col) => col.refs)) {
      const table = ref.table
        ? ast.tabelas.find(
            (item) => (item.alias ?? item.nome).toLowerCase() === ref.table?.toLowerCase(),
          )
        : ast.tabelas.length === 1
          ? ast.tabelas[0]
          : undefined;
      if (!table || !safeColumns.get(table.nome.toLowerCase())?.has(ref.column.toLowerCase())) {
        throw new DomainError({
          code: ERROR_CODES.PRIVACIDADE_NEGADA,
          message: "Amostra contém coluna sem classificação segura.",
          hint: "Confirme a coluna sem expor valores; dados pessoais e segredos ficam fora da projeção.",
        });
      }
    }
    exigirFiltroEscopoPadrao({
      sql,
      colunasDasTabelas: colsByTable,
      escopoPadrao: acesso.escopoPadrao,
      dialeto: acesso.dialeto,
    });
    applySelectAliasHints(columnHints, ast.colunas);
    const contrato = (skillsPassadas.length > 0 ? skillsPassadas : elegiveis).flatMap(
      (item) => item.params,
    );
    const params = coerceBoundParams(
      bindNamedParams(sql, mesclarParamsEscopo(input.params ?? {}, acesso.escopoPadrao), contrato),
      contrato,
    );
    const timeoutMs = Math.min(input.options?.timeout_ms ?? 15_000, 15_000);
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
      const assertEntrega = async (): Promise<void> => {
        const current = await refreshAndRequireAcessoAprovado(
          this.acessos,
          this.plug,
          this.sessions,
          await requireAcesso(this.acessos, acesso.id, uid),
          uid,
        );
        if (
          current.tokenHash !== acesso.tokenHash ||
          current.clientTokenHash !== acesso.clientTokenHash ||
          JSON.stringify(current.escopoPadrao) !== JSON.stringify(acesso.escopoPadrao)
        ) {
          throw new DomainError({
            code: ERROR_CODES.ACCESS_REVOKED,
            message: "Autorização mudou durante a inspeção.",
            hint: "Prepare a inspeção novamente.",
          });
        }
        const freshPolicy = await withHubAuth(this.sessions, uid, (accessToken) =>
          this.plug.getClientTokenPolicy({ accessToken, agentId: acesso.agentId, clientToken }),
        );
        if (
          tabelasSql.some(
            (table) =>
              !freshPolicy.allTables &&
              !freshPolicy.tables.some((allowed) => allowed.toLowerCase() === table.toLowerCase()),
          )
        ) {
          throw new DomainError({
            code: ERROR_CODES.PERMISSION_DENIED,
            message: "Policy revogada durante a inspeção.",
            hint: "Revise a autorização no hub.",
          });
        }
        for (const ref of ast.colunas.flatMap((col) => col.refs)) {
          const table = ref.table
            ? ast.tabelas.find(
                (item) => (item.alias ?? item.nome).toLowerCase() === ref.table?.toLowerCase(),
              )
            : ast.tabelas.length === 1
              ? ast.tabelas[0]
              : undefined;
          const physical = table ? await this.grafo.findTabelaByNome(acesso.id, table.nome) : null;
          const column = physical
            ? await this.grafo.findColuna(acesso.id, physical.id, ref.column)
            : null;
          if (
            column?.origem !== "confirmado_usuario" ||
            column.status !== "vigente" ||
            ["pessoal", "segredo"].includes(column.sensibilidade)
          ) {
            throw new DomainError({
              code: ERROR_CODES.PRIVACIDADE_NEGADA,
              message: "Classificação mudou durante a inspeção.",
              hint: "Inspecione apenas colunas classificadas para amostra.",
            });
          }
        }
      };
      await assertEntrega();
      const returnedColumns =
        result.columns.length > 0
          ? result.columns
          : (result.columnsMetadata?.map((item) => item.name) ?? []);
      const outputNames = new Set(
        ast.colunas.map((col) =>
          ((col.alias.length > 0 ? col.alias : col.column) ?? "").toLowerCase(),
        ),
      );
      const columns = returnedColumns.filter((name) => outputNames.has(name.toLowerCase()));
      const rows = result.rows
        .slice(0, INSPECAO_MAX_ROWS)
        .map((row) =>
          Object.fromEntries(
            Object.entries(row).filter(([name]) => outputNames.has(name.toLowerCase())),
          ),
        );
      const columnsMetadata = normalizeColumnsMetadata(
        columns,
        result.columnsMetadata,
        columnHints,
      );
      const columnTypes = new Map<string, string | null>(
        columnsMetadata.map((item) => [item.name.toLowerCase(), item.type]),
      );
      const lookup = await lookupSensibilidadeGrafo(this.grafo, acesso.id, tabelasSql);
      const sanitizadas = sanitizarLinhasConsulta({
        rows,
        columnTypes,
        anexos: this.extras.anexos,
        usuarioId: uid,
        acessoId: acesso.id,
        origem: "inspecionar_consulta",
        lookupSensibilidade: (coluna) => lookup(null, coluna),
      });
      const masked = mascararLinhas({
        rows: sanitizadas.rows,
        columns,
        ast,
        sessaoId: acesso.id,
        lookup,
      });
      const rowsSanitizadas = masked.rows;
      const avisoAnexo = avisoAnexos(sanitizadas.anexos, "inspecionar_consulta");
      const newOutputColumns = await persistirColunasInspecao({
        grafo: this.grafo,
        acessoId: acesso.id,
        autorUsuarioId: uid,
        ast,
        columns,
        metadata: columnsMetadata,
      });
      const colunasNovasNoGrafo = [...new Set([...discovered, ...newOutputColumns])];
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
      await assertEntrega();
      return {
        success: true,
        finalidade,
        columns,
        rows: rowsSanitizadas,
        rowCount: rowsSanitizadas.length,
        maxRowsApplied: INSPECAO_MAX_ROWS,
        truncated: result.rows.length >= INSPECAO_MAX_ROWS || result.truncated === true,
        colunasMascaradas: masked.colunasMascaradas,
        colunasOmitidas: [...new Set(omitted)],
        colunasNovasNoGrafo: [...new Set([...discovered, ...colunasNovasNoGrafo])],
        columnsMetadata,
        sqlExecutado: sqlParaOdbc(sql),
        avisos: [
          ...(ast ? coletarAvisosValidacao(ast) : []),
          {
            code: "INSPECAO",
            message:
              "Amostra de colunas classificadas, sem dados pessoais ou segredos, sem cache e sem consulta_aprendida. Não use para KPI. Origem inferido não licencia SQL de negócio.",
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
    const publicadas = await this.skills.listPublicadas(acesso.id);
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
    const frozen = publicadas
      .flatMap((skill) => skill.conhecimentoPublicado?.colunas ?? [])
      .filter(
        (col) => col.tabela.toLowerCase() === tabelaNome.toLowerCase() && colunasDoPacote(col.nome),
      );
    const unique = [...new Map(frozen.map((col) => [col.nome.toLowerCase(), col])).values()];
    const currentTable = await this.grafo.findTabelaByNome(acesso.id, tabelaNome);
    const currentColumns = currentTable
      ? await this.grafo.listColunas(acesso.id, currentTable.id)
      : [];
    return {
      success: true,
      tabela: tabelaNome,
      colunas: unique
        .filter((col) => isIdentificadorSql(col.nome))
        .map((col) => {
          const current = currentColumns.find(
            (item) => item.nome.toLowerCase() === col.nome.toLowerCase(),
          );
          const sensibilidade =
            current?.sensibilidade === "segredo" || current?.sensibilidade === "pessoal"
              ? current.sensibilidade
              : col.sensibilidade;
          return {
            nome: col.nome,
            tipo: col.tipo,
            nullable: col.nullable,
            papel: col.papel,
            sensibilidade,
            chave: col.papel === "chave",
          };
        }),
      relacionamentos: pacote.relacionamentos
        .filter(
          (rel) =>
            rel.tabelaOrigem.toLowerCase() === tabelaNome.toLowerCase() ||
            rel.tabelaDestino.toLowerCase() === tabelaNome.toLowerCase(),
        )
        .map((rel) => ({
          destino:
            rel.tabelaOrigem.toLowerCase() === tabelaNome.toLowerCase()
              ? rel.tabelaDestino
              : rel.tabelaOrigem,
          pares: [...rel.pares],
          cardinalidade: rel.cardinalidade ?? null,
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
    private readonly aprendizado?: AprendizadoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; tabela?: string },
  ): Promise<{
    success: true;
    tabela: string;
    drifted: boolean;
    mudou: boolean;
    anterior: string | null;
    delta: DeltaAssinaturaSchema;
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
    const tabela = await this.grafo.findTabelaByNome(acesso.id, tabelaNome);
    if (!tabela) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Tabela ainda não está no grafo.",
        hint: "Mapeie a tabela antes de comparar a assinatura.",
      });
    }
    const cols = await this.grafo.listColunas(acesso.id, tabela.id);
    const rels = await this.grafo.listRelacionamentos(acesso.id);
    const tabelas = await this.grafo.listTabelas(acesso.id);
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
          tipoJoin: rel.tipoJoin,
          cardinalidade: rel.cardinalidade,
        })),
    });
    const result = await aplicarDerivaEsquema({
      grafo: this.grafo,
      skills: this.skills,
      cache: this.cache,
      acessoId: acesso.id,
      tabelaNome: tabela.nome,
      assinatura,
      aprendizado: this.aprendizado,
    });
    return {
      success: true,
      tabela: tabela.nome,
      drifted: result.drifted,
      mudou: result.mudou,
      anterior: result.anterior,
      delta: result.delta,
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
