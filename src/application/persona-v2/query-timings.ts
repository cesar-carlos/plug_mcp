import { AsyncLocalStorage } from "node:async_hooks";

const phases = ["catalog", "authorization", "hub", "serialization"] as const;
type Phase = (typeof phases)[number];
interface Sample {
  milliseconds: number;
  calls: number;
}
export interface QueryTimingReport {
  outcome: "success" | "failure";
  totalMs: number;
  phases: Record<Phase, Sample>;
}

/** Per-call fixed-size samples. No identity, SQL, parameters, errors or results. */
export class QueryTimings {
  private readonly context = new AsyncLocalStorage<Record<Phase, Sample>>();
  constructor(
    private readonly percent: number,
    private readonly emit: (report: QueryTimingReport) => void,
    private readonly clock = () => performance.now(),
    private readonly random = Math.random,
  ) {}
  async run<T>(call: () => Promise<T>): Promise<T> {
    if (
      !Number.isFinite(this.percent) ||
      this.percent <= 0 ||
      this.random() * 100 >= Math.min(100, this.percent)
    )
      return call();
    const samples = Object.fromEntries(
      phases.map((p) => [p, { milliseconds: 0, calls: 0 }]),
    ) as Record<Phase, Sample>;
    const start = this.clock();
    let outcome: QueryTimingReport["outcome"] = "failure";
    try {
      const result = await this.context.run(samples, call);
      outcome = "success";
      return result;
    } finally {
      try {
        this.emit({
          outcome,
          totalMs: Math.max(0, this.clock() - start),
          phases: structuredClone(samples),
        });
      } catch {
        /* Observability cannot replace a query result or its original failure. */
      }
    }
  }
  private end(phase: Phase, start: number, samples: Record<Phase, Sample>): void {
    samples[phase].milliseconds += Math.max(0, this.clock() - start);
    samples[phase].calls++;
  }
  async measure<T>(phase: Phase, call: () => Promise<T>): Promise<T> {
    const samples = this.context.getStore();
    if (!samples) return call();
    const start = this.clock();
    try {
      return await call();
    } finally {
      this.end(phase, start, samples);
    }
  }
  sync<T>(phase: Phase, call: () => T): T {
    const samples = this.context.getStore();
    if (!samples) return call();
    const start = this.clock();
    try {
      return call();
    } finally {
      this.end(phase, start, samples);
    }
  }
}
