import { afterEach, expect, it, vi } from "vitest";
import { ContextRequests } from "./model";
import { AdminReadQueue } from "./admin-read-queue";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("coordena leituras de todos os painéis e clientes sem repetir chamadas", async () => {
  let active = 0;
  let peak = 0;
  const fetchMock = vi.fn(async () => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return new Response("{}");
  });
  vi.stubGlobal("fetch", fetchMock);
  const clients = [new ContextRequests(), new ContextRequests(), new ContextRequests()];
  await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      clients[i % clients.length].json(`/api/admin/personas/fixture/skills/${i}/publicacao`),
    ),
  );
  expect(peak).toBe(2);
  expect(fetchMock).toHaveBeenCalledTimes(25);
});

it("descarta leituras na fila ao trocar contexto e mantém POST/MCP fora da fila", async () => {
  const releases: (() => void)[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/block")) await new Promise<void>((resolve) => releases.push(resolve));
    return new Response("{}");
  });
  vi.stubGlobal("fetch", fetchMock);
  const blocker = new ContextRequests();
  const old = new ContextRequests();
  const running = [blocker.json("/api/admin/block"), blocker.json("/api/admin/block")];
  await vi.waitFor(() => expect(releases).toHaveLength(2));
  const queued = old.json("/api/admin/old").catch((error: unknown) => error);
  await blocker.json("/api/admin/write", { method: "POST", body: "{}" });
  await blocker.json("/mcp", { method: "POST", body: "{}" });
  old.reset();
  expect(await queued).toBeInstanceOf(Error);
  releases.forEach((release) => release());
  await Promise.all(running);
  await old.json("/api/admin/new");
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "/api/admin/block",
    "/api/admin/block",
    "/api/admin/write",
    "/mcp",
    "/api/admin/new",
  ]);
});

it("limita fila e tempo de espera e libera capacidade sem executar expirados", async () => {
  vi.useFakeTimers();
  const queue = new AdminReadQueue();
  const signal = new AbortController().signal;
  const first = await queue.acquire(signal);
  const second = await queue.acquire(signal);
  const pending = Array.from({ length: 32 }, () =>
    queue.acquire(signal).catch((error: unknown) => error),
  );
  await expect(queue.acquire(signal)).rejects.toThrow("ocupado");
  await vi.advanceTimersByTimeAsync(10000);
  expect((await Promise.all(pending)).every((value) => value instanceof Error)).toBe(true);
  first();
  first();
  second();
  const release = await queue.acquire(signal);
  release();
});

it("preserva supportId e não repete erro remoto, liberando a fila", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ error: { code: "PLUG_SERVER_ERROR", message: "Falha temporária" } }),
        { status: 503, headers: { "X-Request-ID": id } },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const client = new ContextRequests();
  const errors = await Promise.all(
    Array.from({ length: 5 }, () =>
      client.json("/api/admin/personas").catch((error: Error) => error),
    ),
  );
  expect(errors.every((error) => error instanceof Error && error.message.includes(id))).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(5);
});
