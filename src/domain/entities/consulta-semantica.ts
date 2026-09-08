export type OpFiltroSemantico =
  "=" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "like" | "is_null" | "is_not_null" | "between";

export type OpHavingSemantico = "=" | "!=" | ">" | ">=" | "<" | "<=";

export interface FiltroSemantico {
  readonly coluna: string;
  readonly op: OpFiltroSemantico;
  readonly param?: string;
  readonly param2?: string;
}

export interface HavingSemantico {
  readonly metrica: string;
  readonly op: OpHavingSemantico;
  readonly param: string;
}

export interface PeriodoSemantico {
  readonly coluna: string;
  readonly de: string;
  readonly ate: string;
}

export interface OrdenacaoSemantica {
  readonly coluna: string;
  readonly dir: "asc" | "desc";
}

export interface ConsultaSemanticaV1 {
  readonly versao: 1;
  readonly metrica: string;
  readonly metricas?: readonly string[];
  readonly dimensoes?: readonly string[];
  readonly filtros?: readonly FiltroSemantico[];
  readonly having?: readonly HavingSemantico[];
  readonly periodo?: PeriodoSemantico;
  readonly ordenacao?: readonly OrdenacaoSemantica[];
  readonly limite?: number;
}

/**
 * IR atual. A seleção de dimensão em `listagem` continua sendo uma coluna
 * certificada do pacote; não é uma licença para descobrir schema novo.
 */
export type ConsultaSemanticaV2 =
  | {
      readonly versao: 2;
      readonly modo: "agregacao";
      readonly metricas: readonly string[];
      readonly dimensoes?: readonly string[];
      readonly filtros?: readonly FiltroSemantico[];
      readonly having?: readonly HavingSemantico[];
      readonly periodo?: PeriodoSemantico;
      readonly ordenacao?: readonly OrdenacaoSemantica[];
      readonly limite?: number;
    }
  | {
      readonly versao: 2;
      readonly modo: "listagem";
      readonly dimensoes: readonly string[];
      readonly filtros?: readonly FiltroSemantico[];
      readonly periodo?: PeriodoSemantico;
      readonly ordenacao?: readonly OrdenacaoSemantica[];
      readonly limite?: number;
    };

export type ConsultaSemantica = ConsultaSemanticaV1 | ConsultaSemanticaV2;

const OPS = new Set<string>([
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "in",
  "like",
  "is_null",
  "is_not_null",
  "between",
]);

const HAVING_OPS = new Set<string>(["=", "!=", ">", ">=", "<", "<="]);

const OPS_SEM_PARAM = new Set(["is_null", "is_not_null"]);

export const aliasesMetricas = (consulta: ConsultaSemantica): readonly string[] => {
  if (consulta.versao === 2) {
    return consulta.modo === "agregacao" ? consulta.metricas : [];
  }
  if (consulta.metricas && consulta.metricas.length > 0) {
    return consulta.metricas;
  }
  return consulta.metrica.trim() ? [consulta.metrica] : [];
};

export const parseConsultaSemantica = (value: unknown): ConsultaSemantica | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const rec = value as Record<string, unknown>;
  const versao = rec.versao === 2 ? 2 : 1;
  const modo = rec.modo === "listagem" ? "listagem" : "agregacao";
  const metricasRaw = Array.isArray(rec.metricas)
    ? rec.metricas.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      )
    : [];
  const metricaSingular = typeof rec.metrica === "string" ? rec.metrica.trim() : "";
  const metricas =
    metricasRaw.length > 0
      ? metricasRaw.map((item) => item.trim())
      : metricaSingular
        ? [metricaSingular]
        : [];
  const metrica = metricas[0] ?? "";
  const dimensoes = Array.isArray(rec.dimensoes)
    ? rec.dimensoes.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      )
    : [];
  const filtros: FiltroSemantico[] = [];
  if (Array.isArray(rec.filtros)) {
    for (const item of rec.filtros) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const f = item as Record<string, unknown>;
      const coluna = typeof f.coluna === "string" ? f.coluna.trim() : "";
      const op = typeof f.op === "string" ? f.op.trim().toLowerCase() : "";
      const param = typeof f.param === "string" ? f.param.trim() : "";
      const param2 = typeof f.param2 === "string" ? f.param2.trim() : "";
      if (!coluna || !OPS.has(op)) {
        continue;
      }
      if (OPS_SEM_PARAM.has(op)) {
        filtros.push({ coluna, op: op as OpFiltroSemantico });
        continue;
      }
      if (op === "between") {
        if (!param || !param2) {
          continue;
        }
        filtros.push({ coluna, op: "between", param, param2 });
        continue;
      }
      if (!param) {
        continue;
      }
      filtros.push({ coluna, op: op as OpFiltroSemantico, param });
    }
  }
  const having: HavingSemantico[] = [];
  if (modo !== "listagem" && Array.isArray(rec.having)) {
    for (const item of rec.having) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const h = item as Record<string, unknown>;
      const alias = typeof h.metrica === "string" ? h.metrica.trim() : "";
      const op = typeof h.op === "string" ? h.op.trim() : "";
      const param = typeof h.param === "string" ? h.param.trim() : "";
      if (!alias || !param || !HAVING_OPS.has(op)) {
        continue;
      }
      having.push({ metrica: alias, op: op as OpHavingSemantico, param });
    }
  }
  let periodo: PeriodoSemantico | undefined;
  if (rec.periodo && typeof rec.periodo === "object") {
    const p = rec.periodo as Record<string, unknown>;
    const coluna = typeof p.coluna === "string" ? p.coluna.trim() : "";
    const de = typeof p.de === "string" ? p.de.trim() : "";
    const ate = typeof p.ate === "string" ? p.ate.trim() : "";
    if (coluna && de && ate) {
      periodo = { coluna, de, ate };
    }
  }
  const ordenacao: OrdenacaoSemantica[] = [];
  if (Array.isArray(rec.ordenacao)) {
    for (const item of rec.ordenacao) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const o = item as Record<string, unknown>;
      const coluna = typeof o.coluna === "string" ? o.coluna.trim() : "";
      if (!coluna) {
        continue;
      }
      ordenacao.push({ coluna, dir: o.dir === "desc" ? "desc" : "asc" });
    }
  }
  const limiteRaw = rec.limite;
  const limite =
    typeof limiteRaw === "number" && Number.isInteger(limiteRaw) && limiteRaw > 0
      ? limiteRaw
      : undefined;
  const common = {
    ...(filtros.length > 0 ? { filtros } : {}),
    ...(periodo ? { periodo } : {}),
    ...(ordenacao.length > 0 ? { ordenacao } : {}),
    ...(limite != null ? { limite } : {}),
  };
  if (versao === 2) {
    if (modo === "listagem") {
      // O modo de listagem não aceita métrica singular, metricas[] nem HAVING;
      // manter essa validação no parser também protege chamadas internas que
      // não passaram pelo schema MCP.
      if (
        metricaSingular ||
        metricasRaw.length > 0 ||
        (Array.isArray(rec.having) && rec.having.length > 0)
      ) {
        return null;
      }
      return dimensoes.length > 0 ? { versao: 2, modo, dimensoes, ...common } : null;
    }
    return metricas.length > 0 && !metricaSingular
      ? {
          versao: 2,
          modo,
          metricas,
          ...(dimensoes.length > 0 ? { dimensoes } : {}),
          ...(having.length > 0 ? { having } : {}),
          ...common,
        }
      : null;
  }
  if (!metrica) {
    return null;
  }
  return {
    versao: 1,
    metrica,
    ...(metricas.length > 1 || metricasRaw.length > 0 ? { metricas } : {}),
    ...(dimensoes.length > 0 ? { dimensoes } : {}),
    ...(having.length > 0 ? { having } : {}),
    ...common,
  };
};
