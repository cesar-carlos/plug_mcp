import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/console-browser",
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: "line",
  outputDir: "test-results/console",
  use: {
    baseURL: "http://127.0.0.1:5187",
    browserName: "chromium",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "npx tsx tests/helpers/console-browser-server.ts",
    url: "http://127.0.0.1:5187/app/conectar",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
