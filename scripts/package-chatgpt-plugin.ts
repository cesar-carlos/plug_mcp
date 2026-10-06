import { resolve } from "node:path";
import { loadConfig } from "../src/config/env.js";
import { packageSe7ePlugin } from "../src/infrastructure/plugins/package-plugin.js";
const args = process.argv.slice(2);
const config = loadConfig();
const output = await packageSe7ePlugin({
  root: resolve("plugins/se7e-chatgpt"),
  publicBaseUrl: config.PUBLIC_BASE_URL,
  portable: args.includes("--portable"),
  connectionId: args
    .find((value) => value.startsWith("--connection-id="))
    ?.slice("--connection-id=".length),
});
process.stdout.write(`Pacote gerado: ${output}\n`);
