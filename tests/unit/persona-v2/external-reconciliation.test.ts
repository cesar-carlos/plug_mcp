import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { externalContractSchema } from "../../../src/domain/persona-v2/external-contract.js";
import { classifyExternalEvidence } from "../../../src/domain/persona-v2/external-reconciliation.js";
const field = (type: "string" | "number" | "boolean") => ({
  type,
  required: true,
  purpose: "Teste",
  classification: "livre",
});
const contract = () =>
  externalContractSchema.parse({
    operationId: randomUUID(),
    integrationId: randomUUID(),
    purpose: "Teste",
    effect: "acao",
    effectDescription: "Efeito",
    reconciliation: "Conferir chave composta",
    transport: { kind: "rest", method: "POST", path: "/write" },
    input: { tenant: field("string"), id: field("string") },
    output: {},
    timeoutMs: 1000,
    maxResponseBytes: 4096,
    reconciliationCheck: {
      guarantee: "Chave composta, retorno completo e único",
      transport: { kind: "rest", method: "GET", path: "/lookup" },
      input: { tenant: field("string"), key: field("string") },
      bindings: { tenant: "tenant", key: "id" },
      output: {
        tenant: field("string"),
        key: field("string"),
        count: field("number"),
        complete: field("boolean"),
        status: field("string"),
      },
      evidence: {
        countField: "count",
        completeField: "complete",
        correlation: [
          { inputField: "tenant", outputField: "tenant" },
          { inputField: "id", outputField: "key" },
        ],
        statusField: "status",
        appliedValue: "applied",
      },
    },
  });
it("compara toda chave composta e só reconhece evidência única, completa e aplicada", () => {
  const c = contract().reconciliationCheck!,
    input = { tenant: "A", id: "1" },
    data = { tenant: "A", key: "1", count: 1, complete: true, status: "applied" };
  expect(classifyExternalEvidence(c, input, data).status).toBe("applied_verified");
  for (const change of [
    { tenant: "B" },
    { key: "2" },
    { count: 0 },
    { count: 2 },
    { count: 1.5 },
    { complete: false },
    { status: "pending" },
  ])
    expect(classifyExternalEvidence(c, input, { ...data, ...change }).status).toBe("inconclusive");
});
it("recusa rotas com efeito, tipos incompatíveis, chave parcial e schemas remotos livres", () => {
  const c = contract(),
    r = c.reconciliationCheck!;
  for (const change of [
    { transport: { kind: "rest", method: "POST", path: "/write" } },
    { bindings: { tenant: "tenant", key: "missing" } },
    { evidence: { ...r.evidence, correlation: [r.evidence.correlation[0]] } },
    { evidence: { ...r.evidence, completeField: "count" } },
    { evidence: { ...r.evidence, appliedValue: true } },
    { transport: { kind: "mcp_http", tool: "lookup", inputSchema: {}, outputSchema: {} } },
  ])
    expect(
      externalContractSchema.safeParse({ ...c, reconciliationCheck: { ...r, ...change } }).success,
    ).toBe(false);
  expect(
    externalContractSchema.safeParse({
      ...c,
      effect: "consulta",
      transport: { kind: "rest", method: "GET", path: "/lookup" },
    }).success,
  ).toBe(false);
});
