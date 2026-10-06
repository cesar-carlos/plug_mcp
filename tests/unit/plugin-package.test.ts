import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { packageSe7ePlugin } from "../../src/infrastructure/plugins/package-plugin.js";

import { validateChatGptPackage } from "../../src/infrastructure/plugins/package-validation.js";

describe("pacote Se7e", () => {
  it("gera variantes exclusivas e impede sobrescrita e identificadores fictícios", async () => {
    const outputRoot = await mkdtemp(resolve(tmpdir(), "se7e-package-"));
    const input = {
      root: resolve("plugins/se7e-chatgpt"),
      outputRoot,
      publicBaseUrl: "https://synthetic.example.test/",
    };
    try {
      await expect(
        packageSe7ePlugin({ ...input, connectionId: "plugin_asdk_app_placeholder" }),
      ).rejects.toThrow("identificador real");
      await expect(
        packageSe7ePlugin({
          ...input,
          portable: true,
          publicBaseUrl: "http://synthetic.example.test",
        }),
      ).rejects.toThrow("HTTPS");
      const portable = await packageSe7ePlugin({ ...input, portable: true });
      expect(JSON.parse(await readFile(resolve(portable, "mcp.json"), "utf8"))).toMatchObject({
        mcpServers: {
          se7e: { type: "streamable-http", url: "https://synthetic.example.test/mcp/chatgpt" },
        },
      });
      expect(await readdir(portable)).not.toContain(".app.json");
      // Identificador sintético restrito a este teste; não é utilizado em instalação.
      const connectionId = "plugin_asdk_app_0123456789abcdef";
      const chatgpt = await packageSe7ePlugin({ ...input, connectionId });
      expect(JSON.parse(await readFile(resolve(chatgpt, ".app.json"), "utf8"))).toEqual({
        apps: { se7e: { id: connectionId, required: true } },
      });
      expect(JSON.parse(await readFile(resolve(chatgpt, "plugin.json"), "utf8"))).toMatchObject({
        extensions: { "com.openai": { apps: "./.app.json" } },
      });
      await expect(
        validateChatGptPackage(chatgpt, connectionId, input.publicBaseUrl),
      ).resolves.toBeUndefined();
      await expect(
        validateChatGptPackage(portable, connectionId, input.publicBaseUrl),
      ).rejects.toThrow();
      await expect(
        validateChatGptPackage(chatgpt, "plugin_asdk_app_otherconnection", input.publicBaseUrl),
      ).rejects.toThrow();
      await expect(
        validateChatGptPackage(chatgpt, connectionId, "https://other-environment.test"),
      ).rejects.toThrow();
      await writeFile(resolve(chatgpt, "mcp.json"), "{}");
      await expect(
        validateChatGptPackage(chatgpt, connectionId, input.publicBaseUrl),
      ).rejects.toThrow("duplicado");
      await rm(resolve(chatgpt, "mcp.json"));
      expect(await readdir(chatgpt)).not.toContain("mcp.json");
      expect(await readdir(resolve(chatgpt, "skills"))).toHaveLength(2);
      await expect(packageSe7ePlugin({ ...input, connectionId })).rejects.toThrow();
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});
