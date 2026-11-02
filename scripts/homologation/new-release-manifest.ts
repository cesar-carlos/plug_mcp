import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { externalRunManifestSchema } from "../../src/domain/persona-v2/external-run.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const revision = (directory: string) =>
  execFileSync("git", ["-C", directory, "rev-parse", "--verify", "HEAD^{commit}"], {
    encoding: "utf8",
  }).trim();

async function main() {
  const [kind, output, ...args] = process.argv.slice(2);
  if (!output) throw new Error("Output required");
  let manifest;
  if (kind === "ai" && args.length === 2) {
    const cases = JSON.parse(
      await readFile(resolve(root, "tests/fixtures/evaluation/persona-release-cases.json"), "utf8"),
    );
    manifest = {
      generation: "persona-v2",
      isolatedFixture: true,
      datasetAuthorization: "synthetic",
      trials: 3,
      candidate: { mcp: revision(root), hub: revision(args[0]!), agent: revision(args[1]!) },
      cases,
    };
  } else if (kind === "external" && args.length === 1) {
    const binding = externalRunManifestSchema
      .omit({ runId: true })
      .parse(JSON.parse(await readFile(resolve(args[0]!), "utf8")));
    manifest = externalRunManifestSchema.parse({ ...binding, runId: randomUUID() });
  } else {
    throw new Error("Invalid arguments");
  }
  await writeFile(resolve(output), JSON.stringify(manifest, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
}

void main().catch(() => {
  console.error(
    "Falha ao criar manifesto. Confira argumentos, vínculo da fixture e saída inédita.",
  );
  process.exitCode = 1;
});
