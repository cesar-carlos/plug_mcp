export interface ParRelacionamento {
  readonly colunaOrigem: string;
  readonly colunaDestino: string;
}

const lower = (value: string): string => value.trim().toLowerCase();

export const parseParesRelacionamento = (value: unknown): ParRelacionamento[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: ParRelacionamento[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const colunaOrigem = typeof rec.colunaOrigem === "string" ? rec.colunaOrigem.trim() : "";
    const colunaDestino = typeof rec.colunaDestino === "string" ? rec.colunaDestino.trim() : "";
    if (!colunaOrigem || !colunaDestino) {
      continue;
    }
    out.push({ colunaOrigem, colunaDestino });
  }
  return out;
};

export const paresDeInput = (input: {
  pares?: readonly { colunaOrigem?: string; colunaDestino?: string }[];
  colunaOrigem?: string;
  colunaDestino?: string;
}): ParRelacionamento[] => {
  const fromList = parseParesRelacionamento(input.pares);
  if (fromList.length > 0) {
    return fromList;
  }
  const colunaOrigem = input.colunaOrigem?.trim() ?? "";
  const colunaDestino = input.colunaDestino?.trim() ?? "";
  if (!colunaOrigem || !colunaDestino) {
    return [];
  }
  return [{ colunaOrigem, colunaDestino }];
};

export const fingerprintPares = (pares: readonly ParRelacionamento[]): string =>
  [...pares]
    .map((par) => `${lower(par.colunaOrigem)}=${lower(par.colunaDestino)}`)
    .sort()
    .join("&");

export const fingerprintParesInvertidos = (pares: readonly ParRelacionamento[]): string =>
  fingerprintPares(
    pares.map((par) => ({ colunaOrigem: par.colunaDestino, colunaDestino: par.colunaOrigem })),
  );

export const paresEquivalentes = (
  a: readonly ParRelacionamento[],
  b: readonly ParRelacionamento[],
): boolean => {
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  const fa = fingerprintPares(a);
  return fa === fingerprintPares(b) || fa === fingerprintParesInvertidos(b);
};

export const labelPares = (
  tabelaOrigem: string,
  tabelaDestino: string,
  pares: readonly ParRelacionamento[],
): string =>
  pares
    .map((par) => `${tabelaOrigem}.${par.colunaOrigem} = ${tabelaDestino}.${par.colunaDestino}`)
    .join(" AND ");

export interface IgualdadeResolvida {
  readonly leftTable: string;
  readonly leftColumn: string;
  readonly rightTable: string;
  readonly rightColumn: string;
}

export const paresDeIgualdades = (eqs: readonly IgualdadeResolvida[]): {
  tabelaOrigem: string;
  tabelaDestino: string;
  pares: ParRelacionamento[];
} | null => {
  const first = eqs[0];
  if (!first) {
    return null;
  }
  const tabelaOrigem = first.leftTable;
  const tabelaDestino = first.rightTable;
  const pares: ParRelacionamento[] = [];
  for (const eq of eqs) {
    if (
      lower(eq.leftTable) === lower(tabelaOrigem) &&
      lower(eq.rightTable) === lower(tabelaDestino)
    ) {
      pares.push({ colunaOrigem: eq.leftColumn, colunaDestino: eq.rightColumn });
      continue;
    }
    if (
      lower(eq.leftTable) === lower(tabelaDestino) &&
      lower(eq.rightTable) === lower(tabelaOrigem)
    ) {
      pares.push({ colunaOrigem: eq.rightColumn, colunaDestino: eq.leftColumn });
      continue;
    }
    return null;
  }
  return { tabelaOrigem, tabelaDestino, pares };
};

export const igualdadesCobremRelacionamento = (
  eqs: readonly IgualdadeResolvida[],
  rel: {
    tabelaOrigem: string;
    tabelaDestino: string;
    pares: readonly ParRelacionamento[];
  },
): boolean => {
  const grouped = paresDeIgualdades(eqs);
  if (grouped?.pares.length !== rel.pares.length) {
    return false;
  }
  const sameTables =
    lower(grouped.tabelaOrigem) === lower(rel.tabelaOrigem) &&
    lower(grouped.tabelaDestino) === lower(rel.tabelaDestino);
  const swappedTables =
    lower(grouped.tabelaOrigem) === lower(rel.tabelaDestino) &&
    lower(grouped.tabelaDestino) === lower(rel.tabelaOrigem);
  if (sameTables) {
    return paresEquivalentes(grouped.pares, rel.pares);
  }
  if (swappedTables) {
    return paresEquivalentes(grouped.pares, rel.pares);
  }
  return false;
};
