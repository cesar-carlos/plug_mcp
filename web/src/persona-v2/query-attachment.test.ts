import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_DOWNLOAD_TIMEOUT_MS,
  attachmentBytesMatchDescriptor,
  attachmentCreateQueryOptions,
  attachmentDownloadInit,
  attachmentDownloadPath,
  isAttachmentDownloadStale,
  publicationAllowsAttachment,
  type AttachmentPublicationContract,
} from "./query-attachment";

const jsonContract: AttachmentPublicationContract = {
  package: {
    training: { attachments: { format: "json", maxBytes: 1024, ttlMs: 60_000 } },
  },
};
const binaryContract: AttachmentPublicationContract = {
  package: {
    training: {
      binaryAttachments: {
        table: "files",
        column: "bytes",
        mimeTypes: ["application/pdf"],
        maxBytes: 1024,
        ttlMs: 60_000,
      },
    },
  },
};

describe("regras do anexo de consulta", () => {
  it("exige publicação com contrato do formato e token, sem reusar resultado anterior", () => {
    expect(publicationAllowsAttachment(undefined, "json", "token")).toBe(false);
    expect(publicationAllowsAttachment(jsonContract, "json", "")).toBe(false);
    expect(publicationAllowsAttachment(jsonContract, "json", "token")).toBe(true);
    expect(publicationAllowsAttachment(jsonContract, "binary", "token")).toBe(false);
    expect(publicationAllowsAttachment(binaryContract, "binary", "token")).toBe(true);
    expect(publicationAllowsAttachment(binaryContract, "json", "token")).toBe(false);
  });

  it("JSON pagina a consulta fresca; binário pede no máximo dois registros sem paginação", () => {
    expect(attachmentCreateQueryOptions("json", 3, 50)).toEqual({ page: 3, pageSize: 50 });
    expect(attachmentCreateQueryOptions("binary", 3, 50)).toEqual({ maxRows: 2 });
  });

  it("download usa Bearer, sem cache, cookie administrativo ou conversão de bytes", () => {
    const signal = new AbortController().signal;
    expect(attachmentDownloadPath("a/b")).toBe("/api/consumer/bearer/attachments/a%2Fb");
    expect(attachmentDownloadInit("secret", signal)).toEqual({
      headers: { Authorization: "Bearer secret" },
      signal,
      cache: "no-store",
      credentials: "omit",
    });
    expect(ATTACHMENT_DOWNLOAD_TIMEOUT_MS).toBe(60_000);
  });

  it("descarta bytes se o contexto mudou e recusa prazo vencido ou tamanho divergente", () => {
    const handle = "handle-1";
    expect(
      isAttachmentDownloadStale({
        logged: true,
        personaId: "persona",
        requestedPersonaId: "persona",
        currentHandle: handle,
        requestedHandle: handle,
      }),
    ).toBe(false);
    expect(
      isAttachmentDownloadStale({
        logged: false,
        personaId: "persona",
        requestedPersonaId: "persona",
        currentHandle: handle,
        requestedHandle: handle,
      }),
    ).toBe(true);
    expect(
      isAttachmentDownloadStale({
        logged: true,
        personaId: "other",
        requestedPersonaId: "persona",
        currentHandle: handle,
        requestedHandle: handle,
      }),
    ).toBe(true);
    expect(
      isAttachmentDownloadStale({
        logged: true,
        personaId: "persona",
        requestedPersonaId: "persona",
        currentHandle: "other",
        requestedHandle: handle,
      }),
    ).toBe(true);
    const now = Date.parse("2026-10-27T12:00:00.000Z");
    expect(attachmentBytesMatchDescriptor("2026-10-27T12:00:01.000Z", 12, 12, now)).toBe(true);
    expect(attachmentBytesMatchDescriptor("2026-10-27T12:00:00.000Z", 12, 12, now)).toBe(false);
    expect(attachmentBytesMatchDescriptor("2026-10-27T12:00:01.000Z", 11, 12, now)).toBe(false);
  });
});
