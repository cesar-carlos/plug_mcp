import { defineConfig } from "vitest/config";

// Explicit private manifest and candidate required; no operational defaults.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/homologation/persona-manual-training.test.ts",
      "tests/homologation/manual-fixture-access.test.ts",
    ],
    fileParallelism: false,
    testTimeout: 300000,
    hookTimeout: 120000,
  },
});
