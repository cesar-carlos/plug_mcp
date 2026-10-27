import type { ExternalTestDetails } from "../../../src/domain/persona-v2/external-run";
import type { ExternalTestValue } from "./external-test-values";

export interface ExternalTestSkill {
  skillId: string;
  name: string;
  revision: number;
  effect: string;
}

export interface ExternalTestReportPage {
  revision: number;
  packageHash: string;
  casesHash: string;
  reports: ExternalTestDetails["reports"];
}

export interface ExternalOperatorLink {
  personaId: string | undefined;
  ownerId: string;
  skillId: string;
  revision: number;
  packageHash: string;
  casesHash: string;
}

export function externalTestCaseFingerprint(input: {
  name: string;
  required: boolean;
  input: Record<string, ExternalTestValue>;
  expected: Record<string, ExternalTestValue>;
}): string {
  return JSON.stringify({
    name: input.name,
    required: input.required,
    input: input.input,
    expected: input.expected,
  });
}

export function isExternalTestCaseDirty(input: {
  editing: boolean;
  fingerprint: string;
  saved: string;
  removeConfirmed: boolean;
}): boolean {
  return (input.editing && input.fingerprint !== input.saved) || input.removeConfirmed;
}

export function appendExternalTestReports<T extends ExternalTestReportPage>(
  previous: T,
  next: T,
): T {
  if (
    next.revision !== previous.revision ||
    next.packageHash !== previous.packageHash ||
    next.casesHash !== previous.casesHash
  ) {
    throw new Error("Conteúdo mudou. Recarregue os relatórios antes de continuar.");
  }
  return { ...next, reports: [...previous.reports, ...next.reports] };
}

export function externalTestCaseName(content: unknown): string {
  return content &&
    typeof content === "object" &&
    "name" in content &&
    typeof content.name === "string"
    ? content.name
    : "";
}

export function externalTestCaseRecord(
  content: unknown,
  key: "input" | "expected",
): Record<string, string | number | boolean> | undefined {
  if (!content || typeof content !== "object" || !(key in content)) {
    return undefined;
  }
  const value = (content as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, string | number | boolean>)
    : undefined;
}

export function externalOperatorLink(
  base: string,
  details: Pick<
    ExternalTestDetails,
    "ownerId" | "skillId" | "revision" | "packageHash" | "casesHash"
  >,
): ExternalOperatorLink {
  return {
    personaId: base.split("/").at(-1),
    ownerId: details.ownerId,
    skillId: details.skillId,
    revision: details.revision,
    packageHash: details.packageHash,
    casesHash: details.casesHash,
  };
}

export function externalTestsApprovalLabel(requiredApproved: boolean): string {
  return requiredApproved
    ? "Relatório técnico atual aprovado. Revisão semântica e publicação são ações separadas."
    : "Sem relatório atual aprovado. Execute os casos obrigatórios em fixture isolada.";
}

export function externalTestSavedMessage(remove: boolean): string {
  return remove
    ? "Caso removido. Execute nova rodada isolada."
    : "Caso salvo. Relatórios anteriores não aprovam esta revisão.";
}

export function externalReportCurrencyLabel(current: boolean): string {
  return current ? "Conteúdo atual" : "Obsoleto — não libera publicação";
}

export function externalReportApprovalLabel(approved: boolean): string {
  return approved ? "Aprovado tecnicamente" : "Não aprovado";
}

export function externalReportRunLabel(runId: string | null): string {
  return runId ?? "registro anterior sem rodada vinculada";
}
