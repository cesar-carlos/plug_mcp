import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** Proves the frozen patch at its reviewed ancestor, without writing the hub index/worktree. */
export function verifyHistoricalHubSnapshot(input: {
  hub: string;
  baseRef: string;
  incorporatedRef: string;
  currentRef: string;
  patch: string;
}): void {
  for (const ref of [input.baseRef, input.incorporatedRef, input.currentRef]) {
    if (!/^[a-f0-9]{40}$/.test(ref)) throw new Error("Exact upstream commits required");
  }
  const git = (args: string[], env = process.env) =>
    execFileSync("git", ["-C", resolve(input.hub), ...args], { env, stdio: "pipe" });
  git(["merge-base", "--is-ancestor", input.baseRef, input.incorporatedRef]);
  git(["merge-base", "--is-ancestor", input.incorporatedRef, input.currentRef]);
  const directory = mkdtempSync(join(tmpdir(), "se7e-hub-snapshot-"));
  const env = { ...process.env, GIT_INDEX_FILE: join(directory, "index") };
  try {
    git(["read-tree", input.incorporatedRef], env);
    git(["apply", "--reverse", "--check", "--cached", resolve(input.patch)], env);
  } finally {
    // Only files created in this private temporary directory; no recursive hub cleanup.
    for (const file of readdirSync(directory)) unlinkSync(join(directory, file));
    rmdirSync(directory);
  }
}
