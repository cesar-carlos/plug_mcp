export function fieldCapabilityLabel(capability: string): string {
  const parts = capability.split(":");
  const labels: Record<string, string> = {
    projecao: "exibir",
    filtro: "filtrar",
    join: "relacionar",
    agrupamento: "agrupar e agregar",
    ordenacao: "ordenar",
    exportacao: "exportar (exige contrato de anexos)",
  };
  return `${parts[2]} · ${labels[parts[3] ?? ""] ?? parts[3]}`;
}
