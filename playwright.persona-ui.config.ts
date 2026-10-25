import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/persona-v2-browser",
  testMatch: "ui-*.spec.ts",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 30000,
  reporter: "line",
  outputDir: "test-results/persona-ui",
  globalSetup: "./tests/helpers/persona-ui-static-server.ts",
  use: {
    baseURL: "http://127.0.0.1:5189",
    browserName: "chromium",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
