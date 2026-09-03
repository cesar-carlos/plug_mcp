export interface PlanoBackfillAgente {
  readonly agentId: string;
  readonly canonicalAcessoId: string | null;
  readonly duplicarPara: readonly string[];
  readonly orfao: boolean;
}

/** Decide attach vs duplicate vs orphan for cutover 0022 (catalog per acesso). */
export const planificarBackfillPorAgente = (
  agentId: string,
  acessoIds: readonly string[],
): PlanoBackfillAgente => {
  const ids = [...new Set(acessoIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) {
    return { agentId, canonicalAcessoId: null, duplicarPara: [], orfao: true };
  }
  const canonical = ids[0] ?? null;
  return {
    agentId,
    canonicalAcessoId: canonical,
    duplicarPara: ids.slice(1),
    orfao: false,
  };
};
