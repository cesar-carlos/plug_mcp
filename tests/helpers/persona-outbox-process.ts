import pg from "pg";
import { readFile } from "node:fs/promises";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { PostgresPersonaOutbox } from "../../src/infrastructure/persistence/persona-v2/outbox-worker.js";
import { PersonaOutboxWorker } from "../../src/application/persona-v2/outbox-worker.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { PersonaNotificationHttps } from "../../src/infrastructure/persona-v2/notification-transport.js";
import {
  PublicExternalHttp,
  sendExternalHttps,
} from "../../src/infrastructure/persona-v2/external-http.js";
const url = new URL(personaV2TestDatabaseUrl());
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  !/^\/persona_outbox_[a-f0-9]+_test$/.test(url.pathname)
)
  throw new Error("Isolated fixture database required");
const port = Number(process.env.PERSONA_OUTBOX_FIXTURE_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Fixture port required");
const cert = await readFile(new URL("../fixtures/tls/test-cert.pem", import.meta.url));
const db = new pg.Pool({ connectionString: url.toString() });
try {
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
  const result = await new PersonaOutboxWorker(
    new PostgresPersonaOutbox(db),
    new NodeCryptoAdapter("01".repeat(32)),
    transport,
  ).runOnce();
  process.stdout.write(JSON.stringify(result));
} catch {
  process.exitCode = 1;
} finally {
  await db.end();
}
