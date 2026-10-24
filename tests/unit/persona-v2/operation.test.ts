import { describe, expect, it } from "vitest";
import {
  assertExecutableOperation,
  preparationExpiry,
  transitionOperation,
  upstreamPermissionFor,
  validateOperationCommand,
  type PreparedOperation,
  type SqlOperationCommand,
} from "../../../src/domain/persona-v2/operation.js";

const now = new Date("2026-10-10T12:00:00Z");
const fingerprint = "a".repeat(64);
const prepared: PreparedOperation = {
  id: "operation",
  personaId: "persona",
  tokenId: "token",
  publicationId: "publication",
  fingerprint,
  state: "aprovada",
  requireHumanApproval: true,
  expiresAt: preparationExpiry(now),
  version: 1,
};
const approval = {
  operationId: prepared.id,
  ownerId: "owner",
  fingerprint,
  expiresAt: prepared.expiresAt,
};
const command: SqlOperationCommand = {
  operationId: "id",
  fingerprint,
  database: "test",
  maxAffectedRows: 2,
  timeoutMs: 1000,
  steps: [
    {
      id: "insert",
      effect: "insert",
      sql: "INSERT INTO orders (name) VALUES (:name) RETURNING id",
      params: { name: { kind: "value", scalar: { type: "string", value: "synthetic" } } },
      affectedRows: { min: 1, max: 1 },
      outputs: { id: "integer" },
    },
    {
      id: "line",
      effect: "insert",
      sql: "INSERT INTO lines (order_id) VALUES (:order)",
      params: { order: { kind: "step_output", stepId: "insert", output: "id" } },
      affectedRows: { min: 1, max: 1 },
      outputs: {},
    },
  ],
};
describe("persona-v2 operações", () => {
  it("aprovação vincula responsável, fingerprint e prazo", () => {
    expect(() =>
      assertExecutableOperation(prepared, fingerprint, approval, "owner", now),
    ).not.toThrow();
    expect(() => assertExecutableOperation(prepared, fingerprint, null, "owner", now)).toThrow();
    expect(() =>
      assertExecutableOperation(prepared, fingerprint, approval, "other", now),
    ).toThrow();
    expect(() =>
      assertExecutableOperation(
        prepared,
        fingerprint,
        { ...approval, operationId: "another-operation" },
        "owner",
        now,
      ),
    ).toThrow();
    expect(() =>
      assertExecutableOperation(prepared, "b".repeat(64), approval, "owner", now),
    ).toThrow();
    expect(() =>
      assertExecutableOperation(
        prepared,
        fingerprint,
        { ...approval, expiresAt: now },
        "owner",
        now,
      ),
    ).toThrow();
    expect(() =>
      assertExecutableOperation(
        prepared,
        fingerprint,
        { ...approval, expiresAt: new Date(prepared.expiresAt.getTime() + 1) },
        "owner",
        now,
      ),
    ).toThrow();
  });
  it("expiração nunca libera reexecução de resultado desconhecido", () => {
    const running = transitionOperation(prepared, "executando");
    const unknown = transitionOperation(running, "resultado_desconhecido");
    expect(() => transitionOperation(unknown, "executando")).toThrow();
    expect(() => transitionOperation(unknown, "expirada")).toThrow();
    expect(() =>
      assertExecutableOperation(unknown, fingerprint, approval, "owner", prepared.expiresAt),
    ).toThrow();
    expect(transitionOperation(unknown, "concluida").state).toBe("concluida");
  });
  it("cancelamento solicitado não implica rollback", () => {
    const pending = transitionOperation(
      transitionOperation(prepared, "executando"),
      "cancelamento_solicitado",
    );
    expect(pending.state).toBe("cancelamento_solicitado");
    expect(transitionOperation(pending, "concluida").state).toBe("concluida");
    expect(() => transitionOperation(prepared, "rollback_confirmado")).toThrow();
  });
  it("preparação e aprovação expiram em 15 minutos", () => {
    expect(prepared.expiresAt.getTime() - now.getTime()).toBe(900000);
    expect(() =>
      assertExecutableOperation(prepared, fingerprint, approval, "owner", prepared.expiresAt),
    ).toThrow("expirada");
  });
  it("saída escalar depende de etapa anterior e limite de escrita explícito", () => {
    expect(() => validateOperationCommand(command)).not.toThrow();
    expect(() => validateOperationCommand({ ...command, maxAffectedRows: 100_001 })).toThrow();
    const check = {
      id: "check",
      effect: "select" as const,
      sql: "SELECT id FROM orders WHERE id=:id",
      params: {},
      outputs: {},
      expectedRows: { min: 0, max: 0 },
    };
    expect(() =>
      validateOperationCommand({ ...command, steps: [check, ...command.steps] }),
    ).not.toThrow();
    expect(() =>
      validateOperationCommand({
        ...command,
        steps: [{ ...check, expectedRows: { min: 2, max: 1 } }, ...command.steps],
      }),
    ).toThrow();
    expect(() =>
      validateOperationCommand({ ...command, steps: [command.steps[1]!, command.steps[0]!] }),
    ).toThrow();
    expect(() =>
      validateOperationCommand({
        ...command,
        steps: [{ ...command.steps[0]!, affectedRows: undefined }],
      }),
    ).toThrow();
    expect(() =>
      validateOperationCommand({
        ...command,
        steps: [{ ...command.steps[0]!, affectedRows: { min: 0, max: 3 } }],
      }),
    ).toThrow();
    expect(() =>
      validateOperationCommand({
        ...command,
        steps: Array.from({ length: 33 }, (_, i) => ({ ...command.steps[0]!, id: String(i) })),
      }),
    ).toThrow();
  });
  it("INSERT utiliza permissão update upstream", () => {
    expect(upstreamPermissionFor("insert")).toBe("update");
    expect(upstreamPermissionFor("delete")).toBe("delete");
    expect(upstreamPermissionFor("select")).toBe("read");
  });
});
