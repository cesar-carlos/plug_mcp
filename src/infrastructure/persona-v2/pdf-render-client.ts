import { connect } from "node:net";
import type {
  PdfRenderInput,
  PdfRendererPort,
} from "../../domain/ports/persona-pdf-renderer.port.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import {
  PDF_RENDER_REASONS,
  PdfRendererFailure,
} from "../../domain/persona-v2/pdf-renderer-failure.js";

export class PdfSocketRenderer implements PdfRendererPort {
  constructor(private readonly socketPath: string) {}
  async render(
    input: PdfRenderInput,
    timeoutMs: number,
  ): Promise<{ data: Uint8Array; pages: number }> {
    const payload = JSON.stringify(input);
    if (
      Buffer.byteLength(payload) + 1 > 16 * 1024 * 1024 ||
      !Number.isFinite(timeoutMs) ||
      timeoutMs <= 0
    ) {
      throw new PersonaV2Error("BUDGET_EXCEEDED", "Orçamento do renderizador esgotado.");
    }
    return new Promise((resolve, reject) => {
      const socket = connect(this.socketPath);
      let bytes = 0;
      let settled = false;
      const chunks: Buffer[] = [];
      const fail = () => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        socket.destroy();
        reject(
          new PersonaV2Error(
            "CAPABILITY_UNAVAILABLE",
            "Renderizador PDF indisponível; consulta não será repetida.",
          ),
        );
      };
      const deadline = setTimeout(fail, Math.min(timeoutMs, 11000));
      socket.once("error", fail);
      socket.once("connect", () => socket.write(`${payload}\n`));
      socket.once("close", fail);
      socket.on("data", (chunk: Buffer) => {
        if (settled) return;
        bytes += chunk.length;
        if (bytes > 12 * 1024 * 1024) fail();
        else chunks.push(chunk);
      });
      socket.once("end", () => {
        if (settled) return;
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
            data?: unknown;
            pages?: unknown;
            error?: unknown;
          };
          const reason = PDF_RENDER_REASONS.find((reason) => reason === result.error);
          if (reason && !settled) {
            settled = true;
            clearTimeout(deadline);
            socket.destroy();
            reject(new PdfRendererFailure(reason));
            return;
          }
          if (
            Object.hasOwn(result, "error") ||
            typeof result.data !== "string" ||
            !Number.isInteger(result.pages) ||
            (result.pages as number) < 1 ||
            (result.pages as number) > input.maxPages
          ) {
            fail();
            return;
          }
          const data = Buffer.from(result.data, "base64");
          if (
            data.toString("base64") !== result.data ||
            data.byteLength > input.maxBytes ||
            data.subarray(0, 5).toString() !== "%PDF-"
          ) {
            fail();
            return;
          }
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          socket.destroy();
          resolve({ data, pages: result.pages as number });
        } catch {
          fail();
        }
      });
    });
  }
}
