import { expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { packageSe7ePlugin } from "../../src/infrastructure/plugins/package-plugin.js";
import { validateSe7ePackage } from "../../src/infrastructure/plugins/package-validation.js";
import {
  comparePersonaPlugin,
  personaPluginCompatibility,
  diagnosePersonaPlugin,
} from "../../src/infrastructure/plugins/persona-compatibility.js";
import { PERSONA_CONSUMER_GUIDANCE } from "../../src/application/persona-v2/consumer-guidance.js";
import { PERSONA_V2_INSTRUCTIONS } from "../../src/application/persona-v2/runtime-instructions.js";
import {
  pluginInventory,
  readPluginFiles,
} from "../../src/infrastructure/plugins/package-files.js";
import { pluginRecordSchema } from "../../src/infrastructure/plugins/package-schemas.js";
import { execFileSync, spawnSync } from "node:child_process";
import { trainingManifest } from "../../src/application/persona-v2/training-topics.js";
import { canonicalJson } from "../../src/domain/persona-v2/catalog.js";
import { createHash } from "node:crypto";

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
it("diagnostica componentes divergentes e contratos antigos sem expor valores livres", () => {
  const pkg = personaPluginCompatibility("portable");
  const changed = diagnosePersonaPlugin(pkg, { ...pkg, trainingTopicsHash: "0".repeat(64) });
  expect(changed).toMatchObject({
    compatible: false,
    differences: ["trainingTopicsHash"],
    installedPackageVerified: false,
  });
  expect(changed.diagnostics[0]!.action).toContain("plugin:package");
  expect(changed.diagnostics[0]!.action).toContain("não atualiza a instalação");
  const invalid = diagnosePersonaPlugin({ ...pkg, format: "old", secret: "private-value" }, pkg);
  expect(invalid.compatible).toBe(false);
  expect(invalid.differences).toContain("format");
  expect(JSON.stringify(invalid)).not.toContain("private-value");
  expect(JSON.stringify(invalid)).not.toContain("secret");
});
it("identifica o tópico alterado somente após conferir os hashes do manifesto", () => {
  const pkg = personaPluginCompatibility("portable");
  const before = trainingManifest(),
    after = trainingManifest();
  after.topics.find((item) => item.topic === "sql")!.contentHash = "0".repeat(64);
  const server = {
    ...pkg,
    trainingTopicsHash: createHash("sha256").update(canonicalJson(after.topics)).digest("hex"),
  };
  expect(diagnosePersonaPlugin(pkg, server, before, after).differences).toEqual([
    "trainingTopicsHash",
    "trainingTopics.sql",
  ]);
  expect(diagnosePersonaPlugin(pkg, pkg, before, after).differences).toEqual(["trainingManifest"]);
});
it("vincula base e todos os tópicos, recusando contratos antigos sem hashes", () => {
  const pkg = personaPluginCompatibility("portable");
  expect(pkg.trainingBaseHash).toBe(trainingManifest().baseHash);
  expect(pkg.trainingTopicsHash).toBe(
    createHash("sha256").update(canonicalJson(trainingManifest().topics)).digest("hex"),
  );
  for (const field of ["trainingBaseHash", "trainingTopicsHash"] as const) {
    expect(comparePersonaPlugin(pkg, { ...pkg, [field]: "0".repeat(64) })).toMatchObject({
      compatible: false,
      differences: [field],
      installedPackageVerified: false,
    });
    const missing = { ...pkg } as Record<string, unknown>;
    delete missing[field];
    expect(() => comparePersonaPlugin(missing, pkg)).toThrow();
  }
  expect(() =>
    comparePersonaPlugin({ ...pkg, format: "persona-plugin-compatibility-v1" }, pkg),
  ).toThrow();
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
    const skill = await readFile(resolve(pkg, "skills/se7e-consulta/SKILL.md"), "utf8");
    expect(skill).toContain("reportar_erro_interacao,");
    expect(skill).toContain("error.data");
    expect(skill).toContain("reportId");
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
        training: trainingManifest(),
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
    await writeFile(
      capabilities,
      JSON.stringify({
        pluginCompatibility: {
          ...personaPluginCompatibility("portable"),
          trainingTopicsHash: "0".repeat(64),
        },
      }),
    );
    const mismatch = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("scripts/compare-persona-plugin.ts"),
        `--package=${pkg}`,
        `--capabilities=${capabilities}`,
      ],
      { encoding: "utf8" },
    );
    expect(mismatch.status).toBe(1);
    expect(JSON.parse(mismatch.stdout)).toMatchObject({
      compatible: false,
      differences: ["trainingTopicsHash"],
      diagnostics: [
        expect.objectContaining({
          component: "trainingTopicsHash",
          action: expect.stringContaining("plugin:package"),
        }),
      ],
      installedPackageVerified: false,
    });
    const compatibilityPath = resolve(pkg, "compatibility.json");
    const originalCompatibility = await readFile(compatibilityPath, "utf8");
    const recordPath = resolve(pkg, "se7e-package.json");
    const originalRecord = await readFile(recordPath, "utf8");
    await writeFile(
      compatibilityPath,
      JSON.stringify({
        ...personaPluginCompatibility("portable"),
        trainingTopicsHash: "0".repeat(64),
      }),
    );
    const tamperedRecord = pluginRecordSchema.parse(JSON.parse(originalRecord));
    tamperedRecord.files = pluginInventory(await readPluginFiles(pkg));
    await writeFile(recordPath, JSON.stringify(tamperedRecord));
    await expect(validateSe7ePackage(pkg, input)).rejects.toThrow(/Contrato de instruções/);
    await writeFile(compatibilityPath, originalCompatibility);
    await writeFile(recordPath, originalRecord);
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
