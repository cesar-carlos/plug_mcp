import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
const files = async (root: string): Promise<string[]> => {
  const found: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) found.push(...(await files(path)));
    else if (entry.name.endsWith(".ts")) found.push(path);
  }
  return found;
};
it("casos de uso dependem de ports, sem pool/adapters de persistência", async () => {
  for (const path of await files(resolve("src/application/use-cases"))) {
    const source = await readFile(path, "utf8");
    const imports = [...source.matchAll(/(?:from\s*|import\s*\()(["'])([^"']+)\1/g)].map(
      (match) => match[2]!,
    );
    expect(
      imports.filter(
        (name) =>
          name === "pg" ||
          name.startsWith("drizzle-orm") ||
          name.includes("infrastructure/persistence"),
      ),
      path,
    ).toEqual([]);
    expect(source, path).not.toMatch(/\b(?:pool|dbPool)\.(?:query|connect)\(/);
  }
});
