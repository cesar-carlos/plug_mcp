import type { Training } from "./model";

export const ATTACHMENT_DOWNLOAD_TIMEOUT_MS = 60_000;

export interface AttachmentPublicationContract {
  package: {
    training: {
      attachments?: Training["attachments"];
      binaryAttachments?: Training["binaryAttachments"];
    };
  };
}

export function publicationAllowsAttachment(
  publication: AttachmentPublicationContract | undefined,
  format: "json" | "binary",
  bearer: string,
): boolean {
  if (!publication || !bearer) {
    return false;
  }
  return format === "binary"
    ? !!publication.package.training.binaryAttachments
    : !!publication.package.training.attachments;
}

export function attachmentCreateQueryOptions(
  format: "json" | "binary",
  page: number,
  pageSize: number,
): { maxRows: 2 } | { page: number; pageSize: number } {
  return format === "binary" ? { maxRows: 2 } : { page, pageSize };
}

export function attachmentDownloadPath(handle: string): string {
  return `/api/consumer/bearer/attachments/${encodeURIComponent(handle)}`;
}

export function attachmentDownloadInit(bearer: string, signal: AbortSignal): RequestInit {
  return {
    headers: { Authorization: `Bearer ${bearer}` },
    signal,
    cache: "no-store",
    credentials: "omit",
  };
}

export function isAttachmentDownloadStale(input: {
  logged: boolean;
  personaId: string;
  requestedPersonaId: string;
  currentHandle: string | undefined;
  requestedHandle: string;
}): boolean {
  return (
    !input.logged ||
    input.personaId !== input.requestedPersonaId ||
    input.currentHandle !== input.requestedHandle
  );
}

export function attachmentBytesMatchDescriptor(
  expiresAt: string,
  receivedBytes: number,
  expectedBytes: number,
  now: number,
): boolean {
  return Date.parse(expiresAt) > now && receivedBytes === expectedBytes;
}
