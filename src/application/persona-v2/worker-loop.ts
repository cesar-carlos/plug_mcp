import type { LoggerPort } from "../../domain/ports/logger.port.js";

export interface PersonaWorkerJob {
  stage: "knowledge_review" | "ephemeral_cleanup" | "operation_retention" | "notification_delivery";
  run(): Promise<void>;
}

/** One cycle per process; database leases coordinate different processes. */
export class PersonaWorkerLoop {
  private running: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;
  private completedAt: number | undefined;
  private completedSuccessfully = false;
  private cycleFailed = false;
  private intervalMs = 60000;

  constructor(
    private readonly jobs: readonly PersonaWorkerJob[],
    private readonly logger: LoggerPort,
    private readonly monotonicNow: () => number = () => performance.now(),
  ) {}

  health(): "starting" | "healthy" | "degraded" | "stale" | "stopping" {
    if (this.stopped) {
      return "stopping";
    }
    if (this.cycleFailed) {
      return "degraded";
    }
    if (this.completedAt === undefined) {
      return "starting";
    }
    if (!this.completedSuccessfully) {
      return "degraded";
    }
    if (this.monotonicNow() - this.completedAt > this.intervalMs + 120000) {
      return "stale";
    }
    return "healthy";
  }

  get stopping(): boolean {
    return this.stopped;
  }

  start(intervalMs: number): Promise<void> {
    if (this.stopped || this.timer) {
      throw new Error("Worker already started or stopped.");
    }
    this.intervalMs = intervalMs;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    return this.tick();
  }

  tick(): Promise<void> {
    if (this.stopped || this.running) {
      return this.running ?? Promise.resolve();
    }
    this.running = this.cycle().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    await this.running;
  }

  private async cycle(): Promise<void> {
    this.cycleFailed = false;
    for (const job of this.jobs) {
      if (this.stopped) {
        break;
      }
      try {
        await job.run();
      } catch {
        this.cycleFailed = true;
        this.logger.error("persona worker job failed", { stage: job.stage });
      }
    }
    this.completedAt = this.monotonicNow();
    this.completedSuccessfully = !this.cycleFailed && !this.stopped;
  }
}
