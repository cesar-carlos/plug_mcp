import { readStablePluginFile } from "./package-read.js";
import { PluginFailure } from "./package-diagnostics.js";
import { basename, resolve } from "node:path";
import { z } from "zod";
import {
  pluginManifestSchema,
  pluginRecordSchema,
  pluginRuntimeSchema,
  pluginVariantSchema,
  type PluginManifest,
  type PluginRuntime,
  type PluginVariant,
} from "./package-schemas.js";
import {
  pluginInventory,
  readPluginFiles,
  validatePluginReferences,
  validatePluginSkills,
  OFFICIAL_PLUGIN_ICONS,
  fileHash,
} from "./package-files.js";
import { pluginTools, pluginResource, pluginToolCatalogHash } from "./tool-catalog.js";
import { PERSONA_CONSUMER_GUIDANCE } from "../../application/persona-v2/consumer-guidance.js";
import { personaPluginCompatibility } from "./persona-compatibility.js";
import { trainingManifest } from "../../application/persona-v2/training-topics.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";

export const validateConnectionId = (connection: string | undefined): string => {
  if (
    !connection ||
    !/^(?:asdk_app_|connector_|templated_apps_)[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(connection) ||
    /placeholder|example|replace|teste/i.test(connection)
  ) {
    throw new PluginFailure(
      "INVALID_CONFIGURATION",
      "Informe o identificador real do aplicativo --connection-id=asdk_app_..., connector_... ou templated_apps_... do ChatGPT.",
    );
  }
  return connection;
};
export const validatePublicPluginUrl = (base: string): URL => {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new PluginFailure("INVALID_CONFIGURATION");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new PluginFailure("INVALID_CONFIGURATION", "PUBLIC_BASE_URL deve ser HTTPS canônica.");
  }
  return url;
};
export const readPluginManifest = async (root: string): Promise<PluginManifest> => {
  const path = resolve(root, "plugin.json");
  return pluginManifestSchema.parse(
    JSON.parse((await readStablePluginFile(path, 512 * 1024)).toString("utf8")),
  );
};

export interface PluginValidationInput {
  readonly runtime: PluginRuntime;
  readonly variant: PluginVariant;
  readonly publicBaseUrl: string;
  readonly connectionId?: string;
}

export function validatePluginConfiguration(input: PluginValidationInput): {
  url: URL;
  connection: string | undefined;
} {
  if (
    !pluginRuntimeSchema.safeParse(input.runtime).success ||
    !pluginVariantSchema.safeParse(input.variant).success
  ) {
    throw new PluginFailure("INVALID_CONFIGURATION");
  }
  if (input.variant === "portable" && input.connectionId !== undefined) {
    throw new PluginFailure(
      "INVALID_CONFIGURATION",
      "Variante portátil não recebe conexão ChatGPT.",
    );
  }
  return {
    url: validatePublicPluginUrl(input.publicBaseUrl),
    connection: input.variant === "chatgpt" ? validateConnectionId(input.connectionId) : undefined,
  };
}

export const validateSe7ePackage = async (
  root: string,
  input: PluginValidationInput,
): Promise<void> => {
  const { url, connection } = validatePluginConfiguration(input);
  if (basename(root) !== "se7e") {
    throw new Error("Diretório raiz deve corresponder ao nome se7e.");
  }
  const files = await readPluginFiles(root);
  const json = (name: string): unknown =>
    JSON.parse(files.get(name)?.toString("utf8") ?? "null") as unknown;
  const manifest = pluginManifestSchema.parse(json("plugin.json"));
  const record = pluginRecordSchema.parse(json("se7e-package.json"));
  if (
    record.runtime !== input.runtime ||
    record.variant !== input.variant ||
    record.publicBaseUrl !== url.origin ||
    record.resource !== pluginResource(url.origin, input.runtime, input.variant) ||
    record.version !== manifest.version ||
    record.connectionId !== connection ||
    record.toolCatalogHash !== pluginToolCatalogHash(input.runtime, input.variant)
  ) {
    throw new PluginFailure(
      "CONTRACT_MISMATCH",
      "Pacote pertence a outra geração, conexão ou ambiente.",
    );
  }
  const extension = manifest.extensions?.["com.openai"];
  if (!extension) {
    throw new Error("Identidade visual do pacote ausente.");
  }
  if (input.variant === "chatgpt") {
    if (files.has("mcp.json") || files.has(".mcp.json")) {
      throw new Error("Pacote com MCP duplicado.");
    }
    if (extension.apps !== "./.app.json") {
      throw new Error("Conexão ChatGPT ausente.");
    }
    z.strictObject({
      apps: z.strictObject({
        se7e: z.strictObject({ id: z.literal(connection!), required: z.literal(true) }),
      }),
    }).parse(json(".app.json"));
  } else {
    if (extension.apps || files.has(".app.json") || files.has(".mcp.json")) {
      throw new Error("Pacote com MCP duplicado.");
    }
    z.strictObject({
      $schema: z.literal("https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"),
      mcpServers: z.strictObject({
        se7e: z.strictObject({
          type: z.literal("streamable-http"),
          url: z.literal(record.resource),
        }),
      }),
    }).parse(json("mcp.json"));
  }
  if (
    canonicalJson(json("tool-catalog.json")) !==
    canonicalJson({ runtime: input.runtime, tools: pluginTools(input.runtime, input.variant) })
  ) {
    throw new PluginFailure("CONTRACT_MISMATCH", "Catálogo do pacote foi alterado.");
  }
  for (const icon of [extension.interface.logo, extension.interface.composerIcon]) {
    const data = files.get(icon);
    if (
      !data ||
      fileHash(data) !== OFFICIAL_PLUGIN_ICONS[icon] ||
      !icon.startsWith("assets/") ||
      !icon.endsWith(".png") ||
      !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      data.length < 24 ||
      data.readUInt32BE(16) < 48 ||
      data.readUInt32BE(16) > 4096 ||
      data.readUInt32BE(16) !== data.readUInt32BE(20)
    ) {
      throw new Error("Ícone PNG ausente ou inválido.");
    }
  }
  validatePluginSkills(files, input.runtime);
  if (input.runtime === "persona-v2") {
    if (canonicalJson(json("training-manifest.json")) !== canonicalJson(trainingManifest()))
      throw new PluginFailure(
        "CONTRACT_MISMATCH",
        "Manifesto de tópicos do pacote diverge do runtime atual.",
      );
    if (
      canonicalJson(json("compatibility.json")) !==
      canonicalJson(personaPluginCompatibility(input.variant))
    )
      throw new PluginFailure(
        "CONTRACT_MISMATCH",
        "Contrato de instruções do pacote diverge do runtime atual.",
      );
    for (const [path, content] of files) {
      if (!path.endsWith("/SKILL.md")) continue;
      if (
        !content
          .toString("utf8")
          .includes("[guia de compatibilidade, erros e exemplos](references/consumer-guide.md)") ||
        files.get(path.replace("SKILL.md", "references/consumer-guide.md"))?.toString("utf8") !==
          PERSONA_CONSUMER_GUIDANCE
      )
        throw new PluginFailure("CONTRACT_MISMATCH", "Guia compartilhado ausente ou divergente.");
    }
  }
  validatePluginReferences(files);
  if (canonicalJson(pluginInventory(files)) !== canonicalJson(record.files)) {
    throw new PluginFailure("INTEGRITY_MISMATCH", "Inventário ou hashes do pacote divergem.");
  }
  const allowed = new Set([
    "plugin.json",
    "se7e-package.json",
    "tool-catalog.json",
    ...(input.runtime === "persona-v2" ? ["compatibility.json", "training-manifest.json"] : []),
    input.variant === "chatgpt" ? ".app.json" : "mcp.json",
    extension.interface.logo,
    extension.interface.composerIcon,
  ]);
  if ([...files.keys()].some((path) => !allowed.has(path) && !path.startsWith("skills/"))) {
    throw new Error("Arquivo não declarado no pacote.");
  }
};

/** Legacy readiness cannot approve a persona-v2 artifact. */
export const validateChatGptPackage = (
  root: string,
  connectionId: string,
  publicBaseUrl: string,
): Promise<void> =>
  validateSe7ePackage(root, { runtime: "legacy", variant: "chatgpt", connectionId, publicBaseUrl });
