import { describe, expect, it } from "vitest";
import { importedDraftFocusIsCurrent } from "./use-imported-draft-focus";

describe("foco após importar treinamento", () => {
  it("só aplica ao mesmo objeto pendente na área de treinamentos", () => {
    const target = { personaId: "p1", skillId: "s1" };
    const matching = {
      logged: true,
      area: "training" as const,
      personaId: "p1",
      draftId: "s1",
    };
    expect(importedDraftFocusIsCurrent(target, target, matching)).toBe(true);
    expect(importedDraftFocusIsCurrent(target, { personaId: "p1", skillId: "s1" }, matching)).toBe(
      false,
    );
    expect(importedDraftFocusIsCurrent(target, target, { ...matching, draftId: "other" })).toBe(
      false,
    );
    expect(importedDraftFocusIsCurrent(target, target, { ...matching, area: "catalog" })).toBe(
      false,
    );
    expect(importedDraftFocusIsCurrent(target, target, { ...matching, logged: false })).toBe(false);
  });
});
