import type { EscopoSkill } from "../../../domain/entities/escopo.js";
import type { SqlAstSelect } from "./sql-ast.js";

export const avisosKpiDesalinhado = (
  ast: SqlAstSelect,
  escopo: EscopoSkill,
): { code: string; message: string }[] => {
  const avisos: { code: string; message: string }[] = [];
  for (const metrica of escopo.metricasSaida) {
    const usaMetrica = ast.colunas.some(
      (coluna) =>
        coluna.expr.toLowerCase().includes(metrica.expr.toLowerCase()) ||
        coluna.alias.toLowerCase() === metrica.alias.toLowerCase(),
    );
    if (!usaMetrica) {
      continue;
    }
    const filtros = ast.filtroRefs.map((ref) => ref.column.toLowerCase());
    if (
      (metrica.statusIncluidos?.length ?? 0) > 0 &&
      !filtros.some((col) => col.includes("status"))
    ) {
      avisos.push({
        code: "KPI_DESALINHADO",
        message: `KPI ${metrica.alias} declara statusIncluidos e o SQL não filtra status.`,
      });
    }
    const colunaData = metrica.colunaData;
    if (colunaData && !filtros.some((col) => col === colunaData.toLowerCase())) {
      avisos.push({
        code: "KPI_DESALINHADO",
        message: `KPI ${metrica.alias} declara colunaData ${colunaData} e o SQL não a recorta.`,
      });
    }
  }
  return avisos;
};
