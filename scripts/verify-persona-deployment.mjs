import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const names = ["se7e-persona-v2-test-server-1", "se7e-persona-v2-test-worker-1"];
const jobs = ["review", "ephemeral", "retention", "outbox"];

class ObservationFailure extends Error {
  constructor(code, summary) {
    super("Post-deploy observation failed.");
    this.code = code;
    this.summary = summary;
  }
}
export function observationFailure(error) {
  return error instanceof ObservationFailure
    ? { code: error.code, ...(error.summary ? { summary: error.summary } : {}) }
    : { code: "OBSERVATION_FAILED" };
}

export function safeLogSummary(log) {
  const lines = log.split(/\r?\n/).filter(Boolean);
  const result = {
    warnings: 0,
    errors: 0,
    nonJson: 0,
    supportIds: [],
    completedJobs: [],
    possiblyTruncated: lines.length >= 1000,
  };
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      result.nonJson++;
      continue;
    }
    if (!entry || typeof entry !== "object") {
      result.nonJson++;
      continue;
    }
    if (entry.level === 40) result.warnings++;
    if (typeof entry.level === "number" && entry.level >= 50) result.errors++;
    if (
      entry.level >= 40 &&
      typeof entry.supportId === "string" &&
      /^[a-f0-9-]{36}$/.test(entry.supportId) &&
      result.supportIds.length < 20
    )
      result.supportIds.push(entry.supportId);
    for (const job of jobs)
      if (entry.msg === `persona ${job} worker completed` && !result.completedJobs.includes(job))
        result.completedJobs.push(job);
  }
  return result;
}

/** Read-only checks. Never retries migrations, SQL, deploys or service mutations. */
export async function verifyPersonaDeployment({
  revision,
  imageId,
  run,
  wait = sleep,
  attempts = 20,
}) {
  if (
    !/^[a-f0-9]{40}$/.test(revision) ||
    !/^sha256:[a-f0-9]{64}$/.test(imageId) ||
    !Number.isInteger(attempts) ||
    attempts < 1 ||
    attempts > 30
  )
    throw new ObservationFailure("INVALID_EXPECTED_IDENTITY");
  for (let attempt = 0; attempt < attempts; attempt++) {
    const containers = [];
    for (const name of names) {
      const items = JSON.parse(run(["inspect", name]));
      if (!Array.isArray(items) || items.length !== 1)
        throw new ObservationFailure("CONTAINER_IDENTITY_UNAVAILABLE");
      const item = items[0];
      if (
        item.Name !== `/${name}` ||
        item.Image !== imageId ||
        !item.Config?.Env?.includes(`GIT_SHA=${revision}`) ||
        !item.Config.Env.includes("PERSONA_V2_DEPLOYMENT=test-server") ||
        item.RestartCount !== 0 ||
        item.State?.OOMKilled !== false ||
        !Number.isFinite(Date.parse(item.State?.StartedAt))
      )
        throw new ObservationFailure("CONTAINER_IDENTITY_OR_LIFECYCLE_MISMATCH");
      const logs = safeLogSummary(
        run(["logs", "--since", item.State.StartedAt, "--tail", "1000", name]),
      );
      containers.push({
        service: name === names[0] ? "server" : "worker",
        healthy: item.State.Status === "running" && item.State.Health?.Status === "healthy",
        ...logs,
      });
    }
    if (
      containers.every((item) => item.healthy) &&
      jobs.every((job) => containers[1].completedJobs.includes(job))
    ) {
      if (containers.some((item) => item.errors))
        throw new ObservationFailure("RUNTIME_ERRORS_OBSERVED", { revision, imageId, containers });
      return {
        revision,
        imageId,
        logLimit: 1000,
        logReviewRequired: containers.some(
          (item) => item.warnings || item.nonJson || item.possiblyTruncated,
        ),
        containers,
      };
    }
    if (attempt + 1 < attempts) await wait(3000);
  }
  throw new ObservationFailure("HEALTH_OR_WORKER_CYCLE_UNCONFIRMED");
}

export function dockerRead(args) {
  const result = spawnSync("docker", args, {
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 2 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0)
    throw new ObservationFailure("DOCKER_OBSERVATION_FAILED");
  return result.stdout + (args[0] === "logs" ? result.stderr : "");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [revision, imageId, ...extra] = process.argv.slice(2);
    if (extra.length) throw Error("Invalid arguments");
    console.log(
      JSON.stringify(await verifyPersonaDeployment({ revision, imageId, run: dockerRead })),
    );
  } catch (error) {
    console.error(JSON.stringify(observationFailure(error)));
    console.error(
      "Post-deploy verification failed; inspect service state. No secrets or raw logs emitted.",
    );
    process.exitCode = 1;
  }
}
