import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
} from "node:crypto";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";

const VERSION = "v2";

const keyFromSecret = (secret: string): Buffer => {
  if (/^[0-9a-f]{64}$/i.test(secret)) {
    return Buffer.from(secret, "hex");
  }
  return scryptSync(secret, "se7e-mcp-token", 32);
};

export class NodeCryptoAdapter implements CryptoPort {
  private readonly key: Buffer;
  private readonly keys: ReadonlyMap<string, Buffer>;
  private readonly legacyKey: Buffer;

  constructor(
    encryptionSecret: string,
    private readonly keyId = "primary",
    previousKeys: Readonly<Record<string, string>> = {},
    legacySecret?: string,
  ) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId) || Object.hasOwn(previousKeys, keyId)) {
      throw new Error("invalid encryption key id");
    }
    this.key = keyFromSecret(encryptionSecret);
    this.legacyKey = keyFromSecret(legacySecret ?? encryptionSecret);
    this.keys = new Map([
      [keyId, this.key],
      ...Object.entries(previousKeys).map(([id, secret]) => [id, keyFromSecret(secret)] as const),
    ]);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(`${VERSION}.${this.keyId}`));
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      this.keyId,
      iv.toString("base64url"),
      tag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }

  decrypt(payload: string): string {
    const parts = payload.split(".");
    const version = parts[0];
    const [id, ivB64, tagB64, dataB64] =
      version === "v1" ? [null, ...parts.slice(1)] : parts.slice(1);
    const key = version === "v1" ? this.legacyKey : id ? this.keys.get(id) : undefined;
    if (
      !key ||
      (version !== VERSION && version !== "v1") ||
      parts.length !== (version === "v1" ? 4 : 5) ||
      !ivB64 ||
      !tagB64 ||
      !dataB64 ||
      Buffer.from(ivB64, "base64url").length !== 12 ||
      Buffer.from(tagB64, "base64url").length !== 16
    ) {
      throw new Error("invalid encrypted payload");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
    if (version === VERSION) {
      decipher.setAAD(Buffer.from(`${version}.${id}`));
    }
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
