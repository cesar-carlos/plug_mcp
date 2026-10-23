import type {
  OperationRetentionCounts,
  PersonaRetentionWorkerPort,
} from "../../domain/ports/persona-retention-worker.port.js";

export const RETENTION_WORKER_LEASE_MS = 30000;
export const RETENTION_BATCH_SIZE = 100;
export class PersonaRetentionWorker {
  constructor(
    private readonly port: PersonaRetentionWorkerPort,
    private readonly owner: string,
    private readonly now: () => Date,
  ) {}
  async runOnce(): Promise<{ claimed: boolean; purged: OperationRetentionCounts | null }> {
    const now = this.now();
    if (
      !(await this.port.claim(this.owner, now, new Date(now.getTime() + RETENTION_WORKER_LEASE_MS)))
    ) {
      return { claimed: false, purged: null };
    }
    try {
      return { claimed: true, purged: await this.port.process(this.owner, this.now()) };
    } finally {
      await this.port.release(this.owner);
    }
  }
}
