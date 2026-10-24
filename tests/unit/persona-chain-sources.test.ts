import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const projects = ["mcp", "hub", "agent"] as const;
type Project = (typeof projects)[number];
interface SourceRecord {
  authorizesRelease: boolean;
  result?: string;
  testExitCode?: number;
  unchanged?: boolean;
  before: Record<Project, { revision: string; sourceSha256: string; fileCount: number }>;
  after?: SourceRecord["before"];
}

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), "se7e-chain-sources-"));
  roots.push(parent);
  const paths = Object.fromEntries(
    projects.map((project) => [project, join(parent, project)]),
  ) as Record<Project, string>;
  const git = (project: Project, ...args: string[]): string =>
    execFileSync(
      "git",
      [
        "-C",
        paths[project],
        "-c",
        "core.hooksPath=",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        ...args,
      ],
      { encoding: "utf8", stdio: "pipe" },
    ).trim();
  for (const project of projects) {
    mkdirSync(join(paths[project], "src"), { recursive: true });
    writeFileSync(join(paths[project], ".gitignore"), "node_modules/\n.env\n");
    writeFileSync(join(paths[project], "src/fixture.txt"), "Synthetic fixture source.");
    git(project, "init");
    git(project, "add", ".");
    git(project, "commit", "-m", "Synthetic inventory fixture");
  }
  mkdirSync(join(paths.mcp, "scripts"));
  for (const script of ["checkout-snapshot.mjs", "persona-chain-sources.mjs"])
    copyFileSync(`scripts/${script}`, join(paths.mcp, "scripts", script));
  const recordPath = join(
    paths.mcp,
    "node_modules/.cache",
    `persona-chain-sources-${randomUUID().replaceAll("-", "")}.json`,
  );
  const args = ["--hub", paths.hub, "--agent", paths.agent, "--record", recordPath];
  const invoke = (...arguments_: string[]): string =>
    execFileSync(
      process.execPath,
      [join(paths.mcp, "scripts/persona-chain-sources.mjs"), ...arguments_],
      { cwd: paths.mcp, encoding: "utf8", stdio: "pipe" },
    );
  const run = (phase: string, ...extra: string[]): string => invoke(phase, ...args, ...extra);
  const record = (): SourceRecord => JSON.parse(readFileSync(recordPath, "utf8")) as SourceRecord;
  return { paths, git, recordPath, record, run, invoke };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("chain source inventory", () => {
  it("resolves an existing repository alias to its native filesystem identity", () => {
    const f = fixture();
    const alias = process.platform === "win32" ? f.paths.hub.toLowerCase() : `${f.paths.hub}/.`;
    if (process.platform === "win32") expect(alias).not.toBe(f.paths.hub);
    f.invoke("before", "--hub", alias, "--agent", f.paths.agent, "--record", f.recordPath);
    f.run("after", "--test-exit", "0");
    expect(f.record()).toMatchObject({ unchanged: true, result: "passed" });
    expect(f.record().after).toEqual(f.record().before);
  });

  it("captures three local snapshots without changing the Git indexes or reading ignored secrets", () => {
    const f = fixture();
    const indexes = () =>
      projects.map((project) =>
        createHash("sha256")
          .update(readFileSync(join(f.paths[project], ".git/index")))
          .digest("hex"),
      );
    const before = indexes();
    const output = f.run("before");
    for (const project of projects)
      writeFileSync(join(f.paths[project], ".env"), "synthetic-private-value");
    const completed = f.run("after", "--test-exit", "0");
    expect(output + completed).not.toContain("synthetic-private-value");
    expect(output + completed).not.toContain(f.paths.hub);
    expect(indexes()).toEqual(before);
    expect(f.record()).toMatchObject({
      authorizesRelease: false,
      unchanged: true,
      result: "passed",
      testExitCode: 0,
    });
    expect(f.record().after).toEqual(f.record().before);
    expect(() => f.run("after", "--test-exit", "0")).toThrow();
  });

  it.each(projects)("rejects changed %s bytes even when HEAD is unchanged", (project) => {
    const f = fixture();
    f.run("before");
    writeFileSync(join(f.paths[project], "src/fixture.txt"), "Changed synthetic source.");
    expect(() => f.run("after", "--test-exit", "0")).toThrow();
    const result = f.record();
    expect(result).toMatchObject({
      result: "failed",
      unchanged: false,
      testExitCode: 0,
      authorizesRelease: false,
    });
    expect(result.after?.[project].revision).toBe(result.before[project].revision);
    expect(result.after?.[project].sourceSha256).not.toBe(result.before[project].sourceSha256);
  });

  it.each(["untracked", "deleted", "revision"])(
    "rejects %s changes instead of certifying a different checkout",
    (kind) => {
      const f = fixture();
      f.run("before");
      if (kind === "untracked")
        writeFileSync(join(f.paths.hub, "src/new.txt"), "new fixture source");
      if (kind === "deleted") rmSync(join(f.paths.hub, "src/fixture.txt"));
      if (kind === "revision")
        f.git("hub", "commit", "--allow-empty", "-m", "Synthetic changed base");
      expect(() => f.run("after", "--test-exit", "0")).toThrow();
      expect(f.record()).toMatchObject({ unchanged: false, result: "failed" });
    },
  );

  it("preserves a failed test result with stable files and refuses overwriting an existing record", () => {
    const f = fixture();
    f.run("before");
    expect(() => f.run("before")).toThrow();
    expect(() => f.run("after", "--test-exit", "7")).toThrow();
    expect(f.record()).toMatchObject({ unchanged: true, testExitCode: 7, result: "failed" });
  });

  it("refuses missing records, repeated options and linked source directories", () => {
    const f = fixture();
    expect(() => f.run("after", "--test-exit", "0")).toThrow();
    expect(() => f.run("before", "--record", join(f.paths.hub, "record.json"))).toThrow();
    const target = join(f.paths.agent, "src");
    symlinkSync(
      target,
      join(f.paths.hub, "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(() => f.run("before")).toThrow();
    expect(() => readFileSync(f.recordPath)).toThrow();
  });

  it("requires three distinct repository roots and an owned record path", () => {
    const f = fixture();
    for (const hub of [f.paths.mcp, join(f.paths.hub, "src")]) {
      expect(() =>
        f.invoke("before", "--hub", hub, "--agent", f.paths.agent, "--record", f.recordPath),
      ).toThrow();
    }
    expect(() =>
      f.invoke(
        "before",
        "--hub",
        f.paths.hub,
        "--agent",
        f.paths.agent,
        "--record",
        join(f.paths.hub, "record.json"),
      ),
    ).toThrow();
    expect(() => readFileSync(f.recordPath)).toThrow();
  });
});
