import { z } from "zod";
import { datasetVersionReferenceSchema } from "./dataset-case-origin.js";

export const datasetCaseCursorSchema = z.strictObject({
  id: z.uuid(),
  version: z.number().int().positive(),
});
export const datasetCaseOptionsSchema = z.strictObject({
  revision: z.number().int().positive(),
  sourceId: z.uuid(),
  catalogId: z.uuid(),
  template: datasetVersionReferenceSchema,
  datasets: z
    .array(datasetVersionReferenceSchema.extend({ name: z.string().min(1).max(200) }))
    .max(20),
  nextCursor: datasetCaseCursorSchema.nullable(),
});
export type DatasetCaseOptions = z.infer<typeof datasetCaseOptionsSchema>;
export type DatasetVersionReference = z.infer<typeof datasetVersionReferenceSchema>;
