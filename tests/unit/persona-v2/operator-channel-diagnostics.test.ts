import { PassThrough, Writable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { OperatorChannel } from "../../../src/infrastructure/persistence/persona-v2/operator-channel.js";
import { operatorFailureReason } from "../../../src/infrastructure/persistence/persona-v2/operator-diagnostics.js";
const channels: OperatorChannel[] = [];
afterEach(() => {
  channels.splice(0).forEach((c) => c.close());
  vi.useRealTimers();
});
function setup(output = new PassThrough() as Writable) {
  const input = new PassThrough();
  const channel = new OperatorChannel(input, output);
  channels.push(channel);
  return { input, output, channel };
}
it.each([
  ["end", "channel_input_ended"],
  ["input", "channel_input_error"],
  ["output", "channel_output_error"],
  ["json", "channel_invalid_json"],
  ["size", "channel_frame_too_large"],
])("classifies %s without retaining private stream content", async (event, reason) => {
  const f = setup();
  const result = f.channel.read().catch((e) => e);
  if (event === "end") f.input.end();
  if (event === "input") f.input.emit("error", new Error("SECRET SQL credentials"));
  if (event === "output") f.output.emit("error", new Error("SECRET SQL credentials"));
  if (event === "json") f.input.write("SECRET SQL credentials\n");
  if (event === "size") f.input.write(Buffer.alloc(4 * 1024 * 1024 + 1, 65));
  const error: unknown = await result;
  expect(operatorFailureReason(error)).toBe(reason);
  f.channel.close();
  const again: unknown = await f.channel.read().catch((e) => e);
  expect(operatorFailureReason(again)).toBe(reason);
  expect(String(error)).not.toContain("SECRET");
});
it("classifies the unchanged 45-second read deadline with fake time", async () => {
  vi.useFakeTimers();
  const f = setup();
  const result = f.channel.read().catch((e) => e);
  await vi.advanceTimersByTimeAsync(45000);
  expect(operatorFailureReason(await result)).toBe("channel_read_timeout");
});
it("classifies a blocked write deadline without retaining the payload", async () => {
  vi.useFakeTimers();
  const f = setup(
    new Writable({
      write() {
        /* intentionally blocked transport */
      },
    }),
  );
  const result = f.channel.send({ secret: "SECRET" }).catch((e) => e);
  await vi.advanceTimersByTimeAsync(45000);
  expect(operatorFailureReason(await result)).toBe("channel_write_timeout");
});
it("classifies failed writes", async () => {
  const f = setup(
    new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error("SECRET"));
      },
    }),
  );
  const error: unknown = await f.channel.send({ secret: "SECRET" }).catch((e) => e);
  expect(operatorFailureReason(error)).toBe("channel_write_failed");
  expect(String(error)).not.toContain("SECRET");
});
it("preserves queue limits and rejects forged diagnostics", async () => {
  const f = setup();
  f.input.write("{}\n{}\n{}\n");
  await f.channel.read();
  await f.channel.read();
  expect(operatorFailureReason(await f.channel.read().catch((e) => e))).toBe(
    "channel_queue_overflow",
  );
  expect(
    operatorFailureReason(Object.assign(new Error("SECRET"), { reason: "channel_read_timeout" })),
  ).toBeUndefined();
});
it("delivers a queued terminal frame even when EOF follows it", async () => {
  const f = setup();
  f.input.end('{"kind":"result"}\n');
  await expect(f.channel.read()).resolves.toEqual({ kind: "result" });
});
