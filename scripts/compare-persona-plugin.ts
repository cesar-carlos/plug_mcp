import { readStablePluginFile } from "../src/infrastructure/plugins/package-read.js";
import { resolve } from "node:path";
import { z } from "zod";
import {
  diagnosePersonaPlugin,
  checkPluginDeploymentRevision,
} from "../src/infrastructure/plugins/persona-compatibility.js";
import { pluginRecordSchema } from "../src/infrastructure/plugins/package-schemas.js";
import { validateSe7ePackage } from "../src/infrastructure/plugins/package-validation.js";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse((await readStablePluginFile(path, 512 * 1024)).toString("utf8")) as unknown;
}
let stage = "arguments";
try {
  const args = process.argv.slice(2);
  if (
    (args.length !== 2 && args.length !== 3) ||
    !args[0]?.startsWith("--package=") ||
    !args[0].slice("--package=".length) ||
    !args[1]?.startsWith("--capabilities=") ||
    !args[1].slice("--capabilities=".length) ||
    (args.length === 3 && !/^--expected-revision=[a-f0-9]{40}$/.test(args[2]!))
  )
    throw new Error("Arguments");
  const root = resolve(args[0].slice("--package=".length));
  stage = "package";
  const record = pluginRecordSchema.parse(await readJson(resolve(root, "se7e-package.json")));
  if (record.runtime !== "persona-v2") throw new Error("Runtime");
  const packageCompatibility = await readJson(resolve(root, "compatibility.json"));
  const packageTraining = await readJson(resolve(root, "training-manifest.json"));
  stage = "capabilities";
  const server = z
    .object({
      pluginCompatibility: z.unknown(),
      training: z.unknown().optional(),
      serverBuild: z.object({ version: z.string(), revision: z.string() }).optional(),
    })
    .parse(await readJson(resolve(args[1].slice("--capabilities=".length))));
  const result = diagnosePersonaPlugin(
    packageCompatibility,
    server.pluginCompatibility,
    packageTraining,
    server.training,
  );
  const deployment = args[2]
    ? checkPluginDeploymentRevision(
        args[2].slice("--expected-revision=".length),
        server.serverBuild?.revision,
      )
    : undefined;
  if (deployment && !deployment.revisionMatches) {
    result.compatible = false;
    result.differences.push("serverRevision");
    result.diagnostics.push(...deployment.diagnostics);
  }
  try {
    await validateSe7ePackage(root, record);
  } catch {
    result.compatible = false;
    result.differences.push("packageValidation");
    result.diagnostics.push({
      component: "packageValidation",
      reason: "invalid_or_obsolete",
      action:
        "O pacote não passou na validação local. Remonte com plugin:package e valide com plugin:check na revisão correspondente; não edite hashes ou inventário para contornar a recusa.",
    });
  }
  process.stdout.write(
    JSON.stringify({
      ...result,
      ...(deployment ? { deployment } : {}),
      serverRevision:
        server.serverBuild?.revision && /^[a-f0-9]{40}$/.test(server.serverBuild.revision)
          ? server.serverBuild.revision
          : "unknown",
    }) + "\n",
  );
  if (!result.compatible) process.exitCode = 1;
} catch {
  process.stderr.write(
    JSON.stringify({
      compatible: false,
      stage,
      installedPackageVerified: false,
      action:
        "Confira os argumentos --package=DIRETORIO --capabilities=JSON, a integridade do pacote e a resposta decodificada de obter_capacidades; não inclua credenciais.",
    }) + "\n",
  );
  process.exitCode = 1;
}
