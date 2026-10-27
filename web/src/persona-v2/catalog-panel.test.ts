import { describe, expect, it } from "vitest";
import {
  catalogCreateHasPendingWork,
  catalogEditorDirty,
  catalogEditorFingerprint,
  catalogFormsDirty,
  catalogImportedDdlHasPendingWork,
  catalogMayEdit,
  catalogMayPublish,
  catalogPatternSwitchHasPendingWork,
  catalogReviewPending,
  catalogRoot,
} from "./catalog-panel";

describe("papéis do catálogo", () => {
  it("edição e publicação seguem o papel concedido, sem ampliar leitor", () => {
    expect(catalogMayEdit(undefined)).toBe(false);
    expect(catalogMayEdit("reader")).toBe(false);
    expect(catalogMayEdit("contributor")).toBe(true);
    expect(catalogMayPublish("contributor")).toBe(false);
    expect(catalogMayPublish("curator")).toBe(true);
    expect(catalogMayPublish("administrator")).toBe(true);
  });
});

describe("sujeira do editor de padrão", () => {
  it("ignora fingerprint idêntico e campos vazios sem conteúdo", () => {
    const saved = catalogEditorFingerprint("", "", undefined);
    expect(catalogEditorDirty({ slug: "", name: "", content: undefined, saved })).toBe(false);
  });
  it("marca edição quando há identificação ou conteúdo diferente do salvo", () => {
    const saved = catalogEditorFingerprint("pedidos", "Pedidos", { tables: [] });
    expect(
      catalogEditorDirty({ slug: "pedidos", name: "Pedidos", content: { tables: [] }, saved }),
    ).toBe(false);
    expect(
      catalogEditorDirty({ slug: "pedidos", name: "Outro", content: { tables: [] }, saved }),
    ).toBe(true);
    expect(catalogEditorDirty({ slug: "novo", name: "", content: undefined, saved: "" })).toBe(
      true,
    );
  });
});

describe("descarte ao trocar contexto do catálogo", () => {
  it("formulários incluem nome do catálogo e participante; criar catálogo não", () => {
    const reviewDirty = { pub: true };
    expect(catalogReviewPending(reviewDirty)).toBe(true);
    expect(catalogReviewPending({})).toBe(false);
    expect(
      catalogFormsDirty({
        editorDirty: false,
        catalogName: "Novo",
        clientId: "",
        curationDirty: false,
        libraryDirty: false,
        reviewDirty: {},
        reviewDate: "",
      }),
    ).toBe(true);
    expect(
      catalogCreateHasPendingWork({
        editorDirty: false,
        libraryDirty: false,
        curationDirty: false,
        reviewDate: "",
        reviewDirty: {},
      }),
    ).toBe(false);
    expect(
      catalogCreateHasPendingWork({
        editorDirty: false,
        libraryDirty: false,
        curationDirty: false,
        reviewDate: "",
        reviewDirty,
      }),
    ).toBe(true);
    expect(catalogPatternSwitchHasPendingWork(false, "2026-10-28T12:00")).toBe(true);
    expect(
      catalogImportedDdlHasPendingWork({
        editorDirty: false,
        libraryDirty: true,
        reviewDate: "",
      }),
    ).toBe(true);
  });
  it("monta a raiz administrativa do catálogo selecionado", () => {
    expect(catalogRoot("cat-1")).toBe("/api/admin/catalogos/cat-1");
  });
});
