import { mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { readChainManifest } from "./chain-manifest.js";
import { assertManualFixtureAccess } from "./manual-fixture-access.js";
import { fixtureEnvironment } from "./fixture-environment.js";
import { FixtureProcesses } from "./fixture-processes.js";
import { nativeDiscoverySchema } from "./native-desktop-contract.js";

const input = z
  .object({
    manifest: z.string().min(1),
    hub: z.string().min(1),
    agent: z.string().min(1),
    python: z.string().min(1),
    proof: z.string().min(1),
  })
  .parse(
    parseArgs({
      options: Object.fromEntries(
        ["manifest", "hub", "agent", "python", "proof"].map((name) => [name, { type: "string" }]),
      ),
    }).values,
  );
const manifest = readChainManifest(realpathSync(input.manifest));
if (process.platform !== "win32" || !manifest.hubDatabaseUrl)
  throw new Error("Bootstrap compilado exige fixture Windows/Prisma explícita.");
assertManualFixtureAccess(manifest.root);
if (readdirSync(manifest.root).some((name) => name.startsWith("chain-")))
  throw new Error("Use uma fixture nova; bootstrap compilado não retoma rodadas anteriores.");
const hubPath = realpathSync(input.hub),
  agentPath = realpathSync(input.agent),
  python = realpathSync(input.python),
  proof = realpathSync(input.proof);
const sessionRoot = join(manifest.root, `chain-${randomUUID().replaceAll("-", "")}`);
mkdirSync(sessionRoot);
const sessionManifest = join(sessionRoot, "manifest.json");
writeFileSync(sessionManifest, JSON.stringify({ ...manifest, sessionRoot }), { flag: "wx" });
const processes = new FixtureProcesses(sessionRoot);
const env = {
  ...fixtureEnvironment(process.env),
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CONTAINER_PERSISTENCE_MODE: "prisma",
  CONTAINER_EMAIL_SENDER_MODE: "noop",
  PERSONA_CHAIN_MANIFEST: sessionManifest,
  DATABASE_URL: manifest.hubDatabaseUrl,
  JWT_ACCESS_SECRET: randomUUID().repeat(2),
  JWT_REFRESH_SECRET: randomUUID().repeat(2),
};
const nativeSchema = z.object({
  format: z.literal("native-bootstrap-input-v1"),
  root: z.string(),
  executable: z.string(),
  revision: z.string().regex(/^[a-f0-9]{40}$/),
  identity: z.string().regex(/^PlugAgenteHomologacao_[a-f0-9]{12}$/),
  proofSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const hubSchema = z.object({
  hubUrl: z.url(),
  persistence: z.literal("prisma"),
  client: z.object({ email: z.email(), password: z.string() }),
  engines: z.object({
    postgres: z.object({
      agentId: z.uuid(),
      agentAuthToken: z.string(),
      agentRefreshToken: z.string(),
    }),
  }),
});
const readySchema = z.object({
  core: z.literal(true),
  firstFrame: z.literal(true),
  sqlOperationsDefault: z.literal(false),
  configCount: z.literal(1),
  configuredAutoSession: z.literal(true),
  secretRoundtrip: z.literal(true),
  databaseIntegrity: z.literal("ok"),
  configId: z.uuid(),
  instanceId: z.string().startsWith("inst-"),
  sessionId: z.string().startsWith("sess-"),
});
let desktopRoot: string | undefined;
let success = false;
let stopFailed: boolean;
const phases: string[] = [];
try {
  const verified = processes.launch(
    python,
    ["-m", "tool.updater.bootstrap_fixture_input", "--proof", proof],
    agentPath,
    fixtureEnvironment(process.env),
    "proof",
  );
  await processes.completed(verified, 180_000);
  const native = nativeSchema.parse(
    JSON.parse(readFileSync(join(sessionRoot, "proof.log"), "utf8")),
  );
  desktopRoot = realpathSync(native.root);
  if (
    dirname(desktopRoot) !== realpathSync(tmpdir()) ||
    !/^sql-operation-bootstrap-[a-zA-Z0-9_-]+$/.test(basename(desktopRoot))
  )
    throw new Error("Workspace do aplicativo fora da fixture temporária.");
  const migration = processes.launch(
    process.execPath,
    [
      join(hubPath, "node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
      "--config",
      join(hubPath, "prisma.config.ts"),
    ],
    sessionRoot,
    env,
    "hub-migrations",
  );
  await processes.completed(migration);
  processes.launch(
    process.execPath,
    [
      join(hubPath, "node_modules/tsx/dist/cli.mjs"),
      join(hubPath, "tool/homologation/persona_chain_hub.cts"),
    ],
    sessionRoot,
    env,
    "hub",
  );
  const hub = await processes.waitJson("hub-ready.json", hubSchema);
  const url = new URL(hub.hubUrl);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error("Hub fora do endpoint local da fixture.");
  const agent = hub.engines.postgres;
  writeFileSync(
    join(desktopRoot, "profile-bootstrap.json"),
    JSON.stringify({
      serverUrl: hub.hubUrl,
      agentId: agent.agentId,
      accessToken: agent.agentAuthToken,
      refreshToken: agent.agentRefreshToken,
    }),
    { flag: "wx" },
  );
  const login = await fetch(`${hub.hubUrl}/api/v1/client-auth/login`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify(hub.client),
  });
  if (!login.ok) throw new Error("Login Client de fixture recusado.");
  const jwt = z.object({ accessToken: z.string() }).parse(await login.json()).accessToken;
  let previous: z.infer<typeof readySchema> | undefined;
  for (const phase of ["cold", "restart"]) {
    for (const name of ["stop", "boot-ready.json", "boot-closed"])
      rmSync(join(desktopRoot, name), { force: true });
    const desktop = processes.launch(
      native.executable,
      [],
      desktopRoot,
      {
        ...fixtureEnvironment(process.env),
        PLUG_AGENT_BOOTSTRAP_ROOT: desktopRoot,
        PLUG_AGENT_BOOTSTRAP_URL: hub.hubUrl,
        PLUG_AGENT_BOOTSTRAP_PROFILE: "configured",
      },
      `desktop-${phase}`,
    );
    const until = Date.now() + 90_000;
    let ready: z.infer<typeof readySchema> | undefined;
    while (!ready && Date.now() < until) {
      processes.assertRunning();
      try {
        ready = readySchema.parse(
          JSON.parse(readFileSync(join(desktopRoot, "boot-ready.json"), "utf8")),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (!ready) await delay(100);
    }
    if (!ready) throw new Error("Aplicativo não confirmou bootstrap no prazo.");
    if (
      previous &&
      (ready.configId !== previous.configId ||
        ready.instanceId !== previous.instanceId ||
        ready.sessionId === previous.sessionId)
    )
      throw new Error("Identidade persistente ou sessão após reinício inválida.");
    previous = ready;
    const response = await fetch(`${hub.hubUrl}/api/v1/agents/commands`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({
        agentId: agent.agentId,
        command: { jsonrpc: "2.0", id: randomUUID(), method: "rpc.discover", params: {} },
      }),
    });
    if (!response.ok) throw new Error(`Descoberta pela cadeia recusada (${response.status}).`);
    nativeDiscoverySchema.parse(await response.json());
    writeFileSync(join(desktopRoot, "stop"), "stop");
    await processes.completed(desktop, 30_000);
    if (readFileSync(join(desktopRoot, "boot-closed"), "utf8") !== "verified")
      throw new Error("Aplicativo não confirmou encerramento limpo.");
    rmSync(join(desktopRoot, "profile-bootstrap.json"), { force: true });
    phases.push(phase);
  }
  writeFileSync(
    join(sessionRoot, "native-result.json"),
    JSON.stringify({
      format: "native-bootstrap-result-v1",
      revision: native.revision,
      proofSha256: native.proofSha256,
      persistence: "prisma",
      phases,
      discovery: true,
      installationPerformed: false,
      installedState: "not_checked",
    }),
  );
  success = true;
} finally {
  if (desktopRoot) writeFileSync(join(desktopRoot, "stop"), "stop");
  writeFileSync(join(sessionRoot, "hub-stop"), "stop");
  const stopped = await processes.stop();
  writeFileSync(
    join(manifest.root, "native-stopped.json"),
    JSON.stringify({
      format: "native-bootstrap-stopped-v1",
      sessionRoot,
      desktopRoot,
      success,
      stopped: stopped.stopped,
      clean: stopped.clean,
    }),
  );
  stopFailed = !stopped.stopped || !stopped.clean;
}
if (stopFailed) throw new Error("Conserve a fixture: parada limpa não comprovada.");
process.stdout.write(
  `${JSON.stringify({ success, phases, sessionRoot, installationPerformed: false, installedState: "not_checked" })}\n`,
);
