import { z } from "zod";

export const datasetVersionReferenceSchema = z.strictObject({
  id: z.uuid(),
  version: z.number().int().positive(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Editorial lineage, never evidence of semantic or technical approval. */
export const datasetCaseOriginSchema = z.strictObject({
  format: z.literal("dataset-case-origin-v1"),
  catalogId: z.uuid(),
  sourceId: z.uuid(),
  sourceVersion: z.number().int().positive(),
  dialect: z.enum(["postgres", "mssql", "sybase"]),
  template: datasetVersionReferenceSchema,
  dataset: datasetVersionReferenceSchema,
  sourceSeedsHash: z.string().regex(/^[a-f0-9]{64}$/),
  caseSeedsHash: z.string().regex(/^[a-f0-9]{64}$/),
  modified: z.boolean(),
});
export type DatasetCaseOrigin = z.infer<typeof datasetCaseOriginSchema>;

export const datasetCaseBinding = (
  value: DatasetCaseOrigin,
): Omit<DatasetCaseOrigin, "format" | "sourceSeedsHash" | "caseSeedsHash" | "modified"> => ({
  catalogId: value.catalogId,
  sourceId: value.sourceId,
  sourceVersion: value.sourceVersion,
  dialect: value.dialect,
  template: value.template,
  dataset: value.dataset,
});
