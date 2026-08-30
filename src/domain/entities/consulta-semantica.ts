export interface FiltroSemantico {
  readonly coluna: string;
  readonly op: "=" | "!=" | ">" | ">=" | "<" | "<=" | "in";
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

export interface ConsultaSemantica {
  readonly versao: 1;
  readonly metrica: string;
  readonly dimensoes?: readonly string[];
  readonly filtros?: readonly FiltroSemantico[];
  readonly periodo?: PeriodoSemantico;
  readonly ordenacao?: readonly OrdenacaoSemantica[];
}

const OPS = new Set(["=", "!=", ">", ">=", "<", "<=", "in"]);

export const parseConsultaSemantica = (value: unknown): ConsultaSemantica | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const rec = value as Record<string, unknown>;
  const metrica = typeof rec.metrica === "string" ? rec.metrica.trim() : "";
  if (!metrica) {
    return null;
  }
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
      if (!coluna || !param || !OPS.has(op)) {
        continue;
      }
      filtros.push({ coluna, op: op as FiltroSemantico["op"], param });
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
  return {
    versao: 1,
    metrica,
    ...(dimensoes.length > 0 ? { dimensoes } : {}),
    ...(filtros.length > 0 ? { filtros } : {}),
    ...(periodo ? { periodo } : {}),
    ...(ordenacao.length > 0 ? { ordenacao } : {}),
  };
};
