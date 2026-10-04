import { createCipheriv } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
const old = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  next = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
describe("envelope cifrado versionado", () => {
  it("lê chaves anteriores e recriptografa sob o novo identificador", () => {
    const a = new NodeCryptoAdapter(old, "old"),
      b = new NodeCryptoAdapter(next, "new", { old });
    const encrypted = a.encrypt("synthetic-only");
    expect(b.decrypt(encrypted)).toBe("synthetic-only");
    const rotated = b.encrypt(b.decrypt(encrypted));
    expect(rotated).toMatch(/^v2.new./);
    expect(b.decrypt(rotated)).toBe("synthetic-only");
    expect(() => a.decrypt(rotated)).toThrow();
    expect(() => b.decrypt(encrypted.replace(".old.", ".new."))).toThrow();
  });
  it("mantém leitura v1 sem enfraquecer a autenticação do envelope", () => {
    const iv = Buffer.alloc(12, 1),
      cipher = createCipheriv("aes-256-gcm", Buffer.from(old, "hex"), iv),
      bytes = Buffer.concat([cipher.update("legacy-synthetic"), cipher.final()]);
    const v1 = [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      bytes.toString("base64url"),
    ].join(".");
    const b = new NodeCryptoAdapter(next, "new", {}, old);
    expect(b.decrypt(v1)).toBe("legacy-synthetic");
    const parts = v1.split(".");
    parts[2] = Buffer.alloc(16).toString("base64url");
    expect(() => b.decrypt(parts.join("."))).toThrow();
  });
});
