import { z } from "zod";
import { canonicalJson } from "./catalog.js";
import type { ConsumerIdentity } from "./model.js";

export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
export const ATTACHMENT_MAX_TTL_MS = 15 * 60 * 1000;
export const attachmentContractSchema = z.strictObject({
  format: z.literal("json"),
  maxBytes: z.number().int().positive().max(ATTACHMENT_MAX_BYTES),
  ttlMs: z.number().int().positive().max(ATTACHMENT_MAX_TTL_MS),
});
export const binaryMimeSchema = z.enum([
  "application/octet-stream",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
export const binaryAttachmentContractSchema = z.strictObject({
  table: z
    .string()
    .regex(/^[a-z_][a-z0-9_$]*(\.[a-z_][a-z0-9_$]*)?$/)
    .max(200),
  column: z
    .string()
    .regex(/^[a-z_][a-z0-9_$]*$/)
    .max(100),
  mimeTypes: z
    .array(binaryMimeSchema)
    .min(1)
    .max(5)
    .refine((items) => new Set(items).size === items.length),
  maxBytes: attachmentContractSchema.shape.maxBytes,
  ttlMs: attachmentContractSchema.shape.ttlMs,
});
export type BinaryAttachmentContract = z.infer<typeof binaryAttachmentContractSchema>;
export const attachmentHandleSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export type AttachmentContract = z.infer<typeof attachmentContractSchema>;
/** Refresh does not change the consumer; the original handle deadline never extends. */
export const attachmentBinding = (identity: ConsumerIdentity): string =>
  canonicalJson({
    personaId: identity.personaId,
    personaVersion: identity.personaVersion,
    tokenId: identity.tokenId,
    tokenVersion: identity.tokenVersion,
    grantId: identity.grant?.id ?? null,
  });
export interface AttachmentDescriptor {
  id: string;
  handle: string;
  filename: string;
  format: "json" | "binary";
  mimeType: "application/json" | z.infer<typeof binaryMimeSchema>;
  bytes: number;
  rows: number;
  expiresAt: string;
  uri: string;
  downloadPath: string;
  sourceId: string;
  readAt: string;
  complete: boolean;
  classifications: readonly string[];
  provenance?: {
    sourceId: string;
    dialect: string;
    readAt: string;
    publications: readonly { id: string; hash: string }[];
    sharedKnowledge?: readonly {
      catalogId: string;
      publicationId: string;
      hash: string;
      evidenceHash: string;
      profilePublicationId?: string;
      profileHash?: string;
    }[];
  };
}
