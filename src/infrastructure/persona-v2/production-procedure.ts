import { join } from "node:path";
import { validatePersonaProductionConfiguration } from "../../config/persona-production.js";

export type ProductionCommand = (
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
) => string;

/** Operator-only orchestration. No retries, rollback, image build or implicit migration. */
export function runPersonaProductionProcedure(input: {
  mode: "check" | "migrate" | "start";
  artifactDirectory: string;
  node: string;
  env: Record<string, string | undefined>;
  candidate: { imageRevision: string; imageId: string };
  run: ProductionCommand;
}): void {
  const { run, node, artifactDirectory, candidate } = input;
  if (!["check", "migrate", "start"].includes(input.mode)) throw new Error("Unknown phase.");
  const env: Record<string, string | undefined> = {
    ...input.env,
    PERSONA_V2_IMAGE_REVISION: candidate.imageRevision,
  };
  run(
    node,
    [
      "scripts/check-persona-release.mjs",
      "--image-proof",
      join(artifactDirectory, "image-proof.json"),
    ],
    env,
  );
  validatePersonaProductionConfiguration(env);
  run(node, ["scripts/check-node-version.mjs"], env);
  run(node, ["scripts/accepted-image-origin.mjs"], env);
  run(node, ["scripts/tested-image.mjs", "verify", artifactDirectory], env);
  const images = JSON.parse(
    run("docker", ["image", "inspect", env.PERSONA_V2_PRODUCTION_IMAGE!], env),
  ) as { Id?: unknown }[];
  if (!Array.isArray(images) || images.length !== 1 || images[0]?.Id !== candidate.imageId) {
    throw new Error("Configured image differs from accepted image.");
  }
  run(
    node,
    ["scripts/tested-image.mjs", "verify-loaded", artifactDirectory, candidate.imageId],
    env,
  );
  // Explicit file/project and empty env-file prevent accidental legacy .env/compose discovery.
  const compose = [
    "compose",
    "--project-name",
    "se7e-persona-v2-production",
    "--env-file",
    "/dev/null",
    "-f",
    "docker-compose.persona-v2.production.yml",
  ];
  run("docker", [...compose, "config", "--quiet"], env);
  if (input.mode === "check") return;

  const ids = run("docker", [...compose, "ps", "--all", "--quiet", "server", "worker"], env).trim();
  if (ids) {
    const containers = ids.split(/\s+/);
    if (!containers.every((id) => /^[a-f0-9]{12,64}$/.test(id)))
      throw new Error("Invalid container identity.");
    const states = JSON.parse(run("docker", ["inspect", ...containers], env)) as {
      State?: { Status?: unknown };
    }[];
    if (
      !Array.isArray(states) ||
      states.length !== containers.length ||
      states.some((c) => c.State?.Status !== "exited")
    ) {
      throw new Error("Stop server and worker explicitly before migration or start.");
    }
  }
  // Recheck acceptance immediately before the only mutating command.
  run(
    node,
    [
      "scripts/check-persona-release.mjs",
      "--image-proof",
      join(artifactDirectory, "image-proof.json"),
    ],
    env,
  );
  if (input.mode === "migrate") {
    run(
      "docker",
      [
        ...compose,
        "--profile",
        "maintenance",
        "run",
        "--rm",
        "--no-deps",
        "--pull",
        "never",
        "migrate",
      ],
      env,
    );
  } else {
    run(
      "docker",
      [
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
      ],
      env,
    );
  }
}
