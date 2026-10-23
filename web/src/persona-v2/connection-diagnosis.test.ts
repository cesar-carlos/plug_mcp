import { describe, it, expect } from "vitest";
import {
  sourceVerificationMatches,
  remoteSkillStatus,
  diagnosisLimits,
} from "./connection-diagnosis";
import type { SkillDiagnosis } from "../../../src/domain/persona-v2/console";

describe("diagnóstico do consumidor", () => {
  const source = { id: "fonte-a", dialect: "mssql" };
  const proof = {
    fonteId: source.id,
    dialect: source.dialect,
    gatesVerified: true,
    sqlExecuted: false,
    metadataSqlExecuted: true,
  };
  const skill: SkillDiagnosis = {
    skillId: "skill",
    state: "permitido",
    code: "local",
    reason: "",
    action: "",
    sourceIds: ["fonte-a", "fonte-b"],
  };
  it("recusa sucesso sem prova, outra fonte, dialeto ou indicadores incompatíveis", () => {
    expect(sourceVerificationMatches(proof, source)).toBe(true);
    for (const invalid of [
      null,
      {},
      { ...proof, fonteId: "outra" },
      { ...proof, dialect: "postgres" },
      { ...proof, gatesVerified: "true" },
      { ...proof, sqlExecuted: true },
      { ...proof, metadataSqlExecuted: false },
    ])
      expect(sourceVerificationMatches(invalid, source)).toBe(false);
  });
  it("não promove confirmação parcial ou ausente a autorização de execução", () => {
    const checked = { state: "verificada", at: "2026-10-19", verified: true };
    expect(remoteSkillStatus(skill, { "fonte-a": checked })).toContain("1 de 2");
    expect(
      remoteSkillStatus(skill, { "fonte-a": checked, "fonte-b": { ...checked, verified: false } }),
    ).toContain("1 de 2");
    expect(remoteSkillStatus(skill, { "fonte-a": checked, "fonte-b": checked })).toContain(
      "ainda exigem validação",
    );
    expect(
      remoteSkillStatus(
        { ...skill, state: "bloqueado" },
        { "fonte-a": checked, "fonte-b": checked },
      ),
    ).toContain("bloqueada");
    expect(remoteSkillStatus({ ...skill, sourceIds: [] }, {})).toContain("não verificados");
  });
  it("apresenta os tetos recebidos sem criar defaults ou recalcular concessões", () => {
    expect(diagnosisLimits(undefined)).toEqual([]);
    expect(diagnosisLimits({ maxAffectedRows: 17, timeoutMs: 2300 })).toEqual([
      { key: "maxAffectedRows", label: "Linhas diretamente afetadas", value: 17 },
      { key: "timeoutMs", label: "Prazo em milissegundos", value: 2300 },
    ]);
  });
});
