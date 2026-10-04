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
  for (const child of [...input.ast.subqueries, ...input.ast.setBranches]) {
    assertPrivacidadeAntesDoHub({ ...input, ast: child });
  }
  const output = input.ast.colunas.map((coluna) =>
    coluna.alias.length > 0 ? coluna.alias : (coluna.column ?? coluna.expr),
  );
  const linhagem = linhagemColunas(input.ast, output);
  const proibidas: string[] = [];
  for (const ref of [...input.ast.filtroRefs, ...input.ast.groupByRefs, ...input.ast.orderByRefs]) {
    const tabela = input.ast.tabelas.find(
      (item) =>
        item.alias?.toLowerCase() === ref.table?.toLowerCase() ||
        item.nome.toLowerCase() === ref.table?.toLowerCase(),
    );
    const nomeFisico =
      tabela?.nome ??
      ref.table ??
      (input.ast.tabelas.length === 1 ? input.ast.tabelas[0]!.nome : null);
    if (
      resolverSensibilidade([{ table: nomeFisico, column: ref.column }], input.lookup) === "segredo"
    ) {
      proibidas.push(`${ref.column} (segredo)`);
    }
  }
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
    message: "A consulta utiliza dado pessoal ou segredo sem autorização de exposição.",
    hint: "Não projete colunas pessoais ou segredo. Pessoal só COUNT. Segredos nunca são revelados, nem em MAX/MIN. inspecionar_consulta não é amostra mascarada de foto — não use como segunda via.",
    nextAction: "consultar_dados",
    details: { colunas: proibidas },
  });
};
