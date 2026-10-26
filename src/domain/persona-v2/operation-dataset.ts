import { z } from "zod";
import { datasetCaseOriginSchema, datasetVersionReferenceSchema } from "./dataset-case-origin.js";
import { datasetCaseSeedsSchema } from "./dataset-case-seeds.js";

/** An explicit editorial donor, never a query-to-operation training conversion. */
export const operationDatasetSelectionSchema = z.strictObject({
  querySkillId: z.uuid(),
  queryRevision: z.number().int().positive(),
  dataset: datasetVersionReferenceSchema.optional(),
});
export const operationDatasetOriginSchema = datasetCaseOriginSchema.extend({
  format: z.literal("operation-dataset-case-origin-v1"),
  querySkillId: z.uuid(),
  queryRevision: z.number().int().positive(),
});
export const operationDatasetSeedsSchema = datasetCaseSeedsSchema.extend({
  origin: operationDatasetOriginSchema,
});
export type OperationDatasetOrigin = z.infer<typeof operationDatasetOriginSchema>;
export type OperationDatasetSelection = z.infer<typeof operationDatasetSelectionSchema>;
export type OperationDatasetSeeds = z.infer<typeof operationDatasetSeedsSchema>;
