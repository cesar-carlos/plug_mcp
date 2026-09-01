import type { SensibilidadeColuna } from "./privacidade.js";

export const ANEXO_KIND = "anexo" as const;
export const ANEXO_EXPORT_KIND = "anexo_exportado" as const;

export const MIME_DESTINO_ANEXO = ["image/jpeg", "image/png", "application/pdf"] as const;
export type MimeDestinoAnexo = (typeof MIME_DESTINO_ANEXO)[number];

export const MIME_ORIGEM_ANEXO_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "application/pdf",
] as const;
export type MimeOrigemAnexo = (typeof MIME_ORIGEM_ANEXO_ALLOWLIST)[number];

export const ORIGEM_ANEXO_HANDLE = ["consultar_dados", "inspecionar_consulta"] as const;
export type OrigemAnexoHandle = (typeof ORIGEM_ANEXO_HANDLE)[number];

/** Teto de decode por célula (fail-closed; não despeja bytes nas rows). */
export const ANEXO_DECODE_MAX_BYTES = 4 * 1024 * 1024;
/** Soma de blobs extraídos num único resultado tabular. */
export const ANEXO_TOTAL_MAX_BYTES = 8 * 1024 * 1024;
/** Quantas células binárias um resultado pode promover a handle. */
export const ANEXO_MAX_CELLS_PER_RESULT = 8;
export const ANEXO_CONVERT_TIMEOUT_MS = 12_000;
export const ANEXO_RESIZE_MAX_SIDE = 1_280;
export const ANEXO_JPEG_QUALITY = 80;
export const ANEXO_HANDLE_TTL_MS = 15 * 60_000;
/** Cap de handles em memória por `usuarioId` (FIFO; não é teto global). */
export const ANEXO_HANDLE_MAX_PER_USER = 64;
/** Piso após decode (8–16 B): magic **ou** tipo binário. Sem piso de 96 chars na detecção. */
export const ANEXO_DECODED_MIN_BYTES = 8;
export const ANEXO_BYTE_ARRAY_MIN = 32;
/** Cap da string encoded antes de `Buffer.from` (hex = 2 chars/byte). */
export const ANEXO_ENCODED_MAX_CHARS = ANEXO_DECODE_MAX_BYTES * 2 + 16;
export const QUERY_CELL_MAX_CHARS = 2_048;
export const ANEXO_LIMIT_INPUT_PIXELS = 4_096 * 4_096;

export interface AnexoStub {
  readonly kind: typeof ANEXO_KIND;
  readonly bytes?: number;
  readonly mimeHint?: string;
  /** Ausente em inspeção, pessoal/segredo ou binário opaco sem magic — não é exportável. */
  readonly handle?: string;
  readonly truncated: true;
}

export interface AnexoExportPayload {
  readonly kind: typeof ANEXO_EXPORT_KIND;
  readonly mime: string;
  readonly bytes: number;
  readonly resized: boolean;
  readonly aviso?: string;
  readonly data: Uint8Array;
}

export interface AnexoPutInput {
  readonly usuarioId: string;
  readonly acessoId: string;
  readonly bytes: Uint8Array;
  readonly mimeHint?: string;
  readonly coluna: string;
  readonly sensibilidade: SensibilidadeColuna;
  readonly origem: OrigemAnexoHandle;
}

export interface AnexoRecord {
  readonly usuarioId: string;
  readonly acessoId: string;
  readonly bytes: Uint8Array;
  readonly mimeHint?: string;
  readonly coluna: string;
  readonly sensibilidade: SensibilidadeColuna;
  readonly origem: OrigemAnexoHandle;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export const isMimeDestinoAnexo = (value: string): value is MimeDestinoAnexo =>
  (MIME_DESTINO_ANEXO as readonly string[]).includes(value);

export const isMimeOrigemAnexo = (value: string): value is MimeOrigemAnexo =>
  (MIME_ORIGEM_ANEXO_ALLOWLIST as readonly string[]).includes(value);

export const isAnexoStub = (value: unknown): value is AnexoStub => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const rec = value as Record<string, unknown>;
  if (rec.kind !== ANEXO_KIND || rec.truncated !== true) {
    return false;
  }
  return rec.handle === undefined || typeof rec.handle === "string";
};

export const isAnexoExportPayload = (value: unknown): value is AnexoExportPayload => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return (
    rec.kind === ANEXO_EXPORT_KIND &&
    typeof rec.mime === "string" &&
    typeof rec.bytes === "number" &&
    rec.data instanceof Uint8Array
  );
};
