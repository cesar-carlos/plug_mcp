import { pluginDiagnostic } from "../src/infrastructure/plugins/package-diagnostics.js";
import { resolve } from "node:path";
import { parsePluginValidationArgs } from "../src/infrastructure/plugins/package-args.js";
import { validateSe7ePackage } from "../src/infrastructure/plugins/package-validation.js";

let stage: "arguments" | "package" | "validation" = "arguments";
try {
  const { root, input } = parsePluginValidationArgs(
    process.argv.slice(2),
    process.env.PUBLIC_BASE_URL,
  );
  stage = "validation";
  await validateSe7ePackage(resolve(root), {
    ...input,
    variant: input.portable ? "portable" : "chatgpt",
  });
  process.stdout.write(
    "Pacote aprovado pelo perfil local se7e-package-v1. Instalação no cliente não verificada.\n",
  );
} catch (error) {
  process.stderr.write(JSON.stringify(pluginDiagnostic(error, stage)) + "\n");
  process.exitCode = 1;
}
