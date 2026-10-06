import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

export const validateConnectionId = (connection: string | undefined): string => {
  if (
    !connection ||
    !/^plugin_asdk_app_[a-zA-Z0-9]+$/.test(connection) ||
    /placeholder|example|replace|teste/i.test(connection)
  )
    throw new Error("Informe o identificador real --connection-id=plugin_asdk_app_... do ChatGPT.");
  return connection;
};
export const validatePublicPluginUrl = (base: string): URL => {
  const url = new URL(base);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("PUBLIC_BASE_URL deve ser HTTPS canônica.");
  return url;
};
export const readPluginManifest = async (
  root: string,
): Promise<Record<string, unknown> & { name: "se7e"; version: string; description: string }> =>
  z
    .object({
      name: z.literal("se7e"),
      version: z.string().min(1),
      description: z.string().min(1),
    })
    .passthrough()
    .parse(JSON.parse(await readFile(resolve(root, "plugin.json"), "utf8")));

export const validateChatGptPackage = async (
  root: string,
  connectionId: string,
  publicBaseUrl: string,
): Promise<void> => {
  const connection = validateConnectionId(connectionId);
  const url = validatePublicPluginUrl(publicBaseUrl);
  const manifest = await readPluginManifest(root);
  z.strictObject({
    variant: z.literal("chatgpt"),
    publicBaseUrl: z.literal(url.origin),
    resource: z.literal(`${url.origin}/mcp/chatgpt`),
    version: z.literal(manifest.version),
    connectionId: z.literal(connection),
  }).parse(JSON.parse(await readFile(resolve(root, "se7e-package.json"), "utf8")));
  const extensions = z
    .object({ "com.openai": z.object({ apps: z.literal("./.app.json") }).passthrough() })
    .parse(manifest.extensions);
  if (!extensions || "mcpServers" in manifest || "mcp" in manifest)
    throw new Error("Pacote com MCP duplicado.");
  const app = z.strictObject({
    apps: z.strictObject({
      se7e: z.strictObject({ id: z.literal(connection), required: z.literal(true) }),
    }),
  });
  app.parse(JSON.parse(await readFile(resolve(root, ".app.json"), "utf8")));
  for (const file of ["mcp.json", ".mcp.json"]) {
    if (
      await access(resolve(root, file)).then(
        () => true,
        () => false,
      )
    )
      throw new Error("Pacote com MCP duplicado.");
  }
  for (const name of ["consulta", "treinamento-administracao"])
    await access(resolve(root, "skills", name, "SKILL.md"));
};
