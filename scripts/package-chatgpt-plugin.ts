import { pluginDiagnostic } from "../src/infrastructure/plugins/package-diagnostics.js";
import { resolve } from "node:path";
import { packageSe7ePlugin } from "../src/infrastructure/plugins/package-plugin.js";
import { parsePluginPackageArgs } from "../src/infrastructure/plugins/package-args.js";

let stage: "arguments" | "package" | "validation" = "arguments";
try {
  const input = parsePluginPackageArgs(process.argv.slice(2), process.env.PUBLIC_BASE_URL);
  stage = "package";
  const output = await packageSe7ePlugin({
    ...input,
    root: resolve(input.runtime === "legacy" ? "plugins/se7e-chatgpt" : "plugins/se7e-persona-v2"),
  });
  process.stdout.write(`Pacote validado: ${output}\n`);
} catch (error) {
  process.stderr.write(JSON.stringify(pluginDiagnostic(error, stage)) + "\n");
  process.exitCode = 1;
}
