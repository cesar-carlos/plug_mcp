import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureCheckout, mcpSnapshotExclusions } from "./checkout-snapshot.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const prefix = "docs/persona-v2/release-evidence/";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const validHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const text = (value) => typeof value === "string" && value.trim().length > 0;
function requireThat(condition) {
  if (!condition) throw new Error("Evidência inválida.");
}
function git(...args) {
  return execFileSync("git", ["-C", root, ...args], {
    stdio: "pipe",
    maxBuffer: 16 * 1024 * 1024,
  }).toString("utf8");
}
function readContained(path) {
  requireThat(
    text(path) &&
      !/[\\:\0]/.test(path) &&
      path.split("/").every((p) => p && p !== "." && p !== ".."),
  );
  let current = root;
  const parts = path.split("/");
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const stat = lstatSync(current);
    requireThat(!stat.isSymbolicLink());
    requireThat(
      index < parts.length - 1
        ? stat.isDirectory()
        : stat.isFile() && stat.size <= 32 * 1024 * 1024,
    );
  }
  return readFileSync(current);
}
export function captureCandidate() {
  const snapshot = captureCheckout(root, mcpSnapshotExclusions);
  return {
    mcpRevision: snapshot.revision,
    sourceSha256: snapshot.sourceSha256,
    fileCount: snapshot.fileCount,
  };
}
function reference(ref) {
  requireThat(ref && text(ref.path) && ref.path.startsWith(prefix) && validHash(ref.sha256));
  const bytes = readContained(ref.path);
  requireThat(bytes.length > 0 && hash(bytes) === ref.sha256);
  return bytes;
}
function timestamp(value) {
  requireThat(text(value) && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value));
  const parsed = Date.parse(value);
  requireThat(Number.isFinite(parsed) && parsed <= Date.now());
  requireThat(new Date(parsed).toISOString().replace(".000Z", "Z") === value.replace(".000Z", "Z"));
  return parsed;
}
export function verifyEvidence(manifest, gates) {
  const expected = manifest.candidate;
  requireThat(manifest.evidenceVersion === 2 && expected);
  const keys = [
    "mcpRevision",
    "hubRevision",
    "agentRevision",
    "sourceSha256",
    "imageId",
    "imageRevision",
    "imagePlatform",
    "imageRuntime",
    "imageRunId",
    "imageArtifactId",
    "imageArtifactDigest",
  ];
  requireThat(
    keys
      .slice(0, 3)
      .every((key) => typeof expected[key] === "string" && /^[a-f0-9]{40}$/.test(expected[key])) &&
      validHash(expected.sourceSha256),
  );
  requireThat(
    /^sha256:[a-f0-9]{64}$/.test(expected.imageId) &&
      /^[a-f0-9]{40}$/.test(expected.imageRevision) &&
      expected.imagePlatform === "linux/amd64" &&
      expected.imageRuntime === "persona-v2-candidate",
  );
  requireThat(
    Number.isSafeInteger(expected.imageRunId) &&
      expected.imageRunId > 0 &&
      Number.isSafeInteger(expected.imageArtifactId) &&
      expected.imageArtifactId > 0 &&
      validHash(expected.imageArtifactDigest),
  );
  const actual = captureCandidate();
  requireThat(actual.sourceSha256 === expected.sourceSha256);
  git("merge-base", "--is-ancestor", expected.mcpRevision, actual.mcpRevision);
  git("merge-base", "--is-ancestor", expected.imageRevision, actual.mcpRevision);
  const ciRevision = process.env.PERSONA_V2_RELEASE_REVISION ?? process.env.GITHUB_SHA;
  if (ciRevision) requireThat(ciRevision === actual.mcpRevision);
  requireThat(manifest.evidence && Object.keys(manifest.evidence).length === gates.length);
  const reports = new Set();
  for (const gate of gates) {
    const ref = manifest.evidence[gate];
    const report = JSON.parse(reference(ref).toString("utf8"));
    requireThat(!reports.has(ref.path));
    reports.add(ref.path);
    requireThat(
      report.schemaVersion === 2 &&
        report.gate === gate &&
        report.result === "passed" &&
        report.coverage === "complete",
    );
    requireThat(report.candidate && keys.every((key) => report.candidate[key] === expected[key]));
    requireThat(Array.isArray(report.omissions) && report.omissions.length === 0);
    const start = timestamp(report.startedAt);
    const end = timestamp(report.completedAt);
    requireThat(start <= end);
    requireThat(
      text(report.environment?.description) &&
        report.environment.versions &&
        Object.keys(report.environment.versions).length > 0 &&
        Object.values(report.environment.versions).every(text),
    );
    requireThat(
      Array.isArray(report.checks) && report.checks.length > 0 && report.checks.length <= 10000,
    );
    const checks = new Set();
    for (const check of report.checks) {
      requireThat(text(check.id) && !checks.has(check.id) && check.result === "passed");
      checks.add(check.id);
      reference(check.artifact);
    }
    const approval = report.approval;
    // Technical verification is not human acceptance (DV2-015).
    requireThat(
      (approval?.status === "accepted" || approval?.status === "technically_verified") &&
        text(approval.reviewer),
    );
    requireThat(timestamp(approval.reviewedAt) >= end);
    reference(approval.record);
  }
}

/** Called after archive verification and docker load; never replaces those checks. */
export function verifyAcceptedImage(manifest, path) {
  const stat = lstatSync(path);
  requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 4096);
  const proof = JSON.parse(readFileSync(path, "utf8"));
  const candidate = manifest.candidate;
  requireThat(
    proof.schemaVersion === 1 &&
      proof.imageId === candidate.imageId &&
      proof.revision === candidate.imageRevision &&
      proof.platform === candidate.imagePlatform &&
      proof.runtime === candidate.imageRuntime,
  );
}
