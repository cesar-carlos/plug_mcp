import { describe, expect, it } from "vitest";
import {
  clonePhysicalContent,
  copyPhysicalOverrides,
  emptyPhysicalOverrides,
  physicalProfileContentExceedsLimit,
  physicalProfileDirty,
  physicalProfileErrorMessage,
  physicalProfileFingerprint,
  physicalProfileInitialContent,
  physicalProfilePreviewExpired,
  physicalProfileReportsDirty,
  physicalProfileSwitchNeedsDiscard,
} from "./physical-profile-editor";

describe("rascunho do perfil físico", () => {
  it("marca sujeira só na edição diferente do salvo", () => {
    const fingerprint = physicalProfileFingerprint({
      name: "Loja",
      content: { tables: [] },
      overrides: emptyPhysicalOverrides(),
    });
    expect(physicalProfileDirty(false, fingerprint, "")).toBe(false);
    expect(physicalProfileDirty(true, fingerprint, fingerprint)).toBe(false);
    expect(physicalProfileDirty(true, fingerprint, "")).toBe(true);
    expect(physicalProfileSwitchNeedsDiscard(false, "")).toBe(false);
    expect(physicalProfileSwitchNeedsDiscard(false, "2026-10-28T12:00")).toBe(true);
    expect(
      physicalProfileReportsDirty({
        dirty: false,
        suspendConfirmed: true,
        reviewDate: "",
      }),
    ).toBe(true);
  });

  it("copia conteúdo e substituições sem compartilhar o rascunho original", () => {
    const overrides = { tables: ["orders"], relationships: ["link"] };
    const copied = copyPhysicalOverrides(overrides);
    copied.tables.push("extra");
    expect(overrides.tables).toEqual(["orders"]);
    expect(emptyPhysicalOverrides()).toEqual({ tables: [], relationships: [] });
    const content = { label: "1" };
    const cloned = clonePhysicalContent(content) as { label: string };
    cloned.label = "2";
    expect(content.label).toBe("1");
    expect(
      physicalProfileInitialContent(undefined, { from: "profile" }, { from: "standard" }),
    ).toEqual({ from: "profile" });
    expect(physicalProfileInitialContent(undefined, undefined, { from: "standard" })).toEqual({
      from: "standard",
    });
  });
});

describe("limites e prazo da publicação física", () => {
  it("recusa conteúdo acima de 50 KiB e prévia expirada sem autorizar publicação", () => {
    expect(physicalProfileContentExceedsLimit({ ok: true })).toBe(false);
    expect(physicalProfileContentExceedsLimit("x".repeat(51201))).toBe(true);
    const now = Date.parse("2026-10-27T12:00:00.000Z");
    expect(physicalProfilePreviewExpired("2026-10-27T12:00:00.000Z", now)).toBe(true);
    expect(physicalProfilePreviewExpired("2026-10-27T12:00:01.000Z", now)).toBe(false);
    expect(physicalProfileErrorMessage(new Error("CAS"), "falha")).toBe("CAS");
    expect(physicalProfileErrorMessage("x", "Não foi possível concluir o perfil.")).toBe(
      "Não foi possível concluir o perfil.",
    );
  });
});
