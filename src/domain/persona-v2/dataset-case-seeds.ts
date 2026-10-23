import { z } from "zod";
import { fixtureSeedsSchema } from "./publication-fixture.js";
import { datasetCaseOriginSchema } from "./dataset-case-origin.js";

/** Editorial suggestion only; it is neither a saved test nor a technical report. */
export const datasetCaseSeedsSchema = z.strictObject({
  revision: z.number().int().positive(),
  sourceId: z.uuid(),
  catalogId: z.uuid(),
  template: z.strictObject({
    id: z.uuid(),
    version: z.number().int().positive(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  dataset: z.strictObject({
    id: z.uuid(),
    version: z.number().int().positive(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    name: z.string().min(1).max(200),
  }),
  fixtures: fixtureSeedsSchema,
  origin: datasetCaseOriginSchema,
  executable: z.literal(false),
  technicalApproval: z.literal(false),
});
export type DatasetCaseSeeds = z.infer<typeof datasetCaseSeedsSchema>;
