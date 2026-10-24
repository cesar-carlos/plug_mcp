import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type {
  PersonaNotificationTransport,
  PersonaOutboxPort,
} from "../../domain/ports/persona-outbox.port.js";
import { OUTBOX_LIMITS, type OutboxCounts } from "../../domain/persona-v2/notifications.js";

/** Metadata notifications only. Retries never execute business operations. */
export class PersonaOutboxWorker {
  constructor(
    private readonly store: PersonaOutboxPort,
    private readonly crypto: CryptoPort,
    private readonly transport: PersonaNotificationTransport,
  ) {}
  async runOnce(continueProcessing: () => boolean = () => true): Promise<OutboxCounts> {
    const counts = { claimed: 0, delivered: 0, failed: 0, stale: 0 };
    for (let i = 0; i < OUTBOX_LIMITS.batchSize && continueProcessing(); i++) {
      const row = await this.store.claim();
      if (!row) break;
      counts.claimed++;
      let delivered: boolean;
      try {
        if (!continueProcessing()) throw new Error("Worker stopping");
        if (!(await this.store.authorize(row)))
          throw new Error("Notification no longer authorized");
        await this.transport.deliver(
          {
            id: row.id,
            body: row.body,
            destination: this.crypto.decrypt(row.destinationEnc),
            secret: this.crypto.decrypt(row.secretEnc),
            signal: AbortSignal.timeout(OUTBOX_LIMITS.timeoutMs),
          },
          async () => {
            if (!continueProcessing()) throw new Error("Worker stopping");
            if (!(await this.store.authorize(row)))
              throw new Error("Notification claim or subscription changed");
          },
        );
        delivered = true;
      } catch {
        // Never persist a transport error, URL, response, secret or payload in logs.
        delivered = false;
      }
      if (!(await this.store.finish(row, delivered))) counts.stale++;
      else if (delivered) counts.delivered++;
      else counts.failed++;
    }
    return counts;
  }
}
