import type { CatalogTestReport, TrainingCase } from "../../../src/domain/persona-v2/catalog";

export interface SkillEditorEmit {
  (event: "dirty", value: boolean): void;
  (event: "lock", value: boolean): void;
  (event: "changed"): void;
}

export interface SkillTestPage {
  revision: number;
  packageHash: string | null;
  casesHash: string;
  reports: readonly (CatalogTestReport & { readonly current: boolean })[];
}

/** Append a later report page only when revision and hashes still match. */
export function appendSkillTestReports<T extends SkillTestPage>(previous: T, next: T): T {
  if (
    next.revision !== previous.revision ||
    next.packageHash !== previous.packageHash ||
    next.casesHash !== previous.casesHash
  ) {
    throw new Error("Conteúdo mudou; recarregue os relatórios.");
  }
  return { ...next, reports: [...previous.reports, ...next.reports] };
}

export function skillReportCaseLabel(cases: readonly TrainingCase[], resultId: string): string {
  const found = cases.find((item) => item.id === resultId);
  if (!found) {
    return resultId;
  }
  const content = found.content;
  if (
    typeof content === "object" &&
    content !== null &&
    "name" in content &&
    typeof content.name === "string"
  ) {
    return content.name;
  }
  return resultId;
}
