import {
  fingerprintPares,
  parseParesRelacionamento,
  type ParRelacionamento,
} from "./relacionamento.js";

export type { ParRelacionamento } from "./relacionamento.js";

export type PapelColuna = "chave" | "dimensao" | "medida" | "codigo" | "data";

export type Cardinalidade = "1:1" | "1:N" | "N:1" | "N:N";

export const PACOTE_VERSAO_ATUAL = 2;

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
  readonly pares: readonly ParRelacionamento[];
  readonly tipoJoin: string;
  readonly cardinalidade?: Cardinalidade | null;
}

export const paresDoRelacionamento = (
  rel: Pick<RelacionamentoEscopo, "pares" | "colunaOrigem" | "colunaDestino">,
): readonly ParRelacionamento[] => {
  if (rel.pares && rel.pares.length > 0) {
    return rel.pares;
  }
  if (rel.colunaOrigem && rel.colunaDestino) {
    return [{ colunaOrigem: rel.colunaOrigem, colunaDestino: rel.colunaDestino }];
  }
  return [];
};

export const chaveRelacionamentoEscopo = (rel: RelacionamentoEscopo): string => {
  const pares = paresDoRelacionamento(rel);
  const tables = [rel.tabelaOrigem, rel.tabelaDestino].map((nome) => nome.trim().toLowerCase());
  tables.sort();
  return `${tables.join("~")}|${fingerprintPares(pares)}`;
};

export interface MetricaSaida {
  readonly alias: string;
  readonly expr: string;
  readonly definicao?: string;
  readonly grao?: string;
  readonly dimensoesPermitidas?: readonly string[];
  readonly statusIncluidos?: readonly string[];
  readonly statusExcluidos?: readonly string[];
  readonly colunaData?: string;
}

export interface EscopoSkill {
  readonly tabelas: readonly string[];
  readonly colunasPorTabela: Readonly<Record<string, readonly string[]>>;
  readonly relacionamentos: readonly RelacionamentoEscopo[];
  readonly graoPorTabela: Readonly<Record<string, readonly string[]>>;
  readonly graoResultado: readonly string[];
  readonly metricasSaida: readonly MetricaSaida[];
  readonly pacoteVersao: number;
}

export interface BindingEscopoPadrao {
  readonly tabela: string;
  readonly coluna: string;
  readonly param: "empresa" | "filial";
}

export interface EscopoPadraoAcesso {
  readonly empresa?: string;
  readonly filial?: string;
  readonly bindings?: readonly BindingEscopoPadrao[];
}

export const escopoVazio = (): EscopoSkill => ({
  tabelas: [],
  colunasPorTabela: {},
  relacionamentos: [],
  graoPorTabela: {},
  graoResultado: [],
  metricasSaida: [],
  pacoteVersao: PACOTE_VERSAO_ATUAL,
});

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
};

const asStringMap = (value: unknown): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  if (!value || typeof value !== "object") {
    return out;
  }
  for (const [tabela, colunas] of Object.entries(value as Record<string, unknown>)) {
    out[tabela] = asStringArray(colunas);
  }
  return out;
};

const parseMetricas = (value: unknown): MetricaSaida[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: MetricaSaida[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const alias = typeof rec.alias === "string" ? rec.alias.trim() : "";
    const expr = typeof rec.expr === "string" ? rec.expr.trim() : "";
    if (!alias) {
      continue;
    }
    const definicao = typeof rec.definicao === "string" ? rec.definicao.trim() : "";
    const grao = typeof rec.grao === "string" ? rec.grao.trim() : "";
    const colunaData = typeof rec.colunaData === "string" ? rec.colunaData.trim() : "";
    out.push({
      alias,
      expr,
      ...(definicao ? { definicao } : {}),
      ...(grao ? { grao } : {}),
      ...(asStringArray(rec.dimensoesPermitidas).length > 0
        ? { dimensoesPermitidas: asStringArray(rec.dimensoesPermitidas) }
        : {}),
      ...(asStringArray(rec.statusIncluidos).length > 0
        ? { statusIncluidos: asStringArray(rec.statusIncluidos) }
        : {}),
      ...(asStringArray(rec.statusExcluidos).length > 0
        ? { statusExcluidos: asStringArray(rec.statusExcluidos) }
        : {}),
      ...(colunaData ? { colunaData } : {}),
    });
  }
  return out;
};

const parseCardinalidade = (value: unknown): Cardinalidade | null =>
  value === "1:1" || value === "1:N" || value === "N:1" || value === "N:N" ? value : null;

export const parseEscopoSkill = (value: unknown): EscopoSkill => {
  if (!value || typeof value !== "object") {
    return escopoVazio();
  }
  const rec = value as Record<string, unknown>;
  const relacionamentos: RelacionamentoEscopo[] = [];
  if (Array.isArray(rec.relacionamentos)) {
    for (const item of rec.relacionamentos) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const rel = item as Record<string, unknown>;
      const tabelaOrigem = typeof rel.tabelaOrigem === "string" ? rel.tabelaOrigem : "";
      const tabelaDestino = typeof rel.tabelaDestino === "string" ? rel.tabelaDestino : "";
      const paresParsed = parseParesRelacionamento(rel.pares);
      const colunaOrigem = typeof rel.colunaOrigem === "string" ? rel.colunaOrigem.trim() : "";
      const colunaDestino = typeof rel.colunaDestino === "string" ? rel.colunaDestino.trim() : "";
      const pares =
        paresParsed.length > 0
          ? paresParsed
          : colunaOrigem && colunaDestino
            ? [{ colunaOrigem, colunaDestino }]
            : [];
      const first = pares[0];
      const cardinalidade = parseCardinalidade(rel.cardinalidade);
      if (!tabelaOrigem || !tabelaDestino || !first) {
        continue;
      }
      relacionamentos.push({
        tabelaOrigem,
        colunaOrigem: first.colunaOrigem,
        tabelaDestino,
        colunaDestino: first.colunaDestino,
        pares,
        tipoJoin: typeof rel.tipoJoin === "string" ? rel.tipoJoin : "inner",
        ...(cardinalidade ? { cardinalidade } : {}),
      });
    }
  }
  const graoResultado = asStringArray(rec.graoResultado);
  const graoLegado = graoResultado.length > 0 ? graoResultado : asStringArray(rec.grao);
  const pacoteVersao =
    typeof rec.pacoteVersao === "number" && Number.isFinite(rec.pacoteVersao)
      ? rec.pacoteVersao
      : PACOTE_VERSAO_ATUAL;
  return {
    tabelas: asStringArray(rec.tabelas),
    colunasPorTabela: asStringMap(rec.colunasPorTabela),
    relacionamentos,
    graoPorTabela: asStringMap(rec.graoPorTabela),
    graoResultado: graoLegado,
    metricasSaida: parseMetricas(rec.metricasSaida),
    pacoteVersao,
  };
};

const parseBindings = (value: unknown): BindingEscopoPadrao[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: BindingEscopoPadrao[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const tabela = typeof rec.tabela === "string" ? rec.tabela.trim() : "";
    const coluna = typeof rec.coluna === "string" ? rec.coluna.trim() : "";
    const param = rec.param === "filial" ? "filial" : rec.param === "empresa" ? "empresa" : null;
    if (!tabela || !coluna || !param) {
      continue;
    }
    out.push({ tabela, coluna, param });
  }
  return out;
};

export const parseEscopoPadrao = (value: unknown): EscopoPadraoAcesso | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const rec = value as Record<string, unknown>;
  const empresa = typeof rec.empresa === "string" ? rec.empresa.trim() : "";
  const filial = typeof rec.filial === "string" ? rec.filial.trim() : "";
  const bindings = parseBindings(rec.bindings);
  if (!empresa && !filial && bindings.length === 0) {
    return null;
  }
  return {
    ...(empresa ? { empresa } : {}),
    ...(filial ? { filial } : {}),
    ...(bindings.length > 0 ? { bindings } : {}),
  };
};

const mergeStringMap = (
  into: Record<string, Set<string>>,
  source: Readonly<Record<string, readonly string[]>>,
): void => {
  for (const [tabela, colunas] of Object.entries(source)) {
    const set = into[tabela] ?? new Set<string>();
    for (const coluna of colunas) {
      set.add(coluna);
    }
    into[tabela] = set;
  }
};

const freezeMap = (source: Record<string, Set<string>>): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const [tabela, set] of Object.entries(source)) {
    out[tabela] = [...set];
  }
  return out;
};

export const uniaoEscopos = (escopos: readonly EscopoSkill[]): EscopoSkill => {
  const tabelas = new Set<string>();
  const colunasPorTabela: Record<string, Set<string>> = {};
  const graoPorTabela: Record<string, Set<string>> = {};
  const relKeys = new Map<string, RelacionamentoEscopo>();
  const graoResultado = new Set<string>();
  const metricas = new Map<string, MetricaSaida>();
  let pacoteVersao = PACOTE_VERSAO_ATUAL;
  for (const escopo of escopos) {
    pacoteVersao = Math.max(pacoteVersao, escopo.pacoteVersao);
    for (const tabela of escopo.tabelas) {
      tabelas.add(tabela);
    }
    mergeStringMap(colunasPorTabela, escopo.colunasPorTabela);
    mergeStringMap(graoPorTabela, escopo.graoPorTabela);
    for (const rel of escopo.relacionamentos) {
      const key = chaveRelacionamentoEscopo(rel);
      const prev = relKeys.get(key);
      if (!prev) {
        relKeys.set(key, rel);
        continue;
      }
      relKeys.set(key, {
        ...rel,
        ...(rel.cardinalidade ? { cardinalidade: rel.cardinalidade } : prev.cardinalidade ? { cardinalidade: prev.cardinalidade } : {}),
      });
    }
    for (const item of escopo.graoResultado) {
      graoResultado.add(item);
    }
    for (const metrica of escopo.metricasSaida) {
      metricas.set(metrica.alias.toLowerCase(), metrica);
    }
  }
  return {
    tabelas: [...tabelas],
    colunasPorTabela: freezeMap(colunasPorTabela),
    relacionamentos: [...relKeys.values()],
    graoPorTabela: freezeMap(graoPorTabela),
    graoResultado: [...graoResultado],
    metricasSaida: [...metricas.values()],
    pacoteVersao,
  };
};
