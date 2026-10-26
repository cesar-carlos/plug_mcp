import { z } from "zod";
import { datasetCaseOriginSchema, datasetVersionReferenceSchema } from "./dataset-case-origin.js";
import { datasetCaseSeedsSchema } from "./dataset-case-seeds.js";
import { federationDatasetCompositionOriginSchema } from "./dataset-composition.js";

export const federationDatasetSelectionSchema = z.strictObject({
  publicationId: z.uuid(),
  querySkillId: z.uuid(),
  queryRevision: z.number().int().positive(),
  dataset: datasetVersionReferenceSchema.optional(),
});
export const federationSourceDatasetOriginSchema = datasetCaseOriginSchema.extend({
  format: z.literal("federation-source-dataset-v1"),
  publicationId: z.uuid(),
  publicationHash: z.string().regex(/^[a-f0-9]{64}$/),
  querySkillId: z.uuid(),
  queryRevision: z.number().int().positive(),
});
export const federationDatasetOriginSchema = z.strictObject({
  format: z.literal("federation-dataset-case-origin-v1"),
  sources: z
    .array(z.union([federationSourceDatasetOriginSchema, federationDatasetCompositionOriginSchema]))
    .min(1)
    .max(4)
    .refine((sources) => new Set(sources.map((source) => source.sourceId)).size === sources.length),
});
export const federationDatasetSeedsSchema = datasetCaseSeedsSchema.extend({
  origin: federationSourceDatasetOriginSchema,
});
export type FederationDatasetSelection = z.infer<typeof federationDatasetSelectionSchema>;
export type FederationSourceDatasetOrigin = z.infer<typeof federationSourceDatasetOriginSchema>;
export type FederationDatasetOrigin = z.infer<typeof federationDatasetOriginSchema>;
export type FederationDatasetSeeds = z.infer<typeof federationDatasetSeedsSchema>;
