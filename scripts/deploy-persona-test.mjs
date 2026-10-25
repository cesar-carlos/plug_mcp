import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, lstatSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { verifyLoadedIdentity } from "./tested-image-identity.mjs";

export function runTestDeployment({ revision, imageId, envFile, run }) {
  if (
    !/^[a-f0-9]{40}$/.test(revision) ||
    !/^sha256:[a-f0-9]{64}$/.test(imageId) ||
    !envFile.startsWith("/")
  )
    throw new Error("Invalid deployment identity.");
  const images = JSON.parse(run(["image", "inspect", imageId]));
  const image = images[0];
  if (
    images.length !== 1 ||
    image.Id !== imageId ||
    image.Os !== "linux" ||
    image.Architecture !== "amd64" ||
    image.Config?.Entrypoint?.join(" ") !== "./docker-entrypoint-persona-v2.sh" ||
    image.Config.Labels?.["io.se7e.runtime"] !== "persona-v2-test-server" ||
    !image.Config.Env?.includes(`GIT_SHA=${revision}`)
  )
    throw new Error("Loaded image differs from verified test image.");
  const compose = [
    "compose",
    "--project-name",
    "se7e-persona-v2-test",
    "--env-file",
    envFile,
    "-f",
    "docker-compose.persona-v2.test.yml",
  ];
  run([...compose, "config", "--quiet"]);
  run([
    ...compose,
    "--profile",
    "maintenance",
    "run",
    "--rm",
    "--no-deps",
    "--pull",
    "never",
    "check",
  ]);
  run([...compose, "stop", "--timeout", "30", "server", "worker"]);
  const ids = run([...compose, "ps", "--all", "--quiet", "server", "worker"]).trim();
  if (ids) {
    const list = ids.split(/\s+/);
    if (!list.every((id) => /^[a-f0-9]{12,64}$/.test(id)))
      throw new Error("Invalid container identity.");
    const states = JSON.parse(run(["inspect", ...list]));
    if (
      !Array.isArray(states) ||
      states.length !== list.length ||
      states.some(
        (item) =>
          item.State?.Status !== "exited" ||
          item.State.ExitCode !== 0 ||
          item.State.OOMKilled !== false,
      )
    )
      throw new Error("Services did not stop cleanly; investigate before migration.");
  }
  run([
    ...compose,
    "--profile",
    "maintenance",
    "run",
    "--rm",
    "--no-deps",
    "--pull",
    "never",
    "migrate",
  ]);
  run([
    ...compose,
    "up",
    "--detach",
    "--no-deps",
    "--no-build",
    "--pull",
    "never",
    "--wait",
    "--wait-timeout",
    "120",
    "server",
    "worker",
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [revision, imageId, hash, archive, envFile, ...extra] = process.argv.slice(2);
    if (process.platform !== "linux" || extra.length || !/^[a-f0-9]{64}$/.test(hash ?? ""))
      throw new Error("Invalid arguments.");
    const stat = lstatSync(archive);
    const settings = lstatSync(envFile);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size <= 0 ||
      stat.size > 16 * 1024 ** 3 ||
      !settings.isFile() ||
      settings.isSymbolicLink() ||
      (settings.mode & 0o077) !== 0 ||
      settings.uid !== process.getuid()
    )
      throw new Error("Private deployment files required.");
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(archive)) digest.update(chunk);
    if (digest.digest("hex") !== hash) throw new Error("Archive changed in transit.");
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, PERSONA_V2_TEST_IMAGE: imageId };
    const run = (args) =>
      execFileSync("docker", args, {
        env,
        encoding: "utf8",
        stdio: "pipe",
        timeout: 300000,
        maxBuffer: 8 * 1024 * 1024,
      });
    run(["load", "--input", archive]);
    // CI uses this fixed export tag. Prove its immutable identity from the verified
    // archive when Docker's config/OCI representation differs on the target host.
    const [loaded] = JSON.parse(run(["image", "inspect", "se7e-test-server"]));
    verifyLoadedIdentity(imageId, { imageId: loaded.Id, descriptor: loaded.Descriptor }, (id) =>
      execFileSync("tar", ["-xOf", archive, `blobs/sha256/${id.slice(7)}`], {
        stdio: "pipe",
        maxBuffer: 65536,
        timeout: 30000,
      }),
    );
    env.PERSONA_V2_TEST_IMAGE = loaded.Id;
    runTestDeployment({ revision, imageId: loaded.Id, envFile, run });
    console.log(`Persona-v2 test server ready at revision ${revision}; no client release granted.`);
  } catch {
    console.error(
      "Test deployment interrupted. Inspect service state and private configuration; no retry or rollback was attempted.",
    );
    process.exitCode = 1;
  }
}
