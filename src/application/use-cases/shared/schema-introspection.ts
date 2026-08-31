import type { Dialeto } from "../../../domain/entities/dialeto.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";

export const EXPLORAR_TABELAS_MAX_ROWS = 200;
export const DESCREVER_TABELA_MAX_ROWS = 300;

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/;

export const isIdentificadorSql = (nome: string): boolean => IDENT_RE.test(nome.trim());

export interface TabelaIdentificada {
  readonly schema: string | null;
  readonly tabela: string;
}

export const parseIdentificadorTabela = (raw: string | undefined): TabelaIdentificada => {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "tabela é obrigatória.",
      hint: "Chame explorar_tabelas e use o table_name (com schema_name se houver) devolvido.",
    });
  }
  const parts = trimmed.split(".");
  if (parts.length > 2 || parts.some((part) => !part || !IDENT_RE.test(part))) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Nome de tabela inválido.",
      hint: "Use um identificador (letras, dígitos, _ ou $), opcionalmente schema.tabela. Não concatene SQL.",
    });
  }
  if (parts.length === 2) {
    return { schema: parts[0]!, tabela: parts[1]! };
  }
  return { schema: null, tabela: parts[0]! };
};

export const likeFiltro = (filtro: string | undefined): string => {
  const trimmed = filtro?.trim() ?? "";
  if (!trimmed) {
    return "%";
  }
  return `%${trimmed.replace(/[%_]/g, "")}%`;
};

export const sqlExplorarTabelas = (dialeto: Dialeto): string => {
  switch (dialeto) {
    case "mssql":
      return `SELECT TOP ${EXPLORAR_TABELAS_MAX_ROWS} SCHEMA_NAME(o.schema_id) AS schema_name, o.name AS table_name, CASE o.type WHEN 'V' THEN 'view' ELSE 'table' END AS object_type FROM sys.objects o WHERE o.type IN ('U', 'V') AND o.name LIKE :filtro ORDER BY SCHEMA_NAME(o.schema_id), o.name`;
    case "sybase":
      return `SELECT TOP ${EXPLORAR_TABELAS_MAX_ROWS} user_name(uid) AS schema_name, name AS table_name, CASE type WHEN 'V' THEN 'view' ELSE 'table' END AS object_type FROM sysobjects WHERE type IN ('U', 'V') AND name LIKE :filtro ORDER BY name`;
    case "postgres":
      return `SELECT n.nspname AS schema_name, c.relname AS table_name, CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'view' ELSE 'table' END AS object_type FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'v', 'm', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND c.relname LIKE :filtro ORDER BY n.nspname, c.relname LIMIT ${EXPLORAR_TABELAS_MAX_ROWS}`;
    case "firebird":
      return `SELECT FIRST ${EXPLORAR_TABELAS_MAX_ROWS} CAST(NULL AS VARCHAR(31)) AS schema_name, TRIM(RDB$RELATION_NAME) AS table_name, CASE WHEN RDB$VIEW_BLR IS NULL THEN 'table' ELSE 'view' END AS object_type FROM RDB$RELATIONS WHERE COALESCE(RDB$SYSTEM_FLAG, 0) = 0 AND TRIM(RDB$RELATION_NAME) LIKE :filtro ORDER BY 2`;
  }
};

export const sqlDescreverTabela = (dialeto: Dialeto, temSchema: boolean): string => {
  switch (dialeto) {
    case "mssql":
      return temSchema
        ? `SELECT TOP ${DESCREVER_TABELA_MAX_ROWS} c.name AS column_name, t.name AS data_type, CASE c.is_nullable WHEN 1 THEN 'YES' ELSE 'NO' END AS is_nullable FROM sys.columns c INNER JOIN sys.objects o ON o.object_id = c.object_id INNER JOIN sys.types t ON t.user_type_id = c.user_type_id AND t.system_type_id = c.system_type_id INNER JOIN sys.schemas s ON s.schema_id = o.schema_id WHERE o.name = :tabela AND s.name = :schema ORDER BY c.column_id`
        : `SELECT TOP ${DESCREVER_TABELA_MAX_ROWS} c.name AS column_name, t.name AS data_type, CASE c.is_nullable WHEN 1 THEN 'YES' ELSE 'NO' END AS is_nullable FROM sys.columns c INNER JOIN sys.objects o ON o.object_id = c.object_id INNER JOIN sys.types t ON t.user_type_id = c.user_type_id AND t.system_type_id = c.system_type_id WHERE o.name = :tabela ORDER BY c.column_id`;
    case "sybase":
      return `SELECT TOP ${DESCREVER_TABELA_MAX_ROWS} c.name AS column_name, t.name AS data_type, CASE c.status & 8 WHEN 8 THEN 'YES' ELSE 'NO' END AS is_nullable FROM syscolumns c INNER JOIN sysobjects o ON o.id = c.id INNER JOIN systypes t ON t.usertype = c.usertype WHERE o.name = :tabela ORDER BY c.colid`;
    case "postgres":
      return temSchema
        ? `SELECT a.attname AS column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type, CASE a.attnotnull WHEN true THEN 'NO' ELSE 'YES' END AS is_nullable FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = :tabela AND n.nspname = :schema AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT ${DESCREVER_TABELA_MAX_ROWS}`
        : `SELECT a.attname AS column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type, CASE a.attnotnull WHEN true THEN 'NO' ELSE 'YES' END AS is_nullable FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid WHERE c.relname = :tabela AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT ${DESCREVER_TABELA_MAX_ROWS}`;
    case "firebird":
      return `SELECT FIRST ${DESCREVER_TABELA_MAX_ROWS} TRIM(f.RDB$FIELD_NAME) AS column_name, TRIM(t.RDB$FIELD_NAME) AS data_type, CASE f.RDB$NULL_FLAG WHEN 1 THEN 'NO' ELSE 'YES' END AS is_nullable FROM RDB$RELATION_FIELDS f LEFT JOIN RDB$FIELDS t ON t.RDB$FIELD_NAME = f.RDB$FIELD_SOURCE WHERE TRIM(f.RDB$RELATION_NAME) = :tabela ORDER BY f.RDB$FIELD_POSITION`;
  }
};

export const cell = (row: Record<string, unknown>, ...keys: string[]): string => {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const [key, value] of Object.entries(row)) {
    if (!wanted.has(key.toLowerCase()) || value == null) {
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value).trim();
    }
  }
  return "";
};

export interface ColunaCatalogo {
  readonly nome: string;
  readonly tipo: string;
  readonly nullable: string;
}

export const agruparColunasCatalogo = (
  rows: readonly Record<string, unknown>[],
): { colunas: ColunaCatalogo[]; ambiguas: boolean } => {
  const byName = new Map<string, { nome: string; tipos: Set<string>; nullable: string }>();
  const order: string[] = [];
  for (const row of rows) {
    const nome = cell(row, "column_name");
    if (!nome || !isIdentificadorSql(nome)) {
      continue;
    }
    const tipo = cell(row, "data_type");
    const nullable = cell(row, "is_nullable");
    const key = nome.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { nome, tipos: new Set(tipo ? [tipo] : []), nullable });
      order.push(key);
      continue;
    }
    if (tipo) {
      existing.tipos.add(tipo);
    }
    if (!existing.nullable && nullable) {
      existing.nullable = nullable;
    }
  }
  const colunas: ColunaCatalogo[] = order.flatMap((key) => {
    const item = byName.get(key);
    if (!item || !isIdentificadorSql(item.nome)) {
      return [];
    }
    const tipoUnico = item.tipos.size === 1 ? [...item.tipos][0] : undefined;
    return [{ nome: item.nome, tipo: tipoUnico ?? "", nullable: item.nullable }];
  });
  const ambiguas = [...byName.values()].some((item) => item.tipos.size > 1);
  return { colunas, ambiguas };
};

export const hintCatalogoSistemaNegado = (): string =>
  "O client_token deste ambiente não autoriza o catálogo de sistema. Peça ao usuário ou ao admin do ERP os nomes das tabelas, ou libere o catálogo de sistema no token. Não insista nesta tool.";
