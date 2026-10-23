import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { parseMarkdown, type MarkdownDocument } from "./markdown.js";
import { requiredExamples, validateExample, type RequiredExample } from "./examples.js";

export interface DocProblem {
  file: string;
  line: number;
  code: string;
  message: string;
}
export interface DocsReport {
  files: number;
  links: number;
  rules: number;
  jsonExamples: number;
  schemaExamples: number;
  acceptanceGates: number;
  problems: DocProblem[];
}
const unix = (file: string): string => file.split(sep).join("/");
const within = (root: string, target: string): boolean => {
  const path = relative(root, target);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};
const walk = (root: string, directory: string): string[] => {
  const full = resolve(root, directory);
  if (!existsSync(full)) {
    return [];
  }
  return readdirSync(full, { withFileTypes: true })
    .flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      // Do not follow symlinks out of the documentation tree.
      return entry.isDirectory() ? walk(root, path) : entry.isFile() ? [path] : [];
    })
    .sort();
};
const exactCase = (root: string, target: string): boolean => {
  let current = root;
  for (const name of relative(root, target).split(sep).filter(Boolean)) {
    if (!readdirSync(current).includes(name)) {
      return false;
    }
    current = resolve(current, name);
  }
  return true;
};

/** Repository checks are read-only and offline. External URLs are intentionally not fetched. */
export function checkDocumentation(
  root: string,
  examples: readonly RequiredExample[] = requiredExamples,
): DocsReport {
  root = realpathSync(root);
  const report: DocsReport = {
    files: 0,
    links: 0,
    rules: 0,
    jsonExamples: 0,
    schemaExamples: 0,
    acceptanceGates: 0,
    problems: [],
  };
  const problem = (file: string, line: number, code: string, message: string): void => {
    report.problems.push({ file, line, code, message });
  };
  const rules = walk(root, ".cursor/rules").filter((file) => file.endsWith(".mdc"));
  const documents = [
    ...new Set([
      ...readdirSync(root).filter(
        (file) => file.endsWith(".md") && statSync(resolve(root, file)).isFile(),
      ),
      ...walk(root, "docs").filter((file) => file.endsWith(".md")),
      ...rules,
    ]),
  ].sort();
  const parsed = new Map<string, MarkdownDocument>();
  const parse = (file: string): MarkdownDocument => {
    let doc = parsed.get(file);
    if (!doc) {
      doc = parseMarkdown(readFileSync(resolve(root, file), "utf8"));
      parsed.set(file, doc);
    }
    return doc;
  };
  const seenExamples = new Set<string>();
  const validate = (file: string, line: number, kind: string, value: unknown): void => {
    seenExamples.add(`${file}:${kind}`);
    try {
      report.schemaExamples += validateExample(kind, value);
    } catch (error) {
      const fields =
        error instanceof z.ZodError
          ? error.issues
              .slice(0, 3)
              .map((issue) => issue.path.map(String).join(".") || "$")
              .join(", ")
          : "campos, tipos ou referências treinadas";
      problem(file, line, "DOC_SCHEMA", `Exemplo incompatível com o contrato ${kind}: ${fields}.`);
    }
  };
  const readJson = (file: string, line: number, content: string): { value: unknown } | null => {
    try {
      const value: unknown = JSON.parse(content);
      report.jsonExamples++;
      return { value };
    } catch {
      problem(file, line, "DOC_JSON", "Exemplo JSON inválido.");
      return null;
    }
  };
  const agentRuleLinks = new Set<string>();
  for (const file of documents) {
    report.files++;
    const doc = parse(file);
    for (const issue of doc.problems) {
      problem(file, issue.line, "DOC_MARKDOWN", issue.message);
    }
    for (const link of doc.links) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(link.target) && !/^[a-z]:[\\/]/i.test(link.target)) {
        continue;
      }
      report.links++;
      try {
        const [pathWithQuery = "", fragment] = link.target.split("#");
        const path = decodeURIComponent(pathWithQuery.split("?")[0] ?? "");
        const target = path
          ? resolve(
              path.startsWith("/") ? root : dirname(resolve(root, file)),
              path.replace(/^\//, ""),
            )
          : resolve(root, file);
        if (!within(root, target)) {
          problem(file, link.line, "DOC_LINK", "Link local fora do repositório.");
          continue;
        }
        if (
          !existsSync(target) ||
          !within(root, realpathSync(target)) ||
          !exactCase(root, target)
        ) {
          problem(
            file,
            link.line,
            "DOC_LINK",
            "Destino local ausente, com caixa divergente ou fora do repositório.",
          );
          continue;
        }
        const targetFile = unix(relative(root, target));
        if (file === "AGENTS.md") {
          agentRuleLinks.add(targetFile);
        }
        if (
          fragment &&
          [".md", ".mdc"].includes(extname(target)) &&
          !parse(targetFile).anchors.has(decodeURIComponent(fragment))
        ) {
          problem(file, link.line, "DOC_ANCHOR", `Âncora ausente em ${targetFile}.`);
        }
      } catch {
        problem(file, link.line, "DOC_LINK", "Link local malformado ou ilegível.");
      }
    }
    for (const block of doc.blocks) {
      const [language, ...options] = block.info.split(/\s+/);
      if (language !== "json") {
        continue;
      }
      const json = readJson(file, block.line, block.content);
      const contract = options.find((option) => option.startsWith("docs:"));
      if (contract && json) {
        validate(file, block.line, contract.slice(5), json.value);
      }
    }
  }
  if (!documents.includes("AGENTS.md")) {
    problem("AGENTS.md", 1, "DOC_RULE_INDEX", "Índice AGENTS.md ausente.");
  }
  for (const rule of rules) {
    report.rules++;
    if (!agentRuleLinks.has(rule)) {
      problem("AGENTS.md", 1, "DOC_RULE_INDEX", `Rule sem link no índice: ${rule}.`);
    }
    const content = readFileSync(resolve(root, rule), "utf8");
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1];
    if (
      !frontmatter ||
      !/^description:\s*\S.+$/m.test(frontmatter) ||
      !/^alwaysApply:\s*(true|false)\s*$/m.test(frontmatter)
    ) {
      problem(
        rule,
        1,
        "DOC_RULE_METADATA",
        "Frontmatter exige description e alwaysApply booleano.",
      );
    }
  }
  for (const file of walk(root, "docs").filter((name) => name.endsWith(".json"))) {
    const json = readJson(file, 1, readFileSync(resolve(root, file), "utf8"));
    const contract = examples.find(
      (example) => example.file === file && example.location === "file",
    );
    if (file.startsWith("docs/persona-v2/examples/") && !contract) {
      problem(
        file,
        1,
        "DOC_SCHEMA",
        "Exemplo v2 sem contrato registrado em scripts/docs/examples.ts.",
      );
    }
    if (json && contract) {
      validate(file, 1, contract.kind, json.value);
    }
  }
  for (const example of examples) {
    if (!seenExamples.has(`${example.file}:${example.kind}`)) {
      problem(
        example.file,
        1,
        "DOC_EXAMPLE_MISSING",
        `Exemplo obrigatório ausente ou sem marcador docs:${example.kind}.`,
      );
    }
  }
  const manifest = resolve(root, "contracts/persona-v2-release.json");
  if (existsSync(manifest)) {
    const file = "docs/persona-v2/acceptance.md";
    try {
      const release = z
        .object({ requiredGates: z.array(z.string().min(1)).min(1) })
        .parse(JSON.parse(readFileSync(manifest, "utf8")));
      const matrix = parse(file);
      for (const gate of release.requiredGates) {
        if (!matrix.headings.some((heading) => heading.level === 2 && heading.slug === gate)) {
          problem(file, 1, "DOC_ACCEPTANCE", `Gate sem seção na matriz: ${gate}.`);
        } else {
          report.acceptanceGates++;
        }
      }
    } catch {
      problem(file, 1, "DOC_ACCEPTANCE", "Manifesto ou matriz de aceite ausente/inválido.");
    }
  }
  return report;
}
