import { createServer } from "node:http";
import { expect, it } from "vitest";
import { queryTransportContext } from "../../src/application/persona-v2/query-transport-context.js";
import {
  createHubHttpAgents,
  createPooledFetch,
  destroyHubHttpAgents,
} from "../../src/infrastructure/plug-server/hub-http.js";

it("limita a fila por destino e persona, libera capacidade após cancelamento sem reenviar", async () => {
  const agents = createHubHttpAgents();
  agents.sql.http.maxSockets = 2;
  let requests = 0;
  const server = createServer((_req, res) => {
    requests++;
    res.writeHead(200);
    res.write("partial");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture address");
  const url = `http://127.0.0.1:${address.port}`;
  const fetcher = createPooledFetch(agents.sql);
  const controller = new AbortController();
  const run = (personaId: string) =>
    queryTransportContext.run({ personaId, signal: controller.signal }, () =>
      fetcher(url, { signal: controller.signal }),
    );
  try {
    const first = run("a").catch((error: unknown) => error);
    await expect(run("a")).rejects.toMatchObject({ phase: "queue", reason: "capacity" });
    const second = run("b").catch((error: unknown) => error);
    while (requests < 2) await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    expect(await first).toMatchObject({ reason: "timeout" });
    expect(await second).toMatchObject({ reason: "timeout" });
    expect(requests).toBe(2);
    const later = fetcher(url, { signal: AbortSignal.timeout(30) });
    await expect(later).rejects.toMatchObject({ reason: "timeout" });
    expect(requests).toBe(3);
  } finally {
    controller.abort();
    destroyHubHttpAgents(agents);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("recusa excesso global sem enviar e remove pedido expirado da fila", async () => {
  const agents = createHubHttpAgents();
  agents.sql.http.maxSockets = 1;
  let requests = 0;
  const server = createServer(() => {
    requests++;
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture address");
  const url = `http://127.0.0.1:${address.port}`;
  const fetcher = createPooledFetch(agents.sql),
    controller = new AbortController();
  try {
    const first = fetcher(url, { signal: controller.signal }).catch((error: unknown) => error);
    const queued = fetcher(url, { signal: AbortSignal.timeout(30) });
    const queueCheck = expect(queued).rejects.toMatchObject({ phase: "queue", reason: "timeout" });
    await expect(fetcher(url)).rejects.toMatchObject({ phase: "queue", reason: "capacity" });
    await queueCheck;
    controller.abort();
    await first;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(requests).toBe(1);
  } finally {
    controller.abort();
    destroyHubHttpAgents(agents);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("resposta perdida não repete POST e pool recupera somente em novo pedido explícito", async () => {
  const agents = createHubHttpAgents();
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    if (requests === 1) req.socket.destroy();
    else res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture address");
  const url = `http://127.0.0.1:${address.port}`;
  const fetcher = createPooledFetch(agents.sql);
  try {
    await expect(fetcher(url, { method: "POST", body: "synthetic" })).rejects.toMatchObject({
      reason: "network",
      errno: "ECONNRESET",
    });
    expect(requests).toBe(1);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => server.listen(address.port, "127.0.0.1", resolve));
    expect(await (await fetcher(url)).text()).toBe("ok");
    expect(requests).toBe(2);
  } finally {
    destroyHubHttpAgents(agents);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
