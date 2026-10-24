import { z } from "zod";
import type { StructureContent } from "./shared-knowledge.js";
import type { ExpectedStructure } from "./source-schema.js";

export const knowledgeSelectionSchema = z.strictObject({
  catalogId: z.uuid(),
  publicationId: z.uuid(),
  evidenceId: z.uuid(),
  profilePublicationId: z.uuid().optional(),
});

const physicalName = z
  .string()
  .regex(/^[a-z_][a-z0-9_$]*(\.[a-z_][a-z0-9_$]*)?$/)
  .max(200);
const columnName = z
  .string()
  .regex(/^[a-z_][a-z0-9_$]*$/)
  .max(100);
const relationId = z
  .string()
  .regex(/^[a-z][a-z0-9_-]*$/)
  .max(100);
export const trainedRelationshipSchema = z.strictObject({
  from: physicalName,
  id: relationId.optional(),
  via: z.array(physicalName).max(8).optional(),
  path: z.array(relationId).max(9).optional(),
  to: physicalName,
  keys: z
    .array(z.strictObject({ from: columnName, to: columnName }))
    .min(1)
    .max(16),
  join: z.enum(["inner", "left"]),
  cardinality: z.enum(["1:1", "1:N", "N:1", "N:N"]),
  meaning: z.string().trim().min(1).max(5000),
});
export type TrainedRelationship = z.infer<typeof trainedRelationshipSchema>;

/** Exact published dependencies, shared by read and write packages without sharing authority. */
export interface AdoptedKnowledge {
  readonly catalogId: string;
  readonly publicationId: string;
  readonly publicationHash: string;
  readonly evidenceId: string;
  readonly evidenceHash: string;
  readonly profilePublicationId?: string;
  readonly profileHash?: string;
  readonly content: StructureContent;
  readonly expectedStructure: ExpectedStructure;
}
