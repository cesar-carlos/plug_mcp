import { existsSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { z } from "zod";
import { readChainManifest, chainEngines } from "./chain-manifest.js";
import { fixtureEnvironment } from "./fixture-environment.js";
import { createManualSession, fixtureSessionDeadline } from "./manual-session-contract.js";
import { FixtureProcesses } from "./fixture-processes.js";
import { assertManualFixtureAccess } from "./manual-fixture-access.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { fixtureTablesSchema } from "../../src/domain/persona-v2/publication-fixture.js";

const values = parseArgs({
  options: {
    manifest: { type: "string" },
    hub: { type: "string" },
    agent: { type: "string" },
    flutter: { type: "string" },
    image: { type: "string" },
    minutes: { type: "string", default: "60" },
  },
}).values;
const input = z
  .object({
    manifest: z.string().min(1),
    hub: z.string().min(1),
    agent: z.string().min(1),
    flutter: z.string().min(1),
    image: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    minutes: z.coerce.number().int().min(10).max(120),
  })
  .parse(values);
const project = realpathSync(process.cwd());
const manifest = readChainManifest(realpathSync(input.manifest));
if (!manifest.hubDatabaseUrl || process.platform !== "win32")
  throw new Error("Sessão manual exige fixture Prisma/Windows explícita.");
assertManualFixtureAccess(manifest.root);
if (readdirSync(manifest.root).some((file) => file.startsWith("chain-")))
  throw new Error("Use fixture nova para cada sessão manual; não há retomada automática.");
const hubPath = realpathSync(input.hub),
  agentPath = realpathSync(input.agent),
  flutter = realpathSync(input.flutter);
if (basename(flutter).toLowerCase() !== "flutter.bat" || /[&|<>^%!"\r\n]/.test(flutter))
  throw new Error("Executável Flutter explícito inválido.");
const sessionRoot = join(manifest.root, `chain-${randomUUID().replaceAll("-", "")}`);
mkdirSync(sessionRoot);
writeFileSync(
  join(sessionRoot, "manual-secrets.json"),
  JSON.stringify({ mcpEncryptionKey: randomBytes(32).toString("hex") }),
  { flag: "wx", mode: 0o600 },
);
const manualTraining = createManualSession(input.minutes);
const deadline = fixtureSessionDeadline({ manualTraining }, 0);
const sessionManifest = join(sessionRoot, "manifest.json");
const publicationTables = fixtureTablesSchema.parse([
  {
    table: "publication_orders",
    columns: [
      { name: "id", type: "integer" },
      { name: "marker", type: "string", nullable: true },
      { name: "revision", type: "integer" },
    ],
    primaryKey: ["id"],
  },
]);
writeFileSync(
  sessionManifest,
  JSON.stringify({
    ...manifest,
    sessionRoot,
    manualTraining,
    engines: Object.fromEntries(
      chainEngines.map((dialect) => [dialect, { ...manifest.engines[dialect], publicationTables }]),
    ),
  }),
  { flag: "wx", mode: 0o600 },
);
const processes = new FixtureProcesses(sessionRoot);
const env: NodeJS.ProcessEnv = {
  ...fixtureEnvironment(process.env),
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  CONTAINER_PERSISTENCE_MODE: "prisma",
  CONTAINER_EMAIL_SENDER_MODE: "noop",
  PERSONA_CHAIN_MANIFEST: sessionManifest,
  PERSONA_CHAIN_CANDIDATE_IMAGE: input.image,
  DATABASE_URL: manifest.hubDatabaseUrl,
  JWT_ACCESS_SECRET: randomUUID().repeat(2),
  JWT_REFRESH_SECRET: randomUUID().repeat(2),
  AGENT_HUB_PRESENCE_REDIS_URL: "",
  HUB_INSTANCE_ID: "",
  INTEGRATION_REDIS_TESTS_ENABLED: "false",
  SOCKET_IO_REDIS_ADAPTER_URL: "",
  SOCKET_RATE_LIMIT_REDIS_URL: "",
  REST_RATE_LIMIT_REDIS_URL: "",
  REST_SOCKET_EVENT_IDEMPOTENCY_REDIS_URL: "",
  AGENT_EVENT_STREAM_REDIS_URL: "",
};
const hubSchema = z.object({
  hubUrl: z.url(),
  persistence: z.literal("prisma"),
  client: z.object({ email: z.email(), password: z.string().min(1) }),
  engines: z.record(z.string(), z.object({ agentId: z.uuid() })),
});
const agentsSchema = z.record(z.string(), z.object({ clientToken: z.string().min(1) }));
let stop = false;
process.once("SIGINT", () => {
  stop = true;
});
process.once("SIGTERM", () => {
  stop = true;
});
let success = false;
let stopFailed: boolean;
try {
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
  const hubUrl = new URL(hub.hubUrl);
  if (
    hubUrl.protocol !== "http:" ||
    hubUrl.hostname !== "127.0.0.1" ||
    !hubUrl.port ||
    hubUrl.pathname !== "/" ||
    hubUrl.username ||
    hubUrl.password ||
    hubUrl.search ||
    hubUrl.hash
  )
    throw new Error("Hub fora da fixture local.");
  processes.launch(
    "cmd.exe",
    [
      "/d",
      "/s",
      "/c",
      flutter,
      "test",
      "--no-pub",
      "tool/homologation/persona_chain_agent_test.dart",
      "--reporter",
      "expanded",
    ],
    agentPath,
    { ...env, PERSONA_CHAIN_AGENT_MANIFEST: join(sessionRoot, "hub-ready.json") },
    "agents",
  );
  const agents = await processes.waitJson("agents-ready.json", agentsSchema);
  const logged = await fetch(`${hub.hubUrl}/api/v1/client-auth/login`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify(hub.client),
  });
  if (!logged.ok) throw new Error("Login técnico da fixture recusado.");
  const jwt = z.object({ accessToken: z.string().min(1) }).parse(await logged.json()).accessToken;
  for (const dialect of chainEngines) {
    const agent = hub.engines[dialect],
      credential = agents[dialect];
    if (!agent || !credential) throw new Error("Agente de fixture ausente.");
    const saved = await fetch(
      `${hub.hubUrl}/api/v1/client/me/agents/${agent.agentId}/client-token`,
      {
        method: "PUT",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
        body: JSON.stringify({ clientToken: credential.clientToken }),
      },
    );
    if (!saved.ok) throw new Error("Vínculo técnico da fixture recusado.");
  }
  await applyPersonaMigrations(manifest.controlDatabaseUrl);
  const control = new pg.Client({ connectionString: manifest.controlDatabaseUrl });
  await control.connect();
  try {
    const count = await control.query<{ n: string }>("SELECT count(*) n FROM persona");
    if (count.rows[0]?.n !== "0")
      throw new Error("Controle não vazio; sessão manual recusada sem apagar dados.");
  } finally {
    await control.end();
  }
  processes.launch(
    process.execPath,
    [
      resolve(project, "node_modules/tsx/dist/cli.mjs"),
      resolve(project, "tests/helpers/persona-chain-container.ts"),
    ],
    sessionRoot,
    env,
    "mcp",
  );
  const mcp = await processes.waitJson("mcp-ready.json", z.object({ url: z.url() }));
  const url = new URL(mcp.url);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Console fora do endpoint local da fixture.");
  const accessFile = join(sessionRoot, "manual-access.json");
  writeFileSync(
    accessFile,
    JSON.stringify({
      login: hub.client,
      sources: chainEngines.map((dialect) => ({
        name: `Fixture ${dialect}`,
        purpose: "Dados sintéticos para treinamento manual",
        environment: "test",
        agentId: hub.engines[dialect]!.agentId,
        dialect,
        email: hub.client.email,
        password: hub.client.password,
        clientToken: agents[dialect]!.clientToken,
      })),
    }),
    { flag: "wx", mode: 0o600 },
  );
  const ready = {
    format: "persona-manual-ready-v1",
    runId: manifest.runId,
    sessionRoot,
    consoleUrl: `${mcp.url}/app`,
    expiresAt: manualTraining.expiresAt,
    accessFile,
    stopFile: join(sessionRoot, "manual-stop"),
    initialPersonas: 0,
    worker: true,
    image: input.image,
  };
  writeFileSync(join(manifest.root, "manual-ready.json"), JSON.stringify(ready), {
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify(ready)}\n`);
  while (!stop && Date.now() < deadline && !existsSync(ready.stopFile)) {
    processes.assertRunning();
    await delay(250);
  }
  success = true;
} finally {
  for (const name of ["mcp", "agents", "hub"])
    writeFileSync(join(sessionRoot, `${name}-stop`), "stop");
  const stopped = await processes.stop();
  writeFileSync(
    join(manifest.root, "manual-stopped.json"),
    JSON.stringify({
      format: "persona-manual-stopped-v1",
      runId: manifest.runId,
      sessionRoot,
      processesStopped: stopped.stopped,
      success: success && stopped.clean,
    }),
    { flag: "wx", mode: 0o600 },
  );
  stopFailed = !stopped.stopped || !stopped.clean;
}
if (stopFailed)
  throw new Error("Serviço não confirmou parada limpa; conserve a fixture para diagnóstico.");
