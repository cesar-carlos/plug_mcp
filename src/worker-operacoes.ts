import { loadConfig } from "./config/env.js";
import { compose } from "./composition/compose.js";

const main = async (): Promise<void> => {
  const config = loadConfig();
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required for worker:operacoes");
  const { operationsWorker, close, logger, purgeExpiredCandidates } = await compose(config);
  if (!operationsWorker) throw new Error("operations worker requires persistent repositories");
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await operationsWorker.executarUmaVez();
      await purgeExpiredCandidates();
    } catch {
      logger.error("operations worker tick failed", { stage: "monitor_or_delivery" });
    } finally {
      running = false;
    }
  };
  await tick();
  const timer = setInterval(() => void tick(), config.OPERATIONS_WORKER_INTERVAL_MS);
  const shutdown = async () => {
    clearInterval(timer);
    await close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
};
main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
