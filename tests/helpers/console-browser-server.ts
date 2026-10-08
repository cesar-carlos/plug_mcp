import { compose } from "../../src/composition/compose.js";
import { testConfig } from "../../src/config/env.js";
import { FakePlugServer } from "./fake-plug-server.js";

// Separate, synthetic process. Never inherit an operational database or ERP gateway.
const plug = new FakePlugServer();
plug.approve("11111111-1111-4111-8111-111111111111");
const { app, close } = await compose(
  testConfig({
    DATABASE_URL: "",
    REDIS_URL: "",
    CHATGPT_OAUTH_ENABLED: false,
    PUBLIC_BASE_URL: "http://127.0.0.1:5187",
    MCP_ALLOWED_ORIGINS: "http://127.0.0.1:5187",
    LOG_LEVEL: "silent",
    PORT: 5187,
  }),
  { plug },
);
const server = app.listen(5187, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      void close().then(() => process.exit(0));
    });
  });
}
