import { DomainError } from "../errors/domain-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import {
  fingerprintPares,
  parseParesRelacionamento,
  relacoesSemSubconjuntos,
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
        ...(rel.cardinalidade
          ? { cardinalidade: rel.cardinalidade }
          : prev.cardinalidade
            ? { cardinalidade: prev.cardinalidade }
            : {}),
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
    relacionamentos: relacoesSemSubconjuntos(
      [...relKeys.values()].map((rel) => ({ ...rel, pares: paresDoRelacionamento(rel) })),
    ),
    graoPorTabela: freezeMap(graoPorTabela),
    graoResultado: [...graoResultado],
    metricasSaida: [...metricas.values()],
    pacoteVersao,
  };
};

export const escopoSemRelacoesSubset = (escopo: EscopoSkill): EscopoSkill => ({
  ...escopo,
  relacionamentos: relacoesSemSubconjuntos(
    escopo.relacionamentos.map((rel) => ({ ...rel, pares: paresDoRelacionamento(rel) })),
  ),
});

export interface MetricaSaidaPatch {
  readonly alias: string;
  readonly expr?: string;
  readonly definicao?: string;
  readonly grao?: string;
  readonly dimensoesPermitidas?: readonly string[];
  readonly statusIncluidos?: readonly string[];
  readonly statusExcluidos?: readonly string[];
  readonly colunaData?: string;
}

const optionalTrim = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
};

const overlayKpiField = (
  existing: string | undefined,
  incoming: string | undefined,
): string | undefined => {
  if (incoming === undefined) {
    return existing;
  }
  return incoming.length > 0 ? incoming : undefined;
};

const overlayKpiList = (
  existing: readonly string[] | undefined,
  incoming: readonly string[] | undefined,
): readonly string[] | undefined => {
  if (incoming === undefined) {
    return existing;
  }
  return incoming.length > 0 ? incoming : undefined;
};

const toMetricaPatch = (metrica: MetricaSaida): MetricaSaidaPatch => ({
  alias: metrica.alias,
  ...(metrica.definicao !== undefined ? { definicao: metrica.definicao } : {}),
  ...(metrica.grao !== undefined ? { grao: metrica.grao } : {}),
  ...(metrica.dimensoesPermitidas !== undefined
    ? { dimensoesPermitidas: metrica.dimensoesPermitidas }
    : {}),
  ...(metrica.statusIncluidos !== undefined ? { statusIncluidos: metrica.statusIncluidos } : {}),
  ...(metrica.statusExcluidos !== undefined ? { statusExcluidos: metrica.statusExcluidos } : {}),
  ...(metrica.colunaData !== undefined ? { colunaData: metrica.colunaData } : {}),
});

export const patchesKpiDeMetricas = (metricas: readonly MetricaSaida[]): MetricaSaidaPatch[] =>
  metricas
    .map(toMetricaPatch)
    .filter(
      (item) =>
        item.definicao !== undefined ||
        item.grao !== undefined ||
        item.dimensoesPermitidas !== undefined ||
        item.statusIncluidos !== undefined ||
        item.statusExcluidos !== undefined ||
        item.colunaData !== undefined,
    );

export const overlayMetricasSaida = (
  escopo: EscopoSkill,
  patch: readonly MetricaSaidaPatch[],
  options?: { readonly ignoreUnknown?: boolean },
): EscopoSkill => {
  if (patch.length === 0) {
    return escopo;
  }
  const byAlias = new Map(escopo.metricasSaida.map((item) => [item.alias.toLowerCase(), item]));
  const aliasesDisponiveis =
    escopo.metricasSaida.map((item) => item.alias).join(", ") || "(nenhum)";
  for (const item of patch) {
    const alias = item.alias.trim();
    if (!alias) {
      continue;
    }
    const existing = byAlias.get(alias.toLowerCase());
    if (!existing) {
      if (options?.ignoreUnknown) {
        continue;
      }
      throw new DomainError({
        code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
        message: `Métrica "${alias}" não está no pacote desta skill.`,
        hint: `Use só aliases já gerados pelo sqlModelo. Disponíveis: ${aliasesDisponiveis}.`,
      });
    }
    const exprPatch = optionalTrim(item.expr);
    if (
      exprPatch &&
      exprPatch.toLowerCase() !== existing.expr.toLowerCase() &&
      !options?.ignoreUnknown
    ) {
      throw new DomainError({
        code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
        message: `Não reescreva a expressão da métrica "${existing.alias}".`,
        hint: "O overlay de KPI só atualiza definição, grão, dimensões, status e coluna de data. Para mudar a expressão, altere o sqlModelo.",
      });
    }
    const definicao = overlayKpiField(existing.definicao, optionalTrim(item.definicao));
    const grao = overlayKpiField(existing.grao, optionalTrim(item.grao));
    const colunaData = overlayKpiField(existing.colunaData, optionalTrim(item.colunaData));
    const dimensoesPermitidas = overlayKpiList(
      existing.dimensoesPermitidas,
      item.dimensoesPermitidas,
    );
    const statusIncluidos = overlayKpiList(existing.statusIncluidos, item.statusIncluidos);
    const statusExcluidos = overlayKpiList(existing.statusExcluidos, item.statusExcluidos);
    byAlias.set(alias.toLowerCase(), {
      alias: existing.alias,
      expr: existing.expr,
      ...(definicao ? { definicao } : {}),
      ...(grao ? { grao } : {}),
      ...(dimensoesPermitidas ? { dimensoesPermitidas } : {}),
      ...(statusIncluidos ? { statusIncluidos } : {}),
      ...(statusExcluidos ? { statusExcluidos } : {}),
      ...(colunaData ? { colunaData } : {}),
    });
  }
  return { ...escopo, metricasSaida: [...byAlias.values()] };
};

export const reaplicarKpiOverlay = (
  escopoNovo: EscopoSkill,
  escopoAnterior: EscopoSkill,
): EscopoSkill =>
  overlayMetricasSaida(escopoNovo, patchesKpiDeMetricas(escopoAnterior.metricasSaida), {
    ignoreUnknown: true,
  });
