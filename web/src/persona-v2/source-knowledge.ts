import {
  physicalName,
  type Comparison,
  type Content,
  type KnowledgeSelection,
  type ProfilePage,
} from "./knowledge-model";
import type { OperationTraining } from "./operation-editor";

export interface SourceKnowledgeSelectedTable {
  id: string;
  columns: string[];
}

export interface SourceKnowledgeComparisonRequest {
  catalogId: string;
  publicationId: string;
  evidenceId: string;
  profilePublicationId?: string;
  selectedTables?: SourceKnowledgeSelectedTable[];
}

export const sourceKnowledgeStatusLabel: Record<Comparison["status"], string> = {
  compatible: "Estrutura compatível",
  incompatible: "Estrutura incompatível",
  inconclusive: "Compatibilidade inconclusiva",
};

export const sourceKnowledgeAppliedMessage =
  "Conhecimento aplicado somente ao rascunho. Salve, revise os testes e publique a skill; tokens não recebem concessões novas automaticamente.";

export const sourceKnowledgeReferenceRemovedMessage =
  "Referência removida somente do rascunho. O conteúdo privado foi preservado; publicação e tokens permanecem sujeitos à revisão.";

export function emptyProfilePage(): ProfilePage {
  return {
    drafts: [],
    publications: [],
    nextDraftCursor: null,
    nextPublicationCursor: null,
  };
}

export function sourceKnowledgeDirty(input: {
  inspectionDirty: boolean;
  profileDirty: boolean;
  pendingAdoption: boolean;
  curationDirty: boolean;
  reviewDirty: boolean;
}): boolean {
  return (
    input.inspectionDirty ||
    input.profileDirty ||
    input.pendingAdoption ||
    input.curationDirty ||
    input.reviewDirty
  );
}

export function sourceKnowledgeSelectionKey(selection: KnowledgeSelection | undefined): string {
  return JSON.stringify([
    selection?.catalogId,
    selection?.standard.id,
    selection?.standard.hash,
    selection?.standard.suspendedAt,
    selection?.profile?.publicationId,
    selection?.profile?.hash,
    selection?.profile?.suspended,
  ]);
}

export function sourceKnowledgeSelectedTables(
  content: Content | undefined,
  tables: readonly string[],
  fields: readonly string[],
): SourceKnowledgeSelectedTable[] {
  return (
    content?.tables
      .filter((table) => tables.includes(table.id))
      .map((table) => ({
        id: table.id,
        columns: table.columns
          .filter((column) => fields.includes(`${table.id}.${column.name}`))
          .map((column) => column.name),
      })) ?? []
  );
}

export function sourceKnowledgeInspectionContent(
  content: Content | undefined,
  tables: readonly string[],
  hasDraft: boolean,
): Content | undefined {
  return hasDraft && tables.length > 0 && content
    ? { ...content, tables: content.tables.filter((table) => tables.includes(table.id)) }
    : content;
}

export function sourceKnowledgeComparisonKey(input: {
  selectionKey: string;
  inspectionId: string | undefined;
  selectedTables: SourceKnowledgeSelectedTable[] | undefined;
  operationTraining: OperationTraining | undefined;
}): string {
  return JSON.stringify([
    input.selectionKey,
    input.inspectionId,
    input.selectedTables,
    input.operationTraining,
  ]);
}

export function sourceKnowledgeTableAllowed(
  table: Content["tables"][number],
  operation: OperationTraining | undefined,
): boolean {
  if (!operation) {
    return true;
  }
  return operation.tables.some(
    (declared) => declared.name === physicalName(table, operation.dialect),
  );
}

export function sourceKnowledgeFieldAllowed(
  table: Content["tables"][number],
  name: string,
  operation: OperationTraining | undefined,
): boolean {
  if (!operation) {
    return true;
  }
  return operation.tables.some(
    (declared) =>
      declared.name === physicalName(table, operation.dialect) &&
      declared.columns.some((column) => column.name === name),
  );
}

export function sourceKnowledgeColumnDisabled(
  table: Content["tables"][number],
  column: Content["tables"][number]["columns"][number],
  operation: OperationTraining | undefined,
): boolean {
  if (!sourceKnowledgeFieldAllowed(table, column.name, operation)) {
    return true;
  }
  if (operation) {
    return column.classification !== "livre";
  }
  return column.classification === "segredo" || column.classification === "inferido";
}

export function sourceKnowledgeColumnHint(
  classification: Content["tables"][number]["columns"][number]["classification"],
): string {
  if (classification === "segredo" || classification === "inferido") {
    return " (não executável)";
  }
  if (classification !== "livre") {
    return " (configure finalidades e justificativa no treinamento antes de publicar)";
  }
  return "";
}

export function sourceKnowledgeSelectAll(
  content: Content,
  operation: OperationTraining | undefined,
): { tables: string[]; fields: string[] } {
  const selectable = content.tables.filter((table) =>
    sourceKnowledgeTableAllowed(table, operation),
  );
  return {
    tables: selectable.map((table) => table.id),
    fields: selectable.flatMap((table) =>
      table.columns
        .filter(
          (column) =>
            column.classification === "livre" &&
            sourceKnowledgeFieldAllowed(table, column.name, operation),
        )
        .map((column) => `${table.id}.${column.name}`),
    ),
  };
}

export function sourceKnowledgeSectionLabel(input: {
  hasOperation: boolean;
  hasDraft: boolean;
}): string {
  if (input.hasOperation) {
    return "Adoção de conhecimento na operação";
  }
  if (input.hasDraft) {
    return "Adoção de conhecimento na skill";
  }
  return "Conhecimento das bases da persona";
}

export function sourceKnowledgeTitle(input: {
  hasDraft: boolean;
  hasOperation: boolean;
  registration: boolean;
}): string {
  if (!input.hasDraft) {
    return input.registration ? "ERP / padrão de estrutura da base" : "Conhecimento da persona";
  }
  return input.hasOperation
    ? "Conhecimento compartilhado desta operação"
    : "Conhecimento compartilhado desta consulta";
}

export function sourceKnowledgeAdoptionLegend(hasOperation: boolean): string {
  return hasOperation
    ? "Tabelas e campos declarados na operação"
    : "Tabelas e campos necessários à consulta";
}

export function sourceKnowledgeAdoptionHelp(hasOperation: boolean): string {
  return hasOperation
    ? "Selecione todas e somente as tabelas e colunas já declaradas na operação. A adoção atualiza significado, grão, regras e relacionamentos; preserva tipos, identidade, concorrência, parâmetros, etapas e permissões de escrita. Cadastre recursos faltantes antes de adotar. PK/UNIQUE, FKs e tipos ainda serão conferidos pelo servidor na publicação."
    : "A aplicação substitui as definições de estrutura e relacionamentos do rascunho; SQL, exemplos e parâmetros são preservados. Inclua grão e chaves utilizadas. A prova inicial usa uma evidência individual ou páginas explicitamente combinadas, até dezesseis recursos.";
}

export function sourceKnowledgeConfirmLabel(hasOperation: boolean): string {
  return hasOperation
    ? "Revisei a adoção estrutural sem alteração das etapas, parâmetros e permissões de escrita."
    : "Revisei a estrutura, os relacionamentos e as regras que substituirão o conteúdo do rascunho.";
}

export function sourceKnowledgeResourceLabel(content: Content | undefined, id: string): string {
  return (
    content?.tables.find((table) => table.id === id)?.name ??
    content?.relationships.find((relationship) => relationship.id === id)?.meaning ??
    id
  );
}

export function sourceKnowledgeCompatibilitySubject(selection: KnowledgeSelection): string {
  return selection.profile
    ? `${selection.profile.name} · revisão ${selection.profile.revision}`
    : `${selection.standard.content.system} · ${selection.standard.content.label}`;
}

export function sourceKnowledgeComparisonBody(input: {
  selection: KnowledgeSelection;
  evidenceId: string;
  selectedTables?: SourceKnowledgeSelectedTable[];
}): SourceKnowledgeComparisonRequest {
  return {
    catalogId: input.selection.catalogId,
    publicationId: input.selection.standard.id,
    evidenceId: input.evidenceId,
    ...(input.selection.profile
      ? { profilePublicationId: input.selection.profile.publicationId }
      : {}),
    ...(input.selectedTables ? { selectedTables: input.selectedTables } : {}),
  };
}

export function sourceKnowledgeSelectionChangeNeedsDiscard(input: {
  profileDirty: boolean;
  curationDirty: boolean;
  reviewDirty: boolean;
  pendingAdoption: boolean;
  selectedTableCount: number;
}): boolean {
  return (
    input.profileDirty ||
    input.curationDirty ||
    input.reviewDirty ||
    (input.pendingAdoption && input.selectedTableCount > 0)
  );
}

export function sourceKnowledgeCompareSelectionError(
  hasDraft: boolean,
  selectedTables: readonly SourceKnowledgeSelectedTable[],
): string | undefined {
  if (!hasDraft) {
    return undefined;
  }
  if (!selectedTables.length || selectedTables.some((table) => table.columns.length === 0)) {
    return "Selecione as tabelas e os campos utilizados antes de comparar.";
  }
  return undefined;
}

export function sourceKnowledgeCompareDisabled(input: {
  disabled: boolean;
  busy: boolean;
  hasInspection: boolean;
  profileSuspended: boolean;
  standardSuspended: boolean;
}): boolean {
  return (
    input.disabled ||
    input.busy ||
    !input.hasInspection ||
    input.profileSuspended ||
    input.standardSuspended
  );
}

export function sourceKnowledgeConfirmDisabled(input: {
  disabled: boolean;
  busy: boolean;
  comparisonStatus: Comparison["status"] | undefined;
}): boolean {
  return input.disabled || input.busy || input.comparisonStatus !== "compatible";
}

export function sourceKnowledgeApplyDisabled(input: {
  disabled: boolean;
  busy: boolean;
  comparisonStatus: Comparison["status"] | undefined;
  confirmed: boolean;
}): boolean {
  return sourceKnowledgeConfirmDisabled(input) || !input.confirmed;
}

export function sourceKnowledgeCanApply(input: {
  hasDraft: boolean;
  hasSelection: boolean;
  hasInspection: boolean;
  comparisonStatus: Comparison["status"] | undefined;
  confirmed: boolean;
}): boolean {
  return (
    input.hasDraft &&
    input.hasSelection &&
    input.hasInspection &&
    input.comparisonStatus === "compatible" &&
    input.confirmed
  );
}

export function sourceKnowledgeMarksPendingOnTouch(
  hasDraft: boolean,
  registration: boolean | undefined,
): boolean {
  return hasDraft || registration === true;
}

export function sourceKnowledgeHasNnRelationships(content: Content): boolean {
  return content.relationships.some((relationship) => relationship.via.length > 0);
}

export function sourceKnowledgeWithoutReference<T extends { sharedKnowledge?: unknown }>(
  training: T,
): T {
  const copy = { ...training };
  delete copy.sharedKnowledge;
  return copy;
}

export function sourceKnowledgeErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
