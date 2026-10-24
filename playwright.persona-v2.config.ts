import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/persona-v2-browser",
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: "line",
  outputDir: "test-results/persona-v2",
  globalSetup: "./tests/helpers/persona-v2-browser-server.ts",
  use: {
    baseURL: "http://127.0.0.1:5188",
    browserName: "chromium",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
