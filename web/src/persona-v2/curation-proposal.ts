import { knowledgeProposalInputSchema } from "../../../src/domain/persona-v2/knowledge-curation";
import type { KnowledgeProposal } from "../../../src/domain/persona-v2/knowledge-curation";
import type { PhysicalKnowledgeProposal } from "../../../src/domain/persona-v2/physical-curation";
import type { Content } from "./knowledge-model";

export type CurationProposal = KnowledgeProposal | PhysicalKnowledgeProposal;

export type CurationProposalKind = KnowledgeProposal["change"]["kind"];

export interface CurationExampleParameter {
  name: string;
  type: "string" | "integer" | "decimal" | "boolean" | "date" | "datetime";
  required: boolean;
  meaning: string;
}

export interface CurationExampleVariant {
  dialect: string;
  sql: string;
  parameters: CurationExampleParameter[];
}

export interface CurationExample {
  id: string;
  purpose: string;
  explanation: string;
  variants: CurationExampleVariant[];
}

export const curationStateLabels: Record<KnowledgeProposal["state"], string> = {
  pending: "Pendente",
  incorporated: "Incorporada ao rascunho",
  rejected: "Rejeitada",
};

export const curationKindLabels: Record<CurationProposalKind, string> = {
  tabela: "Tabela e campos",
  relacionamento: "Relacionamento",
  exemplo_sql: "Exemplo SQL",
  regra: "Regra",
};

export const curationChangeLabels: Record<string, string> = {
  added: "Acrescentado",
  removed: "Removido",
  changed: "Alterado",
};

const fieldLabels: Record<string, string> = {
  tables: "Tabelas",
  columns: "Campos",
  relationships: "Relacionamentos",
  examples: "Exemplos SQL",
  rules: "Regras de negócio",
  meaning: "Significado",
  grain: "Grão",
  classification: "Classificação",
  nullable: "Aceita nulo",
  logicalType: "Tipo lógico",
  nativeTypes: "Tipos nativos",
  physicalNames: "Nomes físicos",
  keys: "Chaves",
  cardinality: "Cardinalidade",
  optional: "Opcionalidade",
  via: "Intermediárias",
  path: "Caminho",
  variants: "Variantes",
  parameters: "Parâmetros",
  purpose: "Finalidade",
  explanation: "Explicação",
  state: "Estado editorial",
  name: "Nome",
  sql: "SQL",
  join: "JOIN",
  from: "Origem",
  to: "Destino",
};

export function emptyCurationExample(): CurationExample {
  return {
    id: "",
    purpose: "",
    explanation: "",
    variants: [{ dialect: "postgres", sql: "", parameters: [] }],
  };
}

export function curationStructuralItems(
  kind: CurationProposalKind,
  content: Content | undefined,
): Content["tables"] | Content["relationships"] {
  return kind === "tabela" ? (content?.tables ?? []) : (content?.relationships ?? []);
}

export function curationChangePath(path: string): string {
  return path
    .split("/")
    .map((part) => fieldLabels[part] ?? part)
    .join(" → ");
}

export function curationOriginLabel(origin: "mcp" | "console"): string {
  return origin === "mcp" ? "Envio explícito pelo consumidor MCP" : "Console autenticado";
}

export function publishedCurationBases<T extends { activePublicationId: string | null }>(
  bases: readonly T[],
): T[] {
  return bases.filter((base) => base.activePublicationId);
}

export function buildCurationProposalBody(input: {
  summary: string;
  kind: CurationProposalKind;
  rule: string;
  example: CurationExample;
  structuralItems: ReadonlyArray<{ id: string }>;
  targetId: string;
  baseId: string;
  physical: boolean;
  overrideCommon: boolean;
}): unknown {
  const change =
    input.kind === "regra"
      ? { kind: "regra" as const, value: input.rule }
      : input.kind === "exemplo_sql"
        ? { kind: "exemplo_sql" as const, value: { ...input.example, state: "candidate" as const } }
        : {
            kind: input.kind,
            value: input.structuralItems.find((item) => item.id === input.targetId),
          };
  const parsed = knowledgeProposalInputSchema.parse({ summary: input.summary, change });
  return input.physical
    ? { ...parsed, profilePublicationId: input.baseId, overrideCommon: input.overrideCommon }
    : { ...parsed, basePublicationId: input.baseId };
}
