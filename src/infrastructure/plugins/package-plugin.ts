import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { resolve, sep } from "node:path";
import {
  readPluginManifest,
  validateConnectionId,
  validatePublicPluginUrl,
  validateSe7ePackage,
} from "./package-validation.js";
import {
  PACKAGE_PROFILE,
  pluginRuntimeSchema,
  type PluginRecord,
  type PluginRuntime,
} from "./package-schemas.js";
import {
  pluginInventory,
  readPluginFiles,
  validatePluginReferences,
  validatePluginSkills,
} from "./package-files.js";
import { pluginTools, pluginResource, pluginToolCatalogHash } from "./tool-catalog.js";

export interface PluginPackageInput {
  root: string;
  runtime: PluginRuntime;
  outputRoot?: string;
  publicBaseUrl: string;
  portable?: boolean;
  connectionId?: string;
}
const json = (value: unknown): Buffer => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const removeStaging = async (staging: string, parent: string): Promise<void> => {
  const actual = await realpath(staging);
  if (!actual.startsWith(parent + sep) || !actual.split(sep).at(-1)?.startsWith(".se7e-staging-")) {
    throw new Error("Limpeza fora da staging recusada.");
  }
  await rm(actual, { recursive: true, force: true });
};
const absent = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return true;
    }
    throw error;
  }
};
export const packageSe7ePlugin = async (input: PluginPackageInput): Promise<string> => {
  const runtime = pluginRuntimeSchema.parse(input.runtime);
  const variant = input.portable === true ? "portable" : "chatgpt";
  const connection = variant === "chatgpt" ? validateConnectionId(input.connectionId) : undefined;
  const url = validatePublicPluginUrl(input.publicBaseUrl);
  const root = resolve(input.root);
  if ((await lstat(root)).isSymbolicLink()) {
    throw new Error("Links simbólicos não são permitidos.");
  }
  const manifest = await readPluginManifest(root);
  const files = new Map<string, Buffer>();
  for (const [path, data] of await readPluginFiles(resolve(root, "skills"))) {
    files.set(`skills/${path}`, data);
  }
  validatePluginSkills(files, runtime);
  validatePluginReferences(files);
  // Only the official normal PNGs are copied. No dependency on the external brand folder.
  for (const size of [192, 512]) {
    const icon = new URL(`../../../web/public/icon-${size}.png`, import.meta.url);
    if ((await lstat(icon)).isSymbolicLink()) {
      throw new Error("Asset oficial não pode ser link simbólico.");
    }
    files.set(`assets/se7e-${size}.png`, await readFile(icon));
  }
  manifest.extensions = {
    "com.openai": {
      ...(connection ? { apps: "./.app.json" as const } : {}),
      interface: {
        displayName: "Se7e",
        shortDescription: "Dados da persona Se7e",
        capabilities: ["Read", "Write"],
        logo: "assets/se7e-512.png",
        composerIcon: "assets/se7e-192.png",
      },
    },
  };
  files.set("plugin.json", json(manifest));
  files.set("tool-catalog.json", json({ runtime, tools: pluginTools(runtime, variant) }));
  const resource = pluginResource(url.origin, runtime, variant);
  if (connection) {
    files.set(".app.json", json({ apps: { se7e: { id: connection, required: true } } }));
  } else {
    files.set(
      "mcp.json",
      json({
        $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        mcpServers: { se7e: { type: "streamable-http", url: resource } },
      }),
    );
  }
  const record: PluginRecord = {
    format: PACKAGE_PROFILE,
    runtime,
    variant,
    publicBaseUrl: url.origin,
    resource,
    version: manifest.version,
    ...(connection ? { connectionId: connection } : {}),
    toolCatalogHash: pluginToolCatalogHash(runtime, variant),
    files: pluginInventory(files),
  };
  files.set("se7e-package.json", json(record));
  const requestedParent = resolve(input.outputRoot ?? resolve(root, "build"), runtime, variant);
  await mkdir(requestedParent, { recursive: true });
  const parent = await realpath(requestedParent);
  const output = resolve(parent, "se7e");
  if (!(await absent(output))) {
    throw new Error("Destino já existe; informe outro --output.");
  }
  // A sibling lease serializes concurrent builders; unvalidated files stay in a private staging directory.
  const leasePath = resolve(parent, ".se7e-package.lock");
  const lease = await open(leasePath, "wx");
  let staging: string | undefined;
  try {
    if (!(await absent(output))) {
      throw new Error("Destino já existe; informe outro --output.");
    }
    staging = await mkdtemp(resolve(parent, ".se7e-staging-"));
    const candidate = resolve(staging, "se7e");
    for (const [path, data] of files) {
      const target = resolve(candidate, path);
      if (!target.startsWith(candidate + sep)) {
        throw new Error("Arquivo fora do pacote.");
      }
      await mkdir(resolve(target, ".."), { recursive: true });
      await writeFile(target, data, { flag: "wx" });
    }
    await validateSe7ePackage(candidate, {
      runtime,
      variant,
      publicBaseUrl: url.origin,
      connectionId: connection,
    });
    if (!(await absent(output))) {
      throw new Error("Destino já existe; informe outro --output.");
    }
    await rename(candidate, output);
    return output;
  } finally {
    try {
      if (staging) {
        await removeStaging(staging, parent);
      }
    } finally {
      await lease.close();
      await rm(leasePath);
    }
  }
};
