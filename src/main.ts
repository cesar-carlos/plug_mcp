import { loadConfig } from "./config/env.js";
import { compose } from "./composition/compose.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const closeHttpServer = (
  server: { close: (cb: (err?: Error) => void) => void },
  timeoutMs: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("http server close timed out"));
    }, timeoutMs);
    server.close((error) => {
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    });
  });

const main = async (): Promise<void> => {
  const config = loadConfig();
  const { app, logger, close } = await compose(config);
  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info("se7e-mcp-server listening", {
      host: config.HOST,
      port: config.PORT,
      publicBaseUrl: config.PUBLIC_BASE_URL,
      mcp: config.mcpResourceUrl,
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info("shutdown", { signal });
    try {
      await closeHttpServer(server, SHUTDOWN_TIMEOUT_MS);
      await close();
      process.exit(0);
    } catch (error: unknown) {
      logger.error("shutdown failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
