import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateOrigin } from "./accepted-image-origin.mjs";

export function validateTestDeployment(contract, revision, run, artifacts, jobs, repository) {
  if (
    contract.schemaVersion !== 1 ||
    contract.enabled !== true ||
    contract.generation !== "persona-v2" ||
    contract.audience !== "test-only" ||
    contract.runtime !== "persona-v2-test-server" ||
    contract.artifactName !== "persona-v2-test-server-amd64" ||
    !/^[a-f0-9]{40}$/.test(revision) ||
    !Array.isArray(contract.requiredJobs) ||
    contract.requiredJobs.length === 0
  )
    throw new Error("Test deployment contract refused.");
  for (const name of contract.requiredJobs) {
    const matches = jobs.filter((job) => job.name === name);
    if (
      matches.length !== 1 ||
      matches[0].status !== "completed" ||
      matches[0].conclusion !== "success"
    )
      throw new Error("Required CI check missing or unsuccessful.");
  }
  const matches = artifacts.filter((artifact) => artifact.name === contract.artifactName);
  if (matches.length !== 1) throw new Error("Exact test artifact required.");
  const artifact = matches[0];
  return validateOrigin(
    {
      imageRunId: run.id,
      imageArtifactId: artifact.id,
      imageRevision: revision,
      imageArtifactDigest: artifact.digest?.replace(/^sha256:/, ""),
    },
    repository,
    run,
    artifact,
    contract.artifactName,
  );
}

export function validateTestImage(proof, revision) {
  if (
    proof.schemaVersion !== 1 ||
    proof.revision !== revision ||
    !/^[a-f0-9]{40}$/.test(revision) ||
    proof.runtime !== "persona-v2-test-server" ||
    proof.platform !== "linux/amd64" ||
    !/^sha256:[a-f0-9]{64}$/.test(proof.imageId) ||
    !/^[a-f0-9]{64}$/.test(proof.archiveSha256) ||
    !Number.isSafeInteger(proof.archiveBytes) ||
    proof.archiveBytes <= 0
  )
    throw new Error("Test image refused.");
  return proof;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, value, revision, ...extra] = process.argv.slice(2);
    if (extra.length || !/^[a-f0-9]{40}$/.test(revision ?? ""))
      throw new Error("Arguments refused.");
    if (mode === "origin") {
      const repository = process.env.GITHUB_REPOSITORY;
      if (
        !/^\d+$/.test(value ?? "") ||
        !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")
      )
        throw new Error("Origin missing.");
      const api = (path, paginate = false) =>
        JSON.parse(
          execFileSync("gh", ["api", ...(paginate ? ["--paginate", "--slurp"] : []), path], {
            encoding: "utf8",
            stdio: "pipe",
            timeout: 60000,
            maxBuffer: 8 * 1024 * 1024,
          }),
        );
      const base = `repos/${repository}/actions/runs/${value}`;
      const run = api(base);
      if (String(run.id) !== value) throw new Error("Run differs.");
      const result = validateTestDeployment(
        JSON.parse(
          readFileSync(
            new URL("../contracts/persona-v2-test-deploy.json", import.meta.url),
            "utf8",
          ),
        ),
        revision,
        run,
        api(`${base}/artifacts?per_page=100`, true).flatMap((page) => page.artifacts),
        api(`${base}/jobs?filter=latest&per_page=100`, true).flatMap((page) => page.jobs),
        repository,
      );
      if (!process.env.GITHUB_OUTPUT) throw new Error("Output missing.");
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        Object.entries(result)
          .map(([key, content]) => `${key}=${content}\n`)
          .join(""),
      );
    } else if (mode === "verify") {
      const proof = validateTestImage(
        JSON.parse(readFileSync(join(value, "image-proof.json"), "utf8")),
        revision,
      );
      execFileSync(process.execPath, ["scripts/tested-image.mjs", "verify", value], {
        env: { ...process.env, PERSONA_V2_IMAGE_REVISION: revision },
        stdio: "pipe",
      });
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(
          process.env.GITHUB_OUTPUT,
          `image_id=${proof.imageId}\narchive_sha256=${proof.archiveSha256}\n`,
        );
    } else throw new Error("Unknown mode.");
    console.log("Test deployment verification passed; customer release remains blocked.");
  } catch {
    console.error(
      "Test deployment refused: contract, CI origin, required checks or image inconsistent.",
    );
    process.exitCode = 1;
  }
}
