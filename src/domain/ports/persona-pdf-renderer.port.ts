import type { PdfCellFormat } from "../persona-v2/pdf-format.js";
export interface PdfRenderInput {
  orientation: "portrait" | "landscape";
  columns: readonly string[];
  formats?: readonly PdfCellFormat[];
  rows: readonly (readonly (string | null)[])[];
  readAt: string;
  sourceId?: string;
  complete: boolean;
  maxPages: number;
  maxBytes: number;
  chart?: {
    kind: "bar" | "line" | "pie";
    categoryIndex: number;
    valueIndex: number;
    unit: "BRL" | "quantity" | "percent";
  };
  additionalSections?: Omit<PdfRenderInput, "additionalSections" | "maxPages" | "maxBytes">[];
}
export interface PdfRendererPort {
  render(input: PdfRenderInput, timeoutMs: number): Promise<{ data: Uint8Array; pages: number }>;
}
