import type pg from "pg";
import { randomUUID } from "node:crypto";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { PersonaNotificationTransport } from "../../domain/ports/persona-outbox.port.js";
import { PersonaWorkerLoop } from "../../application/persona-v2/worker-loop.js";
import { PersonaReviewWorker } from "../../application/persona-v2/review-worker.js";
import { PersonaEphemeralWorker } from "../../application/persona-v2/ephemeral-worker.js";
import { PersonaRetentionWorker } from "../../application/persona-v2/retention-worker.js";
import { PersonaOutboxWorker } from "../../application/persona-v2/outbox-worker.js";
import { PostgresReviewWorker } from "../persistence/persona-v2/review-worker.js";
import { PostgresPersonaEphemeralWorker } from "../persistence/persona-v2/ephemeral-worker.js";
import { PostgresPersonaRetentionWorker } from "../persistence/persona-v2/retention-worker.js";
import { PostgresPersonaOutbox } from "../persistence/persona-v2/outbox-worker.js";
import { PersonaNotificationHttps } from "./notification-transport.js";

/** Shared by the development entry and isolated process homologation. */
export function createPersonaWorker(
  pool: pg.Pool,
  cipher: CryptoPort,
  logger: LoggerPort,
  transport: PersonaNotificationTransport = new PersonaNotificationHttps(),
): PersonaWorkerLoop {
  const review = new PersonaReviewWorker(
    new PostgresReviewWorker(pool),
    randomUUID(),
    () => new Date(),
  );
  const ephemeral = new PersonaEphemeralWorker(
    new PostgresPersonaEphemeralWorker(pool),
    randomUUID(),
    () => new Date(),
  );
  const retention = new PersonaRetentionWorker(
    new PostgresPersonaRetentionWorker(pool),
    randomUUID(),
    () => new Date(),
  );
  const outbox = new PersonaOutboxWorker(new PostgresPersonaOutbox(pool), cipher, transport);
  const loop = new PersonaWorkerLoop(
    [
      {
        stage: "knowledge_review",
        run: async () => {
          const result = await review.runOnce();
          logger.info("persona review worker completed", {
            created: result.created,
            closed: result.closed,
          });
        },
      },
      {
        stage: "ephemeral_cleanup",
        run: async () => {
          const result = await ephemeral.runOnce();
          logger.info("persona ephemeral worker completed", {
            claimed: result.claimed,
            ...result.deleted,
          });
        },
      },
      {
        stage: "operation_retention",
        run: async () => {
          const result = await retention.runOnce();
          logger.info("persona retention worker completed", {
            claimed: result.claimed,
            ...result.purged,
          });
        },
      },
      {
        stage: "notification_delivery",
        run: async () => {
          const result = await outbox.runOnce(() => !loop.stopping);
          logger.info("persona outbox worker completed", { ...result });
        },
      },
    ],
    logger,
  );
  return loop;
}
