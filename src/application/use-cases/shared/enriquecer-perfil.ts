import type { Dialeto } from "../../../domain/entities/dialeto.js";
import type { Cardinalidade, PapelColuna, PerfilColuna } from "../../../domain/entities/escopo.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";
import { inferirFormatoColuna, inferirPapelColuna } from "./inferir-papel.js";
import { cell, DESCREVER_TABELA_MAX_ROWS, sqlDescreverTabela } from "./schema-introspection.js";
import { columnQualifier, lastIdent, parseJoinEqualities, type SqlModelo } from "./sql-modelo.js";

/** Teto de consultas de perfilamento no ERP (opt-in `enriquecer=completo`). */
export const PERFIL_MAX_QUERIES = 16;
const PERFIL_DISTINCT_MAX = 30;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/;

export interface AvisoPerfil {
  readonly code: string;
  readonly message: string;
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

const sqlCountDistinct = (tabela: string, coluna: string): string =>
  `SELECT COUNT(*) AS total, COUNT(DISTINCT ${coluna}) AS distintos FROM ${tabela}`;

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
 * Perfilamento opt-in só com tabelas/colunas do SELECT treinado.
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
  let tetoAvisado = false;
  const avisarTeto = (): void => {
    if (tetoAvisado) {
      return;
    }
    tetoAvisado = true;
    avisos.push({
      code: "PERFIL_TETO",
      message: `Perfilamento parou no teto de ${String(PERFIL_MAX_QUERIES)} consultas.`,
    });
  };
  const run = async (
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> => {
    if (remaining <= 0) {
      avisarTeto();
      return null;
    }
    remaining -= 1;
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

  const uniqueOnTable = async (tabela: string, coluna: string): Promise<boolean | null> => {
    const t = ident(tabela);
    const c = ident(coluna);
    if (!t || !c) {
      return null;
    }
    const row = await run(sqlCountDistinct(t, c));
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

  for (const rel of deps.modelo.relacionamentos) {
    if (remaining <= 0) {
      avisarTeto();
      break;
    }
    if (rel.tipoJoin.includes("cross") || !rel.on) {
      continue;
    }
    for (const eq of parseJoinEqualities(rel.on)) {
      if (remaining <= 0) {
        avisarTeto();
        break;
      }
      const leftTable = aliasToNome.get(eq.leftAlias.toLowerCase());
      const rightTable = aliasToNome.get(eq.rightAlias.toLowerCase());
      if (!leftTable || !rightTable) {
        continue;
      }
      const leftUnique = await uniqueOnTable(leftTable, eq.leftColumn);
      const rightUnique = await uniqueOnTable(rightTable, eq.rightColumn);
      if (leftUnique == null || rightUnique == null) {
        continue;
      }
      const origem = await deps.grafo.findTabelaByNome(deps.agentId, leftTable);
      const destino = await deps.grafo.findTabelaByNome(deps.agentId, rightTable);
      if (!origem || !destino) {
        continue;
      }
      await deps.grafo.mergeRelacionamento({
        agentId: deps.agentId,
        tabelaOrigemId: origem.id,
        colunaOrigem: eq.leftColumn,
        tabelaDestinoId: destino.id,
        colunaDestino: eq.rightColumn,
        tipoJoin: rel.tipoJoin,
        cardinalidade: inferirCardinalidade(leftUnique, rightUnique),
        origem: "validado_execucao",
        autorUsuarioId: deps.autorUsuarioId,
      });
    }
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

  const tipos = new Map<string, string>();
  const tabelasUnicas = [...new Set(colunasFisicas.map((item) => item.tabela))];
  for (const tabelaNome of tabelasUnicas) {
    if (remaining <= 0) {
      avisarTeto();
      break;
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

  for (const item of ordenadas) {
    if (remaining <= 0) {
      avisarTeto();
      break;
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
      origem: "validado_execucao",
      autorUsuarioId: deps.autorUsuarioId,
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
