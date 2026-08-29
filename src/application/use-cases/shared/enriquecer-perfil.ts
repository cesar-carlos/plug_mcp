import type { Dialeto } from "../../../domain/entities/dialeto.js";
import type {
  Cardinalidade,
  EscopoSkill,
  PapelColuna,
  PerfilColuna,
} from "../../../domain/entities/escopo.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";
import { inferirFormatoColuna, inferirPapelColuna } from "./inferir-papel.js";
import { inferirSensibilidadeColuna } from "../../../domain/entities/privacidade.js";
import { paresDeIgualdades } from "../../../domain/entities/relacionamento.js";
import { cell, DESCREVER_TABELA_MAX_ROWS, sqlDescreverTabela } from "./schema-introspection.js";
import { columnQualifier, lastIdent, parseJoinEqualities, type SqlModelo } from "./sql-modelo.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";

/** Teto de consultas de perfilamento no ERP (opt-in `enriquecer=completo`). */
export const PERFIL_MAX_QUERIES = 16;
const PERFIL_DISTINCT_MAX = 30;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/;

export interface AvisoPerfil {
  readonly code: string;
  readonly message: string;
  readonly details?: {
    readonly fase: "cardinalidade" | "catalogo" | "perfil" | "dicionario";
    readonly queriesUsadas: number;
    readonly queriesLimite: number;
    readonly pendencias: readonly string[];
    readonly retomavel?: boolean;
  };
}

export interface EnriquecerPerfilDeps {
  readonly grafo: GrafoRepositoryPort;
  readonly executeSql: (
    sql: string,
    params?: Record<string, unknown>,
  ) => Promise<{
    columns: readonly string[];
    rows: readonly Record<string, unknown>[];
  }>;
  readonly agentId: string;
  readonly dialeto: Dialeto;
  readonly autorUsuarioId: string;
  readonly modelo: SqlModelo;
  readonly escopo?: EscopoSkill;
  readonly escopoPadrao?: { empresa?: string; filial?: string };
  readonly signal?: AbortSignal;
  readonly onProgress?: (input: {
    fase: "cardinalidade" | "catalogo" | "perfil" | "dicionario";
    queriesUsadas: number;
    queriesLimite: number;
  }) => void;
}

const ident = (nome: string): string | null => (IDENT_RE.test(nome) ? nome : null);

const cellNumber = (row: Record<string, unknown>, ...keys: string[]): number | null => {
  const raw = cell(row, ...keys);
  if (!raw) {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const cellValue = (row: Record<string, unknown>, ...keys: string[]): string | number | null => {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const [key, value] of Object.entries(row)) {
    if (!wanted.has(key.toLowerCase()) || value == null) {
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" || typeof value === "boolean") {
      return String(value).trim();
    }
  }
  return null;
};

const isPhysicalColumn = (expr: string): boolean => {
  const trimmed = expr.trim();
  if (!trimmed || trimmed.includes("(")) {
    return false;
  }
  return Boolean(lastIdent(trimmed) && IDENT_RE.test(lastIdent(trimmed)));
};

const sqlCountDistinctCols = (
  dialeto: Dialeto,
  tabela: string,
  colunas: readonly string[],
  recorteSql: string,
): string => {
  const expr =
    colunas.length === 1
      ? colunas[0]!
      : dialeto === "postgres"
        ? colunas.map((coluna) => `${coluna}::text`).join(" || '|' || ")
        : colunas.map((coluna) => `CAST(${coluna} AS varchar)`).join(" + '|' + ");
  return `SELECT COUNT(*) AS total, COUNT(DISTINCT ${expr}) AS distintos FROM ${tabela}${recorteSql}`;
};

const recorteOrganizacional = (
  tabela: string,
  escopoPadrao?: { empresa?: string; filial?: string },
): { sql: string; params: Record<string, unknown> } => {
  const parts: string[] = [];
  const params: Record<string, unknown> = {};
  if (escopoPadrao?.empresa) {
    parts.push(`${tabela}.empresa = :empresa`);
    params.empresa = escopoPadrao.empresa;
  }
  if (escopoPadrao?.filial) {
    parts.push(`${tabela}.filial = :filial`);
    params.filial = escopoPadrao.filial;
  }
  return {
    sql: parts.length > 0 ? ` WHERE ${parts.join(" AND ")}` : "",
    params,
  };
};

const sqlPerfilColuna = (tabela: string, coluna: string): string =>
  `SELECT MIN(${coluna}) AS min_v, MAX(${coluna}) AS max_v, SUM(CASE WHEN ${coluna} IS NULL THEN 1 ELSE 0 END) AS nulos, COUNT(*) AS total, COUNT(DISTINCT ${coluna}) AS distintos FROM ${tabela}`;

const sqlDistinctLimitado = (dialeto: Dialeto, tabela: string, coluna: string): string => {
  if (dialeto === "postgres") {
    return `SELECT DISTINCT ${coluna} AS valor FROM ${tabela} WHERE ${coluna} IS NOT NULL LIMIT ${String(PERFIL_DISTINCT_MAX)}`;
  }
  if (dialeto === "firebird") {
    return `SELECT FIRST ${String(PERFIL_DISTINCT_MAX)} DISTINCT ${coluna} AS valor FROM ${tabela} WHERE ${coluna} IS NOT NULL`;
  }
  return `SELECT DISTINCT TOP ${String(PERFIL_DISTINCT_MAX)} ${coluna} AS valor FROM ${tabela} WHERE ${coluna} IS NOT NULL`;
};

const inferirCardinalidade = (leftUnique: boolean, rightUnique: boolean): Cardinalidade => {
  if (leftUnique && rightUnique) {
    return "1:1";
  }
  if (leftUnique && !rightUnique) {
    return "1:N";
  }
  if (!leftUnique && rightUnique) {
    return "N:1";
  }
  return "N:N";
};

const colKey = (tabela: string, coluna: string): string =>
  `${tabela.toLowerCase()}.${coluna.toLowerCase()}`;

/**
 * Perfilamento opt-in com colunas físicas do SELECT, JOIN e escopo publicado.
 * Ordem: COUNT DISTINCT no ON → catálogo (tipo) → MIN/MAX (medidas/datas primeiro) → DISTINCT.
 * Sybase: catálogo via syscolumns/systypes (mesmo SQL de schema-introspection);
 * divergência de tipo não é bug deste perfil.
 * Falha de uma query vira aviso e não desfaz o merge do treino.
 */
export const enriquecerPerfilCompleto = async (
  deps: EnriquecerPerfilDeps,
): Promise<{ avisos: AvisoPerfil[] }> => {
  const avisos: AvisoPerfil[] = [];
  if (deps.dialeto === "firebird") {
    avisos.push({
      code: "PERFIL_DIALETO",
      message:
        "enriquecer=completo não perfila Firebird (sem SQL livre). O merge básico permanece.",
    });
    return { avisos };
  }
  let remaining = PERFIL_MAX_QUERIES;
  let tetoAtingido = false;
  let fase: "cardinalidade" | "catalogo" | "perfil" | "dicionario" = "cardinalidade";
  const avisarTeto = (): void => {
    tetoAtingido = true;
  };
  const throwIfCancelled = (): void => {
    if (deps.signal?.aborted) {
      throw new DomainError({
        code: ERROR_CODES.OPERACAO_CANCELADA,
        message: "Perfilamento cancelado.",
        hint: "Chame de novo com enriquecer=completo para retomar o que faltar.",
      });
    }
  };
  const report = (): void => {
    deps.onProgress?.({
      fase,
      queriesUsadas: PERFIL_MAX_QUERIES - remaining,
      queriesLimite: PERFIL_MAX_QUERIES,
    });
  };
  const run = async (
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> => {
    throwIfCancelled();
    if (remaining <= 0) {
      avisarTeto();
      return null;
    }
    remaining -= 1;
    report();
    try {
      const result = await deps.executeSql(sql, params);
      return result.rows[0] ?? {};
    } catch {
      avisos.push({
        code: "PERFIL_QUERY_FALHOU",
        message: "Uma query de perfil falhou; o grafo do treino foi mantido.",
      });
      return null;
    }
  };
  const runRows = async (
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<readonly Record<string, unknown>[] | null> => {
    throwIfCancelled();
    if (remaining <= 0) {
      avisarTeto();
      return null;
    }
    remaining -= 1;
    try {
      const result = await deps.executeSql(sql, params);
      return result.rows;
    } catch {
      avisos.push({
        code: "PERFIL_QUERY_FALHOU",
        message: "Uma query de perfil falhou; o grafo do treino foi mantido.",
      });
      return null;
    }
  };

  const aliasToNome = new Map<string, string>();
  for (const tabela of deps.modelo.tabelas) {
    const nome = ident(tabela.nome);
    if (!nome) {
      continue;
    }
    aliasToNome.set(tabela.nome.toLowerCase(), nome);
    if (tabela.alias) {
      aliasToNome.set(tabela.alias.toLowerCase(), nome);
    }
  }

  const uniqueOnCols = async (
    tabela: string,
    colunas: readonly string[],
  ): Promise<boolean | null> => {
    const t = ident(tabela);
    const cols = colunas
      .map((coluna) => ident(coluna))
      .filter((coluna): coluna is string => Boolean(coluna));
    if (!t || cols.length === 0 || cols.length !== colunas.length) {
      return null;
    }
    const recorte = recorteOrganizacional(t, deps.escopoPadrao);
    const row = await run(sqlCountDistinctCols(deps.dialeto, t, cols, recorte.sql), recorte.params);
    if (!row) {
      return null;
    }
    const total = cellNumber(row, "total");
    const distintos = cellNumber(row, "distintos");
    if (total == null || distintos == null || total <= 0) {
      return null;
    }
    return total === distintos;
  };

  const relsGrafo = await deps.grafo.listRelacionamentos(deps.agentId);

  for (const rel of deps.modelo.relacionamentos) {
    throwIfCancelled();
    if (remaining <= 0) {
      avisarTeto();
      break;
    }
    if (rel.tipoJoin.includes("cross") || !rel.on) {
      continue;
    }
    const eqs = parseJoinEqualities(rel.on).flatMap((eq) => {
      const leftTable = aliasToNome.get(eq.leftAlias.toLowerCase());
      const rightTable = aliasToNome.get(eq.rightAlias.toLowerCase());
      if (!leftTable || !rightTable) {
        return [];
      }
      return [
        {
          leftTable,
          leftColumn: eq.leftColumn,
          rightTable,
          rightColumn: eq.rightColumn,
        },
      ];
    });
    const grouped = paresDeIgualdades(eqs);
    if (!grouped) {
      continue;
    }
    const leftCols = grouped.pares.map((par) => par.colunaOrigem);
    const rightCols = grouped.pares.map((par) => par.colunaDestino);
    const origem = await deps.grafo.findTabelaByNome(deps.agentId, grouped.tabelaOrigem);
    const destino = await deps.grafo.findTabelaByNome(deps.agentId, grouped.tabelaDestino);
    if (!origem || !destino) {
      continue;
    }
    const jaTemCardinalidade = relsGrafo.some((item) => {
      const direto = item.tabelaOrigemId === origem.id && item.tabelaDestinoId === destino.id;
      const inverso = item.tabelaOrigemId === destino.id && item.tabelaDestinoId === origem.id;
      return (direto || inverso) && Boolean(item.cardinalidade);
    });
    if (jaTemCardinalidade) {
      continue;
    }
    const leftUnique = await uniqueOnCols(grouped.tabelaOrigem, leftCols);
    const rightUnique = await uniqueOnCols(grouped.tabelaDestino, rightCols);
    if (leftUnique == null || rightUnique == null) {
      continue;
    }
    const cardinalidade = inferirCardinalidade(leftUnique, rightUnique);
    if (cardinalidade === "N:N") {
      avisos.push({
        code: "FANOUT_NAO_DECLARADO",
        message: `JOIN composto ${grouped.tabelaOrigem} → ${grouped.tabelaDestino} perfilou N:N no recorte organizacional. Confirme a cardinalidade antes de agregar medidas.`,
      });
    }
    await deps.grafo.mergeRelacionamento({
      agentId: deps.agentId,
      tabelaOrigemId: origem.id,
      tabelaDestinoId: destino.id,
      pares: grouped.pares,
      tipoJoin: rel.tipoJoin,
      cardinalidade,
      escopoValidacao: deps.escopoPadrao ?? null,
      origem: "validado_execucao",
      autorUsuarioId: deps.autorUsuarioId,
    });
  }

  const colunasFisicas: { tabela: string; coluna: string }[] = [];
  const seen = new Set<string>();
  const pushCol = (tabela: string, coluna: string): void => {
    const t = ident(tabela);
    const c = ident(coluna);
    if (!t || !c) {
      return;
    }
    const key = colKey(t, c);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    colunasFisicas.push({ tabela: t, coluna: c });
  };
  for (const coluna of deps.modelo.colunas) {
    if (!isPhysicalColumn(coluna.expr)) {
      continue;
    }
    const qualifier = columnQualifier(coluna.expr);
    const tabelaNome = qualifier
      ? aliasToNome.get(qualifier.toLowerCase())
      : deps.modelo.tabelas.length === 1
        ? aliasToNome.get(deps.modelo.tabelas[0]!.nome.toLowerCase())
        : undefined;
    if (!tabelaNome) {
      continue;
    }
    pushCol(tabelaNome, lastIdent(coluna.expr));
  }
  for (const rel of deps.modelo.relacionamentos) {
    if (!rel.on) {
      continue;
    }
    for (const eq of parseJoinEqualities(rel.on)) {
      const leftTable = aliasToNome.get(eq.leftAlias.toLowerCase());
      const rightTable = aliasToNome.get(eq.rightAlias.toLowerCase());
      if (leftTable) {
        pushCol(leftTable, eq.leftColumn);
      }
      if (rightTable) {
        pushCol(rightTable, eq.rightColumn);
      }
    }
  }
  for (const [tabela, colunas] of Object.entries(deps.escopo?.colunasPorTabela ?? {})) {
    for (const coluna of colunas) {
      pushCol(tabela, coluna);
    }
  }

  const colunaJaTemCatalogo = async (tabelaNome: string, colunaNome: string): Promise<boolean> => {
    const tabela = await deps.grafo.findTabelaByNome(deps.agentId, tabelaNome);
    if (!tabela) {
      return false;
    }
    const coluna = await deps.grafo.findColuna(tabela.id, colunaNome);
    return Boolean(coluna?.tipo && coluna.formato);
  };

  const colunaJaTemEstatistica = async (
    tabelaNome: string,
    colunaNome: string,
  ): Promise<boolean> => {
    const tabela = await deps.grafo.findTabelaByNome(deps.agentId, tabelaNome);
    if (!tabela) {
      return false;
    }
    const coluna = await deps.grafo.findColuna(tabela.id, colunaNome);
    const perfil = coluna?.perfil;
    return perfil != null && (perfil.min != null || perfil.max != null || perfil.distintos != null);
  };

  const tipos = new Map<string, string>();
  const tabelasUnicas = [...new Set(colunasFisicas.map((item) => item.tabela))];
  fase = "catalogo";
  for (const tabelaNome of tabelasUnicas) {
    if (remaining <= 0) {
      avisarTeto();
      break;
    }
    const colsTabela = colunasFisicas.filter((item) => item.tabela === tabelaNome);
    const todasPerfiladas = (
      await Promise.all(colsTabela.map((item) => colunaJaTemCatalogo(item.tabela, item.coluna)))
    ).every(Boolean);
    if (todasPerfiladas) {
      continue;
    }
    const sql = sqlDescreverTabela(deps.dialeto, false);
    remaining -= 1;
    try {
      const result = await deps.executeSql(sql, { tabela: tabelaNome });
      for (const row of result.rows.slice(0, DESCREVER_TABELA_MAX_ROWS)) {
        const colunaNome = cell(row, "column_name");
        const dataType = cell(row, "data_type");
        if (!colunaNome || !dataType) {
          continue;
        }
        tipos.set(colKey(tabelaNome, colunaNome), dataType);
      }
    } catch {
      avisos.push({
        code: "PERFIL_QUERY_FALHOU",
        message: "Uma query de perfil falhou; o grafo do treino foi mantido.",
      });
    }
  }

  for (const item of colunasFisicas) {
    const tipo = tipos.get(colKey(item.tabela, item.coluna)) ?? null;
    if (!tipo) {
      continue;
    }
    const tabela = await deps.grafo.findTabelaByNome(deps.agentId, item.tabela);
    if (!tabela) {
      continue;
    }
    await deps.grafo.mergeColuna({
      tabelaId: tabela.id,
      nome: item.coluna,
      tipo,
      papel: inferirPapelColuna(item.coluna, tipo),
      formato: inferirFormatoColuna(tipo, null),
      sensibilidade: inferirSensibilidadeColuna(item.coluna, tipo),
      origem: "validado_execucao",
      autorUsuarioId: deps.autorUsuarioId,
    });
  }

  const prioridade = (item: { tabela: string; coluna: string }): number => {
    const tipo = tipos.get(colKey(item.tabela, item.coluna)) ?? null;
    const papel = inferirPapelColuna(item.coluna, tipo);
    return papel === "medida" || papel === "data" ? 0 : 1;
  };
  const ordenadas = [...colunasFisicas].sort((a, b) => prioridade(a) - prioridade(b));

  fase = "perfil";
  for (const item of ordenadas) {
    if (remaining <= 0) {
      avisarTeto();
      break;
    }
    if (await colunaJaTemEstatistica(item.tabela, item.coluna)) {
      continue;
    }
    const row = await run(sqlPerfilColuna(item.tabela, item.coluna));
    if (!row) {
      continue;
    }
    const total = cellNumber(row, "total");
    const distintos = cellNumber(row, "distintos");
    const nulos = cellNumber(row, "nulos");
    const perfil: PerfilColuna = {
      min: cellValue(row, "min_v", "min"),
      max: cellValue(row, "max_v", "max"),
      nulos,
      distintos,
    };
    const tipo = tipos.get(colKey(item.tabela, item.coluna)) ?? null;
    const papel: PapelColuna = inferirPapelColuna(item.coluna, tipo);
    let candidatos: string[] | undefined;
    const baixaCard =
      distintos != null &&
      distintos > 0 &&
      distintos <= PERFIL_DISTINCT_MAX &&
      (total == null || distintos < total);
    if (remaining > 0 && baixaCard && (papel === "dimensao" || papel === "codigo")) {
      fase = "dicionario";
      const rows = await runRows(sqlDistinctLimitado(deps.dialeto, item.tabela, item.coluna));
      if (rows) {
        const values = [
          ...new Set(
            rows
              .map((entry) => cell(entry, "valor", item.coluna))
              .filter((value) => value.length > 0),
          ),
        ];
        if (values.length > 0) {
          candidatos = values;
        }
      }
    }
    fase = "perfil";
    const tabela = await deps.grafo.findTabelaByNome(deps.agentId, item.tabela);
    if (!tabela) {
      continue;
    }
    const perfilFinal = candidatos ? { ...perfil, candidatosDicionario: candidatos } : perfil;
    await deps.grafo.mergeColuna({
      tabelaId: tabela.id,
      nome: item.coluna,
      tipo,
      papel,
      formato: inferirFormatoColuna(tipo, perfilFinal),
      perfil: perfilFinal,
      sensibilidade: inferirSensibilidadeColuna(item.coluna, tipo),
      origem: "validado_execucao",
      autorUsuarioId: deps.autorUsuarioId,
    });
  }

  if (tetoAtingido) {
    const pendencias: string[] = [];
    for (const item of colunasFisicas) {
      const tabela = await deps.grafo.findTabelaByNome(deps.agentId, item.tabela);
      const coluna = tabela ? await deps.grafo.findColuna(tabela.id, item.coluna) : null;
      if (!coluna || (!coluna.tipo && !coluna.formato)) {
        pendencias.push(`Coluna ${item.tabela}.${item.coluna} sem tipo/formato.`);
      }
    }
    const rels = await deps.grafo.listRelacionamentos(deps.agentId);
    for (const rel of deps.modelo.relacionamentos) {
      if (!rel.on) {
        continue;
      }
      const eqs = parseJoinEqualities(rel.on).flatMap((eq) => {
        const origemNome = aliasToNome.get(eq.leftAlias.toLowerCase());
        const destinoNome = aliasToNome.get(eq.rightAlias.toLowerCase());
        if (!origemNome || !destinoNome) {
          return [];
        }
        return [
          {
            leftTable: origemNome,
            leftColumn: eq.leftColumn,
            rightTable: destinoNome,
            rightColumn: eq.rightColumn,
          },
        ];
      });
      const grouped = paresDeIgualdades(eqs);
      if (!grouped) {
        continue;
      }
      const origem = await deps.grafo.findTabelaByNome(deps.agentId, grouped.tabelaOrigem);
      const destino = await deps.grafo.findTabelaByNome(deps.agentId, grouped.tabelaDestino);
      const relacionamento = rels.find(
        (item) =>
          (item.tabelaOrigemId === origem?.id && item.tabelaDestinoId === destino?.id) ||
          (item.tabelaOrigemId === destino?.id && item.tabelaDestinoId === origem?.id),
      );
      if (!relacionamento?.cardinalidade) {
        pendencias.push(
          `JOIN ${grouped.tabelaOrigem} → ${grouped.tabelaDestino} (${grouped.pares
            .map((par) => `${par.colunaOrigem}=${par.colunaDestino}`)
            .join(" AND ")}) sem cardinalidade.`,
        );
      }
    }
    avisos.push({
      code: "PERFIL_TETO",
      message: `Perfilamento parou no teto de ${String(PERFIL_MAX_QUERIES)} consultas. Chame de novo enriquecer=completo para retomar o que faltar.`,
      details: {
        fase,
        queriesUsadas: PERFIL_MAX_QUERIES - remaining,
        queriesLimite: PERFIL_MAX_QUERIES,
        pendencias: [...new Set(pendencias)],
        retomavel: true,
      },
    });
  }

  return {
    avisos: avisos.filter(
      (aviso, index, all) =>
        all.findIndex((entry) => entry.code === aviso.code && entry.message === aviso.message) ===
        index,
    ),
  };
};
