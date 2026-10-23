import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
  readdirSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { verifyHistoricalHubSnapshot } from "../../scripts/hub-snapshot.js";

const directories: string[] = [];
afterAll(() => {
  const remove = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (lstatSync(path).isDirectory()) remove(path);
      else unlinkSync(path);
    }
    rmdirSync(directory);
  };
  // Only disposable directories returned by mkdtemp; never a project checkout.
  for (const directory of directories) remove(directory);
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "se7e-snapshot-test-"));
  directories.push(directory);
  const hub = join(directory, "hub");
  mkdirSync(hub);
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      [
        "-C",
        hub,
        "-c",
        "core.hooksPath=",
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        ...args,
      ],
      { encoding: "utf8", stdio: "pipe" },
    ).trim();
  git("init");
  const source = join(hub, "contract.txt");
  const commit = (text: string) => {
    writeFileSync(source, text);
    git("add", "contract.txt");
    git("commit", "-m", "Synthetic contract fixture");
    return git("rev-parse", "HEAD");
  };
  const baseRef = commit("header\nold-contract\nfooter\n");
  const incorporatedRef = commit("header\nreviewed-contract\nfooter\n");
  const patch = join(directory, "snapshot.patch");
  writeFileSync(patch, git("diff", baseRef, incorporatedRef) + "\n");
  const currentRef = commit("updated-header\nreviewed-contract\nfooter\n");
  writeFileSync(join(hub, "pending.txt"), "untracked fixture\n");
  return { hub, baseRef, incorporatedRef, currentRef, patch, git, source };
}
it("prova o patch no ancestral exato depois de drift textual, sem tocar index ou edição", () => {
  const f = fixture(),
    before = readFileSync(join(f.hub, ".git", "index")),
    source = readFileSync(f.source),
    status = f.git("status", "--porcelain");
  expect(() => f.git("apply", "--reverse", "--check", f.patch)).toThrow();
  verifyHistoricalHubSnapshot(f);
  expect(readFileSync(join(f.hub, ".git", "index"))).toEqual(before);
  expect(readFileSync(f.source)).toEqual(source);
  expect(f.git("status", "--porcelain")).toBe(status);
});
it("recusa snapshot não incorporado e inversão da ancestralidade", () => {
  const f = fixture();
  expect(() => verifyHistoricalHubSnapshot({ ...f, incorporatedRef: f.baseRef })).toThrow();
  expect(() => verifyHistoricalHubSnapshot({ ...f, currentRef: f.baseRef })).toThrow();
  expect(() => verifyHistoricalHubSnapshot({ ...f, currentRef: "HEAD" })).toThrow("Exact upstream");
});
