import { familiaTipoFisico } from "../../../domain/entities/merge-fato.js";
import {
  ANEXO_BYTE_ARRAY_MIN,
  ANEXO_DECODE_MAX_BYTES,
  ANEXO_DECODED_MIN_BYTES,
  ANEXO_ENCODED_MAX_CHARS,
  QUERY_CELL_MAX_CHARS,
} from "../../../domain/entities/anexo.js";
import { REDACTED, TEXTO_OCULTO } from "./mascarar-linhagem.js";

const BASE64_CHARS = /^[A-Za-z0-9+/]+={0,2}$/;
const HEX_CHARS = /^[0-9a-fA-F]+$/;
const PSEUDO_PESSOAL = /^p_[0-9a-f]{10}$/;

const JPEG = [0xff, 0xd8, 0xff] as const;
const PNG = [0x89, 0x50, 0x4e, 0x47] as const;
const GIF = [0x47, 0x49, 0x46, 0x38] as const;
const BMP = [0x42, 0x4d] as const;
const TIFF_LE = [0x49, 0x49, 0x2a, 0x00] as const;
const TIFF_BE = [0x4d, 0x4d, 0x00, 0x2a] as const;
const PDF = [0x25, 0x50, 0x44, 0x46] as const;
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04] as const;
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06] as const;
const OLE = [0xd0, 0xcf, 0x11, 0xe0] as const;
const EXE = [0x4d, 0x5a] as const;

export type EncodingCelulaBinaria = "base64" | "hex" | "buffer_json" | "byte_array" | "buffer";

export interface CelulaBinariaExtraida {
  readonly bytes: Buffer;
  readonly encoding: EncodingCelulaBinaria;
  readonly mimeHint?: string;
}

export type AnaliseCelulaBinaria =
  | { readonly outcome: "extracted"; readonly value: CelulaBinariaExtraida }
  | { readonly outcome: "teto" }
  | { readonly outcome: "omitir" };

const startsWith = (buf: Uint8Array, magic: readonly number[]): boolean => {
  if (buf.length < magic.length) {
    return false;
  }
  for (let i = 0; i < magic.length; i++) {
    if (buf[i] !== magic[i]) {
      return false;
    }
  }
  return true;
};

export const isTipoBinarioHint = (tipo: string | null | undefined): boolean => {
  if (!tipo) {
    return false;
  }
  if (familiaTipoFisico(tipo) === "binario") {
    return true;
  }
  const t = tipo.trim().toLowerCase();
  return (
    t === "binario" ||
    t.includes("varbinary") ||
    t.includes("image") ||
    t.includes("blob") ||
    t.includes("bytea")
  );
};

export const temMagicMidia = (buf: Uint8Array): boolean => {
  if (
    startsWith(buf, JPEG) ||
    startsWith(buf, PNG) ||
    startsWith(buf, GIF) ||
    startsWith(buf, BMP)
  ) {
    return true;
  }
  if (startsWith(buf, TIFF_LE) || startsWith(buf, TIFF_BE) || startsWith(buf, PDF)) {
    return true;
  }
  if (startsWith(buf, WEBP_RIFF) && buf.length >= 12) {
    return buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
  }
  return false;
};

export const temMagicBinarioOpaco = (buf: Uint8Array): boolean =>
  startsWith(buf, ZIP_LOCAL) ||
  startsWith(buf, ZIP_EMPTY) ||
  startsWith(buf, OLE) ||
  startsWith(buf, EXE);

export const mimeHintFromMagic = (buf: Uint8Array): string | undefined => {
  if (startsWith(buf, JPEG)) {
    return "image/jpeg";
  }
  if (startsWith(buf, PNG)) {
    return "image/png";
  }
  if (startsWith(buf, GIF)) {
    return "image/gif";
  }
  if (startsWith(buf, BMP)) {
    return "image/bmp";
  }
  if (startsWith(buf, TIFF_LE) || startsWith(buf, TIFF_BE)) {
    return "image/tiff";
  }
  if (startsWith(buf, PDF)) {
    return "application/pdf";
  }
  if (startsWith(buf, WEBP_RIFF) && buf.length >= 12 && buf[8] === 0x57) {
    return "image/webp";
  }
  return undefined;
};

const isMaskedText = (value: string): boolean =>
  value === REDACTED || value === TEXTO_OCULTO || PSEUDO_PESSOAL.test(value);

const isByteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;

const looksBase64 = (value: string): boolean =>
  value.length % 4 === 0 && value.length > 0 && BASE64_CHARS.test(value);

const looksHex = (value: string): boolean =>
  value.length % 2 === 0 && value.length > 0 && HEX_CHARS.test(value);

const looksEncoded = (value: string): boolean => looksBase64(value) || looksHex(value);

const extracted = (bytes: Buffer, encoding: EncodingCelulaBinaria): AnaliseCelulaBinaria => ({
  outcome: "extracted",
  value: { bytes, encoding, mimeHint: mimeHintFromMagic(bytes) },
});

const decideDecoded = (
  buf: Buffer,
  encoding: EncodingCelulaBinaria,
  typed: boolean,
  encodedChars: number,
  compact: string,
): AnaliseCelulaBinaria | null => {
  if (buf.length > ANEXO_DECODE_MAX_BYTES) {
    return { outcome: "teto" };
  }
  if (typed || temMagicMidia(buf)) {
    return extracted(buf, encoding);
  }
  if (temMagicBinarioOpaco(buf)) {
    return { outcome: "omitir" };
  }
  const wireLike = looksHex(compact) || /[+/]/.test(compact);
  if (encodedChars > QUERY_CELL_MAX_CHARS && wireLike) {
    return { outcome: "omitir" };
  }
  return null;
};

const decodeBase64 = (value: string): Buffer | null => {
  if (!looksBase64(value)) {
    return null;
  }
  const buf = Buffer.from(value, "base64");
  if (buf.length < ANEXO_DECODED_MIN_BYTES) {
    return null;
  }
  const expected = Math.floor((value.replace(/=+$/, "").length * 3) / 4);
  if (Math.abs(buf.length - expected) > 3) {
    return null;
  }
  return buf;
};

const decodeHex = (value: string): Buffer | null => {
  if (!looksHex(value)) {
    return null;
  }
  const buf = Buffer.from(value, "hex");
  return buf.length >= ANEXO_DECODED_MIN_BYTES ? buf : null;
};

const analyseRawBytes = (
  bytes: Uint8Array,
  encoding: EncodingCelulaBinaria,
): AnaliseCelulaBinaria => {
  if (bytes.byteLength === 0) {
    return { outcome: "omitir" };
  }
  if (bytes.byteLength > ANEXO_DECODE_MAX_BYTES) {
    return { outcome: "teto" };
  }
  return extracted(Buffer.from(bytes), encoding);
};

const analyseNumberArray = (
  data: unknown[],
  encoding: "buffer_json" | "byte_array",
  typed: boolean,
): AnaliseCelulaBinaria | null => {
  if (data.length === 0) {
    return encoding === "buffer_json" ? { outcome: "omitir" } : null;
  }
  if (data.length > ANEXO_DECODE_MAX_BYTES) {
    const sample = data.slice(0, 32);
    if (sample.every(isByteNumber)) {
      return { outcome: "teto" };
    }
    return typed ? { outcome: "omitir" } : null;
  }
  if (!data.every(isByteNumber)) {
    return typed ? { outcome: "omitir" } : null;
  }
  const head = Buffer.from(data.slice(0, 16));
  const enough =
    typed ||
    temMagicMidia(head) ||
    encoding === "buffer_json" ||
    data.length >= ANEXO_BYTE_ARRAY_MIN;
  if (!enough) {
    return null;
  }
  return analyseRawBytes(Buffer.from(data), encoding);
};

const isNodeBufferJson = (value: unknown): value is { type: "Buffer"; data: unknown[] } => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return rec.type === "Buffer" && Array.isArray(rec.data);
};

/**
 * Classifica uma célula do hub. Buffer/Uint8Array reais extraem (não `JSON.stringify`).
 * Tipo binário detecta sem piso de 96 chars. Sem tipo e sem magic: omitir, não truncar 2048.
 */
export const analisarCelulaBinaria = (
  value: unknown,
  tipoHint?: string | null,
): AnaliseCelulaBinaria | null => {
  if (value == null) {
    return null;
  }
  if (typeof value === "string" && isMaskedText(value)) {
    return null;
  }
  if (typeof value === "string" && value.endsWith("…")) {
    return null;
  }
  const typed = isTipoBinarioHint(tipoHint);

  if (value instanceof Uint8Array) {
    return analyseRawBytes(value, "buffer");
  }
  if (isNodeBufferJson(value)) {
    return analyseNumberArray(value.data, "buffer_json", typed);
  }
  if (Array.isArray(value)) {
    return analyseNumberArray(value, "byte_array", typed);
  }
  if (typeof value !== "string") {
    return null;
  }
  const compact = value.replace(/\s+/g, "");
  if (compact.length === 0) {
    return null;
  }
  if (compact.length > ANEXO_ENCODED_MAX_CHARS && (typed || looksEncoded(compact.slice(0, 64)))) {
    return { outcome: "teto" };
  }
  const hex = decodeHex(compact);
  if (hex) {
    const decided = decideDecoded(hex, "hex", typed, compact.length, compact);
    if (decided) {
      return decided;
    }
  }
  const b64 = decodeBase64(compact);
  if (b64) {
    const decided = decideDecoded(b64, "base64", typed, compact.length, compact);
    if (decided) {
      return decided;
    }
  }
  if (typed && looksEncoded(compact)) {
    return { outcome: "omitir" };
  }
  return null;
};

/**
 * Extrai bytes de uma célula do hub. O plug_agente serializa varbinary/bytea/image
 * como **string base64** (`normalizeOdbcWireCell`). Buffer JSON e array de bytes
 * são defensivos (não são o fio REST habitual). Texto curto nunca vira anexo.
 */
export const extractBinaryBytes = (
  value: unknown,
  tipoHint?: string | null,
): CelulaBinariaExtraida | null => {
  const analysed = analisarCelulaBinaria(value, tipoHint);
  return analysed?.outcome === "extracted" ? analysed.value : null;
};
