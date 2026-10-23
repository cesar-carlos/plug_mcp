import { loadConfig } from "../src/config/env.js";
import { NodeCryptoAdapter } from "../src/infrastructure/crypto/node-crypto.adapter.js";
import { PersonaVaultRotation } from "../src/application/persona-v2/vault-rotation.js";
import { PostgresPersonaVaultRotationStore } from "../src/infrastructure/persistence/persona-v2/vault-rotation.js";

try {
  const config = loadConfig();
  if (config.NODE_ENV === "production" || !config.DATABASE_URL)
    throw new Error("Development persona vault only");
  const args = process.argv.slice(2);
  if (
    args.some(
      (a) =>
        !/^--(apply|simulate|confirm-database=.+|resume=[a-f0-9-]{36}|batch-size=\d+|max-batches=\d+)$/.test(
          a,
        ),
    ) ||
    args.filter((a) => a === "--apply" || a === "--simulate").length > 1 ||
    new Set(args.map((a) => a.split("=")[0])).size !== args.length
  )
    throw new Error("Invalid rotation arguments");
  const option = (name: string) =>
    args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const cipher = new NodeCryptoAdapter(
    config.MCP_ENCRYPTION_KEY,
    config.MCP_ENCRYPTION_KEY_ID,
    config.MCP_ENCRYPTION_PREVIOUS_KEYS,
    config.MCP_ENCRYPTION_LEGACY_KEY,
  );
  const result = await new PersonaVaultRotation(
    new PostgresPersonaVaultRotationStore(config.DATABASE_URL),
    cipher,
  ).run({
    apply: args.includes("--apply"),
    keyId: config.MCP_ENCRYPTION_KEY_ID,
    confirmDatabase: option("confirm-database"),
    resumeId: option("resume"),
    batchSize: option("batch-size") ? Number(option("batch-size")) : undefined,
    maxBatches: option("max-batches") ? Number(option("max-batches")) : undefined,
  });
  process.stdout.write(JSON.stringify(result) + "\n");
} catch {
  console.error(
    "Persona vault rotation failed; no keys, ciphertext or plaintext logged. Resume only the recorded run with the same keyring.",
  );
  process.exitCode = 1;
}
