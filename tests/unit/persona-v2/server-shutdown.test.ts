import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPersonaServerShutdown } from "../../../src/infrastructure/persona-v2/server-shutdown.js";

function fixture(dispose = vi.fn(async (): Promise<void> => undefined)) {
  let drained: ((error?: Error) => void) | undefined;
  const close = vi.fn((callback?: (error?: Error) => void) => {
    drained = callback;
    return {} as Server;
  });
  return {
    close,
    dispose,
    drain: (error?: Error) => drained!(error),
    stop: createPersonaServerShutdown({ close }, dispose),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("persona server shutdown", () => {
  afterEach(() => vi.useRealTimers());
  it("drains a real local HTTP request before runtime disposal", async () => {
    const entered = deferred();
    const release = deferred();
    const server = createServer((_req, res) => {
      entered.resolve();
      void release.promise.then(() => res.end("complete"));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing fixture address");
    const dispose = vi.fn(async () => undefined);
    const stop = createPersonaServerShutdown(server, dispose);
    const controller = new AbortController();
    const response = fetch(`http://127.0.0.1:${address.port}`, { signal: controller.signal }).then(
      (r) => r.text(),
    );
    try {
      await Promise.race([entered.promise, response]);
      const closing = stop();
      expect(server.listening).toBe(false);
      expect(dispose).not.toHaveBeenCalled();
      release.resolve();
      expect(await response).toBe("complete");
      await closing;
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      release.resolve();
      controller.abort();
      await response.catch(() => undefined);
      server.closeAllConnections();
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("shares one shutdown and drains requests before disposing resources", async () => {
    const f = fixture();
    const stopped = f.stop();
    expect(f.stop()).toBe(stopped);
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.dispose).not.toHaveBeenCalled();
    f.drain();
    await stopped;
    await f.stop();
    expect(f.dispose).toHaveBeenCalledTimes(1);
  });
  it("propagates HTTP failure without closing resources of undrained requests", async () => {
    const f = fixture();
    const stopped = f.stop();
    f.drain(new Error("HTTP failure"));
    await expect(stopped).rejects.toThrow("HTTP failure");
    expect(f.dispose).not.toHaveBeenCalled();
  });
  it("handles runtime disposal failure without retrying", async () => {
    const f = fixture(
      vi.fn(async () => {
        throw new Error("disposal failure");
      }),
    );
    const stopped = f.stop();
    f.drain();
    await expect(stopped).rejects.toThrow("disposal failure");
    await expect(f.stop()).rejects.toThrow("disposal failure");
    expect(f.dispose).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])("enforces the deadline with HTTP drained=%s", async (drained) => {
    vi.useFakeTimers();
    const f = fixture(
      vi.fn(
        () =>
          new Promise<void>(() => {
            // Simulate runtime disposal that never completes.
          }),
      ),
    );
    const stopped = f.stop();
    const rejected = expect(stopped).rejects.toThrow("timed out");
    if (drained) f.drain();
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.dispose).toHaveBeenCalledTimes(drained ? 1 : 0);
  });
  it("clears the deadline after completion", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const stopped = f.stop();
    f.drain();
    await stopped;
    expect(vi.getTimerCount()).toBe(0);
  });
});
