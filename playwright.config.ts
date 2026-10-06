import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash, X509Certificate } from "node:crypto";
const certificate = new X509Certificate(
  readFileSync(new URL("./tests/fixtures/tls/test-cert.pem", import.meta.url)),
);
const spki = createHash("sha256")
  .update(certificate.publicKey.export({ format: "der", type: "spki" }))
  .digest("base64");
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: "line",
  outputDir: "test-results/browser",
  use: {
    browserName: "chromium",
    trace: "off",
    video: "off",
    screenshot: "off",
    launchOptions: { args: [`--ignore-certificate-errors-spki-list=${spki}`] },
  },
});
