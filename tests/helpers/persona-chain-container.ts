import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { readChainManifest } from "../../scripts/homologation/chain-manifest.js";
import { testConfig } from "../../src/config/env.js";
import {
  fixtureSessionDeadline,
  manualSecretsSchema,
} from "../../scripts/homologation/manual-session-contract.js";

// Docker Desktop routes only these already-verified loopback fixture endpoints.
function containerUrl(raw: string): string {
  const url = new URL(raw);
  if (url.hostname !== "127.0.0.1" || !url.port) throw new Error("Fixture endpoint required.");
  url.hostname = "host.docker.internal";
  return url.toString();
}
function docker(...args: string[]): string {
  try {
    return execFileSync("docker", args, { encoding: "utf8", stdio: "pipe", timeout: 30000 }).trim();
  } catch {
    // Docker errors can include configuration. Keep fixture credentials out of runner output.
    throw new Error("Candidate container command failed; inspect only owned fixture metadata.");
  }
}
const manifestPath = process.env.PERSONA_CHAIN_MANIFEST;
const image = process.env.PERSONA_CHAIN_CANDIDATE_IMAGE;
if (
  !manifestPath ||
  process.env.NODE_ENV !== "test" ||
  !image ||
  !/^sha256:[a-f0-9]{64}$/.test(image)
)
  throw new Error("Explicit immutable candidate image and fixture manifest required.");
const sessionRoot = realpathSync(dirname(manifestPath));
const sessionManifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
const manual = Object.prototype.hasOwnProperty.call(sessionManifest, "manualTraining");
if (manual) fixtureSessionDeadline(sessionManifest, 0);
const manifest = readChainManifest(join(dirname(sessionRoot), "manifest.json"));
if (
  dirname(sessionRoot) !== manifest.root ||
  !/^chain-[a-f0-9]{32}$/.test(basename(sessionRoot)) ||
  realpathSync(process.cwd()) !== sessionRoot
)
  throw new Error("Container controller outside fixture session.");
const hub = JSON.parse(readFileSync(join(sessionRoot, "hub-ready.json"), "utf8")) as {
  hubUrl: string;
};
const hubAddress = new URL(hub.hubUrl);
if (
  hubAddress.protocol !== "http:" ||
  hubAddress.hostname !== "127.0.0.1" ||
  hubAddress.pathname !== "/" ||
  hubAddress.username ||
  hubAddress.password ||
  hubAddress.search ||
  hubAddress.hash
)
  throw new Error("Invalid isolated hub origin.");
const imageConfig = JSON.parse(
  docker("image", "inspect", image, "--format", "{{json .Config}}"),
) as { Entrypoint: string[]; Env: string[] };
if (
  imageConfig.Entrypoint.join(" ") !== "./docker-entrypoint-persona-v2.sh" ||
  !imageConfig.Env.includes("NODE_ENV=development")
)
  throw new Error("Image is not the isolated persona-v2 candidate.");
const bootPath = join(sessionRoot, "mcp-boot.json");
let port: number;
if (existsSync(bootPath)) {
  port = (JSON.parse(readFileSync(bootPath, "utf8")) as { port: number }).port;
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid fixture port.");
} else {
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("Invalid fixture endpoint.");
  port = address.port;
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  writeFileSync(bootPath, JSON.stringify({ port }), { flag: "wx" });
}
const url = `http://127.0.0.1:${port}`;
const name = `${manifest.runId}-${basename(sessionRoot)}-mcp`;
const envPath = join(sessionRoot, "mcp-container.env");
let manualKey: string | undefined;
if (manual) {
  try {
    const parsed = manualSecretsSchema.safeParse(
      JSON.parse(readFileSync(join(sessionRoot, "manual-secrets.json"), "utf8")),
    );
    if (!parsed.success) throw new Error("invalid");
    manualKey = parsed.data.mcpEncryptionKey;
  } catch {
    throw new Error("Cofre da sessão manual indisponível ou inválido.");
  }
}
const config = testConfig(manualKey ? { MCP_ENCRYPTION_KEY: manualKey } : {});
const workerHealthPort = 3335;
const environment = {
  NODE_ENV: "test",
  HOST: "0.0.0.0",
  PORT: "3333",
  PUBLIC_BASE_URL: url,
  DATABASE_URL: containerUrl(manifest.controlDatabaseUrl),
  PLUG_SERVER_BASE_URL: hub.hubUrl,
  MCP_ENCRYPTION_KEY: config.MCP_ENCRYPTION_KEY,
  LOG_LEVEL: "silent",
  ...(manual ? { PERSONA_V2_WORKER_HEALTH_PORT: String(workerHealthPort) } : {}),
};
writeFileSync(
  envPath,
  Object.entries(environment)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n"),
  { flag: "wx", mode: 0o600 },
);
const created: string[] = [];
const workerName = `${name}-worker`;
function cleanupContainer(target: string): void {
  const owner = docker(
    "inspect",
    target,
    "--format",
    '{{index .Config.Labels "se7e.persona.session"}}|{{index .Config.Labels "se7e.persona.fixture"}}',
  );
  if (owner !== `${basename(sessionRoot)}|${manifest.runId}`)
    throw new Error("Container ownership mismatch; cleanup refused.");
  docker("stop", "--time", "15", target);
  docker("rm", target);
}
try {
  docker(
    "create",
    "--name",
    name,
    "--label",
    `se7e.persona.fixture=${manifest.runId}`,
    "--label",
    `se7e.persona.session=${basename(sessionRoot)}`,
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    "--tmpfs",
    "/tmp:size=64m,mode=1777",
    "--env-file",
    envPath,
    "-p",
    `127.0.0.1:${port}:3333`,
    image,
    "server",
  );
  created.push(name);
  if (manual) {
    docker(
      "create",
      "--name",
      workerName,
      "--label",
      `se7e.persona.fixture=${manifest.runId}`,
      "--label",
      `se7e.persona.session=${basename(sessionRoot)}`,
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges:true",
      "--tmpfs",
      "/tmp:size=64m,mode=1777",
      "--network",
      `container:${name}`,
      "--env-file",
      envPath,
      image,
      "worker",
    );
    created.push(workerName);
  }
  unlinkSync(envPath);
  docker("start", name);
  // Keep the hub origin identical to the agent's persisted configuration.
  // A fixture-only TCP relay changes routing, never HTTP/RPC content or authority.
  const relayPort = Number(hubAddress.port);
  if (
    !Number.isInteger(relayPort) ||
    relayPort < 1024 ||
    relayPort > 65535 ||
    relayPort === 3333 ||
    (manual && relayPort === workerHealthPort)
  )
    throw new Error("Invalid isolated hub relay port.");
  docker(
    "exec",
    "-d",
    name,
    "node",
    "-e",
    `const net=require("node:net");net.createServer(incoming=>{
      const outgoing=net.connect({host:"host.docker.internal",port:${relayPort}});
      incoming.on("error",()=>outgoing.destroy());
      outgoing.on("error",()=>incoming.destroy());
      incoming.on("close",()=>outgoing.destroy());
      outgoing.on("close",()=>incoming.destroy());
      incoming.pipe(outgoing);outgoing.pipe(incoming);
    }).listen(${relayPort},"127.0.0.1");`,
  );
  docker(
    "exec",
    name,
    "node",
    "-e",
    `const net=require("node:net");const end=Date.now()+5000;
    function check(){const s=net.connect({host:"127.0.0.1",port:${relayPort}});
      s.on("connect",()=>{s.destroy();process.exit(0)});
      s.on("error",()=>{s.destroy();if(Date.now()>end)process.exit(1);setTimeout(check,50)});
    }check();`,
  );
  const deadline = Date.now() + 45000;
  while (true) {
    if (docker("inspect", name, "--format", "{{.State.Running}}") !== "true")
      throw new Error("Packaged MCP exited before readiness.");
    const ready = await fetch(`${url}/ready`, { signal: AbortSignal.timeout(1500) })
      .then(
        async (response) =>
          response.ok &&
          ((await response.json()) as { generation: string }).generation === "persona-v2",
      )
      .catch(() => false);
    if (ready) break;
    if (Date.now() >= deadline) throw new Error("Packaged MCP readiness timed out.");
    await delay(100);
  }
  writeFileSync(
    join(sessionRoot, "candidate-image.json"),
    JSON.stringify({
      image,
      runtime: "container",
      gatewayOverrides: false,
      hubLoopbackRelay: true,
      ...(manual ? { worker: true } : {}),
    }),
  );
  if (manual) {
    docker("start", workerName);
    docker(
      "exec",
      workerName,
      "node",
      "-e",
      `const end=Date.now()+10000;async function check(){const healthy=await fetch("http://127.0.0.1:${workerHealthPort}/health").then(r=>r.ok,()=>false);if(healthy)process.exit(0);if(Date.now()>end)process.exit(1);setTimeout(check,100)}check();`,
    );
  }
  writeFileSync(join(sessionRoot, "mcp-ready.json"), JSON.stringify({ url }));
  const stopDeadline = fixtureSessionDeadline(sessionManifest, 15 * 60000);
  while (!existsSync(join(sessionRoot, "mcp-stop"))) {
    if (docker("inspect", name, "--format", "{{.State.Running}}") !== "true")
      throw new Error("Packaged MCP stopped unexpectedly.");
    if (manual && docker("inspect", workerName, "--format", "{{.State.Running}}") !== "true")
      throw new Error("Worker de fixture encerrou inesperadamente.");
    if (Date.now() >= stopDeadline) {
      if (manual) break;
      throw new Error("Controller failed to stop packaged MCP.");
    }
    await delay(500);
  }
} finally {
  for (const target of created.reverse()) cleanupContainer(target);
  if (existsSync(envPath)) unlinkSync(envPath);
}
