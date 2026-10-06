import { cp, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  validateConnectionId,
  validatePublicPluginUrl,
  readPluginManifest,
} from "./package-validation.js";

export interface PluginPackageInput {
  root: string;
  outputRoot?: string;
  publicBaseUrl: string;
  portable?: boolean;
  connectionId?: string;
}
export const packageSe7ePlugin = async (input: PluginPackageInput): Promise<string> => {
  const portable = input.portable === true;
  const connection = portable ? undefined : validateConnectionId(input.connectionId);
  const url = validatePublicPluginUrl(input.publicBaseUrl);
  const manifest = await readPluginManifest(input.root);
  const root = resolve(input.root),
    output = resolve(input.outputRoot ?? resolve(root, "build"), portable ? "portable" : "chatgpt");
  // Não mistura variantes nem reaproveita arquivos de um artefato anterior.
  await mkdir(output, { recursive: false }).catch(async (error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      await mkdir(input.outputRoot ?? resolve(root, "build"), { recursive: true });
      await mkdir(output);
    } else throw error;
  });
  if (portable)
    await writeFile(
      resolve(output, "mcp.json"),
      JSON.stringify(
        {
          $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
          mcpServers: { se7e: { type: "streamable-http", url: `${url.origin}/mcp/chatgpt` } },
        },
        null,
        2,
      ) + "\n",
    );
  else {
    manifest.extensions = {
      "com.openai": {
        apps: "./.app.json",
        interface: {
          displayName: "Se7e",
          shortDescription: "Dados e skills da persona conectada",
          capabilities: ["Read", "Write"],
        },
      },
    };
    await writeFile(
      resolve(output, ".app.json"),
      JSON.stringify({ apps: { se7e: { id: connection!, required: true } } }, null, 2) + "\n",
    );
  }
  await writeFile(
    resolve(output, "se7e-package.json"),
    JSON.stringify(
      {
        variant: portable ? "portable" : "chatgpt",
        publicBaseUrl: url.origin,
        resource: `${url.origin}/mcp/chatgpt`,
        version: manifest.version,
        ...(connection ? { connectionId: connection } : {}),
      },
      null,
      2,
    ) + "\n",
  );
  await cp(resolve(root, "skills"), resolve(output, "skills"), { recursive: true });
  await writeFile(resolve(output, "plugin.json"), JSON.stringify(manifest, null, 2) + "\n");
  return output;
};
