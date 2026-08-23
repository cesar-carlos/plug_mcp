import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
} from "node:crypto";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";

const VERSION = "v1";

const keyFromSecret = (secret: string): Buffer => {
  if (/^[0-9a-f]{64}$/i.test(secret)) {
    return Buffer.from(secret, "hex");
  }
  return scryptSync(secret, "se7e-mcp-token", 32);
};

export class NodeCryptoAdapter implements CryptoPort {
  private readonly key: Buffer;

  constructor(encryptionSecret: string) {
    this.key = keyFromSecret(encryptionSecret);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      iv.toString("base64url"),
      tag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }

  decrypt(payload: string): string {
    const [version, ivB64, tagB64, dataB64] = payload.split(".");
    if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
      throw new Error("invalid encrypted payload");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  }

  randomId(): string {
    return randomUUID();
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString("base64url");
  }

  sha256Hex(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
