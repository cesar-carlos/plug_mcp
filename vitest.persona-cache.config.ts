import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/homologation/persona-query-cache.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
  },
});
