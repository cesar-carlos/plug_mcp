import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { SensibilidadeColuna } from "../../../domain/entities/privacidade.js";
import type { SqlAstSelect } from "./sql-ast.js";
import { linhagemColunas, resolverSensibilidade } from "./mascarar-linhagem.js";

const soCount = (expr: string, isAggregate: boolean): boolean =>
  isAggregate && /\bcount\s*\(/i.test(expr) && !/\b(max|min|sum|avg)\s*\(/i.test(expr);

export const assertPrivacidadeAntesDoHub = (input: {
  ast: SqlAstSelect;
  lookup: (tabela: string | null, coluna: string) => SensibilidadeColuna | null;
  negar: readonly SensibilidadeColuna[];
}): void => {
  const output = input.ast.colunas.map(
    (coluna) => (coluna.alias.length > 0 ? coluna.alias : (coluna.column ?? coluna.expr)),
  );
  const linhagem = linhagemColunas(input.ast, output);
  const proibidas: string[] = [];
  for (const coluna of input.ast.colunas) {
    const nome = coluna.alias.length > 0 ? coluna.alias : (coluna.column ?? coluna.expr);
    const origens = linhagem.get(nome) ?? [{ table: coluna.table, column: coluna.column ?? nome }];
    const sens = resolverSensibilidade(origens, input.lookup);
    if (!input.negar.includes(sens)) {
      continue;
    }
    if (sens === "segredo") {
      proibidas.push(`${nome} (${sens})`);
      continue;
    }
    if (sens === "pessoal" && soCount(coluna.expr, coluna.isAggregate)) {
      continue;
    }
    proibidas.push(`${nome} (${sens})`);
  }
  if (proibidas.length === 0) {
    return;
  }
  throw new DomainError({
    code: ERROR_CODES.PRIVACIDADE_NEGADA,
    message: "A consulta projeta dado pessoal ou segredo.",
    hint: "Use inspecionar_consulta para amostra mascarada. Segredos nunca são revelados, nem em MAX/MIN.",
    details: { colunas: proibidas },
  });
};
