import { ref, type ComputedRef, type Ref } from "vue";
import type { AttachmentDescriptor } from "../../../src/domain/persona-v2/attachments";
import { assertTokenPersona } from "./mcp-client";
import type { Persona, Publication } from "./model";
import {
  ATTACHMENT_DOWNLOAD_TIMEOUT_MS,
  attachmentBytesMatchDescriptor,
  attachmentCreateQueryOptions,
  attachmentDownloadInit,
  attachmentDownloadPath,
  isAttachmentDownloadStale,
  publicationAllowsAttachment,
} from "./query-attachment";
import { queryParameters, type ParameterMode } from "./query-parameters";

export interface QueryAttachmentDeps {
  run: (action: () => Promise<void>) => Promise<void>;
  mcp: <T>(tool: string, args: unknown) => Promise<T>;
  bearer: Ref<string>;
  personaId: Ref<string>;
  logged: Ref<boolean>;
  message: Ref<string>;
  active: ComputedRef<Publication | undefined>;
  querySkill: Ref<string>;
  querySql: Ref<string>;
  queryValues: Record<string, string>;
  queryModes: Record<string, ParameterMode>;
  queryPage: Ref<number>;
  queryPageSize: Ref<number>;
}

export interface QueryAttachmentState {
  attachment: Ref<AttachmentDescriptor | undefined>;
  clearAttachment: () => void;
  createAttachment: (format?: "json" | "binary") => Promise<void>;
  downloadAttachment: () => Promise<void>;
}

export function useQueryAttachment(deps: QueryAttachmentDeps): QueryAttachmentState {
  const {
    run,
    mcp,
    bearer,
    personaId,
    logged,
    message,
    active,
    querySkill,
    querySql,
    queryValues,
    queryModes,
    queryPage,
    queryPageSize,
  } = deps;
  const attachment = ref<AttachmentDescriptor>();
  let attachmentDownload: AbortController | undefined;

  function clearAttachment(): void {
    attachmentDownload?.abort();
    attachmentDownload = undefined;
    attachment.value = undefined;
  }

  async function createAttachment(format: "json" | "binary" = "json"): Promise<void> {
    await run(async () => {
      clearAttachment();
      const selected = active.value;
      if (!selected || !publicationAllowsAttachment(selected, format, bearer.value)) {
        throw new Error("Selecione uma publicação com anexos e token autorizado.");
      }
      const context = await mcp<Persona>("obter_contexto_persona", {});
      assertTokenPersona(context, personaId.value);
      const params = queryParameters(selected.package.training.parameters, queryValues, queryModes);
      attachment.value = await mcp<AttachmentDescriptor>("criar_anexo_consulta", {
        format,
        query: {
          fonteId: selected.package.sourceId,
          skillIds: [querySkill.value],
          sql: querySql.value.trim() || undefined,
          params,
          options: attachmentCreateQueryOptions(format, queryPage.value, queryPageSize.value),
        },
      });
      message.value =
        "Anexo criado por nova consulta; validade e permissões serão conferidas novamente ao baixar.";
    });
  }

  async function downloadAttachment(): Promise<void> {
    await run(async () => {
      const selected = attachment.value;
      if (!selected || !bearer.value) {
        throw new Error("Crie um anexo autorizado antes de baixar.");
      }
      const currentContext = personaId.value;
      const controller = new AbortController();
      attachmentDownload = controller;
      const timer = window.setTimeout(() => controller.abort(), ATTACHMENT_DOWNLOAD_TIMEOUT_MS);
      try {
        const response = await fetch(
          attachmentDownloadPath(selected.handle),
          attachmentDownloadInit(bearer.value, controller.signal),
        );
        if (!response.ok) {
          throw new Error("Download recusado; confira prazo, conexão e permissões.");
        }
        const bytes = await response.arrayBuffer();
        if (
          isAttachmentDownloadStale({
            logged: logged.value,
            personaId: personaId.value,
            requestedPersonaId: currentContext,
            currentHandle: attachment.value?.handle,
            requestedHandle: selected.handle,
          })
        ) {
          return;
        }
        if (
          !attachmentBytesMatchDescriptor(
            selected.expiresAt,
            bytes.byteLength,
            selected.bytes,
            Date.now(),
          )
        ) {
          throw new Error("Anexo expirado ou resposta incompatível.");
        }
        const url = URL.createObjectURL(new Blob([bytes], { type: selected.mimeType }));
        const link = document.createElement("a");
        try {
          link.href = url;
          link.download = selected.filename;
          link.click();
        } finally {
          URL.revokeObjectURL(url);
        }
        message.value = "Download autorizado. O arquivo preserva o horário da consulta original.";
      } finally {
        window.clearTimeout(timer);
        if (attachmentDownload === controller) {
          attachmentDownload = undefined;
        }
      }
    });
  }

  return {
    attachment,
    clearAttachment,
    createAttachment,
    downloadAttachment,
  };
}
