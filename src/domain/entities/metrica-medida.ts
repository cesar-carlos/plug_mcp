import type { EscopoSkill, MetricaSaida, PapelColuna } from "./escopo.js";

const AGG_MEDIDA = /\b(sum|avg|count|count_big|min|max)\s*\(/i;

export const exprEhMedida = (expr: string): boolean => AGG_MEDIDA.test(expr);

export const metricaEhMedida = (metrica: Pick<MetricaSaida, "expr">): boolean =>
  exprEhMedida(metrica.expr);

export const escopoTemMedida = (escopo: EscopoSkill): boolean =>
  escopo.metricasSaida.some(metricaEhMedida);

export const metricasMedidaSemDefinicao = (escopo: EscopoSkill): MetricaSaida[] =>
  escopo.metricasSaida.filter((item) => metricaEhMedida(item) && !item.definicao?.trim());

export const colunaPapelMedida = (papel: PapelColuna | null | undefined): boolean =>
  papel === "medida";
