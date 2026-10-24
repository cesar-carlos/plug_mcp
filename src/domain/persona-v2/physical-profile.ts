import type { StructureContent } from "./shared-knowledge.js";
import { z } from "zod";
import { structureContentSchema } from "./structure-content-schema.js";

export const physicalProfileSchema = z.strictObject({
  id: z.uuid(),
  catalogId: z.uuid(),
  physicalSourceId: z.uuid(),
  identityHash: z.string().regex(/^[a-f0-9]{64}$/),
  basePublicationId: z.uuid(),
  baseHash: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().min(1).max(200),
  revision: z.number().int().positive(),
  content: structureContentSchema,
  overrides: z.strictObject({
    tables: z.array(z.string()).max(100),
    relationships: z.array(z.string()).max(200),
  }),
});
export const physicalProfilePublicationSchema = physicalProfileSchema.extend({
  publicationId: z.uuid(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  suspended: z.boolean(),
});
export const physicalProfileComparisonSchema = z.strictObject({
  before: physicalProfilePublicationSchema,
  after: physicalProfilePublicationSchema,
  sections: z.array(
    z.strictObject({
      id: z.string(),
      label: z.string(),
      changes: z.array(
        z.strictObject({
          kind: z.enum(["added", "removed", "changed"]),
          path: z.string(),
          label: z.string(),
          before: z.json().optional(),
          after: z.json().optional(),
        }),
      ),
    }),
  ),
});
export interface PhysicalProfilePage {
  drafts: readonly PhysicalProfile[];
  publications: readonly PhysicalProfilePublication[];
  nextDraftCursor: string | null;
  nextPublicationCursor: string | null;
}

export interface PhysicalProfile {
  id: string;
  catalogId: string;
  physicalSourceId: string;
  identityHash: string;
  basePublicationId: string;
  baseHash: string;
  name: string;
  revision: number;
  content: StructureContent;
  overrides: { tables: string[]; relationships: string[] };
}
export interface PhysicalProfilePublication extends PhysicalProfile {
  publicationId: string;
  hash: string;
  suspended: boolean;
}
export interface PhysicalProfileTransaction {
  list(input: {
    catalogId: string;
    physicalSourceId: string;
    identityHash: string;
    basePublicationId: string;
    includeDrafts: boolean;
    beforeDraft?: string;
    beforePublication?: string;
  }): Promise<PhysicalProfilePage>;
  lockCatalog(catalogId: string): Promise<void>;
  get(catalogId: string, id: string): Promise<PhysicalProfile | null>;
  save(profile: PhysicalProfile, expectedRevision: number | null): Promise<void>;
  preview(input: {
    hash: string;
    profile: PhysicalProfile;
    ownerId: string;
    catalogVersion: number;
    evidenceId: string;
    evidenceHash: string;
    expiresAt: Date;
  }): Promise<void>;
  consume(
    hash: string,
    profile: PhysicalProfile,
    ownerId: string,
    catalogVersion: number,
    evidenceId: string,
    evidenceHash: string,
    now: Date,
  ): Promise<boolean>;
  publish(publication: PhysicalProfilePublication): Promise<void>;
  publication(catalogId: string, id: string): Promise<PhysicalProfilePublication | null>;
  suspend(catalogId: string, publicationId: string, ownerId: string): Promise<void>;
}
