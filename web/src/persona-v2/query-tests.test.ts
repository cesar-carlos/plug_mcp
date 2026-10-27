import { describe, expect, it } from "vitest";
import type { OperationTestDetails, TrainingCase } from "../../../src/domain/persona-v2/catalog";
import {
  appendQueryTestReports,
  queryTestCaseName,
  queryTestReportCaseLabel,
  queryTestsApprovalLabel,
  queryTestsDatasetContextMatches,
  queryTestsPageConflicts,
  queryTestsReadError,
  queryTestsSaveError,
} from "./query-tests";

const report = (id: string): OperationTestDetails["reports"][number] => ({
  id,
  revision: 2,
  packageHash: "aa",
  casesHash: "bb",
  approved: true,
  runnerId: "runner",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  results: [{ id: "case-1", passed: true }],
  current: true,
});

const details = (extra?: Partial<OperationTestDetails>): OperationTestDetails => ({
  revision: 2,
  packageHash: "aa",
  casesHash: "bb",
  cases: [{ id: "case-1", required: true, content: { name: "Listar pedidos" } }],
  requiredApproved: true,
  reports: [report("r1")],
  nextCursor: null,
  ...extra,
});

describe("regras dos casos e relatórios da consulta", () => {
  it("nomeia o caso informado e conserva o id quando o relatório não encontra o caso", () => {
    const cases: TrainingCase[] = [
      { id: "case-1", required: true, content: { name: "Listar pedidos" } },
      { id: "case-2", required: false, content: { other: true } },
    ];
    expect(queryTestCaseName({ name: "Listar pedidos" })).toBe("Listar pedidos");
    expect(queryTestCaseName({ other: true })).toBe("Caso sem nome informado");
    expect(queryTestReportCaseLabel(cases, "case-1")).toBe("Listar pedidos");
    expect(queryTestReportCaseLabel(cases, "case-2")).toBe("Caso sem nome informado");
    expect(queryTestReportCaseLabel(cases, "absent")).toBe("absent");
  });

  it("recusa página divergente e concatena relatórios da mesma revisão", () => {
    const previous = details();
    const next = details({ reports: [report("r2")] });
    expect(queryTestsPageConflicts({ result: next, revision: 2, more: false })).toBe(false);
    expect(queryTestsPageConflicts({ result: next, revision: 3, more: false })).toBe(true);
    expect(
      queryTestsPageConflicts({
        result: { ...next, packageHash: "cc" },
        revision: 2,
        more: true,
        previous,
      }),
    ).toBe(true);
    expect(queryTestsPageConflicts({ result: next, revision: 2, more: true, previous })).toBe(
      false,
    );
    expect(appendQueryTestReports(previous, next).reports.map((item) => item.id)).toEqual([
      "r1",
      "r2",
    ]);
  });

  it("distingue contexto de dataset, leitura e rótulo de aprovação sem executar testes", () => {
    expect(queryTestsDatasetContextMatches({ revision: 2, sourceId: "src" }, 2, "src")).toBe(true);
    expect(queryTestsDatasetContextMatches({ revision: 2, sourceId: "src" }, 3, "src")).toBe(false);
    expect(queryTestsReadError(new Error("lista recusada"))).toBe("lista recusada");
    expect(queryTestsReadError("x")).toBe("Não foi possível ler os testes.");
    expect(queryTestsSaveError("x")).toBe(
      "Não foi possível salvar. Preserve sua edição e confira o estado antes de tentar novamente.",
    );
    expect(queryTestsApprovalLabel(true)).toBe(
      "Relatório técnico obrigatório atual aprovado; revisão semântica permanece separada.",
    );
    expect(queryTestsApprovalLabel(false)).toBe(
      "Sem aprovação técnica obrigatória atual comprovada.",
    );
  });
});
