import type { Dialeto } from "../../../domain/entities/dialeto.js";
import type { EscopoSkill } from "../../../domain/entities/escopo.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import { tryParseSelect } from "./sql-ast.js";

const looksLikeStar = (sql: string): boolean =>
  /\bselect\s+(?:top\s+\d+\s+)?(?:distinct\s+)?\*\s+from\b/i.test(sql.trim());

export const expandirStarDoEscopo = (
  sql: string,
  dialeto: Dialeto,
  escopo: EscopoSkill,
): string => {
  if (!looksLikeStar(sql)) {
    return sql;
  }
  const ast = tryParseSelect(sql, dialeto);
  const fisicas = ast?.tabelas.filter((tabela) => !tabela.isCte && !tabela.isSubquery) ?? [];
  if (fisicas.length !== 1 || !ast?.temStar) {
    throw new DomainError({
      code: ERROR_CODES.INVALID_SQL,
      message: "SELECT * não é expandido quando há mais de uma tabela.",
      hint: "Nomeie as colunas do pacote publicado.",
    });
  }
  const tabela = fisicas[0]!;
  const entry = Object.entries(escopo.colunasPorTabela).find(
    ([nome]) => nome.toLowerCase() === tabela.nome.toLowerCase(),
  );
  const colunas = entry?.[1] ?? [];
  if (colunas.length === 0) {
    throw new DomainError({
      code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
      message: `Não há colunas conhecidas para expandir SELECT * de ${tabela.nome}.`,
      hint: "Use obter_skill / descobrir_tabela e nomeie as colunas.",
    });
  }
  const alias = tabela.alias ?? tabela.nome;
  const selectList = colunas.map((coluna) => `${alias}.${coluna}`).join(", ");
  return sql.replace(/\bselect\s+(?:top\s+\d+\s+)?(?:distinct\s+)?\*\s+from\b/i, (match) =>
    match.replace("*", selectList),
  );
};
