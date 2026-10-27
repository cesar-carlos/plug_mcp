import type { OperationTestDetails, TrainingCase } from "../../../src/domain/persona-v2/catalog";

export function queryTestCaseName(content: unknown): string {
  return content &&
    typeof content === "object" &&
    "name" in content &&
    typeof content.name === "string"
    ? content.name
    : "Caso sem nome informado";
}

export function queryTestReportCaseLabel(cases: readonly TrainingCase[], resultId: string): string {
  const found = cases.find((item) => item.id === resultId);
  return found ? queryTestCaseName(found.content) : resultId;
}

export function queryTestsPageConflicts(input: {
  result: Pick<OperationTestDetails, "revision" | "packageHash" | "casesHash">;
  revision: number;
  more: boolean;
  previous?: Pick<OperationTestDetails, "packageHash" | "casesHash">;
}): boolean {
  return (
    input.result.revision !== input.revision ||
    (input.more &&
      !!input.previous &&
      (input.result.packageHash !== input.previous.packageHash ||
        input.result.casesHash !== input.previous.casesHash))
  );
}

export function appendQueryTestReports(
  previous: OperationTestDetails,
  next: OperationTestDetails,
): OperationTestDetails {
  return { ...next, reports: [...previous.reports, ...next.reports] };
}

export function queryTestsDatasetContextMatches(
  result: { revision: number; sourceId: string },
  revision: number,
  sourceId: string,
): boolean {
  return result.revision === revision && result.sourceId === sourceId;
}

export function queryTestsReadError(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Não foi possível ler os testes.";
}

export function queryTestsSaveError(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "Não foi possível salvar. Preserve sua edição e confira o estado antes de tentar novamente.";
}

export function queryTestsApprovalLabel(requiredApproved: boolean): string {
  return requiredApproved
    ? "Relatório técnico obrigatório atual aprovado; revisão semântica permanece separada."
    : "Sem aprovação técnica obrigatória atual comprovada.";
}

export const queryTestsChangedMessage =
  "O treinamento ou os casos mudaram. Recarregue o rascunho antes de revisar os relatórios.";
export const queryTestsSavedMessage =
  "Caso salvo. Relatórios anteriores precisam ser conferidos para a nova revisão.";
export const queryTestsDatasetListBusyMessage = "Aguarde a ação atual antes de listar datasets.";
export const queryTestsDatasetSeedsBusyMessage = "Aguarde a ação atual antes de carregar sementes.";
export const queryTestsDatasetContextMessage = "O contexto ou a revisão mudou; lista descartada.";
export const queryTestsDatasetSeedsContextMessage =
  "O contexto ou a revisão mudou; sementes descartadas.";
