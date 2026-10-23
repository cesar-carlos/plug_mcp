import { expect, it, vi } from "vitest";
import { PersonaWorkerLoop } from "../../../src/application/persona-v2/worker-loop.js";
import type { LoggerPort } from "../../../src/domain/ports/logger.port.js";
import { startPersonaWorkerHealth } from "../../../src/infrastructure/persona-v2/worker-health.js";
import { once } from "node:events";

const logger = (): LoggerPort => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => logger(),
});
const barrier = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

it("saúde acompanha ciclos, falha, recuperação, atraso e parada sem executar jobs", async () => {
  let now = 0;
  const job = vi.fn(() => Promise.resolve());
  const loop = new PersonaWorkerLoop(
    [{ stage: "knowledge_review", run: job }],
    logger(),
    () => now,
  );
  expect(loop.health()).toBe("starting");
  await loop.tick();
  expect(loop.health()).toBe("healthy");
  now = 180001;
  expect(loop.health()).toBe("stale");
  job.mockRejectedValueOnce(new Error("secret"));
  await loop.tick();
  expect(loop.health()).toBe("degraded");
  await loop.tick();
  expect(loop.health()).toBe("healthy");
  expect(job).toHaveBeenCalledTimes(3);
  await loop.stop();
  expect(loop.health()).toBe("stopping");
});

it("probe HTTP usa loopback e não expõe falhas privadas nem inicia trabalho", async () => {
  const job = vi.fn(() => Promise.resolve());
  const loop = new PersonaWorkerLoop([{ stage: "knowledge_review", run: job }], logger());
  const server = await startPersonaWorkerHealth(loop, 0);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Missing fixture listener");
  }
  const url = `http://127.0.0.1:${address.port}/health`;
  try {
    expect(address.address).toBe("127.0.0.1");
    expect((await fetch(url)).status).toBe(503);
    expect(job).not.toHaveBeenCalled();
    await loop.tick();
    const healthy = await fetch(url);
    expect(healthy.status).toBe(200);
    expect(healthy.headers.get("cache-control")).toBe("no-store");
    expect(await healthy.json()).toEqual({ status: "healthy" });
    expect((await fetch(url, { method: "POST" })).status).toBe(404);
    expect((await fetch(`${url}?secret=fixture`)).status).toBe(404);
    job.mockRejectedValueOnce(new Error("private data"));
    await loop.tick();
    const failed = await fetch(url);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ status: "degraded" });
    await loop.stop();
    expect((await fetch(url)).status).toBe(503);
    expect(job).toHaveBeenCalledTimes(2);
  } finally {
    await loop.stop();
    const closed = once(server, "close");
    server.close();
    server.closeAllConnections();
    await closed;
  }
});

it("timer e chamadas concorrentes não sobrepõem ciclos; falha não expõe conteúdo nem impede o job seguinte", async () => {
  vi.useFakeTimers();
  const gate = barrier(),
    log = logger(),
    next = vi.fn();
  const first = vi.fn(async () => {
    await gate.promise;
    throw new Error("private secret fixture");
  });
  const loop = new PersonaWorkerLoop(
    [
      { stage: "knowledge_review", run: first },
      { stage: "ephemeral_cleanup", run: next },
    ],
    log,
  );
  try {
    const cycle = loop.start(1000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(first).toHaveBeenCalledTimes(1);
    const duplicate = loop.tick();
    gate.release();
    await Promise.all([cycle, duplicate]);
    expect(next).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledExactlyOnceWith("persona worker job failed", {
      stage: "knowledge_review",
    });
  } finally {
    await loop.stop();
    vi.useRealTimers();
  }
});

it("parada durante o primeiro ciclo aguarda o job atual e impede jobs e ciclos seguintes", async () => {
  const gate = barrier(),
    next = vi.fn();
  const loop = new PersonaWorkerLoop(
    [
      { stage: "knowledge_review", run: () => gate.promise },
      { stage: "notification_delivery", run: next },
    ],
    logger(),
  );
  const cycle = loop.start(1000);
  let closed = false;
  const stopping = loop.stop().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  gate.release();
  await Promise.all([cycle, stopping]);
  await loop.tick();
  expect(next).not.toHaveBeenCalled();
  expect(() => loop.start(1000)).toThrow("stopped");
});
