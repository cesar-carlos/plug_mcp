import { readFile, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { comparePersonaPlugin } from "../src/infrastructure/plugins/persona-compatibility.js";
import { pluginRecordSchema } from "../src/infrastructure/plugins/package-schemas.js";
import { validateSe7ePackage } from "../src/infrastructure/plugins/package-validation.js";

async function readJson(path: string): Promise<unknown> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024)
    throw new Error("Invalid file");
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
try {
  const args = process.argv.slice(2);
  if (
    args.length !== 2 ||
    !args[0]?.startsWith("--package=") ||
    !args[1]?.startsWith("--capabilities=")
  )
    throw new Error("Arguments");
  const root = resolve(args[0].slice("--package=".length));
  const record = pluginRecordSchema.parse(await readJson(resolve(root, "se7e-package.json")));
  if (record.runtime !== "persona-v2") throw new Error("Runtime");
  await validateSe7ePackage(root, record);
  const server = z
    .object({
      pluginCompatibility: z.unknown(),
      serverBuild: z.object({ version: z.string(), revision: z.string() }).optional(),
    })
    .parse(await readJson(resolve(args[1].slice("--capabilities=".length))));
  const result = comparePersonaPlugin(
    await readJson(resolve(root, "compatibility.json")),
    server.pluginCompatibility,
  );
  process.stdout.write(
    JSON.stringify({
      ...result,
      packageVersion: record.version,
      resource: record.resource,
      serverRevision:
        server.serverBuild?.revision && /^[a-f0-9]{40}$/.test(server.serverBuild.revision)
          ? server.serverBuild.revision
          : "unknown",
    }) + "\n",
  );
  if (!result.compatible) process.exitCode = 1;
} catch {
  process.stderr.write(
    "Comparação recusada. Use --package=DIRETORIO --capabilities=JSON de obter_capacidades da conexão desejada; valide a revisão e não inclua credenciais.\n",
  );
  process.exitCode = 1;
}
