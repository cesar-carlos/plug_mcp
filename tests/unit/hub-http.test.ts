import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_TIMEOUT_MS_LIMIT,
  createHubHttpAgents,
  createPooledFetch,
  destroyHubHttpAgents,
  HUB_BRIDGE_TIMEOUT_MS_DEFAULT,
  HUB_HTTP_AUTH_MAX_SOCKETS,
  HUB_HTTP_KEEPALIVE_MS,
  HUB_HTTP_MAX_SOCKETS,
  hubBridgeWaitMs,
  hubHttpAbortMs,
  type HubHttpAgents,
} from "../../src/infrastructure/plug-server/hub-http.js";

const listen = async (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        resolve(addr.port);
        return;
      }
      reject(new Error("listen failed"));
    });
  });

const closeServer = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

describe("hubBridgeWaitMs / hubHttpAbortMs", () => {
  it("sem timeout_ms usa o default 30s do bridge (não soma 5s)", () => {
    expect(hubBridgeWaitMs(undefined)).toBe(HUB_BRIDGE_TIMEOUT_MS_DEFAULT);
    expect(hubHttpAbortMs(35_000, hubBridgeWaitMs(undefined))).toBe(35_000);
  });

  it("com timeout_ms replica o wait do hub (max(body, timeout_ms+5s))", () => {
    expect(hubBridgeWaitMs(30_000)).toBe(35_000);
    expect(hubBridgeWaitMs(60_000)).toBe(65_000);
    expect(hubHttpAbortMs(35_000, hubBridgeWaitMs(60_000))).toBe(70_000);
  });

  it("não espera além do teto do hub + headroom de download", () => {
    expect(hubBridgeWaitMs(AGENT_TIMEOUT_MS_LIMIT)).toBe(305_000);
    expect(hubHttpAbortMs(35_000, hubBridgeWaitMs(AGENT_TIMEOUT_MS_LIMIT))).toBe(310_000);
  });
});

describe("createPooledFetch", () => {
  let agents: HubHttpAgents | undefined;
  let server: Server | undefined;

  afterEach(async () => {
    if (agents) {
      destroyHubHttpAgents(agents);
      agents = undefined;
    }
    if (server) {
      server.closeAllConnections();
      await closeServer(server);
      server = undefined;
    }
  });

  it("reusa a conexão TCP entre requests sequenciais", async () => {
    let connections = 0;
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json", connection: "keep-alive" });
      res.end(JSON.stringify({ ok: true }));
    });
    server.keepAliveTimeout = 10_000;
    server.on("connection", () => {
      connections += 1;
    });
    const port = await listen(server);
    agents = createHubHttpAgents();
    const fetchImpl = createPooledFetch(agents.sql);
    const url = `http://127.0.0.1:${String(port)}/`;
    const first = await fetchImpl(url, { method: "GET" });
    const second = await fetchImpl(url, { method: "GET" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(connections).toBe(1);
    expect(HUB_HTTP_KEEPALIVE_MS).toBe(30_000);
  });

  it("descomprime gzip do hub", async () => {
    const payload = Buffer.from(JSON.stringify({ gzip: true }), "utf8");
    server = createServer((_req, res) => {
      const compressed = gzipSync(payload);
      res.writeHead(200, {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": String(compressed.length),
      });
      res.end(compressed);
    });
    const port = await listen(server);
    agents = createHubHttpAgents();
    const fetchImpl = createPooledFetch(agents.sql);
    const response = await fetchImpl(`http://127.0.0.1:${String(port)}/`, { method: "GET" });
    const json: unknown = await response.json();
    expect(json).toEqual({ gzip: true });
    expect(response.headers.has("content-encoding")).toBe(false);
    expect(response.headers.has("content-length")).toBe(false);
  });

  it("respeita AbortSignal (TimeoutError) sem reenviar o pedido", async () => {
    let requests = 0;
    server = createServer(() => {
      requests += 1;
    });
    const port = await listen(server);
    agents = createHubHttpAgents();
    const fetchImpl = createPooledFetch(agents.sql);
    await expect(
      fetchImpl(`http://127.0.0.1:${String(port)}/`, {
        method: "GET",
        signal: AbortSignal.timeout(40),
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(requests).toBe(1);
  });

  it("isola o Agent de sql.execute do de login/refresh/getPolicy (dois pools TCP)", async () => {
    let connections = 0;
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json", connection: "keep-alive" });
      res.end(JSON.stringify({ ok: true }));
    });
    server.keepAliveTimeout = 10_000;
    server.on("connection", () => {
      connections += 1;
    });
    const port = await listen(server);
    agents = createHubHttpAgents();
    expect(agents.sql.http).not.toBe(agents.auth.http);
    expect(agents.sql.https).not.toBe(agents.auth.https);
    expect(agents.sql.http.maxSockets).toBe(HUB_HTTP_MAX_SOCKETS);
    expect(agents.auth.http.maxSockets).toBe(HUB_HTTP_AUTH_MAX_SOCKETS);

    const sqlFetch = createPooledFetch(agents.sql);
    const authFetch = createPooledFetch(agents.auth);
    const url = `http://127.0.0.1:${String(port)}/`;
    expect((await sqlFetch(url, { method: "GET" })).ok).toBe(true);
    expect((await authFetch(url, { method: "GET" })).ok).toBe(true);
    expect(connections).toBe(2);
    expect((await sqlFetch(url, { method: "GET" })).ok).toBe(true);
    expect((await authFetch(url, { method: "GET" })).ok).toBe(true);
    expect(connections).toBe(2);
  });
});
