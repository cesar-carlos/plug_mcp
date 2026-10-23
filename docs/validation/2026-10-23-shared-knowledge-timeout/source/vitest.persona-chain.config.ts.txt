import { defineConfig } from "vitest/config";

// Explicit invocation only. Missing engines/manifests are failures, never skips.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/homologation/persona-chain.test.ts"],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 300000,
  },
});
