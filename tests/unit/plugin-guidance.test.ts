import { expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { packageSe7ePlugin } from "../../src/infrastructure/plugins/package-plugin.js";
import { validateSe7ePackage } from "../../src/infrastructure/plugins/package-validation.js";
import {
  comparePersonaPlugin,
  personaPluginCompatibility,
} from "../../src/infrastructure/plugins/persona-compatibility.js";
import { PERSONA_CONSUMER_GUIDANCE } from "../../src/application/persona-v2/consumer-guidance.js";
import { PERSONA_V2_INSTRUCTIONS } from "../../src/application/persona-v2/runtime-instructions.js";
import {
  pluginInventory,
  readPluginFiles,
} from "../../src/infrastructure/plugins/package-files.js";
import { pluginRecordSchema } from "../../src/infrastructure/plugins/package-schemas.js";
import { execFileSync } from "node:child_process";

async function removeFixture(root: string): Promise<void> {
  const actual = await realpath(root);
  if (
    !actual.startsWith((await realpath(tmpdir())) + sep) ||
    !actual.split(sep).at(-1)?.startsWith("se7e-guidance-")
  )
    throw new Error("Cleanup outside fixture");
  await rm(actual, { recursive: true, force: true });
}

it("compara contrato e variante sem atestar instalação", () => {
  const pkg = personaPluginCompatibility("portable");
  expect(comparePersonaPlugin(pkg, pkg)).toEqual({
    compatible: true,
    differences: [],
    installedPackageVerified: false,
  });
  expect(comparePersonaPlugin(pkg, personaPluginCompatibility("chatgpt")).differences).toContain(
    "variant",
  );
  expect(comparePersonaPlugin(pkg, { ...pkg, instructionsHash: "0".repeat(64) }).compatible).toBe(
    false,
  );
  expect(() => comparePersonaPlugin(pkg, {})).toThrow();
});
it("pacote carrega guia exato do runtime e recusa divergência mesmo com inventário recalculado", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "se7e-guidance-"));
  try {
    const pkg = await packageSe7ePlugin({
      root: resolve("plugins/se7e-persona-v2"),
      runtime: "persona-v2",
      portable: true,
      outputRoot: root,
      publicBaseUrl: "https://fixture.example.test",
    });
    const guide = "skills/se7e-consulta/references/consumer-guide.md";
    expect(await readFile(resolve(pkg, guide), "utf8")).toBe(PERSONA_CONSUMER_GUIDANCE);
    expect(PERSONA_V2_INSTRUCTIONS).toContain(PERSONA_CONSUMER_GUIDANCE);
    const input = {
      runtime: "persona-v2" as const,
      variant: "portable" as const,
      publicBaseUrl: "https://fixture.example.test",
    };
    await validateSe7ePackage(pkg, input);
    const capabilities = resolve(root, "capabilities.json");
    await writeFile(
      capabilities,
      JSON.stringify({
        pluginCompatibility: personaPluginCompatibility("portable"),
        serverBuild: { version: "test", revision: "unknown" },
      }),
    );
    const report = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          resolve("scripts/compare-persona-plugin.ts"),
          `--package=${pkg}`,
          `--capabilities=${capabilities}`,
        ],
        { encoding: "utf8" },
      ),
    ) as unknown;
    expect(report).toMatchObject({
      compatible: true,
      installedPackageVerified: false,
      serverRevision: "unknown",
    });
    await writeFile(resolve(pkg, guide), "Guia desatualizado sem tratamento de autoridade.");
    const record = pluginRecordSchema.parse(
      JSON.parse(await readFile(resolve(pkg, "se7e-package.json"), "utf8")),
    );
    record.files = pluginInventory(await readPluginFiles(pkg));
    await writeFile(resolve(pkg, "se7e-package.json"), JSON.stringify(record));
    await expect(validateSe7ePackage(pkg, input)).rejects.toThrow(/Guia compartilhado/);
  } finally {
    await removeFixture(root);
  }
});
