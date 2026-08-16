import { defineConfig } from "vitest/config";

// Config separada de vitest.config.ts: só roda tests/live/, que chama o plug-server real.
// Timeout maior que o padrão (rede real, não in-memory). Nunca inclua isto no `npm test`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/live/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 90_000,
  },
});
