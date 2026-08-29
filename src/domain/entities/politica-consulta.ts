export type ModoConsultaPreferencial = "agregado" | "detalhe";

export interface PoliticaConsulta {
  readonly maxRows?: number;
  readonly timeoutMs?: number;
  readonly exigirRecorteTemporal?: boolean;
  readonly maxTabelas?: number;
  readonly modoPreferencial?: ModoConsultaPreferencial;
}

export const parsePoliticaConsulta = (value: unknown): PoliticaConsulta | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const rec = value as Record<string, unknown>;
  const maxRows = typeof rec.maxRows === "number" && rec.maxRows > 0 ? rec.maxRows : undefined;
  const timeoutMs =
    typeof rec.timeoutMs === "number" && rec.timeoutMs > 0 ? rec.timeoutMs : undefined;
  const maxTabelas =
    typeof rec.maxTabelas === "number" && rec.maxTabelas > 0 ? rec.maxTabelas : undefined;
  const exigirRecorteTemporal =
    typeof rec.exigirRecorteTemporal === "boolean" ? rec.exigirRecorteTemporal : undefined;
  const modoPreferencial =
    rec.modoPreferencial === "agregado" || rec.modoPreferencial === "detalhe"
      ? rec.modoPreferencial
      : undefined;
  if (
    maxRows == null &&
    timeoutMs == null &&
    maxTabelas == null &&
    exigirRecorteTemporal == null &&
    modoPreferencial == null
  ) {
    return null;
  }
  return { maxRows, timeoutMs, exigirRecorteTemporal, maxTabelas, modoPreferencial };
};
