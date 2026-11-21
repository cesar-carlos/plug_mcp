import { z } from "zod";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { attachmentBinding } from "../../domain/persona-v2/attachments.js";
import { pdfReportColumnsSchema } from "../../domain/persona-v2/pdf-report.js";
import { PersonaV2Error, type ConsumerIdentity } from "../../domain/persona-v2/model.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { PdfReportJobsPort, PdfJobRow } from "../../domain/ports/persona-pdf-jobs.port.js";
import type { PdfRendererPort } from "../../domain/ports/persona-pdf-renderer.port.js";
import {
  sourceQuerySchema,
  type SourceQueryResponse,
  type AttachmentQueryCapture,
  type PersonaSourceQueries,
} from "./source-query.js";
import { queryTrainingSchema } from "./query-training.js";
import type { PersonaConsumerCatalog } from "./consumer-catalog.js";
import type { PersonaAttachments, StoredAttachment } from "./attachments.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import {
  PdfRendererFailure,
  pdfFailureDiagnosticSchema,
} from "../../domain/persona-v2/pdf-renderer-failure.js";

const pdfSectionSchema = z
  .strictObject({
    query: sourceQuerySchema.extend({ fonteId: z.uuid(), skillIds: z.array(z.uuid()).length(1) }),
    scope: z.enum(["pagina", "limitado", "integral"]),
    layout: z.strictObject({
      templateId: z.literal("table-v1"),
      orientation: z.enum(["portrait", "landscape"]),
      columns: pdfReportColumnsSchema,
      chartId: z
        .string()
        .regex(/^[a-z][a-z0-9_]{0,39}$/)
        .optional(),
    }),
  })
  .refine(
    (input) => (input.scope === "pagina") === (input.query.options?.page !== undefined),
    "Página exige escopo pagina.",
  );
export const createPdfReportSchema = pdfSectionSchema
  .safeExtend({
    schemaVersion: z.literal(1),
    requestId: z.uuid(),
    additionalSections: z.array(pdfSectionSchema).min(1).max(3).optional(),
    consistency: z.literal("successive_reads").optional(),
  })
  .refine(
    (input) => Boolean(input.additionalSections) === Boolean(input.consistency),
    "Seções adicionais exigem aceite explícito de leituras sucessivas.",
  )
  .refine(
    (input) =>
      (input.additionalSections ?? []).every(
        (section) => section.query.fonteId === input.query.fonteId,
      ),
    "Seções devem usar a mesma fonte.",
  );
export const pdfReportJobSchema = z.strictObject({ jobId: z.uuid() });
export const pdfReportLocateSchema = z.strictObject({ requestId: z.uuid() });
export const pdfReportListSchema = z.strictObject({
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(20).default(10),
});
type Request = z.infer<typeof createPdfReportSchema>;
type SectionRequest = z.infer<typeof pdfSectionSchema>;
interface SectionCapture {
  request: SectionRequest;
  response: SourceQueryResponse;
  capture: AttachmentQueryCapture;
}
interface Capture {
  identity: ConsumerIdentity;
  request: Request;
  response: SourceQueryResponse;
  capture: AttachmentQueryCapture;
  additional?: SectionCapture[];
}
interface Ready {
  failure?: unknown;
  sourceId: string;
  skillId: string;
  publicationId: string;
  descriptor?: StoredAttachment["descriptor"];
  handle?: string;
  additionalAuthorities?: { sourceId: string; skillId: string; publicationId: string }[];
}
const unavailable = () => new PersonaV2Error("ATTACHMENT_UNAVAILABLE", "Relatório indisponível.");

/** A request may capture once. Background work only reads the sealed capture. */
export class PersonaPdfReports {
  constructor(
    private readonly catalog: Pick<PersonaConsumerCatalog, "query" | "revalidateQuery">,
    private readonly queries: Pick<PersonaSourceQueries, "exportPdf">,
    private readonly attachments: Pick<PersonaAttachments, "verifyPdfCapture" | "read">,
    private readonly jobs: PdfReportJobsPort,
    private readonly renderer: PdfRendererPort,
    private readonly crypto: CryptoPort,
    private readonly logger: LoggerPort,
  ) {}

  private async prepare(identity: ConsumerIdentity, raw: unknown) {
    const request = createPdfReportSchema.parse(raw);
    const sections = [request, ...(request.additionalSections ?? [])];
    const evidences = await Promise.all(
      sections.map((section) =>
        this.catalog.query(identity, { ...section.query, cacheFence: true }),
      ),
    );
    const contracts = evidences.map((evidence, index) => {
      const section = sections[index]!;
      const contract = queryTrainingSchema.parse(
        evidence.publications[0]?.package.training,
      ).generatedPdf;
      const chart = contract?.charts?.find((entry) => entry.id === section.layout.chartId);
      if (
        evidence.publications.length !== 1 ||
        !contract ||
        sections.length > (contract.successiveSections ?? 1) ||
        section.layout.columns.some((c) => !contract.columns.includes(c)) ||
        (section.layout.chartId !== undefined &&
          (!chart ||
            !section.layout.columns.includes(chart.category) ||
            !section.layout.columns.includes(chart.value)))
      ) {
        throw new PersonaV2Error(
          "AUTHORIZATION_DENIED",
          "Contrato PDF, seções ou colunas não autorizados.",
        );
      }
      return contract;
    });
    return { request, sections, evidences, contracts };
  }
  async validate(identity: ConsumerIdentity, raw: unknown): Promise<Record<string, unknown>> {
    const { sections, evidences, contracts } = await this.prepare(identity, raw);
    for (const evidence of evidences) await this.catalog.revalidateQuery(identity, evidence);
    return {
      contractValid: true,
      sqlExecuted: false,
      authorizationReserved: false,
      dataCompletenessVerified: false,
      sections: sections.length,
      limits: {
        maxRows: Math.min(
          ...contracts.map((c) => c.maxRows),
          ...evidences.map((e) => e.executionLimits.maxRows),
          ...sections.map((s) => s.query.options?.maxRows ?? 5000),
        ),
        maxBytes: Math.min(
          ...contracts.map((c) => c.maxBytes),
          ...evidences.map((e) => e.executionLimits.maxBytes),
          ...sections.map((s) => s.query.options?.maxBytes ?? Infinity),
        ),
        maxPages: Math.min(...contracts.map((c) => c.maxPages)),
      },
      message:
        "Contrato PDF conferido. SQL, dados, renderização e autoridade devem ser validados novamente na geração.",
    };
  }
  async create(identity: ConsumerIdentity, raw: unknown): Promise<Record<string, unknown>> {
    const { request, sections, evidences, contracts } = await this.prepare(identity, raw);
    // A preflight is not a reservation. Reject stale authority before admitting a capture.
    for (const evidence of evidences) await this.catalog.revalidateQuery(identity, evidence);
    const authorities = evidences.map((evidence, index) => ({
      sourceId: evidence.source.id,
      skillId: sections[index]!.query.skillIds[0]!,
      publicationId: evidence.publications[0]!.id,
    }));
    const binding = attachmentBinding(identity);
    const admission = await this.jobs.admit({
      personaId: identity.personaId,
      tokenId: identity.tokenId,
      binding,
      requestId: request.requestId,
      requestJson: canonicalJson({ request }),
      authorityJson: JSON.stringify({
        ...authorities[0]!,
        ...(authorities.length > 1 ? { additionalAuthorities: authorities.slice(1) } : {}),
      }),
      timeoutMs: Math.min(
        ...evidences.map((evidence) => evidence.executionLimits.timeoutMs),
        ...sections.map((section) => section.query.options?.timeoutMs ?? 60000),
      ),
      ttlMs: Math.min(...contracts.map((contract) => contract.ttlMs)),
      authorityExpiresAt: Math.min(
        ...evidences.map((evidence) => evidence.consumerExpiresAt ?? Infinity),
        identity.grant?.expiresAt ?? Infinity,
      ),
    });
    if (!admission.created) return this.status(identity, { jobId: admission.row.id });
    if (!(await this.jobs.startCapture(admission.row.id, binding))) throw unavailable();
    try {
      const captured: SectionCapture[] = [];
      let remainingRows = Math.min(
        ...contracts.map((contract) => contract.maxRows),
        ...evidences.map((evidence) => evidence.executionLimits.maxRows),
        ...sections.map((section) => section.query.options?.maxRows ?? 5000),
      );
      let remainingBytes = Math.min(
        ...contracts.map((c) => c.maxBytes),
        ...evidences.map((e) => e.executionLimits.maxBytes),
        ...sections.map((s) => s.query.options?.maxBytes ?? Infinity),
      );
      for (const section of sections) {
        const remaining = admission.row.work_deadline.getTime() - Date.now();
        const current = await this.jobs.get(admission.row.id, binding);
        if (remaining <= 0 || current?.state !== "collecting") throw unavailable();
        if (remainingRows < 1 || remainingBytes < 1)
          throw new PersonaV2Error(
            "BUDGET_EXCEEDED",
            "Limite global de linhas ou bytes do relatório atingido.",
          );
        for (const evidence of evidences) await this.catalog.revalidateQuery(identity, evidence);
        const { response, capture } = await this.queries.exportPdf(identity, {
          ...section.query,
          options: {
            ...section.query.options,
            maxRows: Math.min(remainingRows, section.query.options?.maxRows ?? 5000),
            maxBytes: Math.min(remainingBytes, section.query.options?.maxBytes ?? Infinity),
            timeoutMs: Math.min(remaining, 60000),
          },
        });
        if (section.scope === "integral" && !response.completeness.complete)
          throw new PersonaV2Error(
            "INCOMPLETE_INPUT",
            "Seção não comprova cobertura integral; relatório não será entregue.",
          );
        if (
          !response.columns ||
          section.layout.columns.some((column) => !response.columns!.includes(column))
        )
          throw new PersonaV2Error("INVALID_PLAN", "Colunas de apresentação ausentes na captura.");
        remainingRows -= response.rows?.length ?? 0;
        remainingBytes -= Buffer.byteLength(JSON.stringify(response));
        if (remainingRows < 0 || remainingBytes < 0)
          throw new PersonaV2Error(
            "BUDGET_EXCEEDED",
            "Limite global de linhas ou bytes do relatório excedido.",
          );
        captured.push({ request: section, response, capture });
        if (Buffer.byteLength(JSON.stringify(captured)) > 16 * 1024 * 1024)
          throw new PersonaV2Error("BUDGET_EXCEEDED", "Captura do relatório excede o limite.");
      }
      for (const section of captured)
        await this.attachments.verifyPdfCapture(identity, section.capture);
      await this.jobs.sealCapture(
        admission.row.id,
        binding,
        JSON.stringify({
          identity,
          request,
          response: captured[0]!.response,
          capture: captured[0]!.capture,
          ...(captured.length > 1 ? { additional: captured.slice(1) } : {}),
        } satisfies Capture),
      );
    } catch (error) {
      const supportId = this.crypto.randomId();
      const errorCode =
        error instanceof DomainError || error instanceof PersonaV2Error
          ? error.code
          : "INTERNAL_ERROR";
      this.logger.warn("persona-v2 pdf capture failed", {
        supportId,
        errorCode,
        stage: "capture",
        jobId: admission.row.id,
      });
      let diagnosticPersisted = true;
      try {
        const diagnostic = pdfFailureDiagnosticSchema.safeParse({ errorCode });
        await this.jobs.failCapture(
          admission.row.id,
          binding,
          supportId,
          diagnostic.success ? diagnostic.data : { errorCode: "INTERNAL_ERROR" },
        );
        const current = await this.jobs.get(admission.row.id, binding);
        if (current && current.state !== "capture_unconfirmed")
          return this.status(identity, { jobId: current.id });
      } catch {
        diagnosticPersisted = false;
        this.logger.warn("persona-v2 pdf failure persistence failed", {
          supportId,
          errorCode,
          stage: "capture",
          jobId: admission.row.id,
          diagnosticPersisted: false,
        });
      }
      return {
        ...this.describe(admission.row),
        state: "capture_unconfirmed",
        supportId,
        errorCode,
        diagnosticPersisted,
        message:
          "Não foi possível concluir a captura. Nenhuma consulta será repetida automaticamente.",
      };
    }
    return this.status(identity, { jobId: admission.row.id });
  }
  async status(identity: ConsumerIdentity, raw: unknown): Promise<Record<string, unknown>> {
    const { jobId } = pdfReportJobSchema.parse(raw);
    const row = await this.jobs.get(jobId, attachmentBinding(identity));
    if (!row) throw unavailable();
    if (!row.result_enc) throw unavailable();
    const authority = JSON.parse(this.jobs.decodeResult(row)) as Ready;
    const description = {
      ...this.describe(row),
      consistency: authority.additionalAuthorities?.length ? "successive_reads" : "not_asserted",
    };
    for (const entry of [authority, ...(authority.additionalAuthorities ?? [])]) {
      const current = await this.catalog.query(identity, {
        fonteId: entry.sourceId,
        skillIds: [entry.skillId],
        cacheFence: true,
      });
      if (!current.publications.some((publication) => publication.id === entry.publicationId))
        throw unavailable();
      await this.catalog.revalidateQuery(identity, current);
    }
    if (row.state === "ready") {
      if (!authority.handle || row.artifact_expires_at.getTime() <= Date.now()) throw unavailable();
      const file = await this.attachments.read(identity, authority.handle);
      return { ...description, descriptor: file.descriptor };
    }
    if (["failed", "capture_unconfirmed", "expired", "cancelled"].includes(row.state))
      return {
        ...description,
        supportId: row.support_id,
        ...(pdfFailureDiagnosticSchema.safeParse(authority.failure).success
          ? pdfFailureDiagnosticSchema.parse(authority.failure)
          : {}),
      };
    if (!row.payload_enc || row.work_deadline.getTime() <= Date.now()) throw unavailable();
    const payload = JSON.parse(this.jobs.decode(row)) as {
      request: Request;
      capture?: AttachmentQueryCapture;
      additional?: SectionCapture[];
    };
    if (payload.capture) await this.attachments.verifyPdfCapture(identity, payload.capture);
    else await this.catalog.query(identity, { ...payload.request.query, cacheFence: true });
    for (const section of payload.additional ?? [])
      await this.attachments.verifyPdfCapture(identity, section.capture);
    return description;
  }
  async locate(identity: ConsumerIdentity, raw: unknown): Promise<Record<string, unknown>> {
    const { requestId } = pdfReportLocateSchema.parse(raw);
    const row = await this.jobs.findRequest(requestId, attachmentBinding(identity));
    if (!row) throw unavailable();
    return this.status(identity, { jobId: row.id });
  }
  async list(identity: ConsumerIdentity, raw: unknown): Promise<Record<string, unknown>> {
    const { page, pageSize } = pdfReportListSchema.parse(raw);
    const visible: Record<string, unknown>[] = [];
    for (const row of await this.jobs.listCandidates(attachmentBinding(identity))) {
      if (!row.result_enc) continue;
      const authority = JSON.parse(this.jobs.decodeResult(row)) as Ready;
      try {
        for (const entry of [authority, ...(authority.additionalAuthorities ?? [])]) {
          const evidence = await this.catalog.query(identity, {
            fonteId: entry.sourceId,
            skillIds: [entry.skillId],
            cacheFence: true,
          });
          if (!evidence.publications.some((p) => p.id === entry.publicationId)) throw unavailable();
          await this.catalog.revalidateQuery(identity, evidence);
        }
      } catch (error) {
        if (
          error instanceof PersonaV2Error &&
          ["AUTHORIZATION_DENIED", "ATTACHMENT_UNAVAILABLE", "STALE_AUTHORIZATION"].includes(
            error.code,
          )
        )
          continue;
        throw error;
      }
      visible.push({
        ...this.describe(row),
        consistency: authority.additionalAuthorities?.length ? "successive_reads" : "not_asserted",
      });
    }
    const start = (page - 1) * pageSize;
    return {
      items: visible.slice(start, start + pageSize),
      pagination: { page, pageSize, hasNextPage: visible.length > start + pageSize },
      replayAllowed: false,
    };
  }
  async cancel(identity: ConsumerIdentity, raw: unknown): Promise<Record<string, unknown>> {
    const { jobId } = pdfReportJobSchema.parse(raw);
    const row = await this.jobs.get(jobId, attachmentBinding(identity));
    if (!row) throw unavailable();
    await this.status(identity, raw);
    await this.jobs.cancel(jobId, attachmentBinding(identity));
    const current = await this.jobs.get(jobId, attachmentBinding(identity));
    if (!current) throw unavailable();
    return {
      ...this.describe(current),
      ...(current.support_id ? { supportId: current.support_id } : {}),
    };
  }
  private describe(row: PdfJobRow): Record<string, unknown> {
    return {
      jobId: row.id,
      state: row.state,
      workDeadline: row.work_deadline.toISOString(),
      artifactExpiresAt: row.artifact_expires_at.toISOString(),
      replayAllowed: false,
      consistency: "not_asserted",
    };
  }
  async processOnce(): Promise<void> {
    await this.jobs.expire();
    const job = await this.jobs.claimRender();
    if (!job) return;
    try {
      const capture = JSON.parse(this.jobs.decode(job)) as Capture;
      const sections: SectionCapture[] = [capture, ...(capture.additional ?? [])];
      const inputs = sections.map((section) => {
        const contract = queryTrainingSchema.parse(
          section.capture.evidence.publications[0]!.package.training,
        ).generatedPdf!;
        if (sections.length > (contract.successiveSections ?? 1)) throw unavailable();
        const columns = section.request.layout.columns;
        const chart = contract.charts?.find((entry) => entry.id === section.request.layout.chartId);
        if (section.request.layout.chartId && !chart) throw unavailable();
        return {
          orientation: section.request.layout.orientation,
          columns,
          formats: columns.map(
            (column) =>
              contract.columnFormats?.[column] ??
              (chart?.value === column
                ? chart.unit === "BRL"
                  ? "currency"
                  : chart.unit === "percent"
                    ? "percent"
                    : "number"
                : "text"),
          ),
          ...(chart
            ? {
                chart: {
                  kind: chart.kind,
                  categoryIndex: columns.indexOf(chart.category),
                  valueIndex: columns.indexOf(chart.value),
                  unit: chart.unit,
                },
              }
            : {}),
          rows: (section.response.rows ?? []).map((row) =>
            columns.map((column) => {
              const value = row[column];
              if (value === null) return null;
              if (
                typeof value !== "string" &&
                typeof value !== "number" &&
                typeof value !== "boolean"
              )
                throw unavailable();
              return String(value);
            }),
          ),
          readAt: section.response.provenance.readAt,
          sourceId: section.response.fonteId,
          complete: section.request.scope === "integral" && section.response.completeness.complete,
          maxPages: contract.maxPages,
          maxBytes: Math.min(
            contract.maxBytes,
            section.capture.evidence.executionLimits.maxBytes,
            section.request.query.options?.maxBytes ?? Infinity,
          ),
        };
      });
      const maxPages = Math.min(...inputs.map((input) => input.maxPages));
      const maxBytes = Math.min(...inputs.map((input) => input.maxBytes));
      for (const section of sections)
        await this.attachments.verifyPdfCapture(capture.identity, section.capture);
      const rendered = await this.renderer.render(
        {
          ...inputs[0]!,
          maxPages,
          maxBytes,
          ...(inputs.length > 1
            ? {
                additionalSections: inputs
                  .slice(1)
                  .map(
                    ({
                      orientation,
                      columns,
                      formats,
                      rows,
                      readAt,
                      sourceId,
                      complete,
                      chart,
                    }) => ({
                      orientation,
                      columns,
                      formats,
                      rows,
                      readAt,
                      sourceId,
                      complete,
                      ...(chart ? { chart } : {}),
                    }),
                  ),
              }
            : {}),
        },
        Math.min(job.work_deadline.getTime(), job.lease_until!.getTime()) - Date.now(),
      );
      if (
        !Number.isInteger(rendered.pages) ||
        rendered.pages < 1 ||
        rendered.pages > maxPages ||
        rendered.data.byteLength > maxBytes ||
        Buffer.from(rendered.data).subarray(0, 5).toString("ascii") !== "%PDF-"
      ) {
        throw new PersonaV2Error(
          "BUDGET_EXCEEDED",
          "Resposta do renderizador inválida ou fora do contrato.",
        );
      }
      for (const section of sections)
        await this.attachments.verifyPdfCapture(capture.identity, section.capture);
      const record: StoredAttachment = {
        capture: capture.capture,
        ...(sections.length > 1
          ? { additionalPdfCaptures: sections.slice(1).map((section) => section.capture) }
          : {}),
        data: Buffer.from(rendered.data).toString("base64"),
        descriptor: {
          id: job.id,
          format: "pdf",
          filename: `relatorio-${job.id}.pdf`,
          mimeType: "application/pdf",
          bytes: rendered.data.byteLength,
          rows: sections.reduce(
            (total, section) => total + (section.response.rows?.length ?? 0),
            0,
          ),
          expiresAt: job.artifact_expires_at.toISOString(),
          sourceId: capture.response.fonteId,
          readAt: sections.at(-1)!.response.provenance.readAt,
          complete: inputs.every((input) => input.complete),
          consistency: sections.length > 1 ? "successive_reads" : "not_asserted",
          pdfSections: sections.map((section, index) => ({
            sourceId: section.response.fonteId,
            readAt: section.response.provenance.readAt,
            rows: section.response.rows?.length ?? 0,
            complete: inputs[index]!.complete,
            publications: section.response.provenance.publications,
          })),
          classifications: [
            ...new Set(
              sections.flatMap((section) =>
                queryTrainingSchema
                  .parse(section.capture.evidence.publications[0]!.package.training)
                  .columns.filter((c) => c.uses?.includes("exportacao"))
                  .map((c) => c.classification),
              ),
            ),
          ],
          ...(sections.length === 1 ? { provenance: capture.response.provenance } : {}),
        },
      };
      await this.jobs.finish(job.id, job.render_token!, JSON.stringify(record), {
        descriptor: record.descriptor,
      });
    } catch (error) {
      const supportId = this.crypto.randomId();
      const errorCode =
        error instanceof DomainError || error instanceof PersonaV2Error
          ? error.code
          : "PDF_RENDER_FAILED";
      this.logger.warn("persona-v2 pdf render failed", {
        supportId,
        errorCode,
        stage: "render",
        ...(error instanceof PdfRendererFailure ? { renderReason: error.renderReason } : {}),
        jobId: job.id,
      });
      const diagnostic = pdfFailureDiagnosticSchema.safeParse({
        errorCode,
        ...(error instanceof PdfRendererFailure ? { renderReason: error.renderReason } : {}),
      });
      await this.jobs.failRender(
        job.id,
        job.render_token!,
        supportId,
        diagnostic.success ? diagnostic.data : { errorCode: "PDF_RENDER_FAILED" },
      );
    }
  }
}
