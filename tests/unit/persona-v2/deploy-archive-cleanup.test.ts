import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

const bash =
  process.platform === "win32"
    ? ([process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]
        .filter(Boolean)
        .flatMap((root) => [`${root}/Git/bin/bash.exe`, `${root}/Git/usr/bin/bash.exe`])
        .find(existsSync) ?? "bash")
    : "bash";
const shellPath = (path: string): string =>
  path.replaceAll("\\", "/").replace(/^([A-Z]):/i, (_, drive: string) => `/${drive.toLowerCase()}`);

// Execute the real receiver/traps; replace only host paths and external commands.
function attempt(
  stage: string,
  cleanupFails = false,
): { status: number | null; archive: boolean; stderr: string } {
  const root = mkdtempSync(join(tmpdir(), "deploy-cleanup-"));
  const location = shellPath(root);
  try {
    for (const dir of ["bin", "repo", "release", "backups", "volumes", "database"])
      mkdirSync(join(root, dir));
    const protectedFiles = [
      "settings.env",
      "backups/image.tar",
      "volumes/data",
      "database/data",
      "release/docker-compose.persona-v2.test.yml",
      "release/recovery.dump",
    ];
    for (const file of protectedFiles) writeFileSync(join(root, file), "preserve");
    const command = (name: string, body: string): void => {
      writeFileSync(join(root, "bin", name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
    };
    command("flock", "exit 0");
    command("git", "exit 0");
    command("tar", "exit 0");
    command("mktemp", `printf '%s\\n' '${location}/release'`);
    command("head", stage === "upload" ? "printf partial; exit 42" : "cat");
    command(
      "node",
      'if [ "$1" = scripts/check-node-version.mjs ]; then exit 0; fi\n' +
        (stage === "signal"
          ? "kill -TERM $PPID; exit 0"
          : stage === "deploy"
            ? "exit 42"
            : "exit 0"),
    );
    if (cleanupFails) command("rm", "exit 1");
    const source = readFileSync("scripts/deploy-production.sh", "utf8")
      .replace(/^export PATH=.*$/m, `export PATH="${location}/bin:/usr/bin:/bin"`)
      .replace("/root/plug_mcp", `${location}/repo`)
      .replace("/etc/se7e/persona-v2-test.env", `${location}/settings.env`)
      .replace("/var/lock/plug-mcp-deploy.lock", `${location}/deploy.lock`);
    writeFileSync(join(root, "receiver.sh"), source.replaceAll("\r\n", "\n"));
    const result = spawnSync(bash, [join(root, "receiver.sh")], {
      input: "synthetic archive",
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...process.env,
        SSH_ORIGINAL_COMMAND: `deploy-test ${"a".repeat(40)} sha256:${"b".repeat(64)} ${"c".repeat(64)}`,
      },
    });
    expect(result.error).toBeUndefined();
    for (const file of protectedFiles)
      expect(readFileSync(join(root, file), "utf8")).toBe("preserve");
    return {
      status: result.status,
      archive: existsSync(join(root, "release/image.tar")),
      stderr: result.stderr,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

it.each([
  ["success", 0],
  ["upload", 42],
  ["deploy", 42],
  ["signal", 143],
] as const)(
  "removes only the transport archive after %s, preserving the exit status and recovery files",
  (stage, status) => {
    expect(attempt(stage)).toMatchObject({ status, archive: false });
  },
);

it("reports cleanup failure without masking the original deployment failure", () => {
  expect(attempt("success", true)).toMatchObject({ status: 1, archive: true });
  expect(attempt("deploy", true)).toMatchObject({
    status: 42,
    archive: true,
    stderr: expect.stringContaining("Could not remove deployment transport archive"),
  });
});
