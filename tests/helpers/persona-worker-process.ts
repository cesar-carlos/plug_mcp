import pg from "pg";
import { readFile } from "node:fs/promises";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { createPersonaWorker } from "../../src/infrastructure/persona-v2/worker.js";
import { verifyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { assertPersonaVaultKeyring } from "../../src/infrastructure/persistence/persona-v2/vault-keyring.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { PersonaNotificationHttps } from "../../src/infrastructure/persona-v2/notification-transport.js";
import {
  PublicExternalHttp,
  sendExternalHttps,
} from "../../src/infrastructure/persona-v2/external-http.js";
import type { LoggerPort, LogFields } from "../../src/domain/ports/logger.port.js";

const url = new URL(personaV2TestDatabaseUrl());
const port = Number(process.env.PERSONA_OUTBOX_FIXTURE_PORT);
if (
  !process.send ||
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  !/^\/persona_outbox_[a-f0-9]+_test$/.test(url.pathname) ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535
) {
  throw new Error("Explicit local worker fixture and IPC required");
}
const pool = new pg.Pool({ connectionString: url.toString(), max: 2 });
const cipher = new NodeCryptoAdapter("01".repeat(32));
await verifyPersonaMigrations(pool);
await assertPersonaVaultKeyring(pool, cipher, "primary");
const cert = await readFile(new URL("../fixtures/tls/test-cert.pem", import.meta.url));
const transport = new PersonaNotificationHttps(
  new PublicExternalHttp({
    resolve: () => Promise.resolve([{ address: "93.184.216.34", family: 4 }]),
    send: (input) => {
      const target = new URL(input.url);
      target.hostname = "localhost";
      target.port = String(port);
      return sendExternalHttps(
        { ...input, url: target },
        { address: "127.0.0.1", family: 4 },
        cert,
      );
    },
  }),
);
const report = (level: string, message: string, fields?: LogFields): void => {
  if (process.connected) {
    process.send!({ type: "log", level, message, fields });
  }
};
const logger: LoggerPort = {
  info: (message, fields) => report("info", message, fields),
  error: (message, fields) => report("error", message, fields),
  warn: (message, fields) => report("warn", message, fields),
  child: () => logger,
};
const worker = createPersonaWorker(pool, cipher, logger, transport);
let closing: Promise<void> | undefined,
  started = false;
const stop = (): Promise<void> => {
  if (closing) return closing;
  const stopped = worker.stop();
  if (process.connected) process.send!({ type: "stopping" });
  return (closing = stopped.then(async () => {
    await pool.end();
    if (process.connected) {
      process.send!({ type: "stopped" });
      process.disconnect!();
    }
  }));
};
process.on("message", (message) => {
  if (message === "start" && !started && !closing) {
    started = true;
    void worker.start(1000).catch(() => stop());
  } else if (message === "stop") {
    void stop();
  }
});
process.once("disconnect", () => void stop());
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
process.send({ type: "ready" });
