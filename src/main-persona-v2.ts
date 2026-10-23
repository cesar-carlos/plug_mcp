import { loadConfig } from "./config/env.js";
import { composePersonaV2 } from "./composition/compose-persona-v2.js";

const config = loadConfig();
const runtime = await composePersonaV2(config);
const server = runtime.app.listen(config.PORT, config.HOST);
const shutdown = (): void => {
  server.close(() => {
    void runtime.close().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
