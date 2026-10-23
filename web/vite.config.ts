/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "/app/",
  plugins: [vue()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  build: {
    rollupOptions: {
      input: {
        legacy: fileURLToPath(new URL("./index.html", import.meta.url)),
        persona: fileURLToPath(new URL("./persona-v2.html", import.meta.url)),
      },
    },
    outDir: "dist",
    emptyOutDir: true,
  },
});
