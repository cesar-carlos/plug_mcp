import { z } from "zod";
import { structureContentSchema } from "../../../src/domain/persona-v2/structure-content-schema";
import {
  physicalProfileSchema,
  physicalProfilePublicationSchema,
} from "../../../src/domain/persona-v2/physical-profile";
import type { schemaResourceSchema } from "../../../src/domain/persona-v2/source-schema";
import { storedStructureEvidenceSchema } from "../../../src/domain/persona-v2/source-schema";
import type { Training, Dialect } from "./model";
export type Content = z.infer<typeof structureContentSchema>;
export const catalogSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: z.enum(["administrator", "curator", "contributor", "reader"]),
});
export const standardPublicationSchema = z.object({
  id: z.uuid(),
  patternId: z.uuid(),
  revision: z.number().int().positive(),
  hash: z.string(),
  content: structureContentSchema,
  suspendedAt: z.string().nullable(),
});
export type StandardPublication = z.infer<typeof standardPublicationSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type Profile = z.infer<typeof physicalProfileSchema>;
export type ProfilePublication = z.infer<typeof physicalProfilePublicationSchema>;
export const profilePageSchema = z.object({
  drafts: z.array(physicalProfileSchema).max(20),
  publications: z.array(physicalProfilePublicationSchema).max(20),
  nextDraftCursor: z.uuid().nullable(),
  nextPublicationCursor: z.uuid().nullable(),
});
export type ProfilePage = z.infer<typeof profilePageSchema>;
export const inspectionResultSchema = z.object({
  id: z.uuid(),
  hash: z.string(),
  sourceId: z.uuid(),
  expiresAt: z.iso.datetime({ offset: true }),
  evidence: storedStructureEvidenceSchema,
  executable: z.literal(false),
  semanticApproval: z.literal(false),
});
export type Inspection = z.infer<typeof inspectionResultSchema>;
export type Resource = z.infer<typeof schemaResourceSchema>;
export const comparisonSchema = z.object({
  status: z.enum(["compatible", "incompatible", "inconclusive"]),
  issues: z.array(
    z.object({
      resource: z.string(),
      field: z.string().optional(),
      code: z.string(),
      state: z.enum(["incompatible", "inconclusive"]),
    }),
  ),
  publicationId: z.uuid(),
  publicationHash: z.string(),
  evidenceId: z.uuid(),
  profilePublicationId: z.uuid().optional(),
  profileHash: z.string().optional(),
  executionReady: z.literal(false),
  semanticApproval: z.literal(false),
  automaticAdoption: z.literal(false),
});
export type Comparison = z.infer<typeof comparisonSchema>;
export interface KnowledgeSelection {
  catalogId: string;
  standard: StandardPublication;
  profile?: ProfilePublication;
}
export const physicalName = (table: Content["tables"][number], dialect: Dialect) =>
  table.physicalNames.find((p) => p.dialect === dialect)?.name ?? table.name;
export function scopeForContent(content: Content, dialect: Dialect): Resource[] {
  return content.tables.map((t) => {
    const name = physicalName(t, dialect).split(".");
    if (dialect === "firebird") return { schema: null, name: name.at(-1)!, type: t.resourceType };
    if (name.length !== 2)
      throw new Error("O padrão precisa declarar schema e tabela para este motor.");
    return { schema: name[0], name: name[1], type: t.resourceType };
  });
}
export function adoptTraining(
  training: Training,
  selection: KnowledgeSelection,
  inspection: Inspection,
  tableIds: readonly string[],
  fields: readonly string[],
): Training {
  const content = selection.profile?.content ?? selection.standard.content;
  const tables = content.tables.filter((t) => tableIds.includes(t.id));
  if (!tables.length) throw new Error("Selecione pelo menos uma tabela.");
  if (tables.some((t) => !t.grain.length || t.grain.some((c) => !fields.includes(`${t.id}.${c}`))))
    throw new Error("Inclua todos os campos que identificam o grão de cada tabela.");
  const columns = tables.flatMap((t) =>
    t.columns
      .filter((c) => fields.includes(`${t.id}.${c.name}`))
      .map((c) => {
        if (c.classification === "segredo" || c.classification === "inferido")
          throw new Error("A adoção exige campos confirmados, sem segredos.");
        const previous = training.columns.find(
          (column) =>
            column.table === physicalName(t, training.dialect) &&
            column.name === c.name &&
            column.classification === c.classification,
        );
        return {
          table: physicalName(t, training.dialect),
          name: c.name,
          meaning: c.meaning,
          classification: c.classification,
          ...(previous?.uses ? { uses: previous.uses, usePurpose: previous.usePurpose } : {}),
        };
      }),
  );
  if (tables.some((t) => !columns.some((c) => c.table === physicalName(t, training.dialect))))
    throw new Error("Selecione os campos utilizados em cada tabela.");
  const relations = content.relationships.filter(
    (r) =>
      tableIds.includes(r.from) &&
      tableIds.includes(r.to) &&
      r.via.every((id) => tableIds.includes(id)),
  );
  if (
    relations.some(
      (r) =>
        r.via.length &&
        (!r.path?.length ||
          r.path.some((id) => !relations.some((edge) => edge.id === id && !edge.via.length))),
    )
  )
    throw new Error("Inclua todas as tabelas e elos do caminho N:N antes da adoção.");
  if (
    relations.some((r) =>
      r.keys.some(
        (k) => !fields.includes(`${r.from}.${k.from}`) || !fields.includes(`${r.to}.${k.to}`),
      ),
    )
  )
    throw new Error("Inclua todos os pares de campos dos relacionamentos selecionados.");
  return {
    ...training,
    sharedKnowledge: {
      catalogId: selection.catalogId,
      publicationId: selection.standard.id,
      evidenceId: inspection.id,
      ...(selection.profile ? { profilePublicationId: selection.profile.publicationId } : {}),
    },
    tables: tables.map((t) => ({
      name: physicalName(t, training.dialect),
      meaning: t.meaning,
      grain: [...t.grain],
      resourceType: t.resourceType,
    })),
    columns,
    relationships: relations.map((r) => ({
      id: r.id,
      ...(r.via.length
        ? {
            via: r.via.map((id) =>
              physicalName(
                tables.find((t) => t.id === id)!,
                training.dialect,
              ),
            ),
            path: [...r.path!],
          }
        : {}),
      from: physicalName(
        tables.find((t) => t.id === r.from)!,
        training.dialect,
      ),
      to: physicalName(
        tables.find((t) => t.id === r.to)!,
        training.dialect,
      ),
      keys: r.keys.map((k) => ({ ...k })),
      join: r.join,
      cardinality: r.cardinality,
      meaning: r.meaning,
    })),
    rules: [...new Set([...content.rules, ...training.rules])],
  };
}
export const constraintLabels: Record<string, string> = {
  enabled: "Habilitada e validada",
  disabled: "Desabilitada",
  unvalidated: "Não validada",
  unknown: "Estado desconhecido",
};
export const issueLabels: Record<string, string> = {
  DIALECT_NOT_DECLARED: "O motor da base não está declarado nesta versão.",
  RESOURCE_NOT_PROVEN:
    "Tabela ou view sem prova suficiente; confira o schema e as permissões técnicas.",
  COLUMN_MISSING: "Campo não encontrado na estrutura observada.",
  NULLABILITY_UNKNOWN: "A nulabilidade do campo não foi comprovada.",
  NULLABILITY_DIFFERS: "A nulabilidade difere do padrão.",
  NATIVE_TYPE_NOT_DECLARED: "O tipo nativo deste motor não foi declarado.",
  NATIVE_TYPE_DIFFERS: "Tipo, tamanho, precisão ou escala divergentes.",
  CONSTRAINT_STATUS_NOT_PROVEN: "Estado da chave sem prova suficiente.",
  CONSTRAINT_DIFFERS: "Chave ausente, desabilitada ou não validada.",
  RELATIONSHIP_ENFORCEMENT_NOT_PROVEN: "Enforcement do relacionamento não comprovado.",
  RELATIONSHIP_DIFFERS: "FK, destino ou pares de campos divergentes.",
  RELATIONSHIP_DIRECTION_NOT_PROVEN:
    "Direção ou caminho físico ainda não suportado para esta prova.",
  RELATIONSHIP_PATH_NOT_PROVEN: "Caminho N:N incompleto ou sem prova física de todos os elos.",
  RELATIONSHIP_UNIQUENESS_NOT_PROVEN: "Unicidade necessária ao relacionamento não comprovada.",
};
