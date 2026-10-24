import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, rmdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPersonaProductionProcedure } from "../src/infrastructure/persona-v2/production-procedure.js";

// Fixed lock across checkouts on the same Linux host. A stale lock requires operator review.
const lock = "/tmp/se7e-persona-v2-production.lock";
let ownsLock = false;
try {
  const [mode, artifactDirectory, ...extra] = process.argv.slice(2);
  if (
    process.platform !== "linux" ||
    !artifactDirectory ||
    extra.length ||
    !["check", "migrate", "start"].includes(mode ?? "")
  ) {
    throw new Error("Explicit phase and artifact directory required on Linux.");
  }
  const artifacts = resolve(artifactDirectory);
  process.chdir(fileURLToPath(new URL("..", import.meta.url)));
  mkdirSync(lock, { mode: 0o700 });
  ownsLock = true;
  const manifest = JSON.parse(readFileSync("contracts/persona-v2-release.json", "utf8")) as {
    candidate?: { imageRevision: string; imageId: string };
  };
  runPersonaProductionProcedure({
    mode: mode as "check" | "migrate" | "start",
    artifactDirectory: artifacts,
    node: process.execPath,
    candidate: manifest.candidate ?? { imageRevision: "", imageId: "" },
    env: { ...process.env, GITHUB_OUTPUT: join(lock, "origin-output") },
    run: (command, args, env) =>
      execFileSync(command, args, {
        env,
        encoding: "utf8",
        stdio: "pipe",
        timeout: 300_000,
        maxBuffer: 4 * 1024 * 1024,
      }),
  });
  process.stdout.write(
    `Etapa ${mode} concluída; não altera o proxy nem autoriza efeitos de negócio.\n`,
  );
} catch {
  process.stderr.write(
    "Procedimento v2 recusado ou interrompido. Confira evidências, configuração, imagem e estado dos serviços; não repetir mutações sem conferir o estado.\n",
  );
  process.exitCode = 1;
} finally {
  if (ownsLock) {
    rmSync(join(lock, "origin-output"), { force: true });
    rmdirSync(lock);
  }
}
