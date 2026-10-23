import { z } from "zod";
import type { ConsumerIdentity } from "../../domain/persona-v2/model.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { PersonaAttachmentStore } from "../../domain/ports/persona-attachment.port.js";
import type { SourceQueryGatewayPort } from "../../domain/ports/source-query.port.js";
import {
  attachmentBinding,
  attachmentHandleSchema,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_TTL_MS,
  type AttachmentDescriptor,
} from "../../domain/persona-v2/attachments.js";
import {
  sourceQuerySchema,
  type PersonaSourceQueries,
  type AttachmentQueryCapture,
} from "./source-query.js";
import type { PersonaConsumerCatalog } from "./consumer-catalog.js";
import { queryTrainingSchema } from "./query-training.js";
import { verifyAttachmentStructure } from "./attachment-structure.js";
import { binaryMedia, decodeBinaryCell } from "./binary-attachment.js";

export const createAttachmentSchema = z.strictObject({
  format: z.enum(["json", "binary"]),
  query: sourceQuerySchema.extend({ skillIds: sourceQuerySchema.shape.skillIds.unwrap() }),
});
export const readAttachmentSchema = z.strictObject({ handle: attachmentHandleSchema });
interface StoredAttachment {
  descriptor: Omit<AttachmentDescriptor, "handle" | "uri" | "downloadPath">;
  capture: AttachmentQueryCapture;
  data: string;
}
/** Artifacts are data from an authorized fresh SELECT, never caller-supplied payloads. */
export class PersonaAttachments {
  constructor(
    private readonly catalog: Pick<
      PersonaConsumerCatalog,
      "revalidateQuery" | "suspendStructuralQuery"
    >,
    private readonly queries: Pick<PersonaSourceQueries, "exportJson" | "exportBinary">,
    private readonly gateway: SourceQueryGatewayPort,
    private readonly store: PersonaAttachmentStore,
    private readonly crypto: CryptoPort,
  ) {}
  capabilities(): Record<string, unknown> {
    return {
      implemented: true,
      formats: ["json", "binary"],
      binaryColumns: {
        implemented: true,
        onePhysicalColumn: true,
        oneCompleteRecord: true,
        metadataRequired: true,
        encoding: "base64",
      },
      explicitPublishedContract: true,
      maxBytes: ATTACHMENT_MAX_BYTES,
      maxTtlMs: ATTACHMENT_MAX_TTL_MS,
      storage: this.store.storage,
      revalidateOnRead: true,
    };
  }
  private async bounded<T>(
    duration: number,
    action: (check: () => void, reduce: (ms: number) => void) => Promise<T>,
  ): Promise<T> {
    const started = Date.now();
    let deadline = started + duration;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expire!: (error: PersonaV2Error) => void;
    const expired = new Promise<never>((_resolve, reject) => {
      expire = reject;
    });
    const error = () =>
      new PersonaV2Error(
        "BUDGET_EXCEEDED",
        "Prazo do anexo excedido; nenhuma nova consulta será enviada.",
      );
    const check = () => {
      if (Date.now() >= deadline) {
        throw error();
      }
    };
    const reduce = (ms: number) => {
      deadline = Math.min(deadline, started + ms);
      clearTimeout(timer);
      timer = setTimeout(() => expire(error()), Math.max(0, deadline - Date.now()));
    };
    reduce(duration);
    try {
      return await Promise.race([action(check, reduce), expired]);
    } finally {
      clearTimeout(timer);
    }
  }
  private describe(
    identity: ConsumerIdentity,
    handle: string,
    record: StoredAttachment,
  ): AttachmentDescriptor {
    return {
      ...record.descriptor,
      handle,
      uri: `anexo://${identity.personaId}/${handle}`,
      downloadPath: `/api/consumer/${identity.grant ? "oauth" : "bearer"}/attachments/${handle}`,
    };
  }
  private async verify(
    identity: ConsumerIdentity,
    record: StoredAttachment,
    check: () => void,
  ): Promise<void> {
    check();
    const { evidence, resources, expectedStructure, policyFingerprint } = record.capture;
    if (
      !evidence.cacheFence ||
      evidence.cacheFence.writePending ||
      evidence.publications.some(
        (p) =>
          !(record.descriptor.format === "binary"
            ? queryTrainingSchema.parse(p.package.training).binaryAttachments
            : queryTrainingSchema.parse(p.package.training).attachments) ||
          !p.package.requiredCapabilities.some((c) =>
            c.startsWith(
              record.descriptor.format === "binary"
                ? "binary-attachment-contract:"
                : "attachment-contract:",
            ),
          ),
      )
    ) {
      throw new PersonaV2Error("ATTACHMENT_UNAVAILABLE", "Anexo indisponível.");
    }
    await this.catalog.revalidateQuery(identity, evidence);
    check();
    const lease = await this.gateway.authorize(evidence.source, resources, {
      exactResources: true,
      requireDatabase: true,
      ...(expectedStructure ? { requireSchema: true as const } : {}),
      ...(expectedStructure?.resources.some(
        (r) => r.constraints && Object.values(r.constraints).some((keys) => keys.length),
      )
        ? { requireConstraints: true as const }
        : {}),
    });
    check();
    if (lease.policyFingerprint !== policyFingerprint) {
      throw new PersonaV2Error(
        "STALE_AUTHORIZATION",
        "Policy alterada; anexo anterior indisponível.",
      );
    }
    await verifyAttachmentStructure(
      lease,
      expectedStructure,
      () => this.catalog.suspendStructuralQuery(identity, evidence),
      check,
    );
    await lease.revalidate();
    check();
    await this.catalog.revalidateQuery(identity, evidence);
    check();
  }
  async create(identity: ConsumerIdentity, raw: unknown): Promise<AttachmentDescriptor> {
    const input = createAttachmentSchema.parse(raw);
    const started = Date.now();
    return this.bounded(input.query.options?.timeoutMs ?? 60000, async (check, reduce) => {
      const { response, capture } = await (input.format === "binary"
        ? this.queries.exportBinary(identity, input.query)
        : this.queries.exportJson(identity, input.query));
      reduce(response.limits?.timeoutMs ?? capture.evidence.executionLimits.timeoutMs);
      check();
      const contracts = capture.evidence.publications.map((p) =>
        input.format === "binary"
          ? queryTrainingSchema.parse(p.package.training).binaryAttachments!
          : queryTrainingSchema.parse(p.package.training).attachments!,
      );
      const maxBytes = Math.min(
        ATTACHMENT_MAX_BYTES,
        capture.evidence.executionLimits.maxBytes,
        input.query.options?.maxBytes ?? Infinity,
        ...contracts.map((c) => c.maxBytes),
      );
      const expiresAt = Math.min(
        Date.now() + Math.min(ATTACHMENT_MAX_TTL_MS, ...contracts.map((c) => c.ttlMs)),
        capture.evidence.consumerExpiresAt ?? Infinity,
        identity.grant?.expiresAt ?? Infinity,
      );
      const file =
        input.format === "json"
          ? JSON.stringify({
              format: "persona-query-attachment-v1",
              columns: response.columns,
              rows: response.rows,
              provenance: response.provenance,
              completeness: response.completeness,
              pagination: response.pagination ?? null,
              limits: response.limits,
            })
          : undefined;
      const bytes =
        file !== undefined
          ? Buffer.from(file, "utf8")
          : decodeBinaryCell(response.rows?.[0]?.[response.columns![0]!], maxBytes);
      const media =
        input.format === "binary"
          ? binaryMedia(
              bytes,
              queryTrainingSchema.parse(capture.evidence.publications[0]!.package.training)
                .binaryAttachments!.mimeTypes,
            )
          : { mimeType: "application/json" as const, extension: "json" };
      if (bytes.byteLength > maxBytes || expiresAt <= Date.now()) {
        throw new PersonaV2Error(
          "BUDGET_EXCEEDED",
          "Arquivo ou validade excede os limites vigentes.",
        );
      }
      const id = this.crypto.randomId();
      const record: StoredAttachment = {
        capture,
        data: bytes.toString("base64"),
        descriptor: {
          id,
          format: input.format,
          filename: `consulta-${id}.${media.extension}`,
          mimeType: media.mimeType,
          bytes: bytes.byteLength,
          rows: response.rows?.length ?? 0,
          expiresAt: new Date(expiresAt).toISOString(),
          sourceId: response.fonteId,
          ...(input.format === "binary" ? { provenance: response.provenance } : {}),
          readAt: response.provenance.readAt,
          complete: response.completeness.complete,
          classifications: [
            ...new Set(
              capture.evidence.publications.flatMap((p) =>
                queryTrainingSchema
                  .parse(p.package.training)
                  .columns.filter((c) => c.uses?.includes("exportacao"))
                  .map((c) => c.classification),
              ),
            ),
          ].sort(),
        },
      };
      await this.verify(identity, record, check);
      check();
      const binding = attachmentBinding(identity);
      const handle = await this.store.put(binding, JSON.stringify(record), expiresAt);
      try {
        check();
        const descriptor = this.describe(identity, handle, record);
        if (
          Buffer.byteLength(JSON.stringify(descriptor), "utf8") >
          Math.min(
            capture.evidence.executionLimits.maxBytes,
            input.query.options?.maxBytes ?? Infinity,
          )
        ) {
          throw new PersonaV2Error(
            "BUDGET_EXCEEDED",
            "Descritor do anexo excede o orçamento da resposta.",
          );
        }
        await this.catalog.revalidateQuery(identity, capture.evidence, {
          validation: false,
          durationMs: Date.now() - started,
          rows: record.descriptor.rows,
          attachment: { id, bytes: bytes.byteLength, event: "created" },
        });
        check();
        if (expiresAt <= Date.now()) {
          throw new PersonaV2Error("ATTACHMENT_UNAVAILABLE", "Anexo indisponível.");
        }
        return descriptor;
      } catch (error) {
        await this.store.remove(handle, binding);
        throw error;
      }
    });
  }
  async read(
    identity: ConsumerIdentity,
    handle: string,
  ): Promise<{ descriptor: AttachmentDescriptor; data: Uint8Array; maxResponseBytes: number }> {
    const started = Date.now();
    const binding = attachmentBinding(identity);
    return this.bounded(60000, async (budget, reduce) => {
      const stored = await this.store.get(handle, binding);
      if (!stored) {
        throw new PersonaV2Error("ATTACHMENT_UNAVAILABLE", "Anexo indisponível.");
      }
      const record = JSON.parse(stored) as StoredAttachment;
      reduce(record.capture.evidence.executionLimits.timeoutMs);
      const check = () => {
        budget();
        if (Date.parse(record.descriptor.expiresAt) <= Date.now()) {
          throw new PersonaV2Error("ATTACHMENT_UNAVAILABLE", "Anexo indisponível.");
        }
      };
      try {
        check();
        await this.verify(identity, record, check);
        const data = Buffer.from(record.data, "base64");
        if (data.byteLength !== record.descriptor.bytes || data.byteLength > ATTACHMENT_MAX_BYTES) {
          throw new PersonaV2Error("ATTACHMENT_UNAVAILABLE", "Anexo indisponível.");
        }
        await this.catalog.revalidateQuery(identity, record.capture.evidence, {
          validation: false,
          durationMs: Date.now() - started,
          rows: record.descriptor.rows,
          attachment: { id: record.descriptor.id, bytes: data.byteLength, event: "downloaded" },
        });
        check();
        return {
          descriptor: this.describe(identity, handle, record),
          data,
          maxResponseBytes: record.capture.evidence.executionLimits.maxBytes,
        };
      } catch (error) {
        await this.store.remove(handle, binding);
        throw error;
      }
    });
  }
}
