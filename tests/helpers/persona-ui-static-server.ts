import express from "express";
import { resolve } from "node:path";

/** UI-only fixture: serves the built console; every API must be mocked per browser context. */
export default async function startUiFixture(): Promise<() => Promise<void>> {
  const app = express();
  const dist = resolve("web/dist");
  app.get(["/app", "/app/"], (_request, response) =>
    response.sendFile(resolve(dist, "persona-v2.html")),
  );
  app.use("/app", express.static(dist));
  app.use((_request, response) =>
    response.status(503).json({ error: { code: "UI_FIXTURE_API_NOT_MOCKED" } }),
  );
  const server = app.listen(5189, "127.0.0.1");
  await new Promise<void>((done, reject) => {
    server.once("listening", done);
    server.once("error", reject);
  });
  return async () => {
    server.closeAllConnections();
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  };
}
