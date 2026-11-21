import { parentPort, workerData } from "node:worker_threads";
import { pdfRenderInputSchema, renderPdfReport } from "./pdf-renderer.js";
import { PDF_RENDER_REASONS } from "../../domain/persona-v2/pdf-renderer-failure.js";

try {
  const parsed = pdfRenderInputSchema.safeParse(workerData);
  if (!parsed.success) throw new Error("PDF_INPUT_INVALID");
  const result = await renderPdfReport(parsed.data);
  parentPort!.postMessage({ data: result.data, pages: result.pages });
} catch (error) {
  parentPort!.postMessage({
    error:
      (error instanceof Error
        ? PDF_RENDER_REASONS.find((reason) => reason === error.message)
        : undefined) ?? "PDF_RENDER_FAILED",
  });
}
