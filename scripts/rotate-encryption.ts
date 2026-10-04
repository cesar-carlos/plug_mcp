import { loadConfig } from "../src/config/env.js";
import { NodeCryptoAdapter } from "../src/infrastructure/crypto/node-crypto.adapter.js";
import { rotateEncryption } from "../src/infrastructure/persistence/rotate-encryption.js";

try {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL required");
  }
  const crypto = new NodeCryptoAdapter(
    config.MCP_ENCRYPTION_KEY,
    config.MCP_ENCRYPTION_KEY_ID,
    config.MCP_ENCRYPTION_PREVIOUS_KEYS,
    config.MCP_ENCRYPTION_LEGACY_KEY,
  );
  const apply = process.argv.includes("--apply");
  const result = await rotateEncryption(config.DATABASE_URL, crypto, apply);
  console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", ...result }));
} catch {
  console.error("Rotation failed; no secrets or payloads logged.");
  process.exitCode = 1;
}
