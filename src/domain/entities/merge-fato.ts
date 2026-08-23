import type { OrigemFato, StatusFato } from "./grafo.js";
import { origemRank } from "./grafo.js";

export interface FatoMerge {
  readonly origem: OrigemFato;
  readonly status: StatusFato;
  readonly descricao: string | null;
  readonly dicionario?: string | null;
  readonly tipo?: string | null;
}

export interface MergeResultado extends FatoMerge {
  readonly conflito: boolean;
  readonly aplicar: boolean;
}

const norm = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase();

const conflitaTexto = (
  atual: string | null | undefined,
  incoming: string | null | undefined,
): boolean => {
  const a = norm(atual);
  const b = norm(incoming);
  return a.length > 0 && b.length > 0 && a !== b;
};

export const decidirMerge = (atual: FatoMerge, incoming: FatoMerge): MergeResultado => {
  const rankAtual = origemRank(atual.origem);
  const rankNovo = origemRank(incoming.origem);
  if (rankNovo > rankAtual) {
    return { ...incoming, status: "vigente", conflito: false, aplicar: true };
  }
  if (rankNovo < rankAtual) {
    return { ...atual, conflito: false, aplicar: false };
  }
  const conflito =
    conflitaTexto(atual.descricao, incoming.descricao) ||
    conflitaTexto(atual.dicionario, incoming.dicionario) ||
    conflitaTexto(atual.tipo, incoming.tipo);
  if (conflito) {
    return { ...atual, status: "conflito", conflito: true, aplicar: true };
  }
  return {
    origem: atual.origem,
    status: atual.status === "conflito" ? "conflito" : "vigente",
    descricao: atual.descricao ?? incoming.descricao,
    dicionario: atual.dicionario ?? incoming.dicionario,
    tipo: atual.tipo ?? incoming.tipo,
    conflito: false,
    aplicar: true,
  };
};
