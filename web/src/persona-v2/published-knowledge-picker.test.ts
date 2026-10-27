import { expect, it } from "vitest";
import type {
  Catalog,
  Content,
  Profile,
  ProfilePage,
  ProfilePublication,
  StandardPublication,
} from "./knowledge-model";
import {
  appendProfileDrafts,
  appendProfilePublications,
  catalogStillGranted,
  catalogUnavailableMessage,
  isCatalogCurator,
  publishedKnowledgeErrorMessage,
  publishedKnowledgeSelection,
  savedProfileMissingOnPage,
  shouldLoadSavedStandard,
} from "./published-knowledge-picker";
import { emptyProfilePage } from "./source-knowledge";

const content: Content = {
  system: "Fixture",
  label: "1",
  dialects: ["postgres"],
  tables: [],
  relationships: [],
  examples: [],
  rules: [],
};

const catalog = (role: Catalog["role"] = "reader"): Catalog => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "ERP",
  role,
});

const standard = (id = "22222222-2222-4222-8222-222222222222"): StandardPublication => ({
  id,
  patternId: "33333333-3333-4333-8333-333333333333",
  revision: 1,
  hash: "a".repeat(64),
  content,
  suspendedAt: null,
});

const draft = (id: string, name: string): Profile => ({
  id,
  catalogId: catalog().id,
  physicalSourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  identityHash: "b".repeat(64),
  basePublicationId: standard().id,
  baseHash: "c".repeat(64),
  name,
  revision: 1,
  content,
  overrides: { tables: [], relationships: [] },
});

const publication = (publicationId: string, name: string): ProfilePublication => ({
  ...draft(publicationId, name),
  publicationId,
  hash: "d".repeat(64),
  suspended: false,
});

const page = (overrides: Partial<ProfilePage> = {}): ProfilePage => ({
  ...emptyProfilePage(),
  publications: [publication("44444444-4444-4444-8444-444444444444", "Loja")],
  drafts: [draft("55555555-5555-4555-8555-555555555555", "Rascunho")],
  nextDraftCursor: "draft-2",
  nextPublicationCursor: "pub-2",
  ...overrides,
});

it("monta a seleção publicada sem conceder perfil omitido", () => {
  expect(publishedKnowledgeSelection("cat", undefined, undefined)).toBeUndefined();
  expect(publishedKnowledgeSelection("cat", standard(), undefined)).toEqual({
    catalogId: "cat",
    standard: standard(),
  });
  const profile = page().publications[0];
  expect(publishedKnowledgeSelection("cat", standard(), profile)).toEqual({
    catalogId: "cat",
    standard: standard(),
    profile,
  });
  expect(isCatalogCurator("administrator")).toBe(true);
  expect(isCatalogCurator("curator")).toBe(true);
  expect(isCatalogCurator("contributor")).toBe(false);
  expect(isCatalogCurator(undefined)).toBe(false);
});

it("acumula versões de perfil e conserva rascunhos já lidos", () => {
  const current = page();
  const extra = page({
    publications: [publication("66666666-6666-4666-8666-666666666666", "Filial")],
    drafts: [draft("77777777-7777-4777-8777-777777777777", "Outro")],
    nextDraftCursor: "draft-3",
    nextPublicationCursor: null,
  });
  const publications = appendProfilePublications(current, extra);
  expect(publications.publications.map((item) => item.publicationId)).toEqual([
    "44444444-4444-4444-8444-444444444444",
    "66666666-6666-4666-8666-666666666666",
  ]);
  expect(publications.drafts).toEqual(current.drafts);
  expect(publications.nextDraftCursor).toBe("draft-2");
  expect(publications.nextPublicationCursor).toBeNull();
  const drafts = appendProfileDrafts(current, extra);
  expect(drafts.drafts.map((item) => item.id)).toEqual([
    "55555555-5555-4555-8555-555555555555",
    "77777777-7777-4777-8777-777777777777",
  ]);
  expect(drafts.nextDraftCursor).toBe("draft-3");
  expect(drafts.publications).toEqual(current.publications);
});

it("reconhece catálogo vigente, padrão salvo e perfil fora da página", () => {
  expect(catalogStillGranted([catalog()], catalog().id)).toBe(true);
  expect(catalogStillGranted([catalog()], "")).toBe(true);
  expect(catalogStillGranted([catalog()], "00000000-0000-4000-8000-000000000000")).toBe(false);
  const initial = {
    catalogId: catalog().id,
    publicationId: standard().id,
    evidenceId: "88888888-8888-4888-8888-888888888888",
    profilePublicationId: "99999999-9999-4999-8999-999999999999",
  };
  expect(shouldLoadSavedStandard(initial, catalog().id, [])).toBe(true);
  expect(shouldLoadSavedStandard(initial, catalog().id, [standard()])).toBe(false);
  expect(shouldLoadSavedStandard(initial, "outro", [])).toBe(false);
  expect(savedProfileMissingOnPage(initial, standard().id, page().publications)).toBe(true);
  expect(
    savedProfileMissingOnPage(
      { ...initial, profilePublicationId: page().publications[0].publicationId },
      standard().id,
      page().publications,
    ),
  ).toBe(false);
  expect(publishedKnowledgeErrorMessage(new Error("CAS"))).toBe("CAS");
  expect(publishedKnowledgeErrorMessage("x")).toBe("Não foi possível carregar o conhecimento.");
  expect(catalogUnavailableMessage).toContain("catálogo não está mais disponível");
});
