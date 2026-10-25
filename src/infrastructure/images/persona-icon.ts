import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { PERSONA_ICON_MAX_BYTES } from "../../domain/persona-v2/persona-icon.js";

const accepted = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Re-encode a chosen image to a small PNG. Rejects other formats and oversized results. */
export const normalizePersonaIcon = async (encoded: string): Promise<Uint8Array> => {
  const source = Buffer.from(encoded, "base64");
  if (source.length === 0 || source.length > PERSONA_ICON_MAX_BYTES * 4) {
    throw new PersonaV2Error("INVALID_PLAN", "Ícone da persona inválido.");
  }
  const detected = await fileTypeFromBuffer(source);
  if (!detected || !accepted.has(detected.mime)) {
    throw new PersonaV2Error("INVALID_PLAN", "Use PNG, JPEG ou WebP.");
  }
  let png: Buffer;
  try {
    png = await sharp(source, { failOn: "error", limitInputPixels: 4_000_000, animated: false })
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    throw new PersonaV2Error("INVALID_PLAN", "Não foi possível ler o ícone.");
  }
  if (png.length > PERSONA_ICON_MAX_BYTES) {
    throw new PersonaV2Error("INVALID_PLAN", "Ícone maior que 128 KiB depois da redução.");
  }
  return png;
};
