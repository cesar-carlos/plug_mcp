import type { ReviewWorkerPort } from "../../domain/ports/review-worker.port.js";
export const REVIEW_WORKER_LEASE_MS = 30000;
/** Only creates metadata tasks/inbox notifications. No credentials or business SQL. */
export class PersonaReviewWorker {
  constructor(
    private readonly port: ReviewWorkerPort,
    private readonly owner: string,
    private readonly now: () => Date,
  ) {}
  async runOnce(): Promise<{ claimed: boolean; created: number; closed: number }> {
    const now = this.now();
    if (
      !(await this.port.claim(this.owner, now, new Date(now.getTime() + REVIEW_WORKER_LEASE_MS)))
    ) {
      return { claimed: false, created: 0, closed: 0 };
    }
    try {
      return { claimed: true, ...(await this.port.process(this.owner, this.now())) };
    } finally {
      await this.port.release(this.owner);
    }
  }
}
