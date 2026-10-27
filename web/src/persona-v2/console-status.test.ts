import { describe, expect, it } from "vitest";
import { queryDraftStatus, sourceLinkStatus } from "./console-status";

describe("estado visível de rascunho e vínculo", () => {
  it("distingue publicação atual, alterações, suspensão e rascunho", () => {
    expect(queryDraftStatus({ revision: 2, activePublicationId: "p1" }, { revision: 2 })).toBe(
      "publicado",
    );
    expect(queryDraftStatus({ revision: 3, activePublicationId: "p1" }, { revision: 2 })).toBe(
      "alterações pendentes",
    );
    expect(queryDraftStatus({ revision: 1, activePublicationId: "p1" }, undefined)).toBe(
      "publicação suspensa",
    );
    expect(queryDraftStatus({ revision: 1, activePublicationId: null }, undefined)).toBe(
      "rascunho",
    );
  });

  it("não trata vínculo substituído como ativo", () => {
    expect(sourceLinkStatus({ replacedBySourceId: "next", active: true })).toBe(
      "Vínculo substituído",
    );
    expect(sourceLinkStatus({ active: true })).toBe("Vínculo ativo");
    expect(sourceLinkStatus({ replacedBySourceId: null, active: false })).toBe("Vínculo suspenso");
  });
});
