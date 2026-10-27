import { describe, expect, it } from "vitest";
import type { ExternalTestReport } from "../../../src/domain/persona-v2/external-run";
import {
  appendExternalTestReports,
  externalOperatorLink,
  externalReportApprovalLabel,
  externalReportCurrencyLabel,
  externalReportRunLabel,
  externalTestCaseFingerprint,
  externalTestCaseName,
  externalTestCaseRecord,
  externalTestSavedMessage,
  externalTestsApprovalLabel,
  isExternalTestCaseDirty,
} from "./external-tests";

const report = (id: string): ExternalTestReport & { current: boolean } => ({
  id,
  revision: 2,
  packageHash: "aa",
  casesHash: "bb",
  approved: true,
  runnerId: "runner",
  runId: "run-1",
  runState: "passed",
  createdAt: "2026-01-01T00:00:00Z",
  results: [{ id: "case-1", passed: true }],
  current: true,
});

describe("casos e relatórios externos no console", () => {
  it("marca edição pelo fingerprint ou confirmação de remoção", () => {
    const fingerprint = externalTestCaseFingerprint({
      name: "ok",
      required: true,
      input: { id: { enabled: true, value: "1" } },
      expected: {},
    });
    expect(
      isExternalTestCaseDirty({
        editing: true,
        fingerprint,
        saved: fingerprint,
        removeConfirmed: false,
      }),
    ).toBe(false);
    expect(
      isExternalTestCaseDirty({
        editing: true,
        fingerprint,
        saved: "other",
        removeConfirmed: false,
      }),
    ).toBe(true);
    expect(
      isExternalTestCaseDirty({
        editing: false,
        fingerprint,
        saved: "other",
        removeConfirmed: true,
      }),
    ).toBe(true);
  });

  it("concatena relatórios só com a mesma revisão e hashes", () => {
    const previous = {
      revision: 2,
      packageHash: "aa",
      casesHash: "bb",
      reports: [report("r1")],
    };
    const next = {
      revision: 2,
      packageHash: "aa",
      casesHash: "bb",
      reports: [report("r2")],
    };
    expect(appendExternalTestReports(previous, next).reports.map((item) => item.id)).toEqual([
      "r1",
      "r2",
    ]);
    expect(() => appendExternalTestReports(previous, { ...next, casesHash: "cc" })).toThrow(
      "Conteúdo mudou. Recarregue os relatórios antes de continuar.",
    );
  });

  it("lê nome e registros do caso sem inventar valores", () => {
    expect(externalTestCaseName({ name: "Pedido" })).toBe("Pedido");
    expect(externalTestCaseName({})).toBe("");
    expect(externalTestCaseRecord({ input: { n: 1 } }, "input")).toEqual({ n: 1 });
    expect(externalTestCaseRecord({ input: [1] }, "input")).toBeUndefined();
    expect(externalTestCaseRecord(null, "expected")).toBeUndefined();
  });

  it("fixa vínculo técnico e rótulos sem aprovar rodada", () => {
    expect(
      externalOperatorLink("/api/admin/personas/persona-1", {
        ownerId: "owner-1",
        skillId: "skill-1",
        revision: 3,
        packageHash: "aa",
        casesHash: "bb",
      }),
    ).toEqual({
      personaId: "persona-1",
      ownerId: "owner-1",
      skillId: "skill-1",
      revision: 3,
      packageHash: "aa",
      casesHash: "bb",
    });
    expect(externalTestsApprovalLabel(true)).toContain("aprovado");
    expect(externalTestSavedMessage(true)).toContain("nova rodada isolada");
    expect(externalReportCurrencyLabel(false)).toBe("Obsoleto — não libera publicação");
    expect(externalReportApprovalLabel(false)).toBe("Não aprovado");
    expect(externalReportRunLabel(null)).toBe("registro anterior sem rodada vinculada");
  });
});
