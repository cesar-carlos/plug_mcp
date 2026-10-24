import { loadConfig } from "./config/env.js";
import { composePersonaV2 } from "./composition/compose-persona-v2.js";
import { createPersonaServerShutdown } from "./infrastructure/persona-v2/server-shutdown.js";

const config = loadConfig();
const runtime = await composePersonaV2(config);
const server = runtime.app.listen(config.PORT, config.HOST);
const close = createPersonaServerShutdown(server, runtime.close);
const shutdown = (): void => {
  void close().then(
    () => process.exit(0),
    () => process.exit(1),
  );
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
