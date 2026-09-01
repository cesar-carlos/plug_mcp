import type { RelacionamentoEscopo } from "../../../domain/entities/escopo.js";
import { paresDoRelacionamento } from "../../../domain/entities/escopo.js";
import type { RelacionamentoGrafo } from "../../../domain/entities/grafo.js";
import {
  fingerprintPares,
  fingerprintParesInvertidos,
  type ParRelacionamento,
} from "../../../domain/entities/relacionamento.js";
import { escopoFromAst } from "./escopo-from-modelo.js";
import { tryParseSelect } from "./sql-ast.js";

const lower = (value: string): string => value.trim().toLowerCase();

export const matchRelacionamentoGrafo = (
  rels: readonly RelacionamentoGrafo[],
  origemId: string,
  destinoId: string,
  pares: readonly ParRelacionamento[],
): RelacionamentoGrafo | undefined => {
  const fp = fingerprintPares(pares);
  const fpInv = fingerprintParesInvertidos(pares);
  return rels.find((item) => {
    const direto =
      item.tabelaOrigemId === origemId &&
      item.tabelaDestinoId === destinoId &&
      item.paresFingerprint === fp;
    const inverso =
      item.tabelaOrigemId === destinoId &&
      item.tabelaDestinoId === origemId &&
      item.paresFingerprint === fpInv;
    return direto || inverso;
  });
};

export const matchRelacionamentoEscopo = (
  rels: readonly RelacionamentoEscopo[],
  tabelaOrigem: string,
  tabelaDestino: string,
  pares: readonly ParRelacionamento[],
): RelacionamentoEscopo | undefined => {
  const fp = fingerprintPares(pares);
  const fpInv = fingerprintParesInvertidos(pares);
  const origem = lower(tabelaOrigem);
  const destino = lower(tabelaDestino);
  return rels.find((rel) => {
    const relFp = fingerprintPares(paresDoRelacionamento(rel));
    const sameTables =
      (lower(rel.tabelaOrigem) === origem && lower(rel.tabelaDestino) === destino) ||
      (lower(rel.tabelaOrigem) === destino && lower(rel.tabelaDestino) === origem);
    return sameTables && (relFp === fp || relFp === fpInv);
  });
};

export const inferirTipoJoinDoSql = (
  sqlModelo: string,
  tabelaOrigem: string,
  tabelaDestino: string,
  pares: readonly ParRelacionamento[],
): string | undefined => {
  const ast = tryParseSelect(sqlModelo);
  if (!ast) {
    return undefined;
  }
  return matchRelacionamentoEscopo(
    escopoFromAst(ast).relacionamentos,
    tabelaOrigem,
    tabelaDestino,
    pares,
  )?.tipoJoin;
};

/**
 * Sem `tipoJoin` na tool: o SQL modelo (depois o pacote, depois o grafo) manda.
 * Evita gravar inner por default por cima de LEFT já inferido.
 */
export const resolverTipoJoinConfirmacao = (input: {
  readonly informado?: string;
  readonly doSql?: string;
  readonly doEscopo?: string;
  readonly doGrafo?: string;
}): string => {
  const informado = input.informado?.trim();
  if (informado) {
    return informado;
  }
  const doSql = input.doSql?.trim();
  if (doSql) {
    return doSql;
  }
  const doEscopo = input.doEscopo?.trim();
  if (doEscopo) {
    return doEscopo;
  }
  const doGrafo = input.doGrafo?.trim();
  if (doGrafo) {
    return doGrafo;
  }
  return "inner";
};
