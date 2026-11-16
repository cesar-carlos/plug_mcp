import type { Readable, Writable } from "node:stream";
import { operatorFailure, type OperatorFailureReason } from "./operator-diagnostics.js";

/** Private SSH stdio only. Bounded frames, no retry and no raw diagnostics. */
export class OperatorChannel {
  private buffer = Buffer.alloc(0);
  private queue: unknown[] = [];
  private waiter?: { resolve(value: unknown): void; reject(error: Error): void };
  private failure?: Error;
  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
  ) {
    input.on("data", (chunk: Buffer) => {
      if (this.failure) return;
      this.buffer = Buffer.concat([this.buffer, chunk]);
      if (this.buffer.length > 4 * 1024 * 1024) return this.fail("channel_frame_too_large");
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
          else return this.fail("channel_queue_overflow");
        } catch {
          return this.fail("channel_invalid_json");
        }
      }
    });
    input.on("end", () => this.fail("channel_input_ended"));
    input.on("error", () => this.fail("channel_input_error"));
    output.on("error", () => this.fail("channel_output_error"));
  }
  private fail(reason: OperatorFailureReason): Error {
    if (this.failure) return this.failure;
    this.failure = operatorFailure(reason);
    this.buffer = Buffer.alloc(0);
    this.waiter?.reject(this.failure);
    this.waiter = undefined;
    return this.failure;
  }
  async read(): Promise<unknown> {
    if (this.queue.length) return this.queue.shift();
    if (this.failure) throw this.failure;
    if (this.waiter) throw operatorFailure("channel_concurrent_read");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail("channel_read_timeout"), 45000);
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
    if (this.failure) throw this.failure;
    let data: string;
    try {
      data = JSON.stringify(value) + "\n";
    } catch {
      throw operatorFailure("channel_serialization_failed");
    }
    if (Buffer.byteLength(data) > 4 * 1024 * 1024) throw operatorFailure("channel_frame_too_large");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(this.fail("channel_write_timeout"));
      }, 45000);
      this.output.write(data, (error) => {
        clearTimeout(timer);
        if (error) reject(operatorFailure("channel_write_failed"));
        else resolve();
      });
    });
  }
  close(): void {
    this.fail("channel_closed");
    this.input.destroy();
  }
}
