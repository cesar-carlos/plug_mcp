import { resolve } from "node:path";
import { packageSe7ePlugin } from "../src/infrastructure/plugins/package-plugin.js";
import { parsePluginPackageArgs } from "../src/infrastructure/plugins/package-args.js";

try {
  const input = parsePluginPackageArgs(process.argv.slice(2), process.env.PUBLIC_BASE_URL);
  const output = await packageSe7ePlugin({
    ...input,
    root: resolve(input.runtime === "legacy" ? "plugins/se7e-chatgpt" : "plugins/se7e-persona-v2"),
  });
  process.stdout.write(`Pacote validado: ${output}\n`);
} catch {
  process.stderr.write(
    "Montagem recusada. Informe --runtime=legacy|persona-v2, --public-base-url=HTTPS (ou PUBLIC_BASE_URL), --output=DESTINO e --portable ou --connection-id=ID_REAL. A variante ChatGPT v2 depende do OAuth v2. Nenhum segredo deve ser incluído.\n",
  );
  process.exitCode = 1;
}
