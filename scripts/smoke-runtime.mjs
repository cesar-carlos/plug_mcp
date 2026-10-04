import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";

const database = process.env.DATABASE_URL;
if (process.env.CI !== "true" || !database || !new URL(database).pathname.includes("ci")) {
  throw new Error("runtime:check requires an isolated CI database");
}
const port = process.env.RUNTIME_CHECK_PORT ?? "53333";
const env = {
  ...process.env,
  NODE_ENV: "production",
  HOST: "127.0.0.1",
  PORT: port,
  PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
  LOG_LEVEL: "error",
};
const children = [];
let failed = false;
const start = (path) => {
  const child = spawn(process.execPath, [path], {
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  child.stderr.on("data", () => {
    failed = true;
  });
  child.stdout.on("data", (data) => {
    if (String(data).includes("tick failed")) failed = true;
  });
  return child;
};
try {
  if (process.argv.includes("--migrate")) {
    const migration = start("dist/infrastructure/persistence/migrate.js");
    const code = await new Promise((resolve, reject) => {
      migration.once("error", reject);
      migration.once("exit", resolve);
    });
    assert.equal(code, 0, "packaged migrations failed");
  }
  const server = start("dist/main.js");
  const worker = start("dist/worker-operacoes.js");
  let healthy = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    assert.equal(server.exitCode, null, "server exited");
    assert.equal(worker.exitCode, null, "worker exited");
    try {
      healthy = (
        await fetch(`${env.PUBLIC_BASE_URL}/health`, { signal: AbortSignal.timeout(1000) })
      ).ok;
    } catch {
      /* inicialização em andamento */
    }
    if (healthy) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(healthy, "server health timeout");
  assert.ok((await fetch(`${env.PUBLIC_BASE_URL}/ready`)).ok, "database readiness failed");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  assert.equal(worker.exitCode, null);
  assert.equal(failed, false, "runtime diagnostic reported an error");
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  assert.equal((await fileTypeFromBuffer(png))?.mime, "image/png");
  console.log(
    JSON.stringify({
      node: process.version,
      arch: process.arch,
      server: "ready",
      worker: "running",
      nativePng: true,
    }),
  );
} finally {
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
}
