import { z } from "zod";
import { DEFAULT_FEDERATION_BUDGET } from "./federation.js";

const ceiling = (field: keyof typeof DEFAULT_FEDERATION_BUDGET) =>
  z.number().int().min(1).max(DEFAULT_FEDERATION_BUDGET[field]).optional();
export const federationBudgetSchema = z.strictObject({
  sources: ceiling("sources"),
  steps: ceiling("steps"),
  concurrency: ceiling("concurrency"),
  rowsPerSource: ceiling("rowsPerSource"),
  intermediateRows: ceiling("intermediateRows"),
  intermediateBytes: ceiling("intermediateBytes"),
  timeoutMs: ceiling("timeoutMs"),
});
