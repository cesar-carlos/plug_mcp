export type CoberturaBusca = "completa" | "parcial" | "desconhecida" | "composta";

export type GapBusca = "none" | "SKILL_GAP" | "SKILL_NOT_PUBLISHED";

export interface TelemetriaBusca {
  readonly conhecimentos: number;
  readonly slotNarrativa: boolean;
  readonly cobertura: CoberturaBusca;
  readonly consultaPermitida: boolean;
  readonly gap: GapBusca;
  readonly listarSkills: boolean;
}

const COBERTURAS = new Set<CoberturaBusca>(["completa", "parcial", "desconhecida", "composta"]);
const GAPS = new Set<GapBusca>(["none", "SKILL_GAP", "SKILL_NOT_PUBLISHED"]);

const flag = (on: boolean): "0" | "1" => (on ? "1" : "0");

export const formatarTagsTelemetriaBusca = (t: TelemetriaBusca): string =>
  [
    `conhecimentos=${String(t.conhecimentos)}`,
    `slotNarrativa=${flag(t.slotNarrativa)}`,
    `cobertura=${t.cobertura}`,
    `permitida=${flag(t.consultaPermitida)}`,
    `gap=${t.gap}`,
    `listarSkills=${flag(t.listarSkills)}`,
  ].join(";");

const parseFlag = (raw: string | undefined): boolean => raw === "1";

export const parseTagsTelemetriaBusca = (sqlEnviado: string | null): TelemetriaBusca | null => {
  if (!sqlEnviado?.includes("conhecimentos=")) {
    return null;
  }
  const map = new Map<string, string>();
  for (const part of sqlEnviado.split(";")) {
    const cut = part.indexOf("=");
    if (cut <= 0) {
      continue;
    }
    map.set(part.slice(0, cut), part.slice(cut + 1));
  }
  const conhecimentos = Number.parseInt(map.get("conhecimentos") ?? "", 10);
  const coberturaRaw = map.get("cobertura");
  const gapRaw = map.get("gap");
  if (
    !Number.isFinite(conhecimentos) ||
    conhecimentos < 0 ||
    !coberturaRaw ||
    !COBERTURAS.has(coberturaRaw as CoberturaBusca) ||
    !gapRaw ||
    !GAPS.has(gapRaw as GapBusca)
  ) {
    return null;
  }
  return {
    conhecimentos,
    slotNarrativa: parseFlag(map.get("slotNarrativa")),
    cobertura: coberturaRaw as CoberturaBusca,
    consultaPermitida: parseFlag(map.get("permitida")),
    gap: gapRaw as GapBusca,
    listarSkills: parseFlag(map.get("listarSkills")),
  };
};

export interface AgregadoBusca {
  readonly total: number;
  readonly consultaPermitida: number;
  readonly skillGap: number;
  readonly skillNotPublished: number;
  readonly slotNarrativa: number;
}

export const agregarTelemetriaBusca = (
  rows: readonly { tool: string; sqlEnviado: string | null }[],
): AgregadoBusca => {
  let total = 0;
  let consultaPermitida = 0;
  let skillGap = 0;
  let skillNotPublished = 0;
  let slotNarrativa = 0;
  for (const row of rows) {
    if (row.tool !== "buscar_contexto") {
      continue;
    }
    const parsed = parseTagsTelemetriaBusca(row.sqlEnviado);
    if (!parsed) {
      continue;
    }
    total += 1;
    if (parsed.consultaPermitida) {
      consultaPermitida += 1;
    }
    if (parsed.gap === "SKILL_GAP") {
      skillGap += 1;
    }
    if (parsed.gap === "SKILL_NOT_PUBLISHED") {
      skillNotPublished += 1;
    }
    if (parsed.slotNarrativa) {
      slotNarrativa += 1;
    }
  }
  return { total, consultaPermitida, skillGap, skillNotPublished, slotNarrativa };
};
