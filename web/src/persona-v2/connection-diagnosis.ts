import type { SkillDiagnosis } from "../../../src/domain/persona-v2/console";

export interface SourceCheck {
  state: string;
  at: string;
  verified: boolean;
}

export function sourceVerificationMatches(
  value: unknown,
  source: { id: string; dialect: string },
): boolean {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    result.fonteId === source.id &&
    result.dialect === source.dialect &&
    result.gatesVerified === true &&
    result.sqlExecuted === false &&
    result.metadataSqlExecuted === true
  );
}

export function remoteSkillStatus(
  skill: SkillDiagnosis,
  checks: Readonly<Record<string, SourceCheck>>,
): string {
  if (skill.state !== "permitido") return "Concessão local bloqueada; execução indisponível.";
  const ids = [...new Set(skill.sourceIds ?? [])];
  if (!ids.length) return "Portões remotos não verificados para esta capacidade.";
  const verified = ids.filter((id) => checks[id]?.verified).length;
  return verified === ids.length
    ? "Fontes verificadas nesta sessão. Recursos da skill e SQL ainda exigem validação na execução."
    : `${verified} de ${ids.length} fontes verificadas nesta sessão. Acesso às demais não confirmado.`;
}

const limitLabels: Record<string, string> = {
  maxRows: "Linhas por consulta",
  pageSize: "Linhas por página",
  maxBytes: "Bytes da resposta",
  timeoutMs: "Prazo em milissegundos",
  maxAffectedRows: "Linhas diretamente afetadas",
  sources: "Fontes",
  steps: "Etapas",
  concurrency: "Consultas simultâneas",
  rowsPerSource: "Linhas por fonte",
  intermediateRows: "Linhas intermediárias",
  intermediateBytes: "Bytes intermediários",
};

/** Presentation only: effective limits are calculated by server authorization. */
export function diagnosisLimits(limits: SkillDiagnosis["limits"]) {
  return Object.entries(limits ?? {}).flatMap(([key, value]) =>
    limitLabels[key] && typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? [{ key, label: limitLabels[key], value }]
      : [],
  );
}
