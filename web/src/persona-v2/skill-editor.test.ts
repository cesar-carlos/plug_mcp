import { expect, it } from "vitest";
import type { CatalogTestReport, TrainingCase } from "../../../src/domain/persona-v2/catalog";
import { appendSkillTestReports, skillReportCaseLabel } from "./skill-editor";

const report = (id: string): CatalogTestReport & { current: boolean } => ({
  id,
  revision: 1,
  packageHash: "aa",
  casesHash: "bb",
  approved: true,
  runnerId: "runner",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  results: [{ id: "case-1", passed: true }],
  current: true,
});

it("concatena relatórios só quando revisão e hashes permanecem iguais", () => {
  const previous = {
    revision: 1,
    packageHash: "aa",
    casesHash: "bb",
    reports: [report("r1")],
  };
  const next = {
    revision: 1,
    packageHash: "aa",
    casesHash: "bb",
    reports: [report("r2")],
  };
  expect(appendSkillTestReports(previous, next).reports.map((item) => item.id)).toEqual([
    "r1",
    "r2",
  ]);
  expect(() => appendSkillTestReports(previous, { ...next, packageHash: "cc" })).toThrow(
    "Conteúdo mudou; recarregue os relatórios.",
  );
});

it("rótulo do resultado usa o nome do caso quando existe, sem inventar conteúdo", () => {
  const cases: TrainingCase[] = [
    { id: "case-1", required: true, content: { name: "Inserir pedido" } },
    { id: "case-2", required: false, content: { other: true } },
  ];
  expect(skillReportCaseLabel(cases, "case-1")).toBe("Inserir pedido");
  expect(skillReportCaseLabel(cases, "case-2")).toBe("case-2");
  expect(skillReportCaseLabel(cases, "absent")).toBe("absent");
});
