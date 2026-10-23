import { pluginRuntimeSchema } from "./package-schemas.js";
import { validateConnectionId, validatePublicPluginUrl } from "./package-validation.js";
import type { PluginPackageInput } from "./package-plugin.js";

export const parsePluginPackageArgs = (
  args: readonly string[],
  publicBaseUrl?: string,
): Omit<PluginPackageInput, "root"> => {
  const values = new Map<string, string>();
  let portable = false;
  for (const arg of args) {
    if (arg === "--portable" && !portable) {
      portable = true;
      continue;
    }
    const match = /^--(runtime|output|connection-id|public-base-url)=(.+)$/.exec(arg);
    if (!match || values.has(match[1]!)) {
      throw new Error("Argumentos inválidos ou duplicados.");
    }
    values.set(match[1]!, match[2]!);
  }
  const runtime = pluginRuntimeSchema.parse(values.get("runtime"));
  const origin = validatePublicPluginUrl(
    values.get("public-base-url") ?? publicBaseUrl ?? "",
  ).origin;
  const connectionId = values.get("connection-id");
  if (portable && connectionId) {
    throw new Error("Variante portátil não recebe conexão ChatGPT.");
  }
  if (!portable) {
    validateConnectionId(connectionId);
  }
  return {
    runtime,
    publicBaseUrl: origin,
    portable,
    connectionId,
    outputRoot: values.get("output"),
  };
};

export const parsePluginValidationArgs = (
  args: readonly string[],
  publicBaseUrl?: string,
): { root: string; input: Omit<PluginPackageInput, "root" | "outputRoot"> } => {
  const packages = args.filter((arg) => arg.startsWith("--package="));
  if (packages.length !== 1 || !packages[0]!.slice("--package=".length)) {
    throw new Error("Informe exatamente um --package=DIRETORIO.");
  }
  if (args.some((arg) => arg.startsWith("--output="))) {
    throw new Error("A verificação não recebe destino de montagem.");
  }
  const input = parsePluginPackageArgs(
    args.filter((arg) => !arg.startsWith("--package=")),
    publicBaseUrl,
  );
  return { root: packages[0]!.slice("--package=".length), input };
};
