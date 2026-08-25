export type PapelColuna = "chave" | "dimensao" | "medida" | "codigo" | "data";

export type Cardinalidade = "1:1" | "1:N" | "N:1" | "N:N";

export interface PerfilColuna {
  readonly min?: string | number | null;
  readonly max?: string | number | null;
  readonly nulos?: number | null;
  readonly distintos?: number | null;
  readonly candidatosDicionario?: readonly string[];
}

export interface RelacionamentoEscopo {
  readonly tabelaOrigem: string;
  readonly colunaOrigem: string;
  readonly tabelaDestino: string;
  readonly colunaDestino: string;
  readonly tipoJoin: string;
}

export interface EscopoSkill {
  readonly tabelas: readonly string[];
  readonly colunasPorTabela: Readonly<Record<string, readonly string[]>>;
  readonly relacionamentos: readonly RelacionamentoEscopo[];
  readonly grao: readonly string[];
}

export interface EscopoPadraoAcesso {
  readonly empresa?: string;
  readonly filial?: string;
}

export const escopoVazio = (): EscopoSkill => ({
  tabelas: [],
  colunasPorTabela: {},
  relacionamentos: [],
  grao: [],
});

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
};

export const parseEscopoSkill = (value: unknown): EscopoSkill => {
  if (!value || typeof value !== "object") {
    return escopoVazio();
  }
  const rec = value as Record<string, unknown>;
  const colunasPorTabela: Record<string, string[]> = {};
  if (rec.colunasPorTabela && typeof rec.colunasPorTabela === "object") {
    for (const [tabela, colunas] of Object.entries(
      rec.colunasPorTabela as Record<string, unknown>,
    )) {
      colunasPorTabela[tabela] = asStringArray(colunas);
    }
  }
  const relacionamentos: RelacionamentoEscopo[] = [];
  if (Array.isArray(rec.relacionamentos)) {
    for (const item of rec.relacionamentos) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const rel = item as Record<string, unknown>;
      const tabelaOrigem = typeof rel.tabelaOrigem === "string" ? rel.tabelaOrigem : "";
      const colunaOrigem = typeof rel.colunaOrigem === "string" ? rel.colunaOrigem : "";
      const tabelaDestino = typeof rel.tabelaDestino === "string" ? rel.tabelaDestino : "";
      const colunaDestino = typeof rel.colunaDestino === "string" ? rel.colunaDestino : "";
      if (!tabelaOrigem || !colunaOrigem || !tabelaDestino || !colunaDestino) {
        continue;
      }
      relacionamentos.push({
        tabelaOrigem,
        colunaOrigem,
        tabelaDestino,
        colunaDestino,
        tipoJoin: typeof rel.tipoJoin === "string" ? rel.tipoJoin : "inner",
      });
    }
  }
  return {
    tabelas: asStringArray(rec.tabelas),
    colunasPorTabela,
    relacionamentos,
    grao: asStringArray(rec.grao),
  };
};

export const parseEscopoPadrao = (value: unknown): EscopoPadraoAcesso | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const rec = value as Record<string, unknown>;
  const empresa = typeof rec.empresa === "string" ? rec.empresa.trim() : "";
  const filial = typeof rec.filial === "string" ? rec.filial.trim() : "";
  if (!empresa && !filial) {
    return null;
  }
  return {
    ...(empresa ? { empresa } : {}),
    ...(filial ? { filial } : {}),
  };
};

export const uniaoEscopos = (escopos: readonly EscopoSkill[]): EscopoSkill => {
  const tabelas = new Set<string>();
  const colunasPorTabela: Record<string, Set<string>> = {};
  const relKeys = new Map<string, RelacionamentoEscopo>();
  const grao = new Set<string>();
  for (const escopo of escopos) {
    for (const tabela of escopo.tabelas) {
      tabelas.add(tabela);
    }
    for (const [tabela, colunas] of Object.entries(escopo.colunasPorTabela)) {
      const set = colunasPorTabela[tabela] ?? new Set<string>();
      for (const coluna of colunas) {
        set.add(coluna);
      }
      colunasPorTabela[tabela] = set;
    }
    for (const rel of escopo.relacionamentos) {
      const key = [rel.tabelaOrigem, rel.colunaOrigem, rel.tabelaDestino, rel.colunaDestino]
        .join("|")
        .toLowerCase();
      relKeys.set(key, rel);
    }
    for (const item of escopo.grao) {
      grao.add(item);
    }
  }
  const colunas: Record<string, string[]> = {};
  for (const [tabela, set] of Object.entries(colunasPorTabela)) {
    colunas[tabela] = [...set];
  }
  return {
    tabelas: [...tabelas],
    colunasPorTabela: colunas,
    relacionamentos: [...relKeys.values()],
    grao: [...grao],
  };
};
