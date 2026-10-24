import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

export function validateOrigin(candidate, repository, run, artifact) {
  const positive = (value) => Number.isSafeInteger(value) && value > 0;
  const valid =
    candidate &&
    positive(candidate.imageRunId) &&
    positive(candidate.imageArtifactId) &&
    /^[a-f0-9]{40}$/.test(candidate.imageRevision) &&
    /^[a-f0-9]{64}$/.test(candidate.imageArtifactDigest) &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) &&
    run.id === candidate.imageRunId &&
    run.repository?.full_name === repository &&
    run.head_repository?.full_name === repository &&
    run.event === "push" &&
    run.head_branch === "main" &&
    run.head_sha === candidate.imageRevision &&
    run.path === ".github/workflows/ci.yml" &&
    run.status === "completed" &&
    run.conclusion === "success" &&
    artifact.id === candidate.imageArtifactId &&
    artifact.name === "persona-v2-tested-image-amd64" &&
    artifact.expired === false &&
    artifact.workflow_run?.id === run.id &&
    artifact.workflow_run?.head_sha === candidate.imageRevision &&
    artifact.digest === `sha256:${candidate.imageArtifactDigest}`;
  if (!valid) throw new Error("Accepted image origin refused.");
  return {
    run_id: String(run.id),
    artifact_id: String(artifact.id),
    image_revision: candidate.imageRevision,
  };
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/accepted-image-origin.mjs")) {
  try {
    if (process.argv.length !== 2) throw new Error("Unexpected arguments.");
    const manifest = JSON.parse(
      readFileSync(new URL("../contracts/persona-v2-release.json", import.meta.url), "utf8"),
    );
    const repository = process.env.GITHUB_REPOSITORY;
    const candidate = manifest.candidate;
    if (
      !manifest.ready ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") ||
      !Number.isSafeInteger(candidate?.imageRunId) ||
      candidate.imageRunId <= 0 ||
      !Number.isSafeInteger(candidate?.imageArtifactId) ||
      candidate.imageArtifactId <= 0
    )
      throw new Error("Missing origin.");
    const api = (path) =>
      JSON.parse(
        execFileSync("gh", ["api", path], {
          encoding: "utf8",
          stdio: "pipe",
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        }),
      );
    const result = validateOrigin(
      candidate,
      repository,
      api(`repos/${repository}/actions/runs/${candidate.imageRunId}`),
      api(`repos/${repository}/actions/artifacts/${candidate.imageArtifactId}`),
    );
    if (!process.env.GITHUB_OUTPUT) throw new Error("Missing output.");
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(result)
        .map(([k, v]) => `${k}=${v}\n`)
        .join(""),
    );
  } catch {
    console.error("Image promotion blocked: unavailable or inconsistent accepted origin.");
    process.exitCode = 1;
  }
}
