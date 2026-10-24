import {
  sourceRestrictionsSchema,
  type SourceRestriction,
} from "../../domain/persona-v2/source-restrictions.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { EscopoSkill } from "../../domain/entities/escopo.js";
import { implicaRecorte } from "../use-cases/shared/escopo-filtro.js";
import { walkSelectTree, type SqlAstSelect } from "../use-cases/shared/sql-ast.js";

export const parseSourceRestrictions = (raw: unknown): readonly SourceRestriction[] => {
  const parsed = sourceRestrictionsSchema.safeParse(raw ?? []);
  if (!parsed.success)
    throw new PersonaV2Error("INVALID_PLAN", "Recortes físicos da fonte inválidos.");
  return parsed.data;
};

export const enforceSourceRestrictions = (
  ast: SqlAstSelect,
  scope: EscopoSkill,
  restrictions: readonly SourceRestriction[],
): void => {
  for (const restriction of restrictions) {
    if (
      scope.tabelas.includes(restriction.table) &&
      !scope.colunasPorTabela[restriction.table]?.includes(restriction.column)
    ) {
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Coluna do recorte físico precisa estar classificada e publicada.",
      );
    }
  }
  walkSelectTree(ast, (select) => {
    for (const table of select.tabelas.filter((t) => !t.isCte && !t.isSubquery)) {
      for (const restriction of restrictions.filter((r) => r.table === table.nome.toLowerCase())) {
        if (
          !implicaRecorte(
            select.whereAst,
            table.alias ?? table.nome,
            restriction.column,
            restriction.parameter,
            select.tabelas.length === 1,
          )
        ) {
          throw DomainError.pacote({
            code: ERROR_CODES.ESCOPO_FILTRO_AUSENTE,
            message: `Recorte obrigatório ausente em ${table.nome}.${restriction.column}.`,
            hint: `Garanta ${table.alias ?? table.nome}.${restriction.column} = :${restriction.parameter} em cada caminho lógico e ocorrência física. O servidor preenche esse parâmetro.`,
          });
        }
      }
    }
  });
};
