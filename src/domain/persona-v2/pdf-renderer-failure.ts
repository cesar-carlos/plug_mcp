import { PersonaV2Error } from "./model.js";
import { z } from "zod";
import { ERROR_CODES } from "../errors/error-codes.js";

export const PDF_RENDER_REASONS = [
  "PDF_BYTES_EXCEEDED",
  "PDF_PAGES_EXCEEDED",
  "PDF_CELL_TOO_TALL",
  "PDF_LAYOUT_INVALID",
  "PDF_INPUT_INVALID",
  "PDF_RENDER_BUSY",
  "PDF_RENDER_TIMEOUT",
  "PDF_RENDER_CANCELLED",
  "PDF_RENDER_FAILED",
] as const;
export type PdfRenderReason = (typeof PDF_RENDER_REASONS)[number];
export const pdfFailureDiagnosticSchema = z.strictObject({
  errorCode: z.enum([
    ...Object.values(ERROR_CODES),
    "INVALID_PLAN",
    "ADMIN_SESSION_EXPIRED",
    "SOURCE_AMBIGUOUS",
    "OPERATION_CONFLICT",
    "OPERATION_EXPIRED",
    "APPROVAL_REQUIRED",
    "AUTHORIZATION_DENIED",
    "BUDGET_EXCEEDED",
    "CAPABILITY_UNAVAILABLE",
    "INCOMPLETE_INPUT",
    "ATTACHMENT_UNAVAILABLE",
    "STALE_AUTHORIZATION",
    "INTERNAL_ERROR",
    "PDF_RENDER_FAILED",
  ]),
  renderReason: z.enum(PDF_RENDER_REASONS).optional(),
});
export type PdfFailureDiagnostic = z.infer<typeof pdfFailureDiagnosticSchema>;
/** Only a closed reason crosses the untrusted renderer boundary. Never native messages. */
export class PdfRendererFailure extends PersonaV2Error {
  constructor(readonly renderReason: PdfRenderReason) {
    super("CAPABILITY_UNAVAILABLE", "Renderização PDF não concluída; consulta não será repetida.");
  }
}
