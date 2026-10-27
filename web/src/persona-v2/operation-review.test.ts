import { describe, expect, it } from "vitest";
import type { SqlOperationCommand } from "../../../src/domain/persona-v2/operation";
import {
  filterOperationRows,
  mayApproveSqlOperation,
  operationApprovalReference,
  operationListUrl,
  operationReviewDirty,
  operationReviewNeedsDiscard,
  sqlOperationApprovedMessage,
  type OperationReviewRow,
} from "./use-operation-review";

const now = Date.parse("2026-10-27T12:00:00Z");
const command = { steps: [] } as unknown as SqlOperationCommand;

function row(changes: Partial<OperationReviewRow> = {}): OperationReviewRow {
  return {
    operationId: "op-1",
    publicationId: "pub-1",
    sourceId: "src-1",
    fingerprint: "a".repeat(64),
    state: "aprovacao_pendente",
    expiresAt: "2026-10-27T13:00:00Z",
    version: 1,
    requireHumanApproval: true,
    receipt: null,
    reconciliation: null,
    ...changes,
  };
}

describe("revisão administrativa de operação SQL", () => {
  it("filtra só os registros já carregados e preserva a lista original", () => {
    const rows = [row(), row({ operationId: "op-2", state: "preparada" })];
    expect(filterOperationRows(rows, "")).toEqual(rows);
    expect(filterOperationRows(rows, "preparada")).toEqual([rows[1]]);
    expect(rows).toHaveLength(2);
  });

  it("só habilita aprovar conteúdo pendente, vigente, confirmado e com payload", () => {
    const pending = {
      command,
      state: "aprovacao_pendente" as const,
      expiresAt: "2026-10-27T13:00:00Z",
      confirmed: true,
      now,
    };
    expect(mayApproveSqlOperation(pending)).toBe(true);
    expect(mayApproveSqlOperation({ ...pending, command: null })).toBe(false);
    expect(mayApproveSqlOperation({ ...pending, confirmed: false })).toBe(false);
    expect(mayApproveSqlOperation({ ...pending, expiresAt: "2026-10-27T11:00:00Z" })).toBe(false);
    expect(mayApproveSqlOperation({ ...pending, state: "preparada" })).toBe(false);
    expect(mayApproveSqlOperation({ ...pending, state: "resultado_desconhecido" })).toBe(false);
    expect(mayApproveSqlOperation({ ...pending, state: undefined, expiresAt: undefined })).toBe(
      false,
    );
  });

  it("aprovação envia só identidade e fingerprint, sem SQL nem parâmetros", () => {
    const selected = { ...row(), command };
    const payload = operationApprovalReference(selected);
    expect(payload).toEqual({ operationId: "op-1", fingerprint: "a".repeat(64) });
    expect(payload).not.toHaveProperty("command");
    expect(payload).not.toHaveProperty("receipt");
    expect(sqlOperationApprovedMessage("op-1")).toContain("execução continua dependendo");
  });

  it("confirmação e edição do consumidor pedem descarte; sujeira da preparação também é dirty", () => {
    expect(operationReviewNeedsDiscard(false, false)).toBe(false);
    expect(operationReviewNeedsDiscard(true, false)).toBe(true);
    expect(operationReviewNeedsDiscard(false, true)).toBe(true);
    expect(operationReviewDirty(false, false, true)).toBe(true);
    expect(operationReviewDirty(false, false, false)).toBe(false);
  });

  it("lista operações no recorte da persona e pagina por after", () => {
    expect(operationListUrl("/api/personas/p1", false, "cursor")).toBe(
      "/api/personas/p1/operations",
    );
    expect(operationListUrl("/api/personas/p1", true, null)).toBe("/api/personas/p1/operations");
    expect(operationListUrl("/api/personas/p1", true, "op/1")).toBe(
      "/api/personas/p1/operations?after=op%2F1",
    );
  });
});
