import type { Readable, Writable } from "node:stream";

/** Private SSH stdio only. Bounded frames, no retry and no raw diagnostics. */
export class OperatorChannel {
  private buffer = Buffer.alloc(0);
  private queue: unknown[] = [];
  private waiter?: { resolve(value: unknown): void; reject(error: Error): void };
  private failed = false;
  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
  ) {
    input.on("data", (chunk: Buffer) => {
      if (this.failed) return;
      this.buffer = Buffer.concat([this.buffer, chunk]);
      if (this.buffer.length > 4 * 1024 * 1024) return this.fail();
      let newline: number;
      while ((newline = this.buffer.indexOf(10)) >= 0) {
        const line = this.buffer.subarray(0, newline);
        this.buffer = this.buffer.subarray(newline + 1);
        try {
          const value: unknown = JSON.parse(line.toString("utf8"));
          if (this.waiter) {
            const waiter = this.waiter;
            this.waiter = undefined;
            waiter.resolve(value);
          } else if (this.queue.length < 2) this.queue.push(value);
          else return this.fail();
        } catch {
          return this.fail();
        }
      }
    });
    input.on("end", () => this.fail());
    input.on("error", () => this.fail());
    output.on("error", () => this.fail());
  }
  private fail(): void {
    this.failed = true;
    this.buffer = Buffer.alloc(0);
    this.waiter?.reject(new Error("Operator channel unavailable; do not retry."));
    this.waiter = undefined;
  }
  async read(): Promise<unknown> {
    if (this.queue.length) return this.queue.shift();
    if (this.failed || this.waiter) throw new Error("Operator channel unavailable.");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(), 45000);
      this.waiter = {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
    });
  }
  async send(value: unknown): Promise<void> {
    const data = JSON.stringify(value) + "\n";
    if (this.failed || Buffer.byteLength(data) > 4 * 1024 * 1024)
      throw new Error("Operator frame refused.");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail();
        reject(new Error("Operator write expired."));
      }, 45000);
      this.output.write(data, (error) => {
        clearTimeout(timer);
        if (error) reject(new Error("Operator write failed."));
        else resolve();
      });
    });
  }
  close(): void {
    this.fail();
    this.input.destroy();
  }
}
