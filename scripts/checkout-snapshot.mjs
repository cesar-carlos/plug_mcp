import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function captureCheckout(root, excluded = []) {
  const fail = () => {
    throw new Error("Checkout inválido para inventário.");
  };
  if (lstatSync(root).isSymbolicLink()) fail();
  const canonical = realpathSync(root);
  const git = (...args) =>
    execFileSync("git", ["-C", canonical, ...args], {
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 16 * 1024 * 1024,
    });
  if (realpathSync(git("rev-parse", "--show-toplevel").trim()) !== canonical) fail();
  const revision = git("rev-parse", "HEAD").trim();
  if (!/^[a-f0-9]{40}$/.test(revision)) fail();
  const paths = [
    ...new Set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0")),
  ]
    .filter(
      (path) =>
        path &&
        !excluded.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry)),
    )
    .sort();
  if (!paths.length || paths.length > 20000) fail();
  const files = paths.flatMap((path) => {
    if (
      /[\\:\0]/.test(path) ||
      path.split("/").some((part) => !part || part === "." || part === "..")
    )
      fail();
    try {
      let current = canonical;
      const parts = path.split("/");
      for (const [index, part] of parts.entries()) {
        current = join(current, part);
        const stat = lstatSync(current);
        if (
          stat.isSymbolicLink() ||
          (index < parts.length - 1
            ? !stat.isDirectory()
            : !stat.isFile() || stat.size > 32 * 1024 * 1024)
        )
          fail();
      }
      const bytes = readFileSync(resolve(canonical, path));
      return [{ path, sha256: hash(bytes), bytes: bytes.length }];
    } catch (error) {
      // Tracked deletions change the inventory; unreadable files never become an empty snapshot.
      if (error.code === "ENOENT") return [];
      throw error;
    }
  });
  if (!files.length) fail();
  return { revision, sourceSha256: hash(JSON.stringify(files)), fileCount: files.length };
}

export const mcpSnapshotExclusions = [
  "contracts/persona-v2-release.json",
  "docs/persona-v2/release-evidence/",
  "docs/persona-v2/validation/",
];
