import { z } from "zod";
import { datasetCaseOriginSchema, datasetVersionReferenceSchema } from "./dataset-case-origin.js";
import { datasetCaseSeedsSchema } from "./dataset-case-seeds.js";

export const directOperationDatasetSelectionSchema = z.strictObject({
  catalogId: z.uuid(),
  dataset: datasetVersionReferenceSchema,
});
export const directOperationDatasetOriginSchema = datasetCaseOriginSchema.extend({
  format: z.literal("operation-direct-dataset-case-origin-v1"),
});
export const directOperationDatasetSeedsSchema = datasetCaseSeedsSchema.extend({
  origin: directOperationDatasetOriginSchema,
});
export type DirectOperationDatasetSelection = z.infer<typeof directOperationDatasetSelectionSchema>;
export type DirectOperationDatasetOrigin = z.infer<typeof directOperationDatasetOriginSchema>;
export type DirectOperationDatasetSeeds = z.infer<typeof directOperationDatasetSeedsSchema>;
