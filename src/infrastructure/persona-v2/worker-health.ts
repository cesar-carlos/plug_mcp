import { createServer, type Server } from "node:http";
import type { PersonaWorkerLoop } from "../../application/persona-v2/worker-loop.js";

/** Loopback only: observes the local process, never claims jobs or queries a database. */
export async function startPersonaWorkerHealth(
  worker: PersonaWorkerLoop,
  port: number,
): Promise<Server> {
  const server = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET" || req.url !== "/health") {
      res.writeHead(404).end();
      return;
    }
    const status = worker.health();
    res.writeHead(status === "healthy" ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status }));
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  return server;
}
