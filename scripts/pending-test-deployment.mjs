import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const shaPattern = /^[a-f0-9]{40}$/;

// A successful workflow may only have reported "no runtime changes".
// Only the successful SSH publication step is evidence of a deployed image.
export function publishedRevision(run, jobs, repository) {
  if (
    run.path !== ".github/workflows/deploy.yml" ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    run.head_branch !== "main" ||
    run.event !== "workflow_run" ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    !shaPattern.test(run.head_sha ?? "")
  )
    return null;
  const publishers = jobs.filter((job) => job.name === "publish");
  if (publishers.length !== 1) return null;
  const publisher = publishers[0];
  const steps = publisher.steps?.filter((step) => step.name === "Publish the CI image") ?? [];
  return publisher.status === "completed" &&
    publisher.conclusion === "success" &&
    steps.length === 1 &&
    steps[0].status === "completed" &&
    steps[0].conclusion === "success"
    ? run.head_sha
    : null;
}

export function findPublishedRevision(api, repository, currentRunId) {
  // A rerun of an older workflow can finish last: compare actual publication times.
  let latest = null;
  for (let page = 1; page <= 100; page++) {
    const result = api(
      `repos/${repository}/actions/workflows/deploy.yml/runs?status=success&per_page=100&page=${page}`,
    );
    if (!Array.isArray(result.workflow_runs)) throw new Error("Invalid deployment history.");
    for (const run of result.workflow_runs) {
      if (String(run.id) === String(currentRunId)) continue;
      if (!Number.isSafeInteger(run.id) || run.id <= 0) throw new Error("Invalid run ID.");
      const response = api(
        `repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
      );
      if (!Array.isArray(response.jobs) || response.total_count !== response.jobs.length)
        throw new Error("Incomplete deployment jobs.");
      const revision = publishedRevision(run, response.jobs, repository);
      if (revision) {
        const completed = Date.parse(
          response.jobs
            .find((job) => job.name === "publish")
            .steps.find((step) => step.name === "Publish the CI image").completed_at,
        );
        if (!Number.isFinite(completed)) throw new Error("Missing publication time.");
        if (latest && completed === latest.completed && revision !== latest.revision)
          throw new Error("Ambiguous publication history.");
        if (!latest || completed > latest.completed) latest = { revision, completed };
      }
    }
    if (result.workflow_runs.length < 100) return latest?.revision ?? null;
  }
  throw new Error("Deployment history limit exceeded.");
}

export function pendingDeployment(revision, baseline, git, classify) {
  if (!shaPattern.test(revision) || (baseline !== null && !shaPattern.test(baseline)))
    throw new Error("Invalid revision.");
  git(["cat-file", "-e", `${revision}^{commit}`]);
  if (baseline === null) return true; // No receipt: verify and publish, never silently skip.
  git(["merge-base", "--is-ancestor", baseline, revision]); // Refuse rollback/divergence.
  if (baseline === revision) return false;
  const paths = git(["diff", "--no-renames", "--name-only", "-z", baseline, revision])
    .split("\0")
    .filter(Boolean);
  if (paths.some((path) => /[\r\n]/.test(path))) throw new Error("Unsupported filename.");
  return classify(paths.join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const repository = process.env.GITHUB_REPOSITORY;
    const revision = process.env.SHA;
    if (
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") ||
      !/^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") ||
      !process.env.GITHUB_OUTPUT
    )
      throw new Error("Deployment context missing.");
    const run = (command, args, options = {}) =>
      execFileSync(command, args, {
        encoding: "utf8",
        stdio: "pipe",
        timeout: 60000,
        maxBuffer: 16 * 1024 * 1024,
        ...options,
      });
    const baseline = findPublishedRevision(
      (path) => JSON.parse(run("gh", ["api", path])),
      repository,
      process.env.GITHUB_RUN_ID,
    );
    const publish = pendingDeployment(
      revision,
      baseline,
      (args) => run("git", args),
      (input) => {
        try {
          run("bash", ["scripts/should-publish-production.sh"], { input });
          return true;
        } catch (error) {
          if (error.status === 1) return false;
          throw error;
        }
      },
    );
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `publish=${publish}\nbaseline=${baseline ?? "none"}\n`,
    );
    console.log(JSON.stringify({ revision, baseline, publish }));
  } catch (error) {
    console.error(`Pending deployment check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
