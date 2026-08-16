import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // tests/live/ chama o plug-server real e roda só via `npm run test:live` (vitest.live.config.ts).
    exclude: ["tests/live/**", "**/node_modules/**"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
