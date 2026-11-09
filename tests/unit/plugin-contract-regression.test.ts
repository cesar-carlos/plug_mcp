import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { afterEach, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { parsePluginPackageArgs } from "../../src/infrastructure/plugins/package-args.js";
import { personaPluginCompatibility } from "../../src/infrastructure/plugins/persona-compatibility.js";
import { packageSe7ePlugin } from "../../src/infrastructure/plugins/package-plugin.js";
import { validateSe7ePackage } from "../../src/infrastructure/plugins/package-validation.js";
import {
  pluginInventory,
  readPluginFiles,
} from "../../src/infrastructure/plugins/package-files.js";

const roots: string[] = [];
const publicBaseUrl = "https://synthetic.example.test";
const connectionId = "asdk_app_0123456789abcdef";
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!root.startsWith(resolve(tmpdir()) + sep + "se7e-contract-regression-")) {
      throw new Error("Limpeza fora da fixture recusada.");
    }
    await rm(root, { recursive: true, force: true });
  }
});
it.each(["extra", "array", "generation", "variant", "hash"])(
  "recusa adulteração com inventário recalculado: %s",
  async (kind) => {
    const output = await packageSe7ePlugin(await fixture());
    const path = resolve(output, "tool-catalog.json");
    const catalog = JSON.parse(await readFile(path, "utf8")) as {
      tools: string[];
      runtime: string;
      extra?: boolean;
    };
    if (kind === "extra") catalog.extra = true;
    if (kind === "array") catalog.tools.reverse();
    if (kind === "generation") catalog.runtime = "legacy";
    await writeFile(path, JSON.stringify(catalog));
    const recordPath = resolve(output, "se7e-package.json");
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.files = pluginInventory(await readPluginFiles(output));
    if (kind === "variant") record.variant = "chatgpt";
    if (kind === "hash") record.files[0].sha256 = "0".repeat(64);
    await writeFile(recordPath, JSON.stringify(record));
    await expect(
      validateSe7ePackage(output, { runtime: "persona-v2", variant: "portable", publicBaseUrl }),
    ).rejects.toThrow();
  },
);
it.each([
  "http://synthetic.test",
  "https://user:secret@synthetic.test",
  "https://synthetic.test/path",
])("CLI e API recusam a mesma configuração: %s", async (url) => {
  expect(() =>
    parsePluginPackageArgs(["--runtime=persona-v2", "--portable", `--public-base-url=${url}`]),
  ).toThrow();
  await expect(
    packageSe7ePlugin({ ...(await fixture()), publicBaseUrl: url }),
  ).rejects.toMatchObject({ code: "INVALID_CONFIGURATION" });
});
it("CLI pós-deploy exige SHA esperado e preserva distinção entre snapshot e servidor vivo", async () => {
  const setup = await fixture();
  const output = await packageSe7ePlugin(setup);
  const capabilities = resolve(setup.outputRoot, "capabilities.json");
  const expected = "a".repeat(40);
  for (const revision of [expected, "b".repeat(40), "unknown"]) {
    await writeFile(
      capabilities,
      JSON.stringify({
        pluginCompatibility: personaPluginCompatibility("portable"),
        serverBuild: { version: "fixture", revision },
      }),
    );
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/compare-persona-plugin.ts",
        `--package=${output}`,
        `--capabilities=${capabilities}`,
        `--expected-revision=${expected}`,
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(revision === expected ? 0 : 1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      compatible: revision === expected,
      installedPackageVerified: false,
      deployment: { revisionMatches: revision === expected, liveServerVerified: false },
    });
  }
});
it("CLI retorna etapa e categoria segura para configuração rejeitada", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/check-plugin-package.ts",
      "--package=synthetic-secret",
      "--runtime=persona-v2",
      "--portable",
      "--connection-id=synthetic-secret",
      `--public-base-url=${publicBaseUrl}`,
    ],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stderr)).toMatchObject({
    stage: "arguments",
    code: "INVALID_CONFIGURATION",
    installedPackageVerified: false,
  });
  expect(result.stderr).not.toContain("synthetic-secret");
});
async function fixture() {
  const outputRoot = await mkdtemp(resolve(tmpdir(), "se7e-contract-regression-"));
  roots.push(outputRoot);
  return {
    root: resolve("plugins/se7e-persona-v2"),
    runtime: "persona-v2" as const,
    portable: true,
    publicBaseUrl,
    outputRoot,
  };
}
it("comparação não ecoa URL com segredo de inventário recusado", async () => {
  const setup = await fixture();
  const output = await packageSe7ePlugin(setup);
  const recordPath = resolve(output, "se7e-package.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  record.resource = "https://user:synthetic-private-secret@synthetic.example.test/mcp";
  await writeFile(recordPath, JSON.stringify(record));
  const capabilities = resolve(setup.outputRoot, "capabilities.json");
  await writeFile(
    capabilities,
    JSON.stringify({ pluginCompatibility: personaPluginCompatibility("portable") }),
  );
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/compare-persona-plugin.ts",
      `--package=${output}`,
      `--capabilities=${capabilities}`,
    ],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({
    compatible: false,
    differences: ["packageValidation"],
  });
  expect(result.stdout + result.stderr).not.toContain("synthetic-private-secret");
  expect(JSON.parse(result.stdout)).not.toHaveProperty("resource");
});
it("recusa conexão ChatGPT na API de montagem portátil", async () => {
  await expect(packageSe7ePlugin({ ...(await fixture()), connectionId })).rejects.toThrow(
    "portátil",
  );
});
it("recusa conexão ChatGPT na API de validação portátil", async () => {
  const output = await packageSe7ePlugin(await fixture());
  await expect(
    validateSe7ePackage(output, {
      runtime: "persona-v2",
      variant: "portable",
      publicBaseUrl,
      connectionId,
    }),
  ).rejects.toThrow("portátil");
});
it("aceita chaves JSON reordenadas, preservando a recusa de hashes alterados", async () => {
  const output = await packageSe7ePlugin(await fixture());
  const input = { runtime: "persona-v2" as const, variant: "portable" as const, publicBaseUrl };
  for (const name of ["compatibility.json", "tool-catalog.json"]) {
    const path = resolve(output, name);
    const data = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify(Object.fromEntries(Object.entries(data).reverse())));
  }
  const recordPath = resolve(output, "se7e-package.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  record.files = pluginInventory(await readPluginFiles(output)).map((entry) =>
    Object.fromEntries(Object.entries(entry).reverse()),
  );
  await writeFile(recordPath, JSON.stringify(record));
  await expect(validateSe7ePackage(output, input)).resolves.toBeUndefined();
  const path = resolve(output, "compatibility.json");
  const compatibility = JSON.parse(await readFile(path, "utf8"));
  compatibility.trainingBaseHash = "0".repeat(64);
  await writeFile(path, JSON.stringify(compatibility));
  record.files = pluginInventory(await readPluginFiles(output));
  await writeFile(recordPath, JSON.stringify(record));
  await expect(validateSe7ePackage(output, input)).rejects.toThrow("instruções");
});
