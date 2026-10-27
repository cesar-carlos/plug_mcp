import { describe, expect, it } from "vitest";
import type { LibraryPayload } from "../../../src/application/persona-v2/knowledge-library-schema";
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";
import {
  buildLibraryDraftRequest,
  libraryAdditionalExamples,
  libraryDatasetEditorBlocked,
  libraryDatasetsForTemplate,
  libraryMaterialFingerprint,
  libraryPanelDirty,
  libraryTemplateContent,
  parseCreatedLibraryDraft,
  parseLibraryMaterial,
  type LibraryItem,
} from "./library-panel";

function templateItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  const content = {
    examples: [
      {
        id: "principal",
        purpose: "Principal",
        variants: [{ dialect: "postgres" }, { dialect: "mssql" }],
      },
      {
        id: "extra",
        purpose: "Extra",
        variants: [{ dialect: "postgres" }],
      },
    ],
  } as unknown as StructureContent;
  return {
    id: "tpl",
    slug: "pedidos",
    name: "Pedidos",
    kind: "template",
    version: 2,
    hash: "aa".repeat(32),
    payload: { kind: "template", content } as LibraryPayload,
    ...overrides,
  };
}

describe("filtros da biblioteca editorial", () => {
  it("lê template, exemplos adicionais do dialeto e datasets da versão exata", () => {
    const selected = templateItem();
    expect(libraryTemplateContent(selected)?.examples).toHaveLength(2);
    expect(libraryTemplateContent({ ...selected, payload: undefined })).toBeUndefined();
    expect(
      libraryAdditionalExamples(libraryTemplateContent(selected), "principal", "postgres"),
    ).toEqual([
      {
        id: "extra",
        purpose: "Extra",
        variants: [{ dialect: "postgres" }],
      },
    ]);
    expect(
      libraryAdditionalExamples(libraryTemplateContent(selected), "principal", "mssql"),
    ).toEqual([]);
    expect(
      libraryDatasetsForTemplate(
        [
          { ...templateItem({ id: "ds", kind: "dataset", templateId: "tpl", templateVersion: 2 }) },
          {
            ...templateItem({ id: "old", kind: "dataset", templateId: "tpl", templateVersion: 1 }),
          },
        ],
        selected,
      ).map((item) => item.id),
    ).toEqual(["ds"]);
  });
});

describe("sujeira e payload da biblioteca", () => {
  it("marca destino ou material alterado sem tratar JSON vazio como edição", () => {
    const saved = libraryMaterialFingerprint("", "", "");
    expect(
      libraryPanelDirty({
        datasetDirty: false,
        payload: "",
        slug: "",
        name: "",
        saved,
        ddl: "",
        system: "",
        label: "",
        personaId: "",
        sourceId: "",
        chosenDialect: "",
        exampleId: "",
        additionalExampleIds: [],
        datasetId: "",
        skillSlug: "",
        skillName: "",
      }),
    ).toBe(false);
    expect(
      libraryPanelDirty({
        datasetDirty: false,
        payload: "{}",
        slug: "x",
        name: "X",
        saved,
        ddl: "",
        system: "",
        label: "",
        personaId: "",
        sourceId: "",
        chosenDialect: "",
        exampleId: "",
        additionalExampleIds: [],
        datasetId: "",
        skillSlug: "",
        skillName: "",
      }),
    ).toBe(true);
    expect(
      libraryPanelDirty({
        datasetDirty: false,
        payload: "",
        slug: "",
        name: "",
        saved,
        ddl: "",
        system: "",
        label: "",
        personaId: "",
        sourceId: "",
        chosenDialect: "",
        exampleId: "",
        additionalExampleIds: ["extra"],
        datasetId: "",
        skillSlug: "",
        skillName: "",
      }),
    ).toBe(true);
    expect(
      libraryDatasetEditorBlocked({
        disabled: false,
        busy: false,
        materialUnsaved: false,
        ddl: "",
        system: "",
        label: "",
        personaId: "",
        sourceId: "",
        chosenDialect: "",
        exampleId: "",
        datasetId: "",
        skillSlug: "",
        skillName: "",
      }),
    ).toBe(false);
  });
  it("recusa JSON inválido antes do teto e confirma rascunho da persona de destino", () => {
    expect(() => parseLibraryMaterial("{")).toThrow(
      "JSON inválido. Confira a estrutura do material.",
    );
    expect(parseLibraryMaterial('{"kind":"template"}')).toEqual({ kind: "template" });
    const personaId = "11111111-1111-4111-8111-111111111111";
    const skillId = "22222222-2222-4222-8222-222222222222";
    expect(
      parseCreatedLibraryDraft(
        { skill: { id: skillId, personaId, kind: "consulta", name: "Pedidos" } },
        personaId,
      ),
    ).toEqual({ personaId, skillId, name: "Pedidos" });
    expect(() =>
      parseCreatedLibraryDraft(
        { skill: { id: skillId, personaId, kind: "consulta", name: "Pedidos" } },
        "33333333-3333-4333-8333-333333333333",
      ),
    ).toThrow("Não foi possível confirmar o rascunho");
  });
  it("monta o pedido de rascunho com dataset opcional da versão exata", () => {
    const item = templateItem();
    expect(
      buildLibraryDraftRequest({
        catalogId: "cat",
        item,
        source: { id: "src", authorizationVersion: 4 },
        dialect: "postgres",
        exampleId: "principal",
        additionalExampleIds: ["extra"],
        slug: "novo",
        name: "Novo",
      }),
    ).toEqual({
      catalogId: "cat",
      templateId: "tpl",
      templateVersion: 2,
      templateHash: item.hash,
      sourceId: "src",
      sourceVersion: 4,
      dialect: "postgres",
      exampleId: "principal",
      additionalExampleIds: ["extra"],
      slug: "novo",
      name: "Novo",
    });
    expect(
      buildLibraryDraftRequest({
        catalogId: "cat",
        item,
        source: { id: "src", authorizationVersion: 4 },
        dialect: "postgres",
        exampleId: "principal",
        additionalExampleIds: [],
        dataset: { id: "ds", version: 1, hash: "bb".repeat(32) },
        slug: "novo",
        name: "Novo",
      }),
    ).toMatchObject({
      dataset: { id: "ds", version: 1, hash: "bb".repeat(32) },
    });
  });
});
