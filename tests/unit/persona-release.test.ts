import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface Manifest {
  generation: string;
  ready: boolean;
  requiredGates: string[];
  completedGates: string[];
}
const current = (): Manifest =>
  JSON.parse(readFileSync("contracts/persona-v2-release.json", "utf8")) as Manifest;
const accepts = (manifest: Manifest): boolean => {
  const root = mkdtempSync(join(tmpdir(), "se7e-release-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "contracts"));
    const script = join(root, "scripts", "check-persona-release.mjs");
    copyFileSync("scripts/check-persona-release.mjs", script);
    copyFileSync(
      "scripts/persona-release-evidence.mjs",
      join(root, "scripts", "persona-release-evidence.mjs"),
    );
    writeFileSync(join(root, "contracts", "persona-v2-release.json"), JSON.stringify(manifest));
    execFileSync(process.execPath, [script], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};
describe("coordinated persona-v2 release", () => {
  it("blocks the current incomplete release", () => expect(accepts(current())).toBe(false));
  it("requires every named gate, even when the manifest claims ready", () => {
    const manifest = current();
    manifest.ready = true;
    manifest.completedGates = [...manifest.requiredGates];
    for (const removed of manifest.requiredGates) {
      const altered = manifest.requiredGates.filter((gate) => gate !== removed);
      expect(accepts({ ...manifest, requiredGates: altered, completedGates: altered })).toBe(false);
      expect(accepts({ ...manifest, completedGates: altered })).toBe(false);
    }
    expect(accepts({ ...manifest, requiredGates: manifest.requiredGates.map(() => "fake") })).toBe(
      false,
    );
  });
  it("does not accept boolean and gate declarations without evidence", () => {
    const manifest = current();
    expect(accepts({ ...manifest, ready: true, completedGates: [...manifest.requiredGates] })).toBe(
      false,
    );
    expect(
      accepts({
        ...manifest,
        generation: "legacy",
        ready: true,
        completedGates: [...manifest.requiredGates],
      }),
    ).toBe(false);
  });
});
