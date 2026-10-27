import { expect, it } from "vitest";
import type { Content, KnowledgeSelection } from "./knowledge-model";
import { emptyOperation, emptyOperationTable } from "./operation-editor";
import {
  emptyProfilePage,
  sourceKnowledgeAdoptionHelp,
  sourceKnowledgeAdoptionLegend,
  sourceKnowledgeApplyDisabled,
  sourceKnowledgeCanApply,
  sourceKnowledgeColumnDisabled,
  sourceKnowledgeColumnHint,
  sourceKnowledgeCompareDisabled,
  sourceKnowledgeCompareSelectionError,
  sourceKnowledgeComparisonBody,
  sourceKnowledgeComparisonKey,
  sourceKnowledgeCompatibilitySubject,
  sourceKnowledgeConfirmDisabled,
  sourceKnowledgeConfirmLabel,
  sourceKnowledgeDirty,
  sourceKnowledgeErrorMessage,
  sourceKnowledgeFieldAllowed,
  sourceKnowledgeHasNnRelationships,
  sourceKnowledgeInspectionContent,
  sourceKnowledgeMarksPendingOnTouch,
  sourceKnowledgeResourceLabel,
  sourceKnowledgeSectionLabel,
  sourceKnowledgeSelectAll,
  sourceKnowledgeSelectedTables,
  sourceKnowledgeSelectionChangeNeedsDiscard,
  sourceKnowledgeSelectionKey,
  sourceKnowledgeTableAllowed,
  sourceKnowledgeTitle,
  sourceKnowledgeWithoutReference,
} from "./source-knowledge";

const content: Content = {
  system: "Fixture",
  label: "1",
  dialects: ["postgres"],
  tables: [
    {
      id: "orders",
      name: "orders",
      meaning: "Pedidos",
      resourceType: "table",
      grain: ["id"],
      physicalNames: [{ dialect: "postgres", name: "public.orders" }],
      columns: [
        {
          name: "id",
          meaning: "Chave",
          logicalType: "integer",
          nullable: false,
          classification: "livre",
        },
        {
          name: "notes",
          meaning: "Observação",
          logicalType: "string",
          nullable: true,
          classification: "pessoal",
        },
        {
          name: "secret",
          meaning: "Segredo",
          logicalType: "string",
          nullable: true,
          classification: "segredo",
        },
      ],
    },
    {
      id: "customers",
      name: "customers",
      meaning: "Clientes",
      resourceType: "table",
      grain: ["id"],
      physicalNames: [{ dialect: "postgres", name: "public.customers" }],
      columns: [
        {
          name: "id",
          meaning: "Chave",
          logicalType: "integer",
          nullable: false,
          classification: "livre",
        },
      ],
    },
  ],
  relationships: [
    {
      id: "orders-customers",
      from: "orders",
      to: "customers",
      keys: [{ from: "customer_id", to: "id" }],
      join: "inner",
      cardinality: "N:N",
      optional: false,
      meaning: "Pedido do cliente",
      via: ["link"],
    },
  ],
  examples: [],
  rules: [],
};

const selection: KnowledgeSelection = {
  catalogId: "catalog",
  standard: {
    id: "standard",
    patternId: "pattern",
    revision: 1,
    hash: "hash",
    content,
    suspendedAt: null,
  },
};

const operation = {
  ...emptyOperation(),
  dialect: "postgres" as const,
  tables: [
    {
      ...emptyOperationTable(),
      name: "public.orders",
      columns: [{ name: "id", type: "integer" as const, writable: false, meaning: "Chave" }],
    },
  ],
};

it("marca sujeira só com inspeção, perfil, adoção, curadoria ou revisão pendentes", () => {
  expect(
    sourceKnowledgeDirty({
      inspectionDirty: false,
      profileDirty: false,
      pendingAdoption: false,
      curationDirty: false,
      reviewDirty: false,
    }),
  ).toBe(false);
  expect(
    sourceKnowledgeDirty({
      inspectionDirty: true,
      profileDirty: false,
      pendingAdoption: false,
      curationDirty: false,
      reviewDirty: false,
    }),
  ).toBe(true);
  expect(
    sourceKnowledgeDirty({
      inspectionDirty: false,
      profileDirty: false,
      pendingAdoption: true,
      curationDirty: false,
      reviewDirty: false,
    }),
  ).toBe(true);
});

it("identifica a seleção pelo catálogo, padrão e perfil publicados", () => {
  const withoutProfile = sourceKnowledgeSelectionKey(selection);
  expect(withoutProfile).toContain("catalog");
  expect(withoutProfile).toContain("standard");
  expect(sourceKnowledgeSelectionKey(undefined)).not.toBe(withoutProfile);
});

it("recorte de tabelas e inspeção só filtram quando há rascunho e tabelas escolhidas", () => {
  expect(sourceKnowledgeSelectedTables(undefined, ["orders"], ["orders.id"])).toEqual([]);
  expect(sourceKnowledgeSelectedTables(content, ["orders"], ["orders.id"])).toEqual([
    { id: "orders", columns: ["id"] },
  ]);
  expect(sourceKnowledgeInspectionContent(content, ["orders"], false)).toBe(content);
  expect(sourceKnowledgeInspectionContent(content, [], true)).toBe(content);
  expect(
    sourceKnowledgeInspectionContent(content, ["orders"], true)?.tables.map((t) => t.id),
  ).toEqual(["orders"]);
});

it("invalida a comparação quando a evidência, o recorte ou a operação mudam", () => {
  const tables = sourceKnowledgeSelectedTables(content, ["orders"], ["orders.id"]);
  const first = sourceKnowledgeComparisonKey({
    selectionKey: "a",
    inspectionId: "e1",
    selectedTables: tables,
    operationTraining: undefined,
  });
  expect(
    sourceKnowledgeComparisonKey({
      selectionKey: "a",
      inspectionId: "e2",
      selectedTables: tables,
      operationTraining: undefined,
    }),
  ).not.toBe(first);
  expect(
    sourceKnowledgeComparisonKey({
      selectionKey: "a",
      inspectionId: "e1",
      selectedTables: undefined,
      operationTraining: undefined,
    }),
  ).not.toBe(first);
});

it("restringe tabelas e campos da operação ao contrato declarado", () => {
  const orders = content.tables[0];
  const customers = content.tables[1];
  expect(sourceKnowledgeTableAllowed(orders, undefined)).toBe(true);
  expect(sourceKnowledgeTableAllowed(orders, operation)).toBe(true);
  expect(sourceKnowledgeTableAllowed(customers, operation)).toBe(false);
  expect(sourceKnowledgeFieldAllowed(orders, "id", operation)).toBe(true);
  expect(sourceKnowledgeFieldAllowed(orders, "notes", operation)).toBe(false);
});

it("bloqueia segredo, inferido e campos fora da operação; pessoal só avisa na consulta", () => {
  const orders = content.tables[0];
  const livre = orders.columns[0];
  const pessoal = orders.columns[1];
  const segredo = orders.columns[2];
  expect(sourceKnowledgeColumnDisabled(orders, livre, undefined)).toBe(false);
  expect(sourceKnowledgeColumnDisabled(orders, pessoal, undefined)).toBe(false);
  expect(sourceKnowledgeColumnDisabled(orders, segredo, undefined)).toBe(true);
  expect(sourceKnowledgeColumnDisabled(orders, pessoal, operation)).toBe(true);
  expect(sourceKnowledgeColumnHint("livre")).toBe("");
  expect(sourceKnowledgeColumnHint("pessoal")).toContain("finalidades");
  expect(sourceKnowledgeColumnHint("segredo")).toContain("não executável");
});

it("seleciona somente tabelas permitidas e campos livres", () => {
  const query = sourceKnowledgeSelectAll(content, undefined);
  expect(query.tables).toEqual(["orders", "customers"]);
  expect(query.fields).toEqual(["orders.id", "customers.id"]);
  const declared = sourceKnowledgeSelectAll(content, operation);
  expect(declared.tables).toEqual(["orders"]);
  expect(declared.fields).toEqual(["orders.id"]);
});

it("nomeia a jornada sem conceder adoção automática", () => {
  expect(sourceKnowledgeSectionLabel({ hasOperation: true, hasDraft: true })).toBe(
    "Adoção de conhecimento na operação",
  );
  expect(sourceKnowledgeSectionLabel({ hasOperation: false, hasDraft: true })).toBe(
    "Adoção de conhecimento na skill",
  );
  expect(sourceKnowledgeSectionLabel({ hasOperation: false, hasDraft: false })).toBe(
    "Conhecimento das bases da persona",
  );
  expect(sourceKnowledgeTitle({ hasDraft: false, hasOperation: false, registration: true })).toBe(
    "ERP / padrão de estrutura da base",
  );
  expect(sourceKnowledgeTitle({ hasDraft: false, hasOperation: false, registration: false })).toBe(
    "Conhecimento da persona",
  );
  expect(sourceKnowledgeTitle({ hasDraft: true, hasOperation: true, registration: false })).toBe(
    "Conhecimento compartilhado desta operação",
  );
  expect(sourceKnowledgeAdoptionLegend(true)).toContain("operação");
  expect(sourceKnowledgeAdoptionHelp(false)).toContain("dezesseis");
  expect(sourceKnowledgeConfirmLabel(true)).toContain("permissões de escrita");
});

it("rotula recurso, sujeito da comparação e pedido sem inventar perfil", () => {
  expect(sourceKnowledgeResourceLabel(content, "orders")).toBe("orders");
  expect(sourceKnowledgeResourceLabel(content, "orders-customers")).toBe("Pedido do cliente");
  expect(sourceKnowledgeResourceLabel(undefined, "missing")).toBe("missing");
  expect(sourceKnowledgeCompatibilitySubject(selection)).toBe("Fixture · 1");
  expect(
    sourceKnowledgeComparisonBody({
      selection,
      evidenceId: "evidence",
    }),
  ).toEqual({
    catalogId: "catalog",
    publicationId: "standard",
    evidenceId: "evidence",
  });
  expect(
    sourceKnowledgeComparisonBody({
      selection,
      evidenceId: "evidence",
      selectedTables: [{ id: "orders", columns: ["id"] }],
    }).selectedTables,
  ).toEqual([{ id: "orders", columns: ["id"] }]);
});

it("pede descarte ao trocar seleção só com perfil, curadoria, revisão ou adoção com tabelas", () => {
  expect(
    sourceKnowledgeSelectionChangeNeedsDiscard({
      profileDirty: false,
      curationDirty: false,
      reviewDirty: false,
      pendingAdoption: true,
      selectedTableCount: 0,
    }),
  ).toBe(false);
  expect(
    sourceKnowledgeSelectionChangeNeedsDiscard({
      profileDirty: false,
      curationDirty: false,
      reviewDirty: false,
      pendingAdoption: true,
      selectedTableCount: 1,
    }),
  ).toBe(true);
  expect(
    sourceKnowledgeSelectionChangeNeedsDiscard({
      profileDirty: true,
      curationDirty: false,
      reviewDirty: false,
      pendingAdoption: false,
      selectedTableCount: 0,
    }),
  ).toBe(true);
});

it("bloqueia comparação e aplicação até evidência, recorte e confirmação", () => {
  expect(sourceKnowledgeCompareSelectionError(false, [])).toBeUndefined();
  expect(sourceKnowledgeCompareSelectionError(true, [])).toMatch(/tabelas e os campos/);
  expect(sourceKnowledgeCompareSelectionError(true, [{ id: "orders", columns: [] }])).toMatch(
    /tabelas e os campos/,
  );
  expect(
    sourceKnowledgeCompareDisabled({
      disabled: false,
      busy: false,
      hasInspection: true,
      profileSuspended: false,
      standardSuspended: false,
    }),
  ).toBe(false);
  expect(
    sourceKnowledgeCompareDisabled({
      disabled: false,
      busy: false,
      hasInspection: false,
      profileSuspended: false,
      standardSuspended: false,
    }),
  ).toBe(true);
  expect(
    sourceKnowledgeConfirmDisabled({
      disabled: false,
      busy: false,
      comparisonStatus: "compatible",
    }),
  ).toBe(false);
  expect(
    sourceKnowledgeApplyDisabled({
      disabled: false,
      busy: false,
      comparisonStatus: "compatible",
      confirmed: false,
    }),
  ).toBe(true);
  expect(
    sourceKnowledgeCanApply({
      hasDraft: true,
      hasSelection: true,
      hasInspection: true,
      comparisonStatus: "compatible",
      confirmed: true,
    }),
  ).toBe(true);
  expect(
    sourceKnowledgeCanApply({
      hasDraft: true,
      hasSelection: true,
      hasInspection: true,
      comparisonStatus: "incompatible",
      confirmed: true,
    }),
  ).toBe(false);
});

it("preserva rascunho privado ao remover o vínculo e não marca toque sem rascunho ou cadastro", () => {
  expect(sourceKnowledgeMarksPendingOnTouch(false, undefined)).toBe(false);
  expect(sourceKnowledgeMarksPendingOnTouch(false, true)).toBe(true);
  expect(sourceKnowledgeMarksPendingOnTouch(true, false)).toBe(true);
  const training = { sourceId: "s", sharedKnowledge: { catalogId: "c" } };
  expect(sourceKnowledgeWithoutReference(training)).toEqual({ sourceId: "s" });
  expect(training.sharedKnowledge).toEqual({ catalogId: "c" });
  expect(sourceKnowledgeHasNnRelationships(content)).toBe(true);
  expect(emptyProfilePage()).toEqual({
    drafts: [],
    publications: [],
    nextDraftCursor: null,
    nextPublicationCursor: null,
  });
  expect(sourceKnowledgeErrorMessage(new Error("Revise a seleção."), "fallback")).toBe(
    "Revise a seleção.",
  );
  expect(sourceKnowledgeErrorMessage("x", "Não foi possível comparar.")).toBe(
    "Não foi possível comparar.",
  );
});
