import type { EscopoSkill } from "../../../domain/entities/escopo.js";
import { paresDoRelacionamento } from "../../../domain/entities/escopo.js";
import { labelPares } from "../../../domain/entities/relacionamento.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { SqlAstSelect } from "./sql-ast.js";

const lower = (value: string): string => value.trim().toLowerCase();

const MEDIDA_NOME = /valor|saldo/i;

const temMedidaAgregada = (ast: SqlAstSelect, escopo: EscopoSkill): boolean => {
  if (!ast.temAgregacao) {
    return false;
  }
  if (escopo.metricasSaida.length > 0) {
    return ast.colunas.some((coluna) => coluna.isAggregate);
  }
  return ast.colunas.some((coluna) => {
    if (!coluna.isAggregate) {
      return false;
    }
    return MEDIDA_NOME.test(`${coluna.expr} ${coluna.alias} ${coluna.column ?? ""}`);
  });
};

const tabelasNoAst = (ast: SqlAstSelect): Set<string> => {
  const names = new Set<string>();
  for (const tabela of ast.tabelas) {
    names.add(lower(tabela.nome));
  }
  for (const join of ast.joins) {
    names.add(lower(join.tabela));
  }
  return names;
};

const joinNoAst = (ast: SqlAstSelect, origem: string, destino: string): boolean => {
  const o = lower(origem);
  const d = lower(destino);
  return ast.joins.some((join) => {
    const joined = lower(join.tabela);
    if (joined !== o && joined !== d) {
      return false;
    }
    const other = joined === o ? d : o;
    const fromNames = new Set(ast.tabelas.map((tabela) => lower(tabela.nome)));
    for (const prev of ast.joins) {
      fromNames.add(lower(prev.tabela));
    }
    return fromNames.has(other);
  });
};

export const assertFanoutSeguro = (ast: SqlAstSelect, escopo: EscopoSkill): void => {
  if (!temMedidaAgregada(ast, escopo) || ast.joins.length === 0) {
    return;
  }
  const noAst = tabelasNoAst(ast);
  for (const rel of escopo.relacionamentos) {
    const origem = lower(rel.tabelaOrigem);
    const destino = lower(rel.tabelaDestino);
    if (!noAst.has(origem) || !noAst.has(destino)) {
      continue;
    }
    if (!joinNoAst(ast, rel.tabelaOrigem, rel.tabelaDestino)) {
      continue;
    }
    if (rel.cardinalidade === "N:N" || rel.cardinalidade == null) {
      const pares = paresDoRelacionamento(rel);
      throw new DomainError({
        code: ERROR_CODES.FANOUT_NAO_DECLARADO,
        message: `Agregação financeira bloqueada: JOIN ${labelPares(rel.tabelaOrigem, rel.tabelaDestino, pares)} sem cardinalidade segura.`,
        hint: "Confirme a cardinalidade composta (não N:N não declarado) com confirmar_relacionamento no recorte de empresa/filial.",
      });
    }
  }
};
