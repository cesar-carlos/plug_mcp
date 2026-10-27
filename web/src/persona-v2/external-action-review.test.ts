import { describe, expect, it } from "vitest";
import {
  externalActionApprovalReference,
  externalActionApprovedMessage,
  externalActionListUrl,
  externalActionReviewDirty,
  externalActionReviewNeedsDiscard,
  externalActionStateLabel,
  externalReconciliationLabel,
  mayApproveExternalAction,
} from "./use-external-action-review";

const now = Date.parse("2026-10-27T12:00:00Z");

describe("revisão administrativa de ação externa", () => {
  it("habilita aprovar só pendente vigente confirmada, mesmo sem contrato ou input", () => {
    const pending = {
      state: "aprovacao_pendente",
      expiresAt: "2026-10-27T13:00:00Z",
      confirmed: true,
      now,
    };
    expect(mayApproveExternalAction(pending)).toBe(true);
    expect(mayApproveExternalAction({ ...pending, confirmed: false })).toBe(false);
    expect(mayApproveExternalAction({ ...pending, expiresAt: "2026-10-27T11:00:00Z" })).toBe(false);
    expect(mayApproveExternalAction({ ...pending, state: "preparada" })).toBe(false);
    expect(mayApproveExternalAction({ ...pending, state: "resultado_desconhecido" })).toBe(false);
    expect(mayApproveExternalAction({ ...pending, state: undefined, expiresAt: undefined })).toBe(
      false,
    );
  });

  it("aprovação envia só identidade e fingerprint, sem contrato, input ou receipt", () => {
    const payload = externalActionApprovalReference({
      operationId: "act-1",
      fingerprint: "b".repeat(64),
    });
    expect(payload).toEqual({ operationId: "act-1", fingerprint: "b".repeat(64) });
    expect(Object.keys(payload)).toEqual(["operationId", "fingerprint"]);
    expect(externalActionApprovedMessage()).toContain("execução depende do consumidor");
  });

  it("rótulos externos não reutilizam os da operação SQL nem autorizam reenvio", () => {
    expect(externalActionStateLabel("concluida")).toBe("Resposta recebida");
    expect(externalActionStateLabel("cancelada")).toBe("Cancelada antes do envio");
    expect(externalActionStateLabel("estado-desconhecido")).toBe("estado-desconhecido");
    expect(externalReconciliationLabel("applied_verified")).toBe(
      "evidência corresponde ao contrato treinado",
    );
    expect(externalReconciliationLabel("inconclusive")).toBe("evidência inconclusiva");
  });

  it("confirmação e edição do consumidor pedem descarte; sujeira da preparação também é dirty", () => {
    expect(externalActionReviewNeedsDiscard(false, false)).toBe(false);
    expect(externalActionReviewNeedsDiscard(true, false)).toBe(true);
    expect(externalActionReviewNeedsDiscard(false, true)).toBe(true);
    expect(externalActionReviewDirty(false, false, true)).toBe(true);
    expect(externalActionReviewDirty(false, false, false)).toBe(false);
  });

  it("lista ações no recorte externo e pagina por after, sem misturar com /operations", () => {
    expect(externalActionListUrl("/api/personas/p1", false, "cursor")).toBe(
      "/api/personas/p1/external-actions",
    );
    expect(externalActionListUrl("/api/personas/p1", true, null)).toBe(
      "/api/personas/p1/external-actions",
    );
    expect(externalActionListUrl("/api/personas/p1", true, "act/1")).toBe(
      "/api/personas/p1/external-actions?after=act%2F1",
    );
    expect(externalActionListUrl("/api/personas/p1", true, "act-1")).not.toContain("/operations");
  });
});
