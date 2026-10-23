import type { Dialeto } from "../../domain/entities/dialeto.js";
import type { EscopoSkill } from "../../domain/entities/escopo.js";
import { validarAstNoEscopo } from "../use-cases/shared/validar-escopo.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { parseSelect, type SqlAstSelect } from "../use-cases/shared/sql-ast.js";

export const validateSourceSql = (
  sql: string,
  dialect: Dialeto,
  scope: EscopoSkill,
  options?: { page?: number; pageSize?: number },
): SqlAstSelect => {
  if (dialect === "firebird")
    throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Firebird não é suportado.");
  return validarAstNoEscopo(
    parseSelect(sql, dialect, { allowSchemaQualifiedTables: true }),
    scope,
    options,
  );
};
