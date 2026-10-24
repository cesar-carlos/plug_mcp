import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import {
  PLUGIN_SKILL_DIRECTORIES,
  pluginSkillSchema,
  relativePluginPath,
  type PluginRecord,
  type PluginRuntime,
} from "./package-schemas.js";
import { PLUGIN_TOOL_CATALOG } from "./tool-catalog.js";

const MAX_FILES = 128,
  MAX_TOTAL_BYTES = 16 * 1024 * 1024,
  MAX_TEXT_BYTES = 512 * 1024;
const forbidden = /^(?:\.env(?:\..*)?|\.git|node_modules|build|.*\.(?:pem|key|pfx|p12|log))$/i;
export const fileHash = (data: Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");
export const OFFICIAL_PLUGIN_ICONS: Readonly<Record<string, string>> = {
  "assets/se7e-192.png": "1ddb5242b7134d1113e80c713a0e6e1afe40613ddfa2e500d3cde12ce9243516",
  "assets/se7e-512.png": "ca1293cfe8322f95d4617020a610c5197cce0accb55fb4161a9a8ffff45009ae",
};
export const readPluginFiles = async (root: string): Promise<Map<string, Buffer>> => {
  if (!(await lstat(root)).isDirectory() || (await lstat(root)).isSymbolicLink()) {
    throw new Error("Raiz do pacote inválida.");
  }
  const files = new Map<string, Buffer>();
  const seen = new Set<string>();
  let bytes = 0;
  const visit = async (directory: string): Promise<void> => {
    for (const name of (await readdir(resolve(root, directory))).sort()) {
      if (forbidden.test(name)) {
        throw new Error("Arquivo não permitido no pacote.");
      }
      const path = directory ? `${directory}/${name}` : name;
      relativePluginPath.parse(path);
      const key = path.toLowerCase();
      if (seen.has(key)) {
        throw new Error("Caminho duplicado no pacote.");
      }
      seen.add(key);
      if (seen.size > MAX_FILES * 2 || path.split("/").length > 12) {
        throw new Error("Pacote excede o limite de caminhos.");
      }
      const stat = await lstat(resolve(root, path));
      if (stat.isSymbolicLink()) {
        throw new Error("Links simbólicos não são permitidos no pacote.");
      }
      if (stat.isDirectory()) {
        await visit(path);
        continue;
      }
      if (
        !stat.isFile() ||
        files.size >= MAX_FILES ||
        stat.size > (path.endsWith(".png") ? 5 * 1024 * 1024 : MAX_TEXT_BYTES)
      ) {
        throw new Error("Arquivo ou limite de pacote inválido.");
      }
      if (!/\.(?:md|json|png)$/.test(path)) {
        throw new Error("Formato de arquivo não permitido no pacote.");
      }
      bytes += stat.size;
      if (bytes > MAX_TOTAL_BYTES) {
        throw new Error("Pacote excede o limite de bytes.");
      }
      const data = await readFile(resolve(root, path));
      if (data.length !== stat.size) {
        throw new Error("Arquivo mudou durante a leitura.");
      }
      if (!path.endsWith(".png")) {
        const text = data.toString("utf8");
        if (
          text.includes("\uFFFD") ||
          pareceSegredoEmTexto(text) ||
          /\b(?:https?|postgres(?:ql)?):\/\/[^\s/]+:[^\s/]+@/i.test(text)
        ) {
          throw new Error("Conteúdo inválido ou possível segredo no pacote.");
        }
      }
      files.set(path, data);
    }
  };
  await visit("");
  return files;
};

export const pluginInventory = (files: ReadonlyMap<string, Buffer>): PluginRecord["files"] =>
  [...files]
    .filter(([p]) => p !== "se7e-package.json")
    .map(([path, data]) => ({ path, sha256: fileHash(data), bytes: data.length }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

const nonToolTerms = new Set(["client_token", "sql_engine", "plug_server_http", "invalid_payload"]);
export const validatePluginSkills = (
  files: ReadonlyMap<string, Buffer>,
  runtime: PluginRuntime,
): void => {
  const paths = [...files.keys()].filter((p) => /^skills\/[^/]+\/SKILL\.md$/.test(p));
  if (paths.length !== PLUGIN_SKILL_DIRECTORIES.length) {
    throw new Error("Skills obrigatórias ausentes ou adicionais.");
  }
  for (const name of PLUGIN_SKILL_DIRECTORIES) {
    const text = files.get(`skills/${name}/SKILL.md`)?.toString("utf8") ?? "";
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(text);
    if (!match?.[2]?.trim()) {
      throw new Error("Skill vazia ou frontmatter ausente.");
    }
    const document = parseDocument(match[1]!, { uniqueKeys: true });
    if (document.errors.length) {
      throw new Error("Frontmatter YAML inválido.");
    }
    const parsed: unknown = document.toJS({ maxAliasCount: 0 });
    const skill = pluginSkillSchema.parse(parsed);
    if (skill.name !== name || skill.metadata.runtime !== runtime) {
      throw new Error("Nome ou geração da skill divergente.");
    }
    const declared = skill.metadata.tools;
    if (
      new Set(declared).size !== declared.length ||
      declared.some((t) => !PLUGIN_TOOL_CATALOG[runtime].includes(t))
    ) {
      throw new Error("Skill menciona ferramenta indisponível nesta geração.");
    }
    const mentioned = [
      ...match[2].matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)(?:\([^`]*\))?`/g),
    ].map((m) => m[1]!);
    if (
      mentioned.some((t) => !nonToolTerms.has(t) && !declared.includes(t)) ||
      declared.some((t) => !mentioned.includes(t))
    ) {
      throw new Error("Ferramentas citadas e declaradas na skill divergem.");
    }
  }
};

export const validatePluginReferences = (files: ReadonlyMap<string, Buffer>): void => {
  for (const [path, data] of files) {
    if (!path.endsWith(".md")) {
      continue;
    }
    for (const match of data.toString("utf8").matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1]!;
      if (target.startsWith("https://")) {
        const url = new URL(target);
        if (url.username || url.password) {
          throw new Error("Referência externa contém credencial.");
        }
        continue;
      }
      if (target.startsWith("#")) {
        continue;
      }
      const relative = target.split("#")[0]!;
      relativePluginPath.parse(relative);
      const prefix = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
      if (!files.has(`${prefix}${relative}`)) {
        throw new Error("Referência interna ausente ou externa ao pacote.");
      }
    }
  }
};
