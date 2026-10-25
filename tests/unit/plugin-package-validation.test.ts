import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { packageSe7ePlugin } from "../../src/infrastructure/plugins/package-plugin.js";
import {
  parsePluginPackageArgs,
  parsePluginValidationArgs,
} from "../../src/infrastructure/plugins/package-args.js";
import {
  validateChatGptPackage,
  validateSe7ePackage,
  validateConnectionId,
} from "../../src/infrastructure/plugins/package-validation.js";
import {
  pluginManifestSchema,
  pluginRecordSchema,
  pluginSkillSchema,
} from "../../src/infrastructure/plugins/package-schemas.js";
import {
  assertPluginToolsAvailable,
  PLUGIN_TOOL_CATALOG,
  PLUGIN_DELEGATED_TRAINING_TOOLS,
} from "../../src/infrastructure/plugins/tool-catalog.js";

const publicBaseUrl = "https://synthetic.example.test";
// Synthetic connection ID is used only in disposable package fixtures.
const connectionId = "asdk_app_0123456789abcdef";
const skillPath = "skills/se7e-consulta/SKILL.md";
async function removeFixture(root: string): Promise<void> {
  if (
    !root.startsWith(resolve(tmpdir()) + sep) ||
    !basename(root).startsWith("se7e-plugin-validation-")
  ) {
    throw new Error("Limpeza de fixture fora do alvo recusada.");
  }
  await rm(root, { recursive: true, force: true });
}
async function fixture<T>(
  run: (f: { root: string; source: string; output: string }) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(resolve(tmpdir(), "se7e-plugin-validation-"));
  try {
    const source = resolve(root, "source");
    await copyPluginFixture(resolve("plugins/se7e-chatgpt"), source);
    const output = await packageSe7ePlugin({
      root: source,
      runtime: "legacy",
      outputRoot: resolve(root, "output"),
      publicBaseUrl,
      connectionId,
    });
    return await run({ root, source, output });
  } finally {
    await removeFixture(root);
  }
}

async function copyPluginFixture(source: string, destination: string): Promise<void> {
  await cp(source, destination, {
    recursive: true,
    filter: (p) => !relative(source, p).split(/[\\/]/).includes("build"),
  });
}

describe("validação completa do plugin", () => {
  it.each(["asdk_app_a-B_12", "connector_a-B_12", "templated_apps_a-B_12"])(
    "aceita ID de aplicativo e preserva seu valor: %s",
    async (id) =>
      fixture(async ({ root }) => {
        expect(validateConnectionId(id)).toBe(id);
        const output = await packageSe7ePlugin({
          root: resolve("plugins/se7e-persona-v2"),
          runtime: "persona-v2",
          outputRoot: resolve(root, "app-id"),
          publicBaseUrl,
          connectionId: id,
        });
        expect(JSON.parse(await readFile(resolve(output, ".app.json"), "utf8"))).toEqual({
          apps: { se7e: { id, required: true } },
        });
        await validateSe7ePackage(output, {
          runtime: "persona-v2",
          variant: "chatgpt",
          publicBaseUrl,
          connectionId: id,
        });
      }),
  );
  it.each([
    undefined,
    "",
    "plugin_asdk_app_0123456789abcdef",
    "asdk_app_",
    "connector_-abc",
    "templated_apps_/abc",
    "asdk_app_abc def",
    "asdk_app_placeholder",
    "https://example.test/app",
  ])("recusa ID de plugin, vazio, fictício ou malformado: %s", (id) => {
    expect(() => validateConnectionId(id)).toThrow("identificador real");
  });
  it("ancestral build não elimina a origem da fixture nem inclui artefatos gerados", async () =>
    fixture(async ({ root, source }) => {
      const nested = resolve(root, "build", "plugin-source");
      await copyPluginFixture(source, nested);
      await mkdir(resolve(nested, "build"));
      await writeFile(resolve(nested, "build", "generated.txt"), "fixture only");
      const copied = resolve(root, "copied");
      await copyPluginFixture(nested, copied);
      const output = await packageSe7ePlugin({
        root: copied,
        runtime: "legacy",
        outputRoot: resolve(root, "nested-output"),
        publicBaseUrl,
        connectionId,
      });
      await validateChatGptPackage(output, connectionId, publicBaseUrl);
      await expect(lstat(resolve(copied, "build"))).rejects.toMatchObject({ code: "ENOENT" });
    }));
  it("treinamento delegado é condicional sem dispensar o catálogo básico", () => {
    const tools = PLUGIN_TOOL_CATALOG["persona-v2"].filter(
      (tool) => !PLUGIN_DELEGATED_TRAINING_TOOLS.some((optional) => optional === tool),
    );
    expect(() => assertPluginToolsAvailable("persona-v2", tools)).not.toThrow();
    expect(() =>
      assertPluginToolsAvailable(
        "persona-v2",
        tools.filter((tool) => tool !== "consultar_dados"),
      ),
    ).toThrow();
    expect(PLUGIN_TOOL_CATALOG.legacy).not.toContain("editar_caso_skill");
  });
  it("gera identidade oficial, inventário completo e hashes verificáveis", async () =>
    fixture(async ({ output }) => {
      await validateChatGptPackage(output, connectionId, publicBaseUrl);
      const manifest = JSON.parse(await readFile(resolve(output, "plugin.json"), "utf8"));
      expect(manifest.extensions["com.openai"].interface).toMatchObject({
        shortDescription: "Dados da persona Se7e",
        logo: "assets/se7e-512.png",
        composerIcon: "assets/se7e-192.png",
      });
      expect(await readFile(resolve(output, "assets/se7e-192.png"))).toEqual(
        await readFile("web/public/icon-192.png"),
      );
      const record = pluginRecordSchema.parse(
        JSON.parse(await readFile(resolve(output, "se7e-package.json"), "utf8")),
      );
      expect(record.runtime).toBe("legacy");
      expect(record.files.some((f: { path: string }) => f.path === skillPath)).toBe(true);
      expect(record.files.some((f: { path: string }) => f.path === "se7e-package.json")).toBe(
        false,
      );
    }));

  it.each([
    "",
    "---\nname: se7e-consulta\n---\n",
    "---\nname: [broken\n---\nTexto",
    "---\nname: se7e-consulta\nname: duplicate\n---\nTexto",
  ])("recusa skill vazia ou YAML inválido: %s", async (text) =>
    fixture(async ({ output }) => {
      await writeFile(resolve(output, skillPath), text);
      await expect(validateChatGptPackage(output, connectionId, publicBaseUrl)).rejects.toThrow();
    }),
  );
  it.each([
    ["nome", (s: string) => s.replace("name: se7e-consulta", "name: outra-skill")],
    ["geração", (s: string) => s.replace("runtime: legacy", "runtime: persona-v2")],
    ["ferramenta inexistente", (s: string) => s + "\nChame `ferramenta_inventada`.\n"],
    ["referência ausente", (s: string) => s + "\n[Guia](references/ausente.md)\n"],
    ["referência externa ao pacote", (s: string) => s + "\n[Guia](../../../../outside.md)\n"],
    [
      "segredo",
      (s: string) => s + "\nAuthorization: Bearer synthetic-token-should-never-be-packaged\n",
    ],
    ["alteração sem novo inventário", (s: string) => s + "\nTexto alterado.\n"],
  ])("recusa %s", async (_name, change) =>
    fixture(async ({ output }) => {
      await writeFile(
        resolve(output, skillPath),
        change(await readFile(resolve(output, skillPath), "utf8")),
      );
      await expect(validateChatGptPackage(output, connectionId, publicBaseUrl)).rejects.toThrow();
    }),
  );
  it.each(["tool-catalog.json", "assets/se7e-192.png"])(
    "recusa arquivo alterado ou ausente: %s",
    async (path) =>
      fixture(async ({ output }) => {
        await rm(resolve(output, path));
        await expect(validateChatGptPackage(output, connectionId, publicBaseUrl)).rejects.toThrow();
      }),
  );
  it.each(["description", "version"])("valida campo do manifesto: %s", async (field) =>
    fixture(async ({ output }) => {
      const manifest = JSON.parse(await readFile(resolve(output, "plugin.json"), "utf8"));
      if (field === "description") {
        manifest.extensions["com.openai"].interface.shortDescription = "a".repeat(31);
      } else {
        manifest.version = "01.2.3";
      }
      await writeFile(resolve(output, "plugin.json"), JSON.stringify(manifest));
      await expect(validateChatGptPackage(output, connectionId, publicBaseUrl)).rejects.toThrow();
    }),
  );
  it("recusa arquivos de ambiente, credenciais e links simbólicos", async () =>
    fixture(async ({ root, output }) => {
      await writeFile(resolve(output, ".env"), "SECRET=synthetic");
      await expect(validateChatGptPackage(output, connectionId, publicBaseUrl)).rejects.toThrow(
        "permitido",
      );
      await rm(resolve(output, ".env"));
      await symlink(resolve(root, "source"), resolve(output, "skills/linked"), "junction");
      expect((await lstat(resolve(output, "skills/linked"))).isSymbolicLink()).toBe(true);
      await expect(validateChatGptPackage(output, connectionId, publicBaseUrl)).rejects.toThrow(
        "simbólicos",
      );
    }));
  it("não disponibiliza artefato final quando a origem é inválida", async () =>
    fixture(async ({ root, source }) => {
      await writeFile(resolve(source, skillPath), "");
      const outputRoot = resolve(root, "invalid");
      await expect(
        packageSe7ePlugin({
          root: source,
          runtime: "legacy",
          outputRoot,
          publicBaseUrl,
          connectionId,
        }),
      ).rejects.toThrow();
      await expect(lstat(resolve(outputRoot, "legacy/chatgpt/se7e"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    }));
  it("serializa montagens concorrentes sem sobrescrita", async () =>
    fixture(async ({ root, source }) => {
      const input = {
        root: source,
        runtime: "legacy" as const,
        outputRoot: resolve(root, "concurrent"),
        publicBaseUrl,
        connectionId,
      };
      const results = await Promise.allSettled([
        packageSe7ePlugin(input),
        packageSe7ePlugin(input),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(await readdir(resolve(root, "concurrent/legacy/chatgpt"))).toEqual(["se7e"]);
    }));
  it("isola candidatos v2 portátil e ChatGPT com conexão explícita", async () =>
    fixture(async ({ root }) => {
      const input = {
        root: resolve("plugins/se7e-persona-v2"),
        runtime: "persona-v2" as const,
        outputRoot: resolve(root, "v2"),
        publicBaseUrl,
      };
      const output = await packageSe7ePlugin({ ...input, portable: true });
      await validateSe7ePackage(output, {
        runtime: "persona-v2",
        variant: "portable",
        publicBaseUrl,
      });
      expect(
        JSON.parse(await readFile(resolve(output, "mcp.json"), "utf8")).mcpServers.se7e.url,
      ).toBe(`${publicBaseUrl}/mcp`);
      await expect(validateChatGptPackage(output, connectionId, publicBaseUrl)).rejects.toThrow(
        "outra geração",
      );
      const chatgpt = await packageSe7ePlugin({ ...input, connectionId });
      await validateSe7ePackage(chatgpt, {
        runtime: "persona-v2",
        variant: "chatgpt",
        publicBaseUrl,
        connectionId,
      });
      expect(
        JSON.parse(await readFile(resolve(chatgpt, "se7e-package.json"), "utf8")).resource,
      ).toBe(`${publicBaseUrl}/mcp/chatgpt`);
      await expect(
        packageSe7ePlugin({ ...input, runtime: "legacy", portable: true }),
      ).rejects.toThrow("geração");
    }));
  it("catálogo exige todas as ferramentas citadas, sem conceder autoridade", () => {
    for (const runtime of ["legacy", "persona-v2"] as const) {
      expect(() => assertPluginToolsAvailable(runtime, PLUGIN_TOOL_CATALOG[runtime])).not.toThrow();
      expect(() =>
        assertPluginToolsAvailable(runtime, PLUGIN_TOOL_CATALOG[runtime].slice(1)),
      ).toThrow("incompatível");
    }
  });
  it("schemas locais versionados correspondem aos validadores executados", async () => {
    for (const [name, schema] of Object.entries({
      manifest: pluginManifestSchema,
      skill: pluginSkillSchema,
      record: pluginRecordSchema,
    })) {
      const pinned = JSON.parse(
        await readFile(`contracts/plugins/se7e-${name}-v1.schema.json`, "utf8"),
      );
      expect(pinned).toEqual(z.toJSONSchema(schema));
    }
  });
  it("CLI de verificação exige pacote único e não aceita destino de montagem", () => {
    const args = ["--runtime=persona-v2", "--portable"];
    expect(() => parsePluginValidationArgs(args, publicBaseUrl)).toThrow();
    expect(() =>
      parsePluginValidationArgs([...args, "--package=a", "--package=b"], publicBaseUrl),
    ).toThrow();
    expect(() =>
      parsePluginValidationArgs([...args, "--package=a", "--output=b"], publicBaseUrl),
    ).toThrow();
    expect(
      parsePluginValidationArgs([...args, "--package=candidate/se7e"], publicBaseUrl),
    ).toMatchObject({
      root: "candidate/se7e",
      input: { runtime: "persona-v2", portable: true, publicBaseUrl },
    });
  });
  it("CLI exige geração explícita e não aceita parâmetros duplicados ou misturados", () => {
    expect(() => parsePluginPackageArgs(["--portable"], publicBaseUrl)).toThrow();
    expect(() =>
      parsePluginPackageArgs(
        ["--runtime=legacy", "--runtime=persona-v2", "--portable"],
        publicBaseUrl,
      ),
    ).toThrow();
    expect(() =>
      parsePluginPackageArgs(
        ["--runtime=legacy", "--portable", `--connection-id=${connectionId}`],
        publicBaseUrl,
      ),
    ).toThrow();
    expect(() =>
      parsePluginPackageArgs(["--runtime=legacy", "--portable", "--typo=x"], publicBaseUrl),
    ).toThrow();
    expect(
      parsePluginPackageArgs(
        ["--runtime=persona-v2", "--portable", "--output=candidate"],
        publicBaseUrl,
      ),
    ).toMatchObject({
      runtime: "persona-v2",
      portable: true,
      outputRoot: "candidate",
      publicBaseUrl,
    });
  });
});
