import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkDocumentation } from "../../scripts/docs/check.js";
import { validateExample } from "../../scripts/docs/examples.js";
import { parseMarkdown } from "../../scripts/docs/markdown.js";

let root: string;
const fixture = (file: string, content: string): void => {
  const target = join(root, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
};
const check = () => checkDocumentation(root, []);
const codes = () => check().problems.map((p) => p.code);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "se7e-docs-"));
  fixture("AGENTS.md", "# Agentes\n\n[Rule](.cursor/rules/security.mdc)\n");
  fixture(
    ".cursor/rules/security.mdc",
    '---\ndescription: "Segurança"\nalwaysApply: true\n---\n# Segurança\n',
  );
  fixture("README.md", "# Projeto\n");
});
afterEach(() => {
  if (!resolve(root).startsWith(resolve(tmpdir(), "se7e-docs-"))) {
    throw new Error("Fixture fora do diretório temporário esperado.");
  }
  rmSync(root, { recursive: true, force: true });
});

describe("documentation gate", () => {
  it("accepts Unicode/duplicate anchors, references, images and balanced destinations", () => {
    fixture(
      "docs/Guia (novo).md",
      '# Ação e `SQL`\n\n## Repetido\n\n## Repetido\n\n<a id="manual"></a>\n',
    );
    fixture("docs/image.svg", "<svg/>");
    fixture(
      "README.md",
      "[A](<docs/Guia (novo).md#ação-e-sql>)\n[B](docs/Guia%20(novo).md#repetido-1)\n[C][guia]\n![Imagem](docs/image.svg)\n\n[guia]: <docs/Guia (novo).md#manual>\n",
    );
    expect(check().problems).toEqual([]);
  });

  it("ignores code/comments and never fetches external links", () => {
    fixture(
      "README.md",
      "`[inline](missing.md)`\n\n~~~md\n[code](missing.md)\n~~~\n\n<!-- [comment](missing.md) -->\n[web](https://nonexistent.invalid/guide)\n[mail](mailto:example@example.invalid)\n",
    );
    expect(check().problems).toEqual([]);
    fixture(
      "README.md",
      "<!--\n```json\ninvalid ignored JSON\n-->\n`<!-- inline code`\n[web](https://nonexistent.invalid)\n",
    );
    expect(check().problems).toEqual([]);
  });

  it("reports missing paths, case mismatches and missing anchors with locations", () => {
    fixture("docs/guide.md", "# Guia\n");
    fixture(
      "README.md",
      "# Projeto\n[missing](docs/no.md)\n[case](docs/Guide.md)\n[anchor](docs/guide.md#no)\n",
    );
    expect(check().problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "README.md", line: 2, code: "DOC_LINK" }),
        expect.objectContaining({ file: "README.md", line: 3, code: "DOC_LINK" }),
        expect.objectContaining({ file: "README.md", line: 4, code: "DOC_ANCHOR" }),
      ]),
    );
  });

  it("rejects escaping the repository, malformed URLs and undefined references", () => {
    fixture("README.md", "[outside](../outside.md)\n[bad](docs/%ZZ.md)\n[ref][not-defined]\n");
    expect(codes()).toEqual(expect.arrayContaining(["DOC_LINK", "DOC_MARKDOWN"]));
  });

  it("requires real links to every rule and validates frontmatter", () => {
    fixture("AGENTS.md", "# Agentes\n.cursor/rules/security.mdc\n");
    fixture(".cursor/rules/security.mdc", "---\ndescription: Teste\nalwaysApply: maybe\n---\n");
    expect(codes()).toEqual(expect.arrayContaining(["DOC_RULE_INDEX", "DOC_RULE_METADATA"]));
  });

  it("rejects malformed standalone/fenced JSON and unclosed fences", () => {
    fixture("docs/example.json", "{invalid}");
    fixture("README.md", '```json\n{"x":}\n```\n\n~~~json\n{}\n');
    expect(codes().filter((code) => code === "DOC_JSON")).toHaveLength(2);
    expect(codes()).toContain("DOC_MARKDOWN");
  });

  it("rejects unknown schemas and requires mandatory examples even if their tags disappear", () => {
    fixture("README.md", "```json docs:unknown\n{}\n```\n");
    const report = checkDocumentation(root, [
      { file: "README.md", kind: "source-query", location: "block" },
    ]);
    expect(report.problems.map((p) => p.code)).toEqual(
      expect.arrayContaining(["DOC_SCHEMA", "DOC_EXAMPLE_MISSING"]),
    );
  });

  it("rejects legacy pagination in a v2 example using the current runtime schema", () => {
    fixture("README.md", '```json docs:source-query\n{"options":{"page":1,"page_size":10}}\n```\n');
    expect(codes()).toContain("DOC_SCHEMA");
    fixture("README.md", '```json docs:source-query\n{"options":{"page":1,"pageSize":10}}\n```\n');
    expect(check().problems).toEqual([]);
  });

  it("requires schema registration for new standalone v2 examples", () => {
    fixture("docs/persona-v2/examples/new.json", "{}");
    expect(codes()).toContain("DOC_SCHEMA");
  });

  it("requires documentation for every manifest gate without changing release authority", () => {
    const manifest = '{"ready":false,"requiredGates":["identity","cutover"],"completedGates":[]}';
    fixture("contracts/persona-v2-release.json", manifest);
    fixture("docs/persona-v2/acceptance.md", "# Aceite\n\n## identity\n");
    expect(codes()).toContain("DOC_ACCEPTANCE");
    fixture("docs/persona-v2/acceptance.md", '# Aceite\n\n## identity\n<a id="cutover"></a>\n');
    expect(codes()).toContain("DOC_ACCEPTANCE");
    fixture("docs/persona-v2/acceptance.md", "# Aceite\n\n## identity\n\n## cutover\n");
    expect(check().acceptanceGates).toBe(2);
    expect(check().problems).toEqual([]);
    expect(readFileSync(join(root, "contracts/persona-v2-release.json"), "utf8")).toBe(manifest);
  });
});

describe("runtime contracts for documentation examples", () => {
  it("compiles operation input and refuses missing parameters or uncovered adaptive cases", () => {
    const file: {
      cases: { required: boolean; content: unknown }[];
      prepareInput: { parameters: Record<string, unknown> };
    } = JSON.parse(readFileSync("docs/persona-v2/examples/sql-operation-adaptive.json", "utf8"));
    expect(validateExample("operation-bundle", file)).toBeGreaterThan(0);
    const missing = structuredClone(file);
    delete missing.prepareInput.parameters.version;
    expect(() => validateExample("operation-bundle", missing)).toThrow();
    file.cases = file.cases.map((c) => ({ ...c, required: false }));
    expect(() => validateExample("operation-bundle", file)).toThrow();
  });

  it("validates permissions with the same schema used by administration", () => {
    const file = JSON.parse(readFileSync("docs/persona-v2/examples/permissions.json", "utf8"));
    expect(validateExample("permissions", file)).toBe(1);
    file.skills[0].effects = ["ddl"];
    expect(() => validateExample("permissions", file)).toThrow();
  });

  it("does not turn fake code headings into linkable anchors", () => {
    const doc = parseMarkdown('# Real\n\n```md\n# Fake\n```\n`<a id="fake"></a>`\n');
    expect([...doc.anchors]).toEqual(["real"]);
    const json = '{"text":"<!-- preserve in code -->"}';
    expect(parseMarkdown("\n```json\n" + json + "\n```\n").blocks[0]?.content).toBe(json);
  });

  it("handles setext headings and titles, and reports unfinished links", () => {
    const doc = parseMarkdown('Título\n---\n\n[link](guide.md "título")\n[broken](guide.md\n');
    expect([...doc.anchors]).toEqual(["título"]);
    expect(doc.links).toEqual([{ target: "guide.md", line: 4 }]);
    expect(doc.problems).toEqual([expect.objectContaining({ line: 5 })]);
  });
});
