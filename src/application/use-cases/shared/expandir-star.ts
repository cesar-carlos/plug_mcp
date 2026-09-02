import type { Dialeto } from "../../../domain/entities/dialeto.js";
import { recusarSqlLivreFirebird } from "./sql-ast.js";
import { parseIdentificadorTabela } from "./schema-introspection.js";
import { sqlDeclaraLimiteExterno } from "./sql-scan.js";

/** SELECT * cortado no dialeto (inspeção). Firebird não tem SQL livre. */
export const sqlStarDescoberta = (dialeto: Dialeto, tabela: string, maxRows: number): string => {
  if (dialeto === "firebird") {
    recusarSqlLivreFirebird();
  }
  const ident = parseIdentificadorTabela(tabela);
  const from = ident.schema ? `${ident.schema}.${ident.tabela}` : ident.tabela;
  if (dialeto === "postgres") {
    return `SELECT * FROM ${from} LIMIT ${String(maxRows)}`;
  }
  return `SELECT TOP ${String(maxRows)} * FROM ${from}`;
};

/** Injeta TOP/LIMIT/FIRST se a inspeção não declarou corte. Não usa options.page. */
export const garantirLimiteInspecao = (sql: string, dialeto: Dialeto, maxRows: number): string => {
  const trimmed = sql.trim().replace(/;+\s*$/u, "");
  if (sqlDeclaraLimiteExterno(trimmed)) {
    return trimmed;
  }
  if (dialeto === "postgres") {
    return `${trimmed} LIMIT ${String(maxRows)}`;
  }
  if (dialeto === "firebird") {
    return trimmed.replace(/^\s*select\s+/i, `SELECT FIRST ${String(maxRows)} `);
  }
  return trimmed.replace(
    /^\s*select(\s+distinct)?\s+/i,
    (_match, distinct: string | undefined) => `SELECT${distinct ?? ""} TOP ${String(maxRows)} `,
  );
};
