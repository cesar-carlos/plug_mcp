import { z } from "zod";
import { datasetVersionReferenceSchema } from "./dataset-case-origin.js";
import { fixtureSeedsSchema } from "./publication-fixture.js";

const materialSelection = z.strictObject({
  catalogId: z.uuid(),
  dataset: datasetVersionReferenceSchema,
});
export const datasetCompositionSelectionSchema = z.strictObject({
  materials: z
    .array(materialSelection)
    .min(1)
    .max(4)
    .refine(
      (items) =>
        new Set(items.map((item) => `${item.catalogId}:${item.dataset.id}:${item.dataset.version}`))
          .size === items.length,
    ),
});
const materialOrigin = materialSelection.extend({
  template: datasetVersionReferenceSchema,
  sourceSeedsHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const operationDatasetCompositionOriginSchema = z.strictObject({
  format: z.literal("operation-dataset-composition-v1"),
  sourceId: z.uuid(),
  sourceVersion: z.number().int().positive(),
  dialect: z.enum(["postgres", "mssql", "sybase"]),
  materials: z.array(materialOrigin).min(1).max(4),
  sourceSeedsHash: z.string().regex(/^[a-f0-9]{64}$/),
  caseSeedsHash: z.string().regex(/^[a-f0-9]{64}$/),
  modified: z.boolean(),
});
export const federationDatasetCompositionOriginSchema =
  operationDatasetCompositionOriginSchema.extend({
    format: z.literal("federation-source-dataset-composition-v1"),
    publicationId: z.uuid(),
    publicationHash: z.string().regex(/^[a-f0-9]{64}$/),
  });
export const datasetCompositionSeedsSchema = z.strictObject({
  revision: z.number().int().positive(),
  sourceId: z.uuid(),
  fixtures: fixtureSeedsSchema,
  origin: z.union([
    operationDatasetCompositionOriginSchema,
    federationDatasetCompositionOriginSchema,
  ]),
  executable: z.literal(false),
  technicalApproval: z.literal(false),
});
export type DatasetCompositionSelection = z.infer<typeof datasetCompositionSelectionSchema>;
export type DatasetCompositionSeeds = z.infer<typeof datasetCompositionSeedsSchema>;
export type DatasetCompositionOrigin = DatasetCompositionSeeds["origin"];
