import type {
  EphemeralCleanupCounts,
  PersonaEphemeralWorkerPort,
} from "../../domain/ports/persona-ephemeral-worker.port.js";

export const EPHEMERAL_WORKER_LEASE_MS = 30000;
export const EPHEMERAL_CLEANUP_BATCH_SIZE = 100;

/** Removes expired control data only; never dispatches or changes operation outcomes. */
export class PersonaEphemeralWorker {
  constructor(
    private readonly port: PersonaEphemeralWorkerPort,
    private readonly owner: string,
    private readonly now: () => Date,
  ) {}

  async runOnce(): Promise<{ claimed: boolean; deleted: EphemeralCleanupCounts | null }> {
    const now = this.now();
    if (
      !(await this.port.claim(this.owner, now, new Date(now.getTime() + EPHEMERAL_WORKER_LEASE_MS)))
    ) {
      return { claimed: false, deleted: null };
    }
    try {
      return { claimed: true, deleted: await this.port.process(this.owner, this.now()) };
    } finally {
      await this.port.release(this.owner);
    }
  }
}
