import { createRequire } from "node:module";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type {
  AnexoConverterPort,
  AnexoConvertido,
} from "../../domain/ports/anexo-converter.port.js";
import {
  ANEXO_CONVERT_TIMEOUT_MS,
  ANEXO_JPEG_QUALITY,
  ANEXO_LIMIT_INPUT_PIXELS,
  ANEXO_RESIZE_MAX_SIDE,
  isMimeOrigemAnexo,
  type MimeDestinoAnexo,
} from "../../domain/entities/anexo.js";

const requirePdfkit = createRequire(import.meta.url);

interface PdfDocumentLike {
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  addPage(options: { size: [number, number]; margin: number }): void;
  image(src: Buffer, x: number, y: number, options: { width: number; height: number }): void;
  end(): void;
}

type PdfDocumentCtor = new (options: {
  autoFirstPage: boolean;
  compress: boolean;
}) => PdfDocumentLike;

const PDFDocument = requirePdfkit("pdfkit") as PdfDocumentCtor;

const recusarTipo = (mime: string | undefined): DomainError =>
  DomainError.anexo({
    code: ERROR_CODES.MIDIA_TIPO_RECUSADO,
    message: "Tipo de anexo recusado.",
    hint: "Só jpeg, png, gif, webp, bmp, tiff ou pdf. O mime pedido pela IA não autoriza. Não envie ole/zip/exe/svg. Chame consultar_dados de novo só se a coluna for foto/PDF livre.",
    details: mime ? { mimeDetectado: mime } : undefined,
  });

const tetoConversao = (): DomainError =>
  DomainError.anexo({
    code: ERROR_CODES.MIDIA_TETO,
    message: "Conversão de anexo excedeu o tempo ou o tamanho.",
    hint: "Peça uma célula só (TOP/LIMIT 1) ou mimeDestino image/jpeg. Não aumente max_rows.",
    retryable: true,
    category: "budget",
  });

export const isErroTetoConversao = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const msg = error.message.toLowerCase();
  return (
    msg.includes("pixel limit") ||
    msg.includes("memory limit") ||
    msg.includes("limitinputpixels") ||
    (msg.includes("exceeds") && msg.includes("pixel"))
  );
};

const withTimeout = async <T>(work: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(tetoConversao());
        }, ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const sniffMime = async (bytes: Uint8Array): Promise<string | undefined> => {
  const found = await fileTypeFromBuffer(bytes);
  return found?.mime;
};

const toRaster = async (
  bytes: Uint8Array,
  mimeDestino: "image/jpeg" | "image/png",
): Promise<{ data: Buffer; resized: boolean }> => {
  const pipeline = sharp(bytes, {
    failOn: "error",
    limitInputPixels: ANEXO_LIMIT_INPUT_PIXELS,
    sequentialRead: true,
  }).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const resized = width > ANEXO_RESIZE_MAX_SIDE || height > ANEXO_RESIZE_MAX_SIDE;
  const fitted = pipeline.resize({
    width: ANEXO_RESIZE_MAX_SIDE,
    height: ANEXO_RESIZE_MAX_SIDE,
    fit: "inside",
    withoutEnlargement: true,
  });
  const data =
    mimeDestino === "image/png"
      ? await fitted.png().toBuffer()
      : await fitted.jpeg({ quality: ANEXO_JPEG_QUALITY }).toBuffer();
  return { data, resized };
};

const toPdfPage = async (image: Buffer, width: number, height: number): Promise<Buffer> => {
  const doc = new PDFDocument({ autoFirstPage: false, compress: true });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => {
      chunks.push(chunk);
    });
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);
  });
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  doc.addPage({ size: [w, h], margin: 0 });
  doc.image(image, 0, 0, { width: w, height: h });
  doc.end();
  return done;
};

export class SharpPdfkitAnexoConverter implements AnexoConverterPort {
  async converter(input: {
    bytes: Uint8Array;
    mimeDestino: MimeDestinoAnexo;
  }): Promise<AnexoConvertido> {
    if (input.bytes.byteLength === 0) {
      throw DomainError.anexo({
        code: ERROR_CODES.MIDIA_ORIGEM_INVALIDA,
        message: "Anexo vazio.",
        hint: "Chame consultar_dados de novo e use o handle novo. Não invente bytes.",
      });
    }
    return withTimeout(this.convertInner(input), ANEXO_CONVERT_TIMEOUT_MS);
  }

  private async convertInner(input: {
    bytes: Uint8Array;
    mimeDestino: MimeDestinoAnexo;
  }): Promise<AnexoConvertido> {
    try {
      const detected = await sniffMime(input.bytes);
      if (!detected || !isMimeOrigemAnexo(detected)) {
        throw recusarTipo(detected);
      }
      if (detected === "application/pdf") {
        if (input.mimeDestino !== "application/pdf") {
          throw recusarTipo(detected);
        }
        return {
          mime: "application/pdf",
          data: Uint8Array.from(input.bytes),
          resized: false,
        };
      }
      if (input.mimeDestino === "application/pdf") {
        const raster = await toRaster(input.bytes, "image/jpeg");
        const meta = await sharp(raster.data).metadata();
        const pdf = await toPdfPage(raster.data, meta.width ?? 1, meta.height ?? 1);
        return {
          mime: "application/pdf",
          data: pdf,
          resized: raster.resized,
          ...(raster.resized
            ? { aviso: `Imagem redimensionada (lado ≤ ${String(ANEXO_RESIZE_MAX_SIDE)}px).` }
            : {}),
        };
      }
      const raster = await toRaster(input.bytes, input.mimeDestino);
      return {
        mime: input.mimeDestino,
        data: raster.data,
        resized: raster.resized,
        ...(raster.resized
          ? { aviso: `Imagem redimensionada (lado ≤ ${String(ANEXO_RESIZE_MAX_SIDE)}px).` }
          : {}),
      };
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      if (isErroTetoConversao(error)) {
        throw tetoConversao();
      }
      throw DomainError.anexo({
        code: ERROR_CODES.MIDIA_ORIGEM_INVALIDA,
        message: "Anexo ilegível ou corrompido.",
        hint: "Chame consultar_dados de novo com TOP/LIMIT 1. Não invente bytes.",
      });
    }
  }
}
