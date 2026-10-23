import { createPersonaWorker } from "./infrastructure/persona-v2/worker.js";
import { startPersonaWorkerHealth } from "./infrastructure/persona-v2/worker-health.js";
import pg from "pg";
import { loadConfig } from "./config/env.js";
import { verifyPersonaMigrations } from "./infrastructure/persistence/persona-v2/migrate.js";
import { assertPersonaVaultKeyring } from "./infrastructure/persistence/persona-v2/vault-keyring.js";
import { NodeCryptoAdapter } from "./infrastructure/crypto/node-crypto.adapter.js";
import { createPino, PinoLoggerAdapter } from "./infrastructure/logging/pino-logger.adapter.js";
const config = loadConfig();
if (config.NODE_ENV === "production") {
  throw new Error("Worker persona-v2 bloqueado para produção até aceite integral.");
}
if (!config.DATABASE_URL) {
  throw new Error("Worker persona-v2 exige banco dedicado.");
}
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 2 });
const logger = new PinoLoggerAdapter(createPino(config.LOG_LEVEL, false));
const cipher = new NodeCryptoAdapter(
  config.MCP_ENCRYPTION_KEY,
  config.MCP_ENCRYPTION_KEY_ID,
  config.MCP_ENCRYPTION_PREVIOUS_KEYS,
  config.MCP_ENCRYPTION_LEGACY_KEY,
);
try {
  await verifyPersonaMigrations(pool);
  await assertPersonaVaultKeyring(pool, cipher, config.MCP_ENCRYPTION_KEY_ID);
} catch {
  await pool.end();
  throw new Error("Banco ou keyring persona-v2 incompatível com o worker.");
}
const worker = createPersonaWorker(pool, cipher, logger);
const health = config.PERSONA_V2_WORKER_HEALTH_PORT
  ? await startPersonaWorkerHealth(worker, config.PERSONA_V2_WORKER_HEALTH_PORT).catch(async () => {
      await pool.end();
      throw new Error("Não foi possível iniciar a saúde local do worker persona-v2.");
    })
  : undefined;
let closing: Promise<void> | undefined;
const shutdown = (): void => {
  health?.close();
  health?.closeAllConnections();
  closing ??= worker.stop().then(() => pool.end());
  void closing.catch(() => {
    logger.error("persona worker shutdown failed", { stage: "shutdown" });
    process.exitCode = 1;
  });
};
// Signals must be registered before awaiting the first cycle, including a slow POST.
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
await worker.start(config.PERSONA_V2_REVIEW_WORKER_INTERVAL_MS);
