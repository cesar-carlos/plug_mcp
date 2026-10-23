import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
interface Candidate {
  mcpRevision: string;
  hubRevision: string;
  agentRevision: string;
  sourceSha256: string;
  imageId: string;
  imageRevision: string;
  imagePlatform: string;
  imageRuntime: string;
  imageRunId: number;
  imageArtifactId: number;
  imageArtifactDigest: string;
}
interface Reference {
  path: string;
  sha256: string;
}
interface Report {
  schemaVersion: number;
  gate: string;
  candidate: Candidate;
  result: string;
  coverage: string;
  startedAt: string;
  completedAt: string;
  omissions: string[];
  environment: { description: string; versions: Record<string, string> };
  checks: { id: string; result: string; artifact: Reference }[];
  approval: { status: string; reviewer: string; reviewedAt: string; record: Reference };
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "se7e-evidence-"));
  roots.push(root);
  const write = (path: string, content: string): void => {
    writeFileSync(join(root, path), content);
  };
  for (const path of ["scripts", "contracts", "src", "docs/persona-v2/release-evidence"])
    mkdirSync(join(root, path), { recursive: true });
  for (const script of [
    "check-persona-release.mjs",
    "persona-release-evidence.mjs",
    "checkout-snapshot.mjs",
  ])
    copyFileSync(`scripts/${script}`, join(root, "scripts", script));
  const original = JSON.parse(readFileSync("contracts/persona-v2-release.json", "utf8")) as {
    generation: string;
    requiredGates: string[];
  };
  write("src/fixture.txt", "Synthetic source, never deployed.");
  const git = (...args: string[]): string =>
    execFileSync(
      "git",
      [
        "-C",
        root,
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
  git("init");
  git("add", ".");
  git("commit", "-m", "Synthetic release fixture");
  const env = { ...process.env, GITHUB_SHA: "", PERSONA_V2_RELEASE_REVISION: "" };
  const run = (...args: string[]): string =>
    execFileSync(process.execPath, [join(root, "scripts/check-persona-release.mjs"), ...args], {
      encoding: "utf8",
      stdio: "pipe",
      env,
    });
  write(
    "contracts/persona-v2-release.json",
    JSON.stringify({ ...original, ready: false, completedGates: [] }),
  );
  const captured = JSON.parse(run("--candidate")) as { mcpRevision: string; sourceSha256: string };
  const candidate = {
    mcpRevision: captured.mcpRevision,
    sourceSha256: captured.sourceSha256,
    hubRevision: "a".repeat(40),
    agentRevision: "b".repeat(40),
    imageId: `sha256:${"c".repeat(64)}`,
    imageRevision: captured.mcpRevision,
    imagePlatform: "linux/amd64",
    imageRuntime: "persona-v2-candidate",
    imageRunId: 123,
    imageArtifactId: 456,
    imageArtifactDigest: "f".repeat(64),
  };
  const ref = (name: string, content: string): Reference => {
    const path = `docs/persona-v2/release-evidence/${name}`;
    write(path, content);
    return { path, sha256: sha(content) };
  };
  const artifact = ref("checks.txt", "Synthetic checks, not production evidence.");
  const record = ref("approval.txt", "Synthetic reviewer record, not actual acceptance.");
  const reports: Report[] = original.requiredGates.map((gate) => ({
    schemaVersion: 2,
    gate,
    candidate: { ...candidate },
    result: "passed",
    coverage: "complete",
    startedAt: "2026-01-01T00:00:00Z",
    completedAt: "2026-01-01T01:00:00Z",
    omissions: [],
    environment: { description: "Isolated unit fixture", versions: { node: "24" } },
    checks: [{ id: "synthetic-check", result: "passed", artifact: { ...artifact } }],
    approval: {
      status: "accepted",
      reviewer: "Synthetic reviewer",
      reviewedAt: "2026-01-01T02:00:00Z",
      record: { ...record },
    },
  }));
  const manifest = {
    ...original,
    ready: true,
    completedGates: [...original.requiredGates],
    evidenceVersion: 2,
    candidate,
    evidence: {} as Record<string, Reference>,
  };
  const save = (): void => {
    manifest.evidence = Object.fromEntries(
      reports.map((report) => [report.gate, ref(`${report.gate}.json`, JSON.stringify(report))]),
    );
    write("contracts/persona-v2-release.json", JSON.stringify(manifest));
  };
  save();
  return { root, run, save, reports, manifest, write, git, env };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
describe("release evidence integrity", () => {
  it("binds loaded image identity to every accepted gate", () => {
    const f = fixture();
    const proofPath = "docs/persona-v2/release-evidence/image-proof.json";
    const proof = {
      schemaVersion: 1,
      imageId: f.manifest.candidate.imageId,
      revision: f.manifest.candidate.imageRevision,
      platform: "linux/amd64",
      runtime: "persona-v2-candidate",
    };
    f.write(proofPath, JSON.stringify(proof));
    expect(() => f.run("--image-proof", join(f.root, proofPath))).not.toThrow();
    for (const [key, value] of Object.entries({
      imageId: `sha256:${"d".repeat(64)}`,
      revision: "e".repeat(40),
      platform: "linux/arm64",
      runtime: "legacy",
      schemaVersion: 2,
    })) {
      f.write(proofPath, JSON.stringify({ ...proof, [key]: value }));
      expect(() => f.run("--image-proof", join(f.root, proofPath))).toThrow();
    }
    f.reports[0]!.candidate.imageId = `sha256:${"d".repeat(64)}`;
    f.save();
    expect(() => f.run()).toThrow();
  });
  it("refuses old evidence without image acceptance", () => {
    const f = fixture();
    f.manifest.evidenceVersion = 1;
    f.save();
    expect(() => f.run()).toThrow();
  });
  it("checks the exact workflow-run revision rather than the workflow default branch", () => {
    const f = fixture();
    f.env.GITHUB_SHA = "d".repeat(40);
    f.env.PERSONA_V2_RELEASE_REVISION = f.manifest.candidate.mcpRevision;
    expect(() => f.run()).not.toThrow();
    f.env.PERSONA_V2_RELEASE_REVISION = "e".repeat(40);
    expect(() => f.run()).toThrow();
  });
  it("accepts complete synthetic evidence, including a proof-only descendant commit", () => {
    const f = fixture();
    expect(() => f.run()).not.toThrow();
    f.git("add", ".");
    f.git("commit", "-m", "Synthetic evidence only");
    expect(() => f.run()).not.toThrow();
  });
  it("captures without granting acceptance or changing files", () => {
    const f = fixture();
    const before = f.git("status", "--porcelain");
    expect(JSON.parse(f.run("--candidate"))).toMatchObject({
      authorizesRelease: false,
      sourceSha256: f.manifest.candidate.sourceSha256,
    });
    expect(f.git("status", "--porcelain")).toBe(before);
  });
  it.each(["source", "artifact", "report", "approval"])("rejects altered %s bytes", (kind) => {
    const f = fixture();
    const paths = {
      source: "src/fixture.txt",
      artifact: f.reports[0]!.checks[0]!.artifact.path,
      report: f.manifest.evidence[f.reports[0]!.gate]!.path,
      approval: f.reports[0]!.approval.record.path,
    };
    f.write(paths[kind as keyof typeof paths], "changed");
    expect(() => f.run()).toThrow();
  });
  it.each([
    "skipped",
    "omitted",
    "unreviewed",
    "foreign",
    "expired-order",
    "empty",
    "duplicate",
    "traversal",
  ])("rejects %s evidence even with recomputed hashes", (kind) => {
    const f = fixture();
    const report = f.reports[0]!;
    if (kind === "skipped") report.checks[0]!.result = "skipped";
    if (kind === "omitted") report.omissions.push("missing engine");
    if (kind === "unreviewed") report.approval.status = "pending";
    if (kind === "foreign") report.candidate.hubRevision = "c".repeat(40);
    if (kind === "expired-order") report.approval.reviewedAt = "2025-01-01T00:00:00Z";
    if (kind === "empty") report.checks = [];
    if (kind === "duplicate") report.checks.push({ ...report.checks[0]! });
    if (kind === "traversal")
      report.checks[0]!.artifact.path =
        "docs/persona-v2/release-evidence/../../../../src/fixture.txt";
    f.save();
    expect(() => f.run()).toThrow();
  });
  it("rejects a junction or symlink inside the proof directory", () => {
    const f = fixture();
    const target = mkdtempSync(join(tmpdir(), "se7e-evidence-target-"));
    roots.push(target);
    writeFileSync(join(target, "proof.txt"), "proof");
    symlinkSync(
      target,
      join(f.root, "docs/persona-v2/release-evidence/link"),
      process.platform === "win32" ? "junction" : "dir",
    );
    f.reports[0]!.checks[0]!.artifact = {
      path: "docs/persona-v2/release-evidence/link/proof.txt",
      sha256: sha("proof"),
    };
    f.save();
    expect(() => f.run()).toThrow();
  });
});
