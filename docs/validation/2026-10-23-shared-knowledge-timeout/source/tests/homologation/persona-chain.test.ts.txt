import { exerciseKnowledgeHistoryOAuth } from "../helpers/persona-chain-knowledge-history-oauth.js";
import { prepareKnowledgeHistoryOAuth } from "../helpers/persona-chain-knowledge-oauth-fixture.js";
import { recordJourneyTiming } from "../helpers/persona-chain-journey-timing.js";
import {
  exercisePhysicalOAuth,
  physicalOAuthClient,
  physicalOAuthRedirect,
} from "../helpers/persona-chain-physical-oauth.js";
import { exercisePublicationMatrix } from "../helpers/persona-publication-matrix.js";
import { exerciseExampleInactivation } from "../helpers/persona-chain-example-inactivation.js";
import { exerciseExternalDelegation } from "../helpers/persona-chain-external-delegation.js";
import { PersonaOwnerDelegationHub } from "../../src/infrastructure/plug-server/persona-owner-delegation.js";
import { exerciseChainBrowser } from "../helpers/persona-chain-browser.js";
import { exerciseChainCache } from "../helpers/persona-chain-cache.js";
import { execFileSync } from "node:child_process";
import {
  exerciseChainBinaryAttachments,
  chainBinarySamples,
  type ChainBinaryConsumer,
} from "../helpers/persona-chain-attachments.js";
import {
  effectPhases,
  exercisePublicationEffects,
} from "../helpers/persona-publication-effects.js";
import {
  publicationTables,
  exerciseGenericPublication,
  exerciseGenericFederationPublication,
} from "../helpers/persona-publication-cases.js";
import { PersonaSourceQuery } from "../../src/infrastructure/plug-server/persona-source-query.js";
import { withReviewDeadline, reviewDateFixture } from "../helpers/review-deadline.js";
import { readFixtureCapabilities } from "../helpers/persona-chain-capabilities.js";
import { PersonaReviewWorker } from "../../src/application/persona-v2/review-worker.js";
import { PostgresReviewWorker } from "../../src/infrastructure/persistence/persona-v2/review-worker.js";
import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  createWriteStream,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import request from "supertest";
import { beforeAll, afterAll, expect, it } from "vitest";
import { readChainManifest, chainEngines } from "../../scripts/homologation/chain-manifest.js";
import { fixtureEnvironment } from "../../scripts/homologation/fixture-environment.js";
import { testConfig } from "../../src/config/env.js";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { PostgresPersonaRepository } from "../../src/infrastructure/persistence/persona-v2/repository.js";
import {
  runOperationCases,
  type IsolatedOperationCaseExecutor,
} from "../../src/application/persona-v2/operation-cases.js";
import { expectedSourceFor } from "../../src/domain/persona-v2/source-discovery.js";
import { parseMcpPayload } from "../helpers/mcp-rpc.js";
import type { Source, Permissions, SkillGrant } from "../../src/domain/persona-v2/model.js";
import type { SourceSchemaEvidence } from "../../src/domain/persona-v2/source-schema.js";
import {
  sourceSchemaResultSchema,
  storedStructureEvidenceSchema,
} from "../../src/domain/persona-v2/source-schema.js";
import type { OperationTraining } from "../../src/domain/persona-v2/operation-training.js";
import {
  federationTraining,
  federationPlan,
  federationCase,
} from "../helpers/persona-v2-federation.js";
import { runFederationCases } from "../../src/application/persona-v2/federation-cases.js";
import { relationshipFixture } from "../helpers/persona-v2-relationships.js";
import {
  compileOperationCommand,
  compileOperationTraining,
} from "../../src/application/persona-v2/operation-training.js";
import { PersonaSqlOperationGateway } from "../../src/infrastructure/plug-server/persona-sql-operation.js";
import { PlugServerRestAdapter } from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { PostgresSourceCredentials } from "../../src/infrastructure/persistence/persona-v2/source-credentials.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";
import { canonicalJson } from "../../src/domain/persona-v2/catalog.js";
import { compileOperationPublication } from "../../src/application/persona-v2/shared-operation-adoption.js";

const manifestPath = process.env.PERSONA_CHAIN_MANIFEST;
if (!manifestPath)
  throw new Error("PERSONA_CHAIN_MANIFEST explícito é obrigatório; não há fallback .env.");
const manifest = readChainManifest(manifestPath);
const persistence = process.env.PERSONA_CHAIN_PERSISTENCE ?? "prisma";
if (!["prisma", "memory"].includes(persistence)) throw new Error("Persistência inválida.");
if (persistence === "prisma" && !manifest.hubDatabaseUrl)
  throw new Error("Prisma exige hubDatabaseUrl dedicado; não há fallback em memória.");
const sessionRoot = join(manifest.root, `chain-${randomUUID().replaceAll("-", "")}`);
mkdirSync(sessionRoot);
const sessionManifest = join(sessionRoot, "manifest.json");
writeFileSync(
  sessionManifest,
  JSON.stringify({
    ...manifest,
    sessionRoot,
    engines: Object.fromEntries(
      chainEngines.map((engine) => [engine, { ...manifest.engines[engine], publicationTables }]),
    ),
  }),
);
const hubPath = resolve(process.env.PERSONA_CHAIN_HUB_CHECKOUT ?? "../plug_server");
const agentPath = resolve(process.env.PERSONA_CHAIN_AGENT_CHECKOUT ?? "../plug_agente");
const children: {
  process: ChildProcess;
  exited: Promise<number | null>;
  stopped: boolean;
}[] = [];
let hubChild: (typeof children)[number];
let agentChild: (typeof children)[number];
let agentGeneration = 0;
let hubEnvironment: NodeJS.ProcessEnv;
let mcpUrl: string;
let mcpChild: (typeof children)[number] | undefined;
let db: pg.Pool;
let hub: {
  hubUrl: string;
  persistence: string;
  resumed: boolean;
  client: { email: string; password: string };
  engines: Record<string, { agentId: string }>;
};
let clientJwt: string, cookie: string, csrf: string, personaId: string, bearer: string;
interface TrainedSource {
  dialect: (typeof chainEngines)[number];
  id: string;
  skillId: string;
  publicationId: string;
  capabilities: string[];
  source: Source;
}
const sources: TrainedSource[] = [];
const binaryConsumers = new Map<string, ChainBinaryConsumer>();
function binarySqlCalls(dialect: string): number {
  const path = join(sessionRoot, `${dialect}-rpc.jsonl`);
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { method: string })
    .filter((entry) => entry.method === "sql.execute").length;
}
function binaryAuthorityCalls(dialect: string): number {
  const path = join(sessionRoot, `${dialect}-rpc.jsonl`);
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { method: string })
    .filter((entry) => ["client_token.getPolicy", "sql.describeSource"].includes(entry.method))
    .length;
}
const genericPublicationSources = new Map<
  string,
  Awaited<ReturnType<typeof exerciseGenericPublication>>
>();
const inspections = new Map<string, { id: string; evidence: SourceSchemaEvidence }>();
const viewEngineVersions = new Map<string, string>();
const verifyRefusalsAfterRestart: (() => Promise<void>)[] = [];
const uncertainReceipts: {
  source: TrainedSource;
  operationId: string;
  fingerprint: string;
  executionId: string;
}[] = [];
const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
const config = testConfig({ DATABASE_URL: manifest.controlDatabaseUrl, LOG_LEVEL: "silent" });
const crypto = new NodeCryptoAdapter(config.MCP_ENCRYPTION_KEY);
const repository = () => new PostgresPersonaRepository(db);

function launch(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string,
) {
  const log = createWriteStream(join(sessionRoot, `${name}.log`));
  const child = spawn(command, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  const exited = new Promise<number | null>((res, rej) => {
    child.once("error", rej);
    child.once("exit", (code) => {
      log.end();
      res(code);
    });
  });
  const tracked = { process: child, exited, stopped: false };
  children.push(tracked);
  return tracked;
}
function launchAgents() {
  const flutter = process.env.FLUTTER_BIN;
  if (!flutter) throw new Error("FLUTTER_BIN explícito obrigatório.");
  agentGeneration += 1;
  return launch(
    process.platform === "win32" ? "cmd.exe" : flutter,
    process.platform === "win32"
      ? [
          "/d",
          "/s",
          "/c",
          flutter,
          "test",
          "--no-pub",
          "tool/homologation/persona_chain_agent_test.dart",
          "--reporter",
          "expanded",
        ]
      : [
          "test",
          "--no-pub",
          "tool/homologation/persona_chain_agent_test.dart",
          "--reporter",
          "expanded",
        ],
    agentPath,
    { ...hubEnvironment, PERSONA_CHAIN_AGENT_MANIFEST: join(sessionRoot, "hub-ready.json") },
    `agents-${agentGeneration}`,
  );
}

async function restartAgents() {
  const original = JSON.parse(readFileSync(join(sessionRoot, "agents-ready.json"), "utf8"));
  writeFileSync(join(sessionRoot, "agents-stop"), "stop");
  expect(await Promise.race([agentChild.exited, delay(20000).then(() => "timeout")])).toBe(0);
  agentChild.stopped = true;
  unlinkSync(join(sessionRoot, "agents-ready.json"));
  unlinkSync(join(sessionRoot, "agents-stop"));
  // Startup must recover secrets from its vault, never the bootstrap credentials.
  const readyPath = join(sessionRoot, "hub-ready.json");
  const bootstrap = JSON.parse(readFileSync(readyPath, "utf8"));
  for (const engine of chainEngines) {
    delete bootstrap.engines[engine].connectionString;
    delete bootstrap.engines[engine].agentAuthToken;
    delete bootstrap.engines[engine].agentRefreshToken;
  }
  writeFileSync(readyPath, JSON.stringify(bootstrap));
  agentChild = launchAgents();
  const recovered = await waitFile(join(sessionRoot, "agents-ready.json"));
  for (const engine of chainEngines) {
    expect(recovered[engine].resumed).toBe(true);
    expect(recovered[engine].storage).toBe("drift-windows-dpapi");
    // Never include raw credentials in assertion diffs or reports.
    expect(createHash("sha256").update(recovered[engine].clientToken).digest("hex")).toBe(
      createHash("sha256").update(original[engine].clientToken).digest("hex"),
    );
    expect(recovered[engine].tokenId).toBe(original[engine].tokenId);
    expect(recovered[engine].configId).toBe(original[engine].configId);
    expect(recovered[engine].agentId).toBe(original[engine].agentId);
  }
}
const processStartupTimeoutMs = 120000;
const processStopTimeoutMs = 20000;
// A composed restart must allow each bounded process transition plus verification.
// This does not change SQL, RPC, reconnect or per-process timeouts.
const fullRestartTimeoutMs = 3 * (processStartupTimeoutMs + processStopTimeoutMs) + 45000 + 60000;
const agentRestartTimeoutMs = processStartupTimeoutMs + processStopTimeoutMs + 60000;
async function waitFile(path: string, timeout = processStartupTimeoutMs) {
  const end = Date.now() + timeout;
  while (true) {
    if (children.some((c) => !c.stopped && c.process.exitCode !== null) || Date.now() > end)
      throw new Error(
        "Fixture encerrou ou expirou; consulte os logs privados, sem publicar credenciais.",
      );
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, "utf8"));
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    await delay(100);
  }
}
const post = (path: string, body: object) =>
  request(mcpUrl)
    .post(path)
    .set("Host", new URL(mcpUrl).host)
    .set("Origin", mcpUrl)
    .set("Cookie", cookie)
    .set("X-CSRF-Token", csrf)
    .send(withReviewDeadline(path, body));
const administrativeGet = (path: string) =>
  request(mcpUrl)
    .get(path)
    .set("Host", new URL(mcpUrl).host)
    .set("Origin", mcpUrl)
    .set("Cookie", cookie)
    .set("X-CSRF-Token", csrf);
async function tool(name: string, args: unknown, token = bearer) {
  const response = await request(mcpUrl)
    .post("/mcp")
    .set("Host", new URL(mcpUrl).host)
    .set("Accept", "application/json, text/event-stream")
    .set("Authorization", `Bearer ${token}`)
    .send({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "tools/call",
      params: { name, arguments: args },
    });
  expect(response.status).toBe(200);
  const result = parseMcpPayload(response).result as {
    isError?: boolean;
    content: { text: string }[];
  };
  const value: unknown = JSON.parse(result.content[0]!.text);
  const error =
    value && typeof value === "object" ? (Reflect.get(value, "error") as unknown) : null;
  if (
    result.isError &&
    error &&
    typeof error === "object" &&
    Reflect.get(error, "code") === "CAPABILITY_UNAVAILABLE"
  ) {
    const diagnostic = [];
    for (const source of sources) {
      diagnostic.push({
        dialect: source.dialect,
        ...(await readFixtureCapabilities(hub.hubUrl, source.source.agentId, clientJwt)),
      });
    }
    writeFileSync(
      join(sessionRoot, `${randomUUID()}.capabilities-diagnostic.json`),
      JSON.stringify({
        checkedAt: new Date().toISOString(),
        children: children.map((c) => ({ stopped: c.stopped, exitCode: c.process.exitCode })),
        agents: diagnostic,
      }),
    );
  }
  return { isError: result.isError === true, value: JSON.parse(result.content[0]!.text) };
}
async function issue(
  selected = sources,
  extra: ({ skillId: string; capabilities: string[]; effects: string[] } & Pick<
    SkillGrant,
    "queryLimits" | "operationLimits" | "federationLimits"
  >)[] = [],
  targetPersonaId = personaId,
  limits: Pick<Permissions, "queryLimits" | "operationLimits" | "federationLimits"> = {},
) {
  const result = await post(`/api/admin/personas/${targetPersonaId}/tokens`, {
    name: "Isolated chain",
    delegation: empty,
    expiresAt: null,
    permissions: {
      ...empty,
      ...limits,
      sourceIds: selected.map((s) => s.id),
      skills: [
        ...selected.map((s) => ({
          skillId: s.skillId,
          capabilities: s.capabilities,
          effects: ["select"],
          requireHumanApproval: false,
        })),
        ...extra.map((s) => ({ ...s, requireHumanApproval: false })),
      ],
    },
  });
  expect(result.status).toBe(201);
  return result.body.bearer as string;
}

/** Consumer and curator use real hub identities; HTTPS is an application boundary, not public TLS. */
async function exercisePhysicalProposal(
  source: Pick<Source, "id">,
  skillId: string,
  capabilities: readonly string[],
): Promise<string> {
  const candidate = await composePersonaV2(
    testConfig({
      DATABASE_URL: manifest.controlDatabaseUrl,
      PLUG_SERVER_BASE_URL: hub.hubUrl,
      PUBLIC_BASE_URL: "https://mcp.fixture.test",
      LOG_LEVEL: "silent",
      PERSONA_V2_OAUTH_ENABLED: true,
      PERSONA_V2_OAUTH_CLIENTS: { [physicalOAuthClient]: [physicalOAuthRedirect] },
    }),
    { oauthClient: { validate: async () => Promise.resolve() } },
  );
  try {
    const logged = await request(candidate.app)
      .post("/api/admin/login")
      .set("Host", "mcp.fixture.test")
      .set("Origin", "https://mcp.fixture.test")
      .send(hub.client);
    expect(logged.status).toBe(200);
    const ownerCookie = (logged.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
    const adminRequest = (path: string, body: object) =>
      request(candidate.app)
        .post(path)
        .set("Host", "mcp.fixture.test")
        .set("Origin", "https://mcp.fixture.test")
        .set("Cookie", ownerCookie)
        .set("X-CSRF-Token", logged.body.csrfToken)
        .send(withReviewDeadline(path, body));
    const status = await request(candidate.app)
      .get(`/api/admin/personas/${personaId}/delegation`)
      .set("Host", "mcp.fixture.test")
      .set("Origin", "https://mcp.fixture.test")
      .set("Cookie", ownerCookie)
      .set("X-CSRF-Token", logged.body.csrfToken);
    expect(status.status).toBe(200);
    const delegated = await adminRequest(`/api/admin/personas/${personaId}/delegation/create`, {
      expectedVersion: status.body.version,
      administrative: ["treinar"],
    });
    expect(delegated.status).toBe(200);
    const issued = await adminRequest(`/api/admin/personas/${personaId}/tokens`, {
      name: "Curadoria física fixture",
      permissions: {
        ...empty,
        sourceIds: [source.id],
        administrative: ["treinar"],
        skills: [{ skillId, capabilities, effects: ["select"], requireHumanApproval: false }],
      },
      delegation: empty,
      expiresAt: null,
    });
    expect(issued.status).toBe(201);
    const call = async (name: string, args: object, token = issued.body.bearer) => {
      const response = await request(candidate.app)
        .post("/mcp")
        .set("Host", "mcp.fixture.test")
        .set("Authorization", `Bearer ${token}`)
        .set("Accept", "application/json, text/event-stream")
        .send({
          jsonrpc: "2.0",
          id: randomUUID(),
          method: "tools/call",
          params: { name, arguments: args },
        });
      if (response.status === 401) return { denied: true, value: response.body };
      expect(response.status).toBe(200);
      const payload = parseMcpPayload(response);
      if (payload.error) return { denied: true, value: payload.error };
      const result = payload.result as { isError?: boolean; content: { text: string }[] };
      return { denied: result.isError === true, value: JSON.parse(result.content[0]!.text) };
    };
    const input = {
      skillId,
      summary: "Particularidade proposta pela cadeia real",
      change: { kind: "regra", value: "Orientação particular enviada explicitamente" },
    };
    const shared = await call("propor_conhecimento", input);
    expect(shared.denied).toBe(false);
    const reference = { skillId, proposalId: shared.value.proposalId };
    const stateOnly = await call("obter_proposta_conhecimento", reference);
    expect(stateOnly.denied).toBe(false);
    expect(stateOnly.value.submitted).toBeUndefined();
    const editorial = await call("obter_proposta_conhecimento", {
      ...reference,
      includeContent: true,
    });
    expect(editorial.denied).toBe(false);
    expect(editorial.value.submitted).toMatchObject({
      summary: input.summary,
      change: input.change,
    });
    const pattern = await call("obter_padrao", { skillId });
    expect(editorial.value.submitted.basePublicationId).toBe(pattern.value.knowledge.publicationId);
    expect(editorial.value.submitted.baseHash).toBe(pattern.value.knowledge.publicationHash);
    expect(editorial.value.submitted).not.toHaveProperty("reason");
    const otherEditor = await adminRequest(`/api/admin/personas/${personaId}/tokens`, {
      name: "Outro editor fixture",
      permissions: {
        ...empty,
        sourceIds: [source.id],
        administrative: ["treinar"],
        skills: [{ skillId, capabilities, effects: ["select"], requireHumanApproval: false }],
      },
      delegation: empty,
      expiresAt: null,
    });
    expect(otherEditor.status).toBe(201);
    const proposalIds = [shared.value.proposalId as string];
    for (let n = 0; n < 20; n++) {
      const sent = await call("propor_conhecimento", {
        ...input,
        summary: `Página sintética ${n}`,
      });
      expect(sent.denied).toBe(false);
      proposalIds.push(sent.value.proposalId);
    }
    const page = await call("listar_minhas_propostas_conhecimento", { skillId });
    expect(page.denied).toBe(false);
    expect(page.value.proposals).toHaveLength(20);
    expect(page.value.nextCursor).toBeTruthy();
    for (const row of page.value.proposals) {
      expect(Object.keys(row).sort()).toEqual(
        ["proposalId", "version", "state", "hash", "createdAt", "reviewedAt", "published"].sort(),
      );
    }
    const last = await call("listar_minhas_propostas_conhecimento", {
      skillId,
      before: page.value.nextCursor,
    });
    expect(last.denied).toBe(false);
    expect(last.value.proposals).toHaveLength(1);
    expect(last.value.nextCursor).toBeNull();
    const listedIds = [...page.value.proposals, ...last.value.proposals].map(
      (p: { proposalId: string }) => p.proposalId,
    );
    expect(new Set(listedIds).size).toBe(21);
    expect([...listedIds].sort()).toEqual([...proposalIds].sort());
    const emptyPage = await call(
      "listar_minhas_propostas_conhecimento",
      { skillId },
      otherEditor.body.bearer,
    );
    expect(emptyPage.denied).toBe(false);
    expect(emptyPage.value).toEqual({ proposals: [], nextCursor: null });
    expect(
      (
        await call(
          "listar_minhas_propostas_conhecimento",
          { skillId, before: page.value.nextCursor },
          otherEditor.body.bearer,
        )
      ).denied,
    ).toBe(true);
    expect(
      (await call("listar_minhas_propostas_conhecimento", { skillId, before: randomUUID() }))
        .denied,
    ).toBe(true);
    expect(
      (
        await call(
          "obter_proposta_conhecimento",
          { ...reference, includeContent: true },
          otherEditor.body.bearer,
        )
      ).denied,
    ).toBe(true);
    const proposed = await call("propor_particularidade_fisica", input);
    expect(proposed.denied, JSON.stringify(proposed.value)).toBe(false);
    expect(proposed.value).toMatchObject({
      state: "pending",
      version: 1,
      published: false,
      semanticApproval: false,
    });
    const physicalReference = { skillId, proposalId: proposed.value.proposalId };
    const physicalIds = [proposed.value.proposalId as string];
    for (let n = 0; n < 20; n++) {
      const sent = await call("propor_particularidade_fisica", {
        ...input,
        summary: `Página física ${n}`,
      });
      expect(sent.denied).toBe(false);
      physicalIds.push(sent.value.proposalId);
    }
    const physicalPage = await call("listar_minhas_propostas_particularidade", { skillId });
    expect(physicalPage.denied).toBe(false);
    expect(physicalPage.value.proposals).toHaveLength(20);
    expect(physicalPage.value.nextCursor).toBeTruthy();
    const physicalLast = await call("listar_minhas_propostas_particularidade", {
      skillId,
      before: physicalPage.value.nextCursor,
    });
    expect(physicalLast.denied).toBe(false);
    expect(physicalLast.value.proposals).toHaveLength(1);
    expect(physicalLast.value.nextCursor).toBeNull();
    const physicalRows = [...physicalPage.value.proposals, ...physicalLast.value.proposals];
    expect(physicalRows.map((p: { proposalId: string }) => p.proposalId).sort()).toEqual(
      [...physicalIds].sort(),
    );
    for (const row of physicalRows)
      expect(Object.keys(row).sort()).toEqual(
        ["proposalId", "state", "version", "hash", "createdAt", "reviewedAt", "published"].sort(),
      );
    const otherPhysical = await call(
      "listar_minhas_propostas_particularidade",
      { skillId },
      otherEditor.body.bearer,
    );
    expect(otherPhysical.denied).toBe(false);
    expect(otherPhysical.value).toEqual({ proposals: [], nextCursor: null });
    expect(
      (
        await call(
          "listar_minhas_propostas_particularidade",
          { skillId, before: physicalPage.value.nextCursor },
          otherEditor.body.bearer,
        )
      ).denied,
    ).toBe(true);
    expect(
      (
        await call("listar_minhas_propostas_particularidade", {
          skillId,
          before: page.value.nextCursor,
        })
      ).denied,
    ).toBe(true);
    expect(
      (await call("obter_proposta_particularidade", physicalReference)).value.submitted,
    ).toBeUndefined();
    const physicalDetail = await call("obter_proposta_particularidade", {
      ...physicalReference,
      includeContent: true,
    });
    expect(physicalDetail.denied).toBe(false);
    expect(physicalDetail.value.submitted).toMatchObject({
      summary: input.summary,
      change: input.change,
      overrideCommon: false,
      basePublicationId: pattern.value.knowledge.publicationId,
      profilePublicationId: pattern.value.knowledge.profilePublicationId,
    });
    expect(physicalDetail.value.submitted).not.toHaveProperty("identityHash");
    expect(physicalDetail.value.submitted).not.toHaveProperty("reason");
    expect(
      (
        await call(
          "obter_proposta_particularidade",
          { ...physicalReference, includeContent: true },
          otherEditor.body.bearer,
        )
      ).denied,
    ).toBe(true);
    expect(
      (
        await call("obter_proposta_particularidade", {
          skillId,
          proposalId: proposed.value.proposalId,
        })
      ).value.state,
    ).toBe("pending");
    expect(
      (await call("propor_particularidade_fisica", { ...input, skillId: randomUUID() })).denied,
    ).toBe(true);
    await exercisePhysicalOAuth(
      candidate.app,
      issued.body.bearer,
      source.id,
      skillId,
      physicalIds,
      physicalPage.value.nextCursor,
      { repository: new PostgresPersonaRepository(db, crypto), personaId },
    );
    const search = await call("buscar_contexto", { pergunta: "particularidade" });
    expect(search.denied).toBe(false);
    const matches = search.value.matches as {
      skillId: string;
      publicationId: string;
      items: {
        id: string;
        origin: { kind: string; catalogId: string; publicationId: string; hash: string };
      }[];
    }[];
    const match = matches.find((m) => m.skillId === skillId)!;
    const item = match.items.find((i) => i.origin.kind === "perfil")!;
    expect(item).toBeDefined();
    const feedback = await call("registrar_feedback_conhecimento", {
      skillId,
      publicationId: match.publicationId,
      itemId: item.id,
      type: "correcao",
      content: "Particularidade exige revisão editorial explícita",
    });
    expect(feedback.denied, JSON.stringify(feedback.value)).toBe(false);
    const linked = await adminRequest(
      `/api/admin/personas/${personaId}/feedback-conhecimento/${feedback.value.feedbackId}/decidir`,
      {
        expectedVersion: 1,
        reason: "Encaminhado à proposta da mesma origem",
        proposal: { id: proposed.value.proposalId, kind: "perfil" },
      },
    );
    expect(linked.status, JSON.stringify(linked.body)).toBe(200);
    expect(linked.body).toMatchObject({ state: "encaminhado", trainingChanged: false });
    const calendarRoot = `/api/admin/personas/${personaId}/fontes/${source.id}/perfis/${item.origin.catalogId}/${item.origin.publicationId}/revisao`;
    const calendar = await adminRequest(calendarRoot, {
      expectedVersion: 1,
      dueAt: new Date(Date.now() + 5000).toISOString(),
      decision: "configurar",
      reason: "Prazo definido pelo curador da fixture",
    });
    expect(calendar.status, JSON.stringify(calendar.body)).toBe(200);
    const reviews = await call("obter_revisoes_conhecimento", { skillId });
    expect(reviews.denied).toBe(false);
    expect(reviews.value.reviews).toContainEqual(
      expect.objectContaining({
        origin: item.origin,
        state: "em_dia",
        version: 2,
        blocksExecution: false,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const worker = new PersonaReviewWorker(
      new PostgresReviewWorker(db),
      randomUUID(),
      () => new Date(),
    );
    await worker.runOnce();
    const task = (
      await db.query<{ id: string }>(
        "SELECT id FROM knowledge_review_task_v2 WHERE publication_id=$1 AND closed_at IS NULL",
        [item.origin.publicationId],
      )
    ).rows[0]!;
    expect(task).toBeDefined();
    const notification = await adminRequest(`${calendarRoot}/notificacoes/${task.id}/lida`, {});
    expect(notification.status, JSON.stringify(notification.body)).toBe(200);
    expect(notification.body).toMatchObject({
      state: "vencida",
      version: 2,
      blocksExecution: false,
    });
    expect(notification.body.notifications.items[0].readAt).not.toBeNull();
    expect(
      (
        await call("consultar_dados", {
          fonteId: source.id,
          skillIds: [skillId],
          params: { tenant: 1 },
        })
      ).denied,
    ).toBe(false);
    const rescheduled = await adminRequest(calendarRoot, {
      expectedVersion: 2,
      dueAt: reviewDateFixture(),
      decision: "revisado",
      reason: "Revisão humana de fixture concluída",
    });
    expect(rescheduled.status, JSON.stringify(rescheduled.body)).toBe(200);
    await new PersonaReviewWorker(
      new PostgresReviewWorker(db),
      randomUUID(),
      () => new Date(),
    ).runOnce();
    const tasks = await db.query(
      "SELECT closed_at FROM knowledge_review_task_v2 WHERE publication_id=$1",
      [item.origin.publicationId],
    );
    expect(tasks.rows).toHaveLength(1);
    expect(tasks.rows[0].closed_at).not.toBeNull();
    const repository = new PostgresPersonaRepository(db, crypto);
    const assertInactivationRevoked = await exerciseExampleInactivation(
      repository,
      personaId,
      skillId,
      call,
    );
    const local = await repository.transaction({ personaIds: [personaId], tokenIds: [] }, (tx) =>
      tx.security.delegation(personaId),
    );
    await new PersonaOwnerDelegationHub(hub.hubUrl, fetch).revoke(clientJwt, local!.hubId);
    const stillLocal = await repository.transaction(
      { personaIds: [personaId], tokenIds: [] },
      (tx) => tx.security.delegation(personaId),
    );
    expect(stillLocal!.revokedAt).toBeNull();
    await assertInactivationRevoked();
    expect(
      (
        await call("listar_minhas_propostas_particularidade", {
          skillId,
          before: physicalPage.value.nextCursor,
        })
      ).denied,
    ).toBe(true);
    expect((await call("listar_minhas_propostas_conhecimento", { skillId })).denied).toBe(true);
    expect(
      (
        await call("listar_minhas_propostas_conhecimento", {
          skillId,
          before: page.value.nextCursor,
        })
      ).denied,
    ).toBe(true);
    expect(
      (await call("obter_proposta_particularidade", { ...physicalReference, includeContent: true }))
        .denied,
    ).toBe(true);
    expect(
      (await call("obter_proposta_conhecimento", { ...reference, includeContent: true })).denied,
    ).toBe(true);
    const revoked = await adminRequest(`/api/admin/personas/${personaId}/delegation/revoke`, {
      expectedVersion: delegated.body.version,
    });
    expect(revoked.status).toBe(200);
    expect((await call("propor_particularidade_fisica", input)).denied).toBe(true);
    expect(
      (
        await call("obter_feedback_conhecimento", {
          skillId,
          publicationId: match.publicationId,
          feedbackId: feedback.value.feedbackId,
        })
      ).value.state,
    ).toBe("encaminhado");
    await adminRequest(
      `/api/admin/personas/${personaId}/tokens/${issued.body.tokenId}/revogar`,
      {},
    ).expect(204);
    expect((await call("obter_revisoes_conhecimento", { skillId })).denied).toBe(true);
    return proposed.value.proposalId as string;
  } finally {
    await candidate.close();
  }
}
async function publish(skillId: string, targetPersonaId = personaId) {
  const path = `/api/admin/personas/${targetPersonaId}/skills/${skillId}`;
  const preview = await post(`${path}/preview`, {});
  expect(preview.status, JSON.stringify(preview.body)).toBe(200);
  const published = await post(`${path}/publicar`, {
    confirmationHash: preview.body.confirmationHash,
  });
  expect(published.status, JSON.stringify(published.body)).toBe(201);
  return {
    publicationId: published.body.publication.id as string,
    capabilities: preview.body.package.requiredCapabilities as string[],
  };
}
const sql =
  'SELECT p.id AS "id", p.amount AS "amount" FROM operation_fixture p WHERE p.id > :minimum ORDER BY p.id';
function localQueryTraining(sourceId: string, dialect: (typeof chainEngines)[number]) {
  return {
    sourceId,
    dialect,
    purpose: "Valores reais da fixture",
    sqlModel: sql,
    tables: [{ name: "operation_fixture", meaning: "Uma linha por ID", grain: ["id"] }],
    columns: ["id", "amount"].map((name) => ({
      table: "operation_fixture",
      name,
      meaning: name,
      classification: "livre",
    })),
    relationships: [],
    rules: ["Valores em BRL"],
    parameters: [{ name: "minimum", type: "number", required: true, meaning: "ID mínimo" }],
  };
}
function launchHub() {
  return launch(
    process.execPath,
    [
      join(hubPath, "node_modules/tsx/dist/cli.mjs"),
      join(hubPath, "tool/homologation/persona_chain_hub.cts"),
    ],
    sessionRoot,
    hubEnvironment,
    `hub-${children.length}`,
  );
}
async function loginAdministrator() {
  const logged = await request(mcpUrl)
    .post("/api/admin/login")
    .set("Host", new URL(mcpUrl).host)
    .set("Origin", mcpUrl)
    .send(hub.client);
  expect(logged.status).toBe(200);
  cookie = (logged.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  csrf = logged.body.csrfToken;
}
async function launchMcp() {
  mcpChild = launch(
    process.execPath,
    [
      resolve("node_modules/tsx/dist/cli.mjs"),
      resolve(
        process.env.PERSONA_CHAIN_CANDIDATE_IMAGE
          ? "tests/helpers/persona-chain-container.ts"
          : "tests/helpers/persona-chain-mcp-server.ts",
      ),
    ],
    sessionRoot,
    hubEnvironment,
    `mcp-${children.length}`,
  );
  mcpUrl = ((await waitFile(join(sessionRoot, "mcp-ready.json"))) as { url: string }).url;
}
beforeAll(async () => {
  const env = {
    ...fixtureEnvironment(process.env),
    NODE_ENV: "test",
    ...(process.env.PERSONA_CHAIN_CANDIDATE_IMAGE
      ? { PERSONA_CHAIN_CANDIDATE_IMAGE: process.env.PERSONA_CHAIN_CANDIDATE_IMAGE }
      : {}),
    CONTAINER_PERSISTENCE_MODE: persistence,
    CONTAINER_EMAIL_SENDER_MODE: "noop",
    PERSONA_CHAIN_MANIFEST: sessionManifest,
    DATABASE_URL: persistence === "prisma" ? manifest.hubDatabaseUrl : manifest.controlDatabaseUrl,
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
    REST_GLOBAL_RATE_LIMIT_MAX: "10000",
    REST_AGENTS_COMMANDS_RATE_LIMIT_MAX: "10000",
    SOCKET_RATE_LIMIT_MAX: "10000",
  };
  hubEnvironment = env;
  if (persistence === "prisma") {
    const migration = launch(
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
    expect(await migration.exited, "Migrations Prisma da fixture falharam.").toBe(0);
    migration.stopped = true;
  }
  hubChild = launchHub();
  hub = await waitFile(join(sessionRoot, "hub-ready.json"));
  expect(hub.persistence).toBe(persistence);
  expect(hub.resumed).toBe(false);
  agentChild = launchAgents();
  const agents = await waitFile(join(sessionRoot, "agents-ready.json"));
  const login = await fetch(`${hub.hubUrl}/api/v1/client-auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(hub.client),
  });
  expect(login.status).toBe(200);
  clientJwt = ((await login.json()) as { accessToken: string }).accessToken;
  for (const dialect of chainEngines) {
    const stored = await fetch(
      `${hub.hubUrl}/api/v1/client/me/agents/${hub.engines[dialect]!.agentId}/client-token`,
      {
        method: "PUT",
        headers: { authorization: `Bearer ${clientJwt}`, "content-type": "application/json" },
        body: JSON.stringify({ clientToken: agents[dialect].clientToken }),
      },
    );
    expect(stored.status).toBe(200);
  }
  await applyPersonaMigrations(manifest.controlDatabaseUrl);
  db = new pg.Pool({ connectionString: manifest.controlDatabaseUrl });
  await launchMcp();
  await loginAdministrator();
  const created = await post("/api/admin/personas", {
    name: "Four real engines",
    specialty: "Dados sintéticos",
    instructions: "Responder apenas com valores consultados e informar fonte e limites.",
  });
  expect(created.status).toBe(201);
  personaId = created.body.persona.id;
  const initiallyEmpty = await administrativeGet(`/api/admin/personas/${personaId}/fontes`);
  expect(initiallyEmpty.status).toBe(200);
  expect(initiallyEmpty.body.fontes).toEqual([]);
  for (const dialect of chainEngines) {
    const response = await post(`/api/admin/personas/${personaId}/fontes`, {
      name: dialect,
      purpose: "Fixture privada",
      environment: "test",
      dialect,
      agentId: hub.engines[dialect]!.agentId,
      email: hub.client.email,
      password: hub.client.password,
      clientToken: agents[dialect].clientToken,
    });
    expect(response.status, `${dialect}: ${JSON.stringify(response.body)}`).toBe(201);
    const source = response.body.fonte as Source;
    expect(source.database).toBe(manifest.engines[dialect].database);
    expect(source.identityHash).toMatch(/^[a-f0-9]{64}$/);
    const draft = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: `query-${dialect}`,
      name: `Query ${dialect}`,
      kind: "consulta",
      training: localQueryTraining(source.id, dialect),
    });
    expect(draft.status).toBe(201);
    const skillId = draft.body.skill.id as string;
    sources.push({ dialect, id: source.id, skillId, source, ...(await publish(skillId)) });
  }
  bearer = await issue();
});
for (const dialect of chainEngines) {
  it(`${dialect}: view nativa consulta e pagina sem ampliar a policy técnica`, async () => {
    const source = sources.find((s) => s.dialect === dialect)!;
    const schema = dialect === "postgres" ? "public" : dialect === "mssql" ? "dbo" : "dba";
    const catalogSchema = dialect === "sybase" ? "DBA" : schema;
    if (dialect === "sybase") {
      const unproven = await post(
        `/api/admin/personas/${personaId}/fontes/${source.id}/estrutura`,
        {
          resources: [{ schema, name: "wide_15", type: "view" }],
          offset: 0,
          pageSize: 1,
        },
      );
      expect(unproven.status).toBe(200);
      expect(unproven.body.evidence.resources[0].status).toBe("unavailable");
    }
    const metadata = await post(`/api/admin/personas/${personaId}/fontes/${source.id}/estrutura`, {
      resources: [{ schema: catalogSchema, name: "wide_15", type: "view" }],
      offset: 0,
      pageSize: 1,
    });
    expect(metadata.status).toBe(200);
    const evidence = sourceSchemaResultSchema.parse(metadata.body.evidence);
    expect(evidence.identity.identityHash).toBe(source.source.identityHash);
    expect(evidence.resources).toContainEqual(
      expect.objectContaining({
        resource: { schema: catalogSchema, name: "wide_15", type: "view" },
        status: "available",
      }),
    );
    viewEngineVersions.set(dialect, evidence.identity.engineVersion);
    const create = async (name: "wide_15" | "wide_hidden", resourceType: "table" | "view") => {
      const resource = `${schema}.${name}`;
      const slug = `native-${name.replaceAll("_", "-")}-${resourceType}-${dialect}`;
      const created = await post(`/api/admin/personas/${personaId}/skills`, {
        slug,
        name: `Recurso nativo ${name} ${resourceType} ${dialect}`,
        kind: "consulta",
        training: {
          sourceId: source.id,
          dialect,
          purpose: "Consultar somente a view sintética autorizada",
          sqlModel: `SELECT v.tenant_id AS "tenant_id", v.item_id AS "item_id", v.marker AS "marker" FROM ${resource} v WHERE v.tenant_id > :minimum ORDER BY v.tenant_id, v.item_id`,
          tables: [
            {
              name: resource,
              resourceType,
              meaning: "Um item por tenant e ID",
              grain: ["tenant_id", "item_id"],
            },
          ],
          columns: ["tenant_id", "item_id", "marker"].map((name) => ({
            table: resource,
            name,
            meaning: name,
            classification: "livre",
          })),
          relationships: [],
          rules: ["Dados sintéticos; páginas não representam um total global"],
          parameters: [
            { name: "minimum", type: "integer", required: true, meaning: "Tenant mínimo" },
          ],
        },
      });
      expect(created.status).toBe(201);
      const skillId = created.body.skill.id as string;
      const publication = await publish(skillId);
      return {
        resource,
        slug,
        skillId,
        ...publication,
        token: await issue([{ ...source, skillId, ...publication }]),
      };
    };
    const granted = await create("wide_15", "view");
    const context = await tool("obter_skill", { slug: granted.slug }, granted.token);
    expect(context.isError).toBe(false);
    expect(context.value.tables).toEqual([
      expect.objectContaining({ name: granted.resource, resourceType: "view" }),
    ]);
    for (const page of [1, 2, 3]) {
      const result = await tool(
        "consultar_dados",
        {
          fonteId: source.id,
          skillIds: [granted.skillId],
          params: { minimum: 0 },
          options: { page, pageSize: 1, maxRows: 3 },
        },
        granted.token,
      );
      expect(result.isError, JSON.stringify(result.value)).toBe(false);
      expect(result.value.rows).toEqual(
        page === 3 ? [] : [{ tenant_id: page, item_id: page * 10, marker: page * 100 }],
      );
      expect(result.value.pagination).toMatchObject({ page, pageSize: 1 });
      expect(result.value.provenance).toMatchObject({
        sourceId: source.id,
        dialect,
        publications: [{ id: granted.publicationId }],
      });
    }
    for (const [name, type] of [
      ["wide_15", "table"],
      ["wide_hidden", "view"],
    ] as const) {
      const denied = await create(name, type);
      const before = binarySqlCalls(dialect);
      const result = await tool(
        "consultar_dados",
        { fonteId: source.id, skillIds: [denied.skillId], params: { minimum: 0 } },
        denied.token,
      );
      expect(result.isError).toBe(true);
      expect(result.value.error).toMatchObject({ code: "AUTHORIZATION_DENIED" });
      expect(binarySqlCalls(dialect)).toBe(before);
    }
  });

  it(`${dialect}: anexos binários pela cadeia real preservam bytes e revalidam isolamento e revogação`, async () => {
    const source = sources.find((s) => s.dialect === dialect)!;
    binaryConsumers.set(
      dialect,
      await exerciseChainBinaryAttachments({
        source: source.source,
        personaId,
        url: mcpUrl,
        post,
        tool,
        publish,
        sqlCalls: () => binarySqlCalls(dialect),
        authorityCalls: () => binaryAuthorityCalls(dialect),
      }),
    );
  });
}
it("Redis coordena duas instâncias MCP nos três motores, com revogação e falha após SQL", async () => {
  const replicas: (typeof children)[number][] = [];
  try {
    const urls: string[] = [];
    for (const instance of ["cache-a", "cache-b"]) {
      replicas.push(
        launch(
          process.execPath,
          [
            resolve("node_modules/tsx/dist/cli.mjs"),
            resolve("tests/helpers/persona-chain-mcp-server.ts"),
          ],
          sessionRoot,
          { ...hubEnvironment, PERSONA_CHAIN_MCP_INSTANCE: instance },
          `mcp-${instance}`,
        ),
      );
      urls.push(
        ((await waitFile(join(sessionRoot, `mcp-${instance}-ready.json`))) as { url: string }).url,
      );
    }
    await exerciseChainCache({
      root: sessionRoot,
      origin: mcpUrl,
      urls: [urls[0]!, urls[1]!],
      redisUrl: manifest.redisUrl,
      personaId,
      sources,
      post,
      waitFile,
      sqlCalls: binarySqlCalls,
      authorityCalls: binaryAuthorityCalls,
      redisRunning: (running) => {
        const container = `${manifest.runId}-redis`;
        const owner = execFileSync(
          "docker",
          ["inspect", "--format", '{{index .Config.Labels "se7e.persona.fixture"}}', container],
          { encoding: "utf8", windowsHide: true },
        ).trim();
        expect(owner).toBe(manifest.runId);
        execFileSync("docker", [running ? "start" : "stop", container], {
          stdio: "ignore",
          timeout: 20000,
          windowsHide: true,
        });
      },
    });
  } finally {
    for (const instance of ["cache-a", "cache-b"])
      writeFileSync(join(sessionRoot, `mcp-${instance}-stop`), "stop");
    for (const replica of replicas) {
      expect(await Promise.race([replica.exited, delay(20000).then(() => "timeout")])).toBe(0);
      replica.stopped = true;
    }
  }
}, 120000);

it("Chromium cria persona, cadastra três bases, treina, publica e consulta pela cadeia real", async () => {
  const callsBefore = new Map(chainEngines.map((dialect) => [dialect, binarySqlCalls(dialect)]));
  if (process.env.PERSONA_CHAIN_CANDIDATE_IMAGE) {
    expect(persistence).toBe("prisma");
    expect(JSON.parse(readFileSync(join(sessionRoot, "candidate-image.json"), "utf8"))).toEqual({
      image: process.env.PERSONA_CHAIN_CANDIDATE_IMAGE,
      runtime: "container",
      gatewayOverrides: false,
      hubLoopbackRelay: true,
    });
  }
  const agents = JSON.parse(readFileSync(join(sessionRoot, "agents-ready.json"), "utf8"));
  await exerciseChainBrowser({
    url: mcpUrl,
    client: hub.client,
    sources: chainEngines.map((dialect) => ({
      dialect,
      agentId: hub.engines[dialect]!.agentId,
      clientToken: agents[dialect].clientToken,
    })),
  });
  for (const dialect of chainEngines) {
    expect(binarySqlCalls(dialect), `SQL must reach the ${dialect} fixture agent`).toBeGreaterThan(
      callsBefore.get(dialect)!,
    );
  }
}, 180000);
for (const dialect of chainEngines) {
  it(`${dialect}: publicação SQL genérica com fixtures variadas e rollback`, async () => {
    const sourceId = sources.find((item) => item.dialect === dialect)!.id;

    const source = await repository().transaction(
      { personaIds: [personaId], tokenIds: [] },
      async (tx) => (await tx.listSources(personaId)).find((item) => item.id === sourceId)!,
    );
    const adapter = new PlugServerRestAdapter(hub.hubUrl, new SilentTestLogger());
    const credentials = new PostgresSourceCredentials(db);
    genericPublicationSources.set(
      dialect,
      await exerciseGenericPublication({
        source,
        sessionRoot,
        runId: manifest.runId,
        hubUrl: hub.hubUrl,
        runnerConfig: config,
        repository: repository(),
        crypto,
        post: async (path, body) => await post(path, body),
        publish,
        reads: new PersonaSourceQuery(credentials, adapter, crypto),
        operations: new PersonaSqlOperationGateway(
          credentials,
          adapter,
          adapter,
          crypto,
          hub.hubUrl,
        ),
      }),
    );
  });
}
for (const dialect of chainEngines) {
  for (const phase of ["types", "trigger", "constraints", "unique-types"] as const) {
    it(`${dialect}: matriz publicada ${phase}`, async () => {
      const selected = genericPublicationSources.get(dialect)!;
      await exercisePublicationMatrix({
        phase,
        source: selected.source,
        tables: publicationTables,
        post: async (path, body) => post(path, body),
        publish,
        run: selected.run,
      });
    });
  }
}
for (const dialect of chainEngines) {
  for (const phase of effectPhases) {
    it(`${dialect}: publicação de ${phase} e efeitos indiretos`, async () => {
      const selected = genericPublicationSources.get(dialect)!;
      await exercisePublicationEffects({
        phase,
        source: selected.source,
        tables: publicationTables,
        post: async (path, body) => post(path, body),
        run: selected.run,
        publish,
      });
    });
  }
}
for (const dialect of chainEngines.slice(1)) {
  it(`publicação genérica de cruzamento PostgreSQL/${dialect} com SELECTs reais e limites`, async () => {
    await exerciseGenericFederationPublication({
      selected: [
        genericPublicationSources.get("postgres")!,
        genericPublicationSources.get(dialect)!,
      ],
      repository: repository(),
      crypto,
      post: async (path, body) => await post(path, body),
      publish,
      verifyEvidence: async (skillId) => {
        const report = await db.query<{
          evidencia: { scope: string; sources: unknown[]; dependencies: unknown[] };
        }>(
          "SELECT evidencia FROM relatorio_teste_v2 WHERE persona_id=$1 AND skill_id=$2 AND aprovado ORDER BY created_at DESC,id DESC LIMIT 1",
          [personaId, skillId],
        );
        expect(report.rows[0]!.evidencia.scope).toBe("isolated-federation-transport");
        expect(report.rows[0]!.evidencia.sources).toHaveLength(2);
        expect(report.rows[0]!.evidencia.dependencies).toHaveLength(2);
        expect(JSON.stringify(report.rows[0]!.evidencia)).not.toContain("SELECT");
      },
    });
  });
}
afterAll(async () => {
  // Export only native versions observed through schema RPC, never bootstrap credentials.
  const engineVersions = chainEngines.map((dialect) => ({
    dialect,
    version:
      inspections.get(dialect)?.evidence.identity.engineVersion ??
      viewEngineVersions.get(dialect) ??
      null,
  }));
  writeFileSync(join(sessionRoot, "engine-versions.json"), JSON.stringify(engineVersions));
  // The fixture directory is deleted after the run; preserve these safe facts in the log.
  process.stdout.write(`${JSON.stringify({ fixtureEngineVersions: engineVersions })}\n`);
  // Signal every owned process even when startup/restart assertions failed.
  // Only files in the verified private fixture root signal shutdown.
  writeFileSync(join(sessionRoot, "mcp-stop"), "stop");
  writeFileSync(join(sessionRoot, "agents-stop"), "stop");
  writeFileSync(join(sessionRoot, "hub-stop"), "stop");
  await db?.end();
  const exits = await Promise.all(
    children.map((c) => Promise.race([c.exited, delay(20000).then(() => "timeout")])),
  );
  for (const exit of exits) expect(exit).toBe(0);
});

if (persistence === "prisma") {
  it("delegação externa com hub persistente preserva casos após reinício e recusa revogação", async () => {
    await exerciseExternalDelegation({
      db,
      databaseUrl: manifest.controlDatabaseUrl,
      hubUrl: hub.hubUrl,
      client: hub.client,
    });
  });
}

it("delegação persistente do hub autoriza treinamento e publicação por token nos três motores sem ampliar concessões", async () => {
  // HTTPS audience is tested at the application boundary; this loopback fixture is not public TLS evidence.
  const candidate = await composePersonaV2(
    testConfig({
      DATABASE_URL: manifest.controlDatabaseUrl,
      PLUG_SERVER_BASE_URL: hub.hubUrl,
      PUBLIC_BASE_URL: "https://mcp.fixture.test",
      LOG_LEVEL: "silent",
    }),
  );
  try {
    const logged = await request(candidate.app)
      .post("/api/admin/login")
      .set("Host", "mcp.fixture.test")
      .set("Origin", "https://mcp.fixture.test")
      .send(hub.client);
    expect(logged.status).toBe(200);
    const ownerCookie = (logged.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
    const adminPost = (path: string, body: object) =>
      request(candidate.app)
        .post(path)
        .set("Host", "mcp.fixture.test")
        .set("Origin", "https://mcp.fixture.test")
        .set("Cookie", ownerCookie)
        .set("X-CSRF-Token", logged.body.csrfToken)
        .send(withReviewDeadline(path, body));
    const administrative = ["treinar", "publicar", "gerenciar_tokens"];
    const issued = await adminPost(`/api/admin/personas/${personaId}/tokens`, {
      name: "Administrador fixture",
      permissions: { ...empty, sourceIds: sources.map((s) => s.id), administrative },
      delegation: empty,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(issued.status).toBe(201);
    const delegated = await adminPost(`/api/admin/personas/${personaId}/delegation/create`, {
      expectedVersion: 0,
      administrative,
    });
    expect(delegated.status).toBe(200);
    expect(delegated.body.administrative).toEqual([...administrative].sort());
    const call = async (name: string, args: object, token = issued.body.bearer) => {
      const response = await request(candidate.app)
        .post("/mcp")
        .set("Host", "mcp.fixture.test")
        .set("Authorization", `Bearer ${token}`)
        .set("Accept", "application/json, text/event-stream")
        .send({
          jsonrpc: "2.0",
          id: randomUUID(),
          method: "tools/call",
          params: { name, arguments: args },
        });
      expect(response.status).toBe(200);
      const payload = parseMcpPayload(response).result as {
        isError?: boolean;
        content: { text: string }[];
      };
      expect(payload.isError, JSON.stringify(payload)).not.toBe(true);
      return JSON.parse(payload.content[0]!.text);
    };
    for (const source of sources) {
      const draft = await call("criar_rascunho_skill", {
        slug: `delegated-${source.dialect}`,
        kind: "consulta",
        name: `Delegada ${source.dialect}`,
        training: localQueryTraining(source.id, source.dialect),
      });
      expect(
        (
          await adminPost(`/api/admin/personas/${personaId}/skills/${draft.id}/prazo-revisao`, {
            dueAt: reviewDateFixture(),
          })
        ).status,
      ).toBe(200);
      const preview = await call("revisar_publicacao_skill", { skillId: draft.id });
      const published = await call("publicar_skill", {
        skillId: draft.id,
        confirmationHash: preview.confirmationHash,
      });
      const execution = await adminPost(`/api/admin/personas/${personaId}/tokens`, {
        name: "Consulta delegada fixture",
        permissions: {
          ...empty,
          sourceIds: [source.id],
          skills: [
            {
              skillId: draft.id,
              capabilities: preview.package.requiredCapabilities,
              effects: ["select"],
              requireHumanApproval: false,
            },
          ],
        },
        delegation: empty,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      expect(execution.status).toBe(201);
      const result = await call(
        "consultar_dados",
        { fonteId: source.id, skillIds: [draft.id], params: { minimum: 0 } },
        execution.body.bearer,
      );
      expect(result.rows).toEqual([{ id: 1, amount: expect.anything() }]);
      expect(Number(result.rows[0].amount)).toBe(10.25);
      expect(result.provenance).toMatchObject({ sourceId: source.id, dialect: source.dialect });
      expect(published.skillId).toBe(draft.id);
    }
    expect(
      (await db.query("SELECT permissoes FROM persona_token WHERE id=$1", [issued.body.tokenId]))
        .rows[0].permissoes.skills,
    ).toEqual([]);
    const revoked = await adminPost(`/api/admin/personas/${personaId}/delegation/revoke`, {
      expectedVersion: 1,
    });
    expect(revoked.status).toBe(200);
  } finally {
    await candidate.close();
  }
});

for (const dialect of chainEngines) {
  it(`${dialect}: inspeciona metadados pela conexão verificada e preserva a ordem de chaves compostas`, async () => {
    const source = sources.find((s) => s.dialect === dialect)!;
    const schema =
      dialect === "postgres"
        ? "public"
        : dialect === "mssql"
          ? "dbo"
          : dialect === "sybase"
            ? "DBA"
            : null;
    const resources = ["schema_parent", "schema_child"].map((name) => ({
      schema,
      name,
      type: "table",
    }));
    const response = await post(`/api/admin/personas/${personaId}/fontes/${source.id}/estrutura`, {
      resources,
      pageSize: 2,
      offset: 0,
    });
    if (response.status !== 200) {
      const agents = JSON.parse(readFileSync(join(sessionRoot, "agents-ready.json"), "utf8"));
      const probe = await fetch(`${hub.hubUrl}/api/v1/agents/commands`, {
        method: "POST",
        headers: { authorization: `Bearer ${clientJwt}`, "content-type": "application/json" },
        body: JSON.stringify({
          agentId: source.source.agentId,
          command: {
            jsonrpc: "2.0",
            id: randomUUID(),
            method: "sql.describeSchema",
            params: {
              contractVersion: 1,
              database: source.source.database,
              client_token: agents[dialect].clientToken,
              expectedSource: expectedSourceFor(source.source),
              resources,
              offset: 0,
              pageSize: 2,
            },
          },
        }),
      });
      const raw = (await probe.json()) as {
        response?: { result?: unknown; item?: { result?: unknown } };
        result?: unknown;
      };
      const result = raw.response?.result ?? raw.response?.item?.result ?? raw.result;
      const parsed = sourceSchemaResultSchema.safeParse(result);
      expect(
        parsed.success,
        JSON.stringify({
          http: probe.status,
          rootKeys: Object.keys(raw),
          responseKeys: Object.keys(raw.response ?? {}),
          resultKeys: result && typeof result === "object" ? Object.keys(result) : [],
          issues: parsed.success
            ? []
            : parsed.error.issues.map((i) => ({ code: i.code, path: i.path })),
        }),
      ).toBe(true);
    }
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.executable).toBe(false);
    const pages = [];
    for (const offset of [0, 1]) {
      const page = await post(`/api/admin/personas/${personaId}/fontes/${source.id}/estrutura`, {
        resources,
        pageSize: 1,
        offset,
      });
      expect(page.status, JSON.stringify(page.body)).toBe(200);
      expect(sourceSchemaResultSchema.safeParse(page.body.evidence).success).toBe(true);
      pages.push(page.body);
    }
    const combined = await post(
      `/api/admin/personas/${personaId}/fontes/${source.id}/estrutura/compor`,
      {
        evidenceIds: pages.map((p) => p.id),
      },
    );
    expect(combined.status, JSON.stringify(combined.body)).toBe(200);
    expect(combined.body.status).toBe("composed");
    expect(combined.body.expiresAt).toBe(pages.map((p) => p.expiresAt).sort()[0]);
    expect(combined.body.evidence.composition.pages).toHaveLength(2);
    inspections.set(dialect, combined.body);
    const observed = storedStructureEvidenceSchema.parse(combined.body.evidence).resources;
    expect(observed.map((r: { status: string }) => r.status)).toEqual(["available", "available"]);
    expect(observed[0]!.columns.map((c: { name: string }) => c.name.toLowerCase())).toEqual([
      "tenant_id",
      "item_id",
    ]);
    expect(observed[0]!.primaryKeys[0]!.columns.map((c: string) => c.toLowerCase())).toEqual([
      "tenant_id",
      "item_id",
    ]);
    expect(observed[1]!.foreignKeys[0]!.columns.map((c: string) => c.toLowerCase())).toEqual([
      "tenant_id",
      "item_id",
    ]);
    expect(observed[1]!.foreignKeys[0]!.targetColumns.map((c: string) => c.toLowerCase())).toEqual([
      "tenant_id",
      "item_id",
    ]);
    expect(observed[1]!.coverage.constraintStatus).toBe(true);
    const state = "enabled";
    expect(observed[0]!.primaryKeys[0]!.status).toBe(state);
    expect(observed[0]!.uniqueKeys?.[0]?.columns.map((c) => c.toLowerCase())).toEqual([
      "item_id",
      "tenant_id",
    ]);
    expect(observed[0]!.uniqueKeys?.[0]?.status).toBe(state);
    expect(observed[1]!.foreignKeys[0]!.status).toBe(state);
    expect(JSON.stringify(response.body)).not.toContain("COLUMN_DEF");
    expect(JSON.stringify(response.body)).not.toContain("REMARKS");
    const onlyChild = await post(`/api/admin/personas/${personaId}/fontes/${source.id}/estrutura`, {
      resources: [resources[1]],
    });
    expect(onlyChild.status, JSON.stringify(onlyChild.body)).toBe(200);
    expect(onlyChild.body.evidence.resources[0].foreignKeys).toEqual([]);
  });
}

for (const dialect of chainEngines) {
  it(`${dialect}: adota dezesseis recursos paginados e recusa drift somente nas dependências treinadas`, async () => {
    const source = sources.find((s) => s.dialect === dialect)!;
    const schema =
      dialect === "postgres"
        ? "public"
        : dialect === "mssql"
          ? "dbo"
          : dialect === "sybase"
            ? "DBA"
            : null;
    const resources = Array.from({ length: 16 }, (_, index) => ({
      schema,
      name: `wide_${String(index).padStart(2, "0")}`,
      type: index === 15 ? "view" : "table",
    }));
    const root = `/api/admin/personas/${personaId}/fontes/${source.id}/estrutura`;
    const hidden = await post(root, { resources: [{ schema, name: "wide_hidden", type: "view" }] });
    expect(hidden.status).toBe(403);
    const pages: { id: string; expiresAt: string }[] = [];
    for (const offset of [0, 4, 8, 12]) {
      const page = await post(root, { resources, offset, pageSize: 4 });
      expect(page.status, JSON.stringify(page.body)).toBe(200);
      const evidence = sourceSchemaResultSchema.parse(page.body.evidence);
      expect(evidence.resources).toHaveLength(4);
      expect(evidence.resources.every((r) => r.status === "available")).toBe(true);
      expect(evidence.metadataPage.nextOffset).toBe(offset === 12 ? null : offset + 4);
      pages.push({ id: page.body.id as string, expiresAt: page.body.expiresAt as string });
    }
    const incomplete = await post(`${root}/compor`, {
      evidenceIds: [pages[0]!.id, pages[2]!.id, pages[3]!.id],
    });
    expect(incomplete.status, JSON.stringify(incomplete.body)).toBe(200);
    expect(incomplete.body.status).toBe("inconclusive");
    const combined = await post(`${root}/compor`, {
      evidenceIds: [...pages].reverse().map((p) => p.id),
    });
    expect(combined.status, JSON.stringify(combined.body)).toBe(200);
    expect(combined.body.status).toBe("composed");
    expect(combined.body.expiresAt).toBe(pages.map((p) => p.expiresAt).sort()[0]);
    const evidence = storedStructureEvidenceSchema.parse(combined.body.evidence);
    expect(evidence.composition?.pages).toHaveLength(4);
    expect(evidence.resources).toHaveLength(16);
    const tables = evidence.resources.map((observed, index) => {
      const physicalName =
        (observed.resource.schema ? `${observed.resource.schema}.` : "") + observed.resource.name;
      return {
        id: `wide_${String(index).padStart(2, "0")}`,
        name: observed.resource.name,
        meaning: "Registro artificial por locatário e item",
        resourceType: observed.resource.type,
        grain: ["tenant_id", "item_id"],
        physicalNames: [{ dialect, name: physicalName.toLowerCase() }],
        columns: observed.columns.map((column) => ({
          name: column.name.toLowerCase(),
          meaning: `Campo artificial ${column.name.toLowerCase()}`,
          logicalType: "integer",
          nullable: column.nullable,
          classification: "livre",
          nativeTypes: [{ dialect, type: column.nativeType }],
        })),
        ...(index === 15 || dialect === "sybase"
          ? {}
          : {
              keys: [
                {
                  id: "primary",
                  kind: "primary",
                  columns: ["tenant_id", "item_id"],
                  status: "enabled",
                },
              ],
            }),
      };
    });
    const relationships = tables.slice(1).map((table) => ({
      id: `rel_${table.id}`,
      from: tables[0]!.id,
      to: table.id,
      keys: [
        { from: "tenant_id", to: "tenant_id" },
        { from: "item_id", to: "item_id" },
      ],
      join: "inner",
      cardinality: "1:1",
      optional: false,
      meaning: "Correspondência artificial revisada por locatário e item",
      via: [],
      origin: "business",
    }));
    const content = {
      system: "Isolated wide fixture",
      label: "1.0",
      dialects: [dialect],
      tables,
      relationships,
      examples: [],
      rules: [],
    };
    const catalog = await post("/api/admin/catalogos", { name: `Wide fixture ${dialect}` });
    expect(catalog.status).toBe(201);
    const catalogId = catalog.body.catalog.id as string;
    const pattern = await post(`/api/admin/catalogos/${catalogId}/padroes`, {
      slug: `wide-${dialect}`,
      name: "Estrutura artificial ampla",
      content,
    });
    expect(pattern.status, JSON.stringify(pattern.body)).toBe(201);
    const patternRoot = `/api/admin/catalogos/${catalogId}/padroes/${pattern.body.pattern.id}`;
    const preview = await post(`${patternRoot}/preview`, {});
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    const published = await post(`${patternRoot}/publicar`, {
      confirmationHash: preview.body.confirmationHash,
    });
    expect(published.status, JSON.stringify(published.body)).toBe(201);
    const physical = (index: number) => tables[index]!.physicalNames[0]!.name;
    const sqlModel =
      `SELECT w0.tenant_id AS "tenant_id",w0.item_id AS "item_id",w0.marker AS "marker" FROM ${physical(0)} w0 ` +
      tables
        .slice(1)
        .map(
          (_t, index) =>
            `INNER JOIN ${physical(index + 1)} w${index + 1} ON w0.tenant_id=w${index + 1}.tenant_id AND w0.item_id=w${index + 1}.item_id`,
        )
        .join(" ") +
      " WHERE w0.tenant_id=:tenant AND w7.marker=w0.marker ORDER BY w0.tenant_id,w0.item_id";
    const training = {
      sourceId: source.id,
      dialect,
      purpose: "Cruzar recursos locais de páginas diferentes",
      sqlModel,
      tables: tables.map((t) => ({
        name: t.physicalNames[0]!.name,
        meaning: t.meaning,
        resourceType: t.resourceType,
        grain: t.grain,
      })),
      columns: tables.flatMap((t) =>
        t.columns.map((c) => ({
          table: t.physicalNames[0]!.name,
          name: c.name,
          meaning: c.meaning,
          classification: c.classification,
        })),
      ),
      relationships: relationships.map((r, index) => ({
        from: physical(0),
        to: physical(index + 1),
        keys: r.keys,
        join: r.join,
        cardinality: r.cardinality,
        meaning: r.meaning,
      })),
      rules: [],
      parameters: [
        { name: "tenant", type: "integer", required: true, meaning: "Locatário artificial" },
      ],
      sharedKnowledge: {
        catalogId,
        publicationId: published.body.publication.id,
        evidenceId: combined.body.id,
      },
    };
    const draft = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: `wide-${dialect}`,
      kind: "consulta",
      name: "Consulta ampla",
      training,
    });
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    const skillId = draft.body.skill.id as string;
    const publication = await publish(skillId);
    const token = await issue(
      [source],
      [{ skillId, capabilities: publication.capabilities, effects: ["select"] }],
    );
    const query = () =>
      tool(
        "consultar_dados",
        { fonteId: source.id, skillIds: [skillId], params: { tenant: 1 } },
        token,
      );
    const result = await query();
    expect(result.isError, JSON.stringify(result.value)).toBe(false);
    expect(result.value.rows).toEqual([{ tenant_id: 1, item_id: 10, marker: 100 }]);
    expect(result.value.completeness.complete).toBe(true);
    const context = await tool("obter_skill", { slug: `wide-${dialect}` }, token);
    expect(context.value.sharedKnowledge.expectedStructure.resources).toHaveLength(16);
    const rpc = readFileSync(join(sessionRoot, `${dialect}-rpc.jsonl`), "utf8")
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as { method: string; structureResourceCount?: number; code: unknown },
      );
    expect(
      rpc.some(
        (r) => r.method === "sql.execute" && r.structureResourceCount === 16 && r.code === null,
      ),
    ).toBe(true);
    const mutate = async (kind: string) => {
      const path = join(sessionRoot, `${randomUUID()}.case-job.json`);
      writeFileSync(`${path}.tmp`, JSON.stringify({ engine: dialect, kind }));
      renameSync(`${path}.tmp`, path);
      const report = await waitFile(`${path}.result`, 45000);
      expect(report.passed, JSON.stringify(report)).toBe(true);
    };
    await mutate("wide-add-unrelated-column");
    const unaffected = await query();
    expect(unaffected.isError, JSON.stringify(unaffected.value)).toBe(false);
    expect(unaffected.value.rows).toEqual(result.value.rows);
    await mutate("wide-change-trained-column");
    const drift = await query();
    expect(drift.isError).toBe(true);
    expect(drift.value.error.code).toBe("STALE_AUTHORIZATION");
    const failureMetadata = readFileSync(join(sessionRoot, `${dialect}-rpc.jsonl`), "utf8")
      .trim()
      .split("\n")
      .map(
        (line) => JSON.parse(line) as { failure_code?: string; structureResourceCount?: number },
      );
    expect(
      failureMetadata.some(
        (r) => r.failure_code === "SOURCE_STRUCTURE_MISMATCH" && r.structureResourceCount === 16,
      ),
    ).toBe(true);
    expect(drift.value.rows).toBeUndefined();
    expect((await tool("obter_skill", { slug: `wide-${dialect}` }, token)).isError).toBe(true);
    const independent = await tool(
      "consultar_dados",
      { fonteId: source.id, skillIds: [source.skillId], params: { minimum: 0 } },
      bearer,
    );
    expect(independent.isError, JSON.stringify(independent.value)).toBe(false);
  });
}

for (const dialect of chainEngines) {
  it(`${dialect}: adota caminho N:N explícito sem autorizar atalho e preserva FK reversa`, async () => {
    const source = sources.find((s) => s.dialect === dialect)!;
    const schema =
      dialect === "postgres"
        ? "public"
        : dialect === "mssql"
          ? "dbo"
          : dialect === "sybase"
            ? "DBA"
            : null;
    const fixture = relationshipFixture();
    const inspected = await post(`/api/admin/personas/${personaId}/fontes/${source.id}/estrutura`, {
      resources: fixture.content.tables.map((t) => ({ schema, name: t.name, type: "table" })),
      pageSize: 3,
    });
    expect(inspected.status, JSON.stringify(inspected.body)).toBe(200);
    const evidence = sourceSchemaResultSchema.parse(inspected.body.evidence);
    const physical = (name: string) =>
      (schema ? `${schema.toLowerCase()}.` : "") + name.replace(/^public\./, "");
    const content = fixture.content;
    content.dialects = [dialect];
    for (const table of content.tables) {
      table.physicalNames = [{ dialect, name: physical(table.name) }];
      const observed = evidence.resources.find((r) => r.resource.name === table.name)!;
      expect(observed.status).toBe("available");
      for (const field of table.columns) {
        const column = observed.columns.find((c) => c.name.toLowerCase() === field.name)!;
        expect(column.nullable).not.toBeNull();
        field.nullable = column.nullable!;
        field.nativeTypes = [{ dialect, type: column.nativeType }];
      }
    }
    const training = {
      ...fixture.training,
      sourceId: source.id,
      dialect,
      sqlModel: fixture.training.sqlModel.replaceAll(
        "public.",
        schema ? `${schema.toLowerCase()}.` : "",
      ),
      tables: fixture.training.tables.map((t) => ({ ...t, name: physical(t.name) })),
      columns: fixture.training.columns.map((c) => ({ ...c, table: physical(c.table) })),
      relationships: fixture.training.relationships.map((r) => ({
        ...r,
        from: physical(r.from),
        to: physical(r.to),
        ...(r.via?.length ? { via: r.via.map(physical) } : {}),
      })),
    };
    const catalog = await post("/api/admin/catalogos", { name: `Relacionamentos ${dialect}` });
    expect(catalog.status).toBe(201);
    const catalogId = catalog.body.catalog.id as string;
    const createPattern = async (slug: string, body: unknown) => {
      const draft = await post(`/api/admin/catalogos/${catalogId}/padroes`, {
        slug,
        name: "Padrão sintético N:N",
        content: body,
      });
      expect(draft.status, JSON.stringify(draft.body)).toBe(201);
      const root = `/api/admin/catalogos/${catalogId}/padroes/${draft.body.pattern.id}`;
      const preview = await post(`${root}/preview`, {});
      expect(preview.status, JSON.stringify(preview.body)).toBe(200);
      const published = await post(`${root}/publicar`, {
        confirmationHash: preview.body.confirmationHash,
      });
      expect(published.status, JSON.stringify(published.body)).toBe(201);
      return published.body.publication.id as string;
    };
    const publicationId = await createPattern(`rel-${dialect}`, content);
    // Operator fixture: compile the exact DML adoption and exercise its guard through the real bridge.
    // Consumer publication/approval is covered separately; this adds relational dependencies.
    const relationalOperation = await sharedOperationTraining(source, { content, training });
    const auth = await repository().authentication(crypto.sha256Hex(bearer));
    const compileRelationalOperation = () =>
      repository().transaction({ personaIds: [personaId], tokenIds: [] }, (tx) =>
        compileOperationPublication(
          tx,
          auth!.persona.ownerId,
          source.source,
          relationalOperation,
          { crypto, now: () => new Date() },
          "Operação com caminho N:N",
        ),
      );

    const pkg = await compileRelationalOperation();
    const adapter = new PlugServerRestAdapter(hub.hubUrl, new SilentTestLogger());
    const gateway = new PersonaSqlOperationGateway(
      new PostgresSourceCredentials(db),
      adapter,
      adapter,
      crypto,
      hub.hubUrl,
    );
    const command = () => compileOperationCommand(pkg, source.source, randomUUID(), input, crypto);
    const receipt = await gateway.execute(source.source, command());
    expect(receipt).toMatchObject({ state: "concluida", directlyAffectedRows: 3 });
    const verifyOperationDrift = async () => {
      const driftCommand = command();
      const refused = await gateway.execute(source.source, driftCommand);
      expect(refused).toMatchObject({
        state: "cancelada",
        failureCode: "SOURCE_STRUCTURE_MISMATCH",
      });
      expect(await gateway.execute(source.source, driftCommand)).toEqual(refused);
    };

    const draft = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: `rel-${dialect}`,
      name: "Consulta por intermediária",
      kind: "consulta",
      training: {
        ...training,
        sharedKnowledge: { catalogId, publicationId, evidenceId: inspected.body.id },
      },
    });
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    const skillId = draft.body.skill.id as string;
    const published = await publish(skillId);
    const token = await issue(
      [source],
      [{ skillId, capabilities: published.capabilities, effects: ["select"] }],
    );
    const query = () =>
      tool(
        "consultar_dados",
        { fonteId: source.id, skillIds: [skillId], params: { tenant: 1 } },
        token,
      );
    const result = await query();
    expect(result.isError, JSON.stringify(result.value)).toBe(false);
    expect(result.value.rows).toEqual([
      { left_id: 10, right_id: 100 },
      { left_id: 10, right_id: 200 },
      { left_id: 20, right_id: 100 },
    ]);
    const shortcut = await tool(
      "consultar_dados",
      {
        fonteId: source.id,
        skillIds: [skillId],
        params: { tenant: 1 },
        sql: `SELECT a.left_id AS "left_id",b.right_id AS "right_id" FROM ${physical("rel_left")} a INNER JOIN ${physical("rel_right")} b ON a.tenant_id=b.tenant_id AND a.left_id=b.right_id WHERE a.tenant_id=:tenant`,
      },
      token,
    );
    expect(shortcut.isError).toBe(true);
    const graph = await tool("obter_grafo_conhecimento", { skillId }, token);
    expect(graph.isError, JSON.stringify(graph.value)).toBe(false);
    expect(graph.value.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardinality: "N:N",
          via: [expect.stringContaining("rel_link")],
          path: [expect.stringContaining("left_links"), expect.stringContaining("link_right")],
        }),
      ]),
    );
    const context = await tool("obter_skill", { slug: `rel-${dialect}` }, token);
    const structure = context.value.sharedKnowledge.expectedStructure as {
      resources: {
        resource: { name: string };
        constraints?: { foreignKeys: { name: string }[] };
      }[];
    };
    const bridge = structure.resources.find((r) => r.resource.name === "rel_link")!;
    {
      expect(bridge.constraints!.foreignKeys.map((k) => k.name.toLowerCase()).sort()).toEqual([
        "fk_rel_left",
        "fk_rel_right",
      ]);
      const path = join(sessionRoot, `${randomUUID()}.case-job.json`);
      writeFileSync(
        `${path}.tmp`,
        JSON.stringify({ engine: dialect, kind: "relationship-drop-right-fk" }),
      );
      renameSync(`${path}.tmp`, path);
      const job = await waitFile(`${path}.result`, 45000);
      expect(job.passed, JSON.stringify(job)).toBe(true);
      await verifyOperationDrift();
      const drift = await query();
      expect(drift.isError).toBe(true);
      expect(drift.value.error.code).toBe("STALE_AUTHORIZATION");
      expect(drift.value.rows).toBeUndefined();
    }
  });
}

for (const dialect of chainEngines) {
  it(`${dialect}: publica adoção explícita e confere as colunas na conexão executora sem herdar concessões`, async () => {
    const phase = recordJourneyTiming(sessionRoot, dialect, "adoption");
    phase("start");
    const source = sources.find((s) => s.dialect === dialect)!;
    const inspection = inspections.get(dialect)!;
    expect(inspection).toBeDefined();
    const observed = inspection.evidence.resources[0]!;
    const qualified = observed.resource.schema
      ? `${observed.resource.schema}.${observed.resource.name}`
      : observed.resource.name;
    const name = dialect === "sybase" ? qualified.toLowerCase() : qualified;
    const childName = observed.resource.schema
      ? `${observed.resource.schema}.schema_child`
      : "schema_child";
    const fields = observed.columns.map((column) => ({
      name: column.name.toLowerCase(),
      meaning: column.name.toLowerCase(),
      logicalType: "integer",
      nullable: column.nullable,
      classification: "livre",
      nativeTypes: [{ dialect, type: column.nativeType }],
    }));
    const content = {
      system: "Isolated fixture",
      label: "1.0",
      dialects: [dialect],
      tables: [
        {
          id: "parent",
          name: "schema_parent",
          meaning: "Uma linha sintética por locatário e item",
          resourceType: "table",
          grain: ["tenant_id", "item_id"],
          physicalNames: [{ dialect, name }],
          columns: fields,
          ...(dialect === "sybase"
            ? {}
            : {
                keys: [
                  {
                    id: "parent-key",
                    kind: "primary",
                    columns: ["tenant_id", "item_id"],
                    status: "enabled",
                  },
                  {
                    id: "parent-unique",
                    kind: "unique",
                    columns: ["item_id", "tenant_id"],
                    status: "enabled",
                  },
                ],
              }),
        },
      ],
      relationships: [],
      examples: [],
      rules: [],
    };
    if (dialect !== "sybase") {
      content.tables.push({
        ...content.tables[0]!,
        id: "child",
        name: "schema_child",
        meaning: "Registro filho sintético",
        physicalNames: [{ dialect, name: childName }],
        keys: [
          {
            id: "child-key",
            kind: "primary",
            columns: ["tenant_id", "item_id"],
            status: "enabled",
          },
        ],
      });
    }
    const relationships =
      dialect === "sybase"
        ? []
        : [
            {
              id: "child-parent",
              from: "child",
              to: "parent",
              keys: [
                { from: "tenant_id", to: "tenant_id" },
                { from: "item_id", to: "item_id" },
              ],
              join: "inner",
              cardinality: "N:1",
              optional: false,
              meaning: "Filho aponta ao pai sintético pela chave composta",
              via: [],
              origin: "database",
              constraintName: "fk_schema_parent",
              constraintStatus: "enabled",
            },
          ];
    const fullContent = { ...content, relationships };
    const catalog = await post("/api/admin/catalogos", { name: `Fixture ${dialect}` });
    expect(catalog.status).toBe(201);
    const catalogId = catalog.body.catalog.id;
    const pattern = await post(`/api/admin/catalogos/${catalogId}/padroes`, {
      slug: `structure-${dialect}`,
      name: "Estrutura sintética",
      content: fullContent,
    });
    expect(pattern.status, JSON.stringify(pattern.body)).toBe(201);
    const patternRoot = `/api/admin/catalogos/${catalogId}/padroes/${pattern.body.pattern.id}`;
    const preview = await post(`${patternRoot}/preview`, {});
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    const published = await post(`${patternRoot}/publicar`, {
      confirmationHash: preview.body.confirmationHash,
    });
    expect(published.status, JSON.stringify(published.body)).toBe(201);
    const sharedPublication = published.body.publication;
    const profileRoot = `/api/admin/personas/${personaId}/fontes/${source.id}/perfis`;
    const profileContent = {
      ...fullContent,
      tables: content.tables.map((t) => ({
        ...t,
        meaning: t.id === "parent" ? "Particularidade sintética revisada desta base" : t.meaning,
      })),
    };
    const profileInput = {
      catalogId,
      basePublicationId: sharedPublication.id,
      name: "Perfil físico sintético",
      content: profileContent,
      overrides: { tables: ["parent"], relationships: [] },
    };
    const conflict = await post(`${profileRoot}/salvar`, {
      ...profileInput,
      overrides: { tables: [], relationships: [] },
    });
    expect(conflict.status, JSON.stringify(conflict.body)).toBe(409);
    expect(conflict.body.error.code).toBe("INVALID_PLAN");
    const profile = await post(`${profileRoot}/salvar`, profileInput);
    expect(profile.status, JSON.stringify(profile.body)).toBe(201);
    const reviewInput = {
      catalogId,
      profileId: profile.body.profile.id,
      evidenceId: inspection.id,
      reviewDueAt: reviewDateFixture(),
    };
    const profileReview = await post(`${profileRoot}/preview`, reviewInput);
    expect(profileReview.status, JSON.stringify(profileReview.body)).toBe(200);
    const profilePublication = await post(`${profileRoot}/publicar`, {
      ...reviewInput,
      confirmationHash: profileReview.body.confirmationHash,
    });
    expect(profilePublication.status, JSON.stringify(profilePublication.body)).toBe(200);
    phase("profile");
    const listing = await administrativeGet(
      `${profileRoot}?${new URLSearchParams({ catalogId, basePublicationId: sharedPublication.id }).toString()}`,
    );
    expect(listing.status, JSON.stringify(listing.body)).toBe(200);
    const listed = listing.body as {
      publications: { publicationId: string }[];
      drafts: { id: string }[];
    };
    expect(listed.publications.map((p) => p.publicationId)).toEqual([
      profilePublication.body.publicationId,
    ]);
    expect(listed.drafts.map((p) => p.id)).toEqual([profile.body.profile.id]);
    const comparison = await post(
      `/api/admin/personas/${personaId}/fontes/${source.id}/compatibilidade`,
      {
        catalogId,
        publicationId: sharedPublication.id,
        evidenceId: inspection.id,
        profilePublicationId: profilePublication.body.publicationId,
        selectedTables: profileContent.tables.map((t) => ({
          id: t.id,
          columns: t.columns.map((c) => c.name),
        })),
      },
    );
    expect(comparison.status, JSON.stringify(comparison.body)).toBe(200);
    expect(comparison.body.status).toBe("compatible");
    expect(
      (
        await post(`${profileRoot}/publicar`, {
          ...reviewInput,
          confirmationHash: profileReview.body.confirmationHash,
        })
      ).status,
    ).toBe(409);
    const staleReview = await post(`${profileRoot}/preview`, reviewInput);
    expect(staleReview.status).toBe(200);
    const editedProfile = await post(`${profileRoot}/salvar`, {
      ...profileInput,
      id: profile.body.profile.id,
      expectedRevision: 1,
      name: "Rascunho posterior sem adoção automática",
    });
    expect(editedProfile.status).toBe(201);
    expect(
      (
        await post(`${profileRoot}/publicar`, {
          ...reviewInput,
          confirmationHash: staleReview.body.confirmationHash,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post(`${profileRoot}/salvar`, {
          ...profileInput,
          id: profile.body.profile.id,
          expectedRevision: 1,
        })
      ).status,
    ).toBe(409);
    const other = sources.find((s) => s.dialect !== dialect)!;
    expect(
      (
        await post(
          `/api/admin/personas/${personaId}/fontes/${other.id}/perfis/preview`,
          reviewInput,
        )
      ).status,
    ).toBe(409);
    const training = {
      sourceId: source.id,
      dialect,
      purpose: "Consultar estrutura compartilhada sintética",
      sqlModel:
        dialect === "sybase"
          ? `SELECT p.tenant_id AS tenant_id, p.item_id AS item_id FROM ${name} p WHERE p.tenant_id=:tenant ORDER BY p.tenant_id,p.item_id`
          : `SELECT c.tenant_id AS tenant_id, c.item_id AS item_id FROM ${childName} c INNER JOIN ${name} p ON c.tenant_id=p.tenant_id AND c.item_id=p.item_id WHERE c.tenant_id=:tenant ORDER BY c.tenant_id,c.item_id`,
      tables: profileContent.tables.map((t) => ({
        name: t.physicalNames[0]!.name,
        meaning: t.meaning,
        grain: t.grain,
      })),
      columns: profileContent.tables.flatMap((t) =>
        fields.map((f) => ({
          table: t.physicalNames[0]!.name,
          name: f.name,
          meaning: f.meaning,
          classification: f.classification,
        })),
      ),
      relationships: relationships.map((r) => ({
        from: childName,
        to: name,
        keys: r.keys,
        join: r.join,
        cardinality: r.cardinality,
        meaning: r.meaning,
      })),
      rules: [],
      parameters: [
        { name: "tenant", type: "integer", required: true, meaning: "Locatário sintético" },
      ],
      sharedKnowledge: {
        catalogId,
        publicationId: sharedPublication.id,
        evidenceId: inspection.id,
        profilePublicationId: profilePublication.body.publicationId,
      },
    };
    const draft = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: `shared-${dialect}`,
      kind: "consulta",
      name: "Consulta compartilhada",
      training,
    });
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    const libraryRoot = `/api/admin/catalogos/${catalogId}/biblioteca`;
    const template = await post(libraryRoot, {
      slug: `template-${dialect}`,
      name: "Template isolado",
      expectedVersion: 0,
      payload: {
        kind: "template",
        content: {
          ...profileContent,
          examples: [
            {
              id: "template-query",
              purpose: training.purpose,
              explanation: "Consulta sintética revisável",
              state: "approved",
              variants: [{ dialect, sql: training.sqlModel, parameters: training.parameters }],
            },
          ],
        },
      },
    });
    expect(template.status, JSON.stringify(template.body)).toBe(201);
    expect(template.body.payload.content.examples[0].state).toBe("candidate");
    const data = await post(libraryRoot, {
      slug: `dataset-${dialect}`,
      name: "Dataset artificial",
      expectedVersion: 0,
      payload: {
        kind: "dataset",
        templateId: template.body.id,
        templateVersion: 1,
        templateHash: template.body.hash,
        provenance: {
          kind: "synthetic",
          description: "Valores literais artificiais, sem captura de consultas",
        },
        tables: [
          {
            tableId: "parent",
            columns: [
              { name: "tenant_id", type: "integer" },
              { name: "item_id", type: "integer" },
            ],
            rows: [[1, 10]],
          },
        ],
      },
    });
    expect(data.status, JSON.stringify(data.body)).toBe(201);
    const cloned = await post(`/api/admin/personas/${personaId}/skills/template`, {
      catalogId,
      templateId: template.body.id,
      templateVersion: 1,
      templateHash: template.body.hash,
      sourceId: source.id,
      sourceVersion: source.source.authorizationVersion,
      dialect,
      exampleId: "template-query",
      slug: `cloned-${dialect}`,
      name: "Rascunho originado de template",
      dataset: { id: data.body.id, version: 1, hash: data.body.hash },
    });
    expect(cloned.status, JSON.stringify(cloned.body)).toBe(201);
    expect(cloned.body.skill.activePublicationId).toBeNull();
    expect(cloned.body.skill.training.examples[0].state).toBe("candidate");
    const clonedRoot = `/api/admin/personas/${personaId}/skills/${cloned.body.skill.id}`;
    const rejected = await post(`${clonedRoot}/preview`, {});
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    expect(
      (await post(`${clonedRoot}/publicar`, { confirmationHash: rejected.body.confirmationHash }))
        .status,
    ).toBe(409);
    expect(
      (
        await post(`${clonedRoot}/rascunho`, {
          expectedRevision: 1,
          name: cloned.body.skill.name,
          training: {
            ...cloned.body.skill.training,
            examples: (cloned.body.skill.training.examples as object[]).map((e) => ({
              ...e,
              state: "approved",
            })),
          },
        })
      ).status,
    ).toBe(200);
    const clonedPublication = await publish(cloned.body.skill.id);
    const clonedToken = await issue(
      [source],
      [
        {
          skillId: cloned.body.skill.id,
          capabilities: clonedPublication.capabilities,
          effects: ["select"],
        },
      ],
    );
    const clonedResult = await tool(
      "consultar_dados",
      { fonteId: source.id, skillIds: [cloned.body.skill.id], params: { tenant: 1 } },
      clonedToken,
    );
    expect(clonedResult.isError, JSON.stringify(clonedResult.value)).toBe(false);
    phase("library");
    const declared = await post(`/api/admin/catalogos/${catalogId}/importar-ddl`, {
      system: "Fixture",
      label: "declared",
      dialect,
      ddl: "CREATE TABLE ddl_never_applied (id int PRIMARY KEY);",
    });
    expect(declared.status, JSON.stringify(declared.body)).toBe(200);
    expect(declared.body).toMatchObject({ technicalEvidence: false, semanticReview: false });
    const skillId = draft.body.skill.id;
    const publication = await publish(skillId);
    const denied = await tool("consultar_dados", { fonteId: source.id, skillIds: [skillId] });
    expect(denied.isError).toBe(true);
    const token = await issue(
      [source],
      [{ skillId, capabilities: publication.capabilities, effects: ["select"] }],
    );
    const context = await tool("obter_skill", { slug: `shared-${dialect}` }, token);
    expect(context.isError, JSON.stringify(context.value)).toBe(false);
    expect(context.value.sharedKnowledge).toMatchObject({
      catalogId,
      publicationId: sharedPublication.id,
      publicationHash: sharedPublication.hash,
    });
    const patterns = await tool("listar_padroes", {}, token);
    expect(patterns.isError).toBe(false);
    expect(patterns.value.catalogBrowsing).toBe(false);
    expect(patterns.value.patterns).toEqual([
      expect.objectContaining({ skillId, catalogId, publicationId: sharedPublication.id }),
    ]);
    const patternContext = await tool("obter_padrao", { skillId }, token);
    expect(patternContext.isError).toBe(false);
    expect(patternContext.value.knowledge).toEqual(context.value.sharedKnowledge);
    expect((await tool("obter_padrao", { skillId }, bearer)).isError).toBe(true);
    const knowledgeGraph = await tool("obter_grafo_conhecimento", { skillId, pageSize: 1 }, token);
    expect(knowledgeGraph.isError).toBe(false);
    expect(knowledgeGraph.value.page.complete).toBe(false);
    expect(knowledgeGraph.value.executionAuthorized).toBe(false);
    const nextGraph = await tool(
      "obter_grafo_conhecimento",
      { skillId, pageSize: 1, cursor: knowledgeGraph.value.page.nextCursor },
      token,
    );
    expect(nextGraph.isError).toBe(false);
    expect(nextGraph.value.nodes[0].id).not.toBe(knowledgeGraph.value.nodes[0].id);
    const learnedSearch = await tool("buscar_contexto", { pergunta: "estrutura" }, token);
    expect(learnedSearch.isError).toBe(false);
    const learnedMatches = learnedSearch.value.matches as { skillId: string }[];
    expect(learnedMatches.some((m) => m.skillId === skillId)).toBe(true);
    const result = await tool(
      "consultar_dados",
      { fonteId: source.id, skillIds: [skillId], params: { tenant: 1 } },
      token,
    );
    expect(result.isError, JSON.stringify(result.value)).toBe(false);
    expect(result.value.rows).toEqual([]);
    expect(result.value.provenance.publications[0].id).toBe(publication.publicationId);
    expect(result.value.provenance.sharedKnowledge).toEqual([
      {
        catalogId,
        publicationId: sharedPublication.id,
        hash: sharedPublication.hash,
        evidenceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        profilePublicationId: profilePublication.body.publicationId,
        profileHash: profilePublication.body.hash,
      },
    ]);
    const curationRoot = `${profileRoot}/curadoria/${catalogId}/${profilePublication.body.publicationId}/propostas`;
    const physicalProposal = await exercisePhysicalProposal(
      source,
      skillId,
      publication.capabilities,
    );
    const physicalPreview = await post(`${curationRoot}/${physicalProposal}/preview`, {});
    expect(physicalPreview.status, JSON.stringify(physicalPreview.body)).toBe(200);
    const incorporated = await post(`${curationRoot}/${physicalProposal}/incorporar`, {
      confirmationHash: physicalPreview.body.confirmationHash,
      reason: "Particularidade revisada na fixture",
    });
    expect(incorporated.status, JSON.stringify(incorporated.body)).toBe(200);
    expect(incorporated.body).toMatchObject({
      published: false,
      semanticApproval: false,
      revision: Number(physicalPreview.body.profileRevision) + 1,
    });
    expect(
      (
        await post(`${curationRoot}/${physicalProposal}/incorporar`, {
          confirmationHash: physicalPreview.body.confirmationHash,
          reason: "Repetição recusada",
        })
      ).status,
    ).toBe(409);
    const afterCuration = await administrativeGet(
      `${profileRoot}?${new URLSearchParams({ catalogId, basePublicationId: sharedPublication.id }).toString()}`,
    );
    expect(afterCuration.body.drafts[0].content.rules).toContain(
      "Orientação particular enviada explicitamente",
    );
    expect(afterCuration.body.publications[0].content.rules).not.toContain(
      "Orientação particular enviada explicitamente",
    );
    phase("curation");
    expect(
      (await tool("obter_skill", { slug: `shared-${dialect}` }, token)).value.sharedKnowledge
        .profileHash,
    ).toBe(profilePublication.body.hash);
    const update = await post(`${patternRoot}/editar`, {
      expectedRevision: 1,
      name: "Nova revisão",
      content: { ...fullContent, label: "2.0" },
    });
    expect(update.status, JSON.stringify(update.body)).toBe(200);
    const unchanged = await tool("obter_skill", { slug: `shared-${dialect}` }, token);
    expect(unchanged.value.sharedKnowledge.publicationId).toBe(sharedPublication.id);
    const historyBefore = await tool("listar_historico_conhecimento", { skillId }, token);
    expect(historyBefore.isError).toBe(false);
    expect(historyBefore.value.versions).toHaveLength(1);
    expect(historyBefore.value.versions[0].publicationId).toBe(sharedPublication.id);
    const nextPatternPreview = await post(`${patternRoot}/preview`, {});
    expect(nextPatternPreview.status).toBe(200);
    const nextPattern = await post(`${patternRoot}/publicar`, {
      confirmationHash: nextPatternPreview.body.confirmationHash,
    });
    expect(nextPattern.status, JSON.stringify(nextPattern.body)).toBe(201);
    // Merely publishing a catalog version does not expand consumer discovery.
    expect((await tool("listar_historico_conhecimento", { skillId }, token)).value).toEqual(
      historyBefore.value,
    );
    const nextDraft = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: `history-${dialect}`,
      kind: "consulta",
      name: "Versão seguinte concedida",
      training: {
        ...training,
        tables: fullContent.tables.map((t) => ({
          name: t.physicalNames[0]!.name,
          meaning: t.meaning,
          grain: t.grain,
        })),
        sharedKnowledge: {
          catalogId,
          publicationId: nextPattern.body.publication.id,
          evidenceId: inspection.id,
        },
      },
    });
    expect(nextDraft.status, JSON.stringify(nextDraft.body)).toBe(201);
    const nextSkillId = nextDraft.body.skill.id as string;
    const nextSkill = await publish(nextSkillId);
    const historyToken = await issue(
      [source],
      [
        { skillId, capabilities: publication.capabilities, effects: ["select"] },
        { skillId: nextSkillId, capabilities: nextSkill.capabilities, effects: ["select"] },
      ],
    );
    const history = await tool("listar_historico_conhecimento", { skillId }, historyToken);
    expect(history.isError, JSON.stringify(history.value)).toBe(false);
    expect(
      Array.from(history.value.versions as { publicationId: string }[], (v) => v.publicationId),
    ).toEqual([nextPattern.body.publication.id, sharedPublication.id]);
    expect(history.value.catalogBrowsing).toBe(false);
    expect(JSON.stringify(history.value)).not.toContain("sqlModel");
    const older = await tool(
      "listar_historico_conhecimento",
      { skillId, afterSkillId: nextSkillId },
      historyToken,
    );
    expect(older.isError).toBe(false);
    expect(older.value.versions).toHaveLength(1);
    expect(
      (await tool("listar_historico_conhecimento", { skillId: nextSkillId }, token)).isError,
    ).toBe(true);
    expect(
      (await tool("listar_historico_conhecimento", { skillId, afterSkillId: nextSkillId }, token))
        .isError,
    ).toBe(true);
    const nextResult = await tool(
      "consultar_dados",
      { fonteId: source.id, skillIds: [nextSkillId], params: { tenant: 1 } },
      historyToken,
    );
    expect(nextResult.isError, JSON.stringify(nextResult.value)).toBe(false);
    expect(nextResult.value.provenance.publications[0].id).toBe(nextSkill.publicationId);
    phase("history");
    const profileSuspended = await post(`${profileRoot}/suspender`, {
      catalogId,
      publicationId: profilePublication.body.publicationId,
    });
    expect(profileSuspended.status).toBe(204);
    expect(
      (
        await tool(
          "comparar_conhecimento",
          {
            fromSkillId: skillId,
            toSkillId: nextSkillId,
          },
          historyToken,
        )
      ).isError,
    ).toBe(true);
    const survivingComparison = await tool(
      "comparar_conhecimento",
      {
        fromSkillId: nextSkillId,
        toSkillId: nextSkillId,
      },
      historyToken,
    );
    expect(survivingComparison.isError).toBe(false);
    expect(survivingComparison.value.changes).toEqual([]);
    expect((await tool("listar_historico_conhecimento", { skillId }, historyToken)).isError).toBe(
      true,
    );
    const survivingHistory = await tool(
      "listar_historico_conhecimento",
      { skillId: nextSkillId },
      historyToken,
    );
    expect(survivingHistory.isError).toBe(false);
    expect(survivingHistory.value.versions).toHaveLength(1);
    expect(survivingHistory.value.versions[0].publicationId).toBe(nextPattern.body.publication.id);
    expect(
      (
        await tool(
          "listar_historico_conhecimento",
          { skillId: nextSkillId, afterSkillId: skillId },
          historyToken,
        )
      ).isError,
    ).toBe(true);
    const historyState = await new PostgresPersonaRepository(db, crypto).authentication(
      crypto.sha256Hex(historyToken),
    );
    expect(historyState).not.toBeNull();
    expect(
      (await post(`/api/admin/personas/${personaId}/tokens/${historyState!.token.id}/revogar`, {}))
        .status,
    ).toBe(204);
    await request(mcpUrl)
      .post("/mcp")
      .set("Host", new URL(mcpUrl).host)
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${historyToken}`)
      .send({
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "tools/call",
        params: {
          name: "listar_historico_conhecimento",
          arguments: { skillId: nextSkillId },
        },
      })
      .expect(401);
    expect((await tool("obter_skill", { slug: `shared-${dialect}` }, token)).isError).toBe(true);
    expect((await tool("obter_padrao", { skillId }, token)).isError).toBe(true);
    expect((await tool("listar_padroes", {}, token)).value.patterns).toEqual([]);
    expect(
      (
        await tool(
          "obter_grafo_conhecimento",
          { skillId, pageSize: 1, cursor: knowledgeGraph.value.page.nextCursor },
          token,
        )
      ).isError,
    ).toBe(true);
    const suspended = await post(
      `/api/admin/catalogos/${catalogId}/publicacoes/${sharedPublication.id}/suspender`,
      {},
    );
    expect(suspended.status).toBe(204);
    expect((await tool("obter_skill", { slug: `shared-${dialect}` }, token)).isError).toBe(true);
    expect(
      (await tool("consultar_dados", { fonteId: source.id, skillIds: [skillId] }, token)).isError,
    ).toBe(true);
    phase("complete");
  });
}

for (const dialect of chainEngines) {
  it(`${dialect}: histórico OAuth compartilhado preserva consentimento e revogação em jornada independente`, async () => {
    const phase = recordJourneyTiming(sessionRoot, dialect, "oauth");
    phase("start");
    const source = sources.find((s) => s.dialect === dialect)!;
    const inspection = inspections.get(dialect);
    expect(inspection).toBeDefined();
    const fixture = await prepareKnowledgeHistoryOAuth({
      personaId,
      source: source.source,
      inspection: inspection!,
      post,
      publish,
      issue: (grants) => issue([source], grants),
    });
    phase("prepared");
    const candidate = await composePersonaV2(
      testConfig({
        DATABASE_URL: manifest.controlDatabaseUrl,
        PLUG_SERVER_BASE_URL: hub.hubUrl,
        PUBLIC_BASE_URL: "https://mcp.fixture.test",
        LOG_LEVEL: "silent",
        PERSONA_V2_OAUTH_ENABLED: true,
        PERSONA_V2_OAUTH_CLIENTS: { [physicalOAuthClient]: [physicalOAuthRedirect] },
      }),
      { oauthClient: { validate: async () => Promise.resolve() } },
    );
    try {
      phase("composed");
      await exerciseKnowledgeHistoryOAuth(
        candidate.app,
        fixture.originator,
        source.id,
        fixture.oldSkill,
        fixture.newSkill,
        async () => {
          const state = await new PostgresPersonaRepository(db, crypto).authentication(
            crypto.sha256Hex(fixture.originator),
          );
          expect(state).not.toBeNull();
          expect(
            (await post(`/api/admin/personas/${personaId}/tokens/${state!.token.id}/revogar`, {}))
              .status,
          ).toBe(204);
        },
      );
      phase("verified");
    } finally {
      await candidate.close();
    }
    phase("complete");
  });

  it(`${dialect}: consulta publicada, SQL adaptado, dados vazios e concessão restrita pela cadeia real`, async () => {
    const source = sources.find((s) => s.dialect === dialect)!;
    const result = await tool("consultar_dados", { fonteId: source.id, params: { minimum: 0 } });
    expect(result.isError, JSON.stringify(result.value)).toBe(false);
    expect(result.value.rows).toEqual([{ id: 1, amount: expect.anything() }]);
    expect(Number(result.value.rows[0].amount)).toBe(10.25);
    expect(result.value.completeness).toEqual({ complete: true, truncated: false });
    expect(result.value.provenance).toMatchObject({
      sourceId: source.id,
      dialect,
      publications: [{ id: source.publicationId, hash: expect.stringMatching(/^[a-f0-9]{64}$/) }],
    });
    const training = await tool("obter_skill", { slug: `query-${dialect}` });
    expect(training.isError).toBe(false);
    expect(JSON.stringify(training.value)).toContain("Uma linha por ID");
    const adapted = await tool("consultar_dados", {
      fonteId: source.id,
      sql: sql.replace("p.id > :minimum", "p.id >= :minimum"),
      params: { minimum: 1 },
    });
    expect(adapted.isError, JSON.stringify(adapted.value)).toBe(false);
    expect(adapted.value.rows).toEqual(result.value.rows);
    expect(
      (await tool("consultar_dados", { fonteId: source.id, params: { minimum: 99999 } })).value
        .rows,
    ).toEqual([]);
    const restricted = await issue(sources.filter((s) => s.id !== source.id));
    expect(
      (await tool("consultar_dados", { fonteId: source.id, params: { minimum: 0 } }, restricted))
        .isError,
    ).toBe(true);
  });
}

for (const dialect of chainEngines) {
  it(`${dialect}: finalidades explícitas por campo autorizam filtro pessoal sem liberar projeção ou ordenação`, async () => {
    const item = sources.find((s) => s.dialect === dialect)!;
    const raw = localQueryTraining(item.id, dialect);
    const created = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: `field-use-${dialect}`,
      name: `Finalidades ${dialect}`,
      kind: "consulta",
      training: {
        ...raw,
        sqlModel:
          'SELECT p.id AS "id" FROM operation_fixture p WHERE p.amount > :minimum ORDER BY p.id',
        columns: raw.columns.map((column) =>
          column.name === "amount"
            ? {
                ...column,
                classification: "pessoal",
                uses: ["filtro"],
                usePurpose: "Filtro sintético autorizado de homologação",
              }
            : column,
        ),
      },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const skillId = created.body.skill.id as string;
    const published = await publish(skillId);
    const atom = `field-use:${item.id}:operation_fixture.amount:filtro`;
    expect(published.capabilities).toContain(atom);
    const emit = async (capabilities: string[], targetSkillId = skillId) => {
      const response = await post(`/api/admin/personas/${personaId}/tokens`, {
        name: "Finalidades sintéticas",
        expiresAt: null,
        delegation: empty,
        permissions: {
          ...empty,
          sourceIds: [item.id],
          skills: [
            {
              skillId: targetSkillId,
              capabilities,
              effects: ["select"],
              requireHumanApproval: false,
            },
          ],
        },
      });
      expect(response.status).toBe(201);
      return response.body.bearer as string;
    };
    const token = await emit(published.capabilities);
    const incomplete = await emit(
      published.capabilities.filter((capability) => capability !== atom),
    );
    const input = { fonteId: item.id, skillIds: [skillId], params: { minimum: 0 } };
    const result = await tool("consultar_dados", input, token);
    expect(result.isError, JSON.stringify(result.value)).toBe(false);
    expect(result.value.rows).toEqual([{ id: 1 }]);
    expect(result.value.provenance.dialect).toBe(dialect);
    expect(result.value.completeness.complete).toBe(true);
    expect((await tool("consultar_dados", input, incomplete)).isError).toBe(true);
    expect((await tool("obter_skill", { slug: `field-use-${dialect}` }, incomplete)).isError).toBe(
      true,
    );
    expect((await tool("consultar_dados", input, bearer)).isError).toBe(true);
    const context = await tool("obter_skill", { slug: `field-use-${dialect}` }, token);
    expect(context.isError).toBe(false);
    expect(JSON.stringify(context.value)).toContain('"uses":["filtro"]');
    const all = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: `field-all-${dialect}`,
      name: `Todos os usos sintéticos ${dialect}`,
      kind: "consulta",
      training: {
        ...raw,
        columns: raw.columns.map((column) => ({
          ...column,
          classification: column.name === "id" ? "pessoal" : "sensivel",
          uses: ["projecao", "filtro", "join", "agrupamento", "ordenacao"],
          usePurpose: "Homologação explícita de dados sintéticos por finalidade",
        })),
        relationships: [
          {
            from: "operation_fixture",
            to: "operation_fixture",
            keys: [{ from: "id", to: "id" }],
            join: "inner",
            cardinality: "1:1",
            meaning: "Correspondência da mesma chave primária sintética",
          },
        ],
      },
    });
    expect(all.status, JSON.stringify(all.body)).toBe(201);
    const allId = all.body.skill.id as string;
    const allPublication = await publish(allId);
    const allToken = await emit(allPublication.capabilities, allId);
    for (const query of [
      sql,
      'SELECT p.amount AS "amount" FROM operation_fixture p WHERE p.id > :minimum ORDER BY p.amount',
      'SELECT p.amount AS "amount" FROM operation_fixture p WHERE p.id > :minimum GROUP BY p.amount ORDER BY p.amount',
      'SELECT p.id AS "id" FROM operation_fixture p INNER JOIN operation_fixture q ON p.id = q.id WHERE p.id > :minimum ORDER BY p.id',
    ]) {
      const allowed = await tool(
        "consultar_dados",
        { ...input, skillIds: [allId], sql: query },
        allToken,
      );
      expect(allowed.isError, JSON.stringify(allowed.value)).toBe(false);
      expect(allowed.value.rows).toHaveLength(1);
    }
    for (const query of [
      'SELECT p.amount AS "amount" FROM operation_fixture p WHERE p.id > :minimum',
      'SELECT p.id AS "id" FROM operation_fixture p WHERE p.id > :minimum ORDER BY p.amount',
      'SELECT p.id AS "id" FROM operation_fixture p WHERE p.id > :minimum GROUP BY p.id, p.amount',
      'SELECT p.id AS "id" FROM operation_fixture p WHERE p.id > :minimum GROUP BY p.id HAVING SUM(p.amount) > :minimum',
      'SELECT x.id AS "id" FROM (SELECT p.id AS "id", p.amount AS "value" FROM operation_fixture p WHERE p.id > :minimum) x WHERE x.id > :minimum ORDER BY x.value',
    ]) {
      expect((await tool("validar_consulta", { ...input, sql: query }, token)).isError, query).toBe(
        true,
      );
      expect((await tool("consultar_dados", { ...input, sql: query }, token)).isError, query).toBe(
        true,
      );
    }
  });
}

for (const dialect of chainEngines) {
  it(`${dialect}: aplica limites menores da skill, token, concessão e pedido na conexão real`, async () => {
    const item = sources.find((s) => s.dialect === dialect)!;
    const created = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: `limits-${dialect}`,
      name: `Limites ${dialect}`,
      kind: "consulta",
      training: {
        ...localQueryTraining(item.id, dialect),
        limits: { maxRows: 4, pageSize: 3, timeoutMs: 15000, maxBytes: 8192 },
      },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const skillId = created.body.skill.id as string;
    const published = await publish(skillId);
    const token = await issue(
      [item],
      [
        {
          skillId,
          capabilities: published.capabilities,
          effects: ["select"],
          queryLimits: { maxRows: 2, pageSize: 2, timeoutMs: 12000, maxBytes: 6000 },
        },
      ],
      personaId,
      { queryLimits: { maxRows: 3, pageSize: 3, timeoutMs: 14000, maxBytes: 7000 } },
    );
    const args = { fonteId: item.id, skillIds: [skillId], params: { minimum: 0 } };
    const context = await tool("obter_skill", { slug: `limits-${dialect}` }, token);
    expect(context.isError, JSON.stringify(context.value)).toBe(false);
    expect(context.value.limits).toEqual({
      maxRows: 2,
      pageSize: 2,
      timeoutMs: 12000,
      maxBytes: 6000,
    });
    const result = await tool(
      "consultar_dados",
      { ...args, options: { page: 1, pageSize: 4, maxRows: 5, timeoutMs: 20000, maxBytes: 10000 } },
      token,
    );
    expect(result.isError, JSON.stringify(result.value)).toBe(false);
    expect(result.value.limits).toEqual(context.value.limits);
    expect(result.value.pagination.pageSize).toBe(2);
    expect(result.value.completeness.complete).toBe(false);
    const limited = await tool("consultar_dados", { ...args, options: { maxRows: 1 } }, token);
    expect(limited.isError, JSON.stringify(limited.value)).toBe(false);
    expect(limited.value.rows).toHaveLength(1);
    expect(limited.value.limits.maxRows).toBe(1);
    expect(limited.value.completeness.complete).toBe(false);
    for (const options of [{ maxBytes: 32 }, { timeoutMs: 1 }]) {
      const denied = await tool("consultar_dados", { ...args, options }, token);
      expect(denied.isError).toBe(true);
      expect(denied.value.error.code).toBe("BUDGET_EXCEEDED");
      expect(denied.value).not.toHaveProperty("rows");
    }
    expect((await tool("consultar_dados", args, bearer)).isError).toBe(true);
  });
}

if (persistence === "prisma") {
  it(
    "preserva persona, bases, publicações e concessões após reiniciar MCP, hub e agente com cofre persistente",
    async () => {
      const savedBinaries = new Map<string, string>();
      for (const [dialect, binary] of binaryConsumers) {
        const created = await binary.create();
        expect(created.isError, JSON.stringify(created.value)).toBe(false);
        savedBinaries.set(dialect, (created.value as { handle: string }).handle);
      }
      const originalHubUrl = hub.hubUrl;
      writeFileSync(join(sessionRoot, "mcp-stop"), "stop");
      expect(await Promise.race([mcpChild!.exited, delay(20000).then(() => "timeout")])).toBe(0);
      mcpChild!.stopped = true;
      unlinkSync(join(sessionRoot, "mcp-ready.json"));
      unlinkSync(join(sessionRoot, "mcp-stop"));
      writeFileSync(join(sessionRoot, "hub-stop"), "stop");
      expect(await Promise.race([hubChild.exited, delay(20000).then(() => "timeout")])).toBe(0);
      hubChild.stopped = true;
      unlinkSync(join(sessionRoot, "hub-ready.json"));
      unlinkSync(join(sessionRoot, "hub-stop"));
      hubChild = launchHub();
      hub = await waitFile(join(sessionRoot, "hub-ready.json"));
      expect(hub.resumed).toBe(true);
      expect(hub.hubUrl).toBe(originalHubUrl);
      await restartAgents();
      const deadline = Date.now() + 45000;
      let connected = false;
      while (!connected && Date.now() < deadline) {
        const response = await fetch(`${hub.hubUrl}/api/v1/client/me/agents`, {
          headers: { authorization: `Bearer ${clientJwt}` },
        });
        expect(response.status).toBe(200);
        const body = (await response.json()) as { agents: { isHubConnected: boolean }[] };
        connected =
          body.agents.length === chainEngines.length &&
          body.agents.every((agent) => agent.isHubConnected);
        if (!connected) await delay(200);
      }
      expect(connected, "Agentes devem renegociar conexão após reinício do hub.").toBe(true);
      await launchMcp();
      // Administrative sessions are ephemeral and must not survive recomposition.
      const oldSession = await post(`/api/admin/personas/${personaId}/tokens`, {});
      expect(oldSession.status).toBe(403);
      expect(oldSession.body.error.code).toBe("AUTHORIZATION_DENIED");
      await loginAdministrator();
      for (const [dialect, binary] of binaryConsumers) {
        const before = binarySqlCalls(dialect);
        const authorityBefore = binaryAuthorityCalls(dialect);
        const recovered = await binary.download(mcpUrl, savedBinaries.get(dialect));
        expect(recovered.status, JSON.stringify(recovered.body)).toBe(200);
        expect(Buffer.from(recovered.body)).toEqual(chainBinarySamples[0]!.bytes);
        expect(binaryAuthorityCalls(dialect)).toBeGreaterThan(authorityBefore);
        expect((await binary.downloadRevoked(mcpUrl)).status).toBe(401);
        expect(binarySqlCalls(dialect)).toBe(before);
        // Only a new explicit creation sends another business SELECT.
        const recreated = await binary.create();
        expect(recreated.isError, JSON.stringify(recreated.value)).toBe(false);
        expect(binarySqlCalls(dialect)).toBe(before + 1);
      }
      const auth = await repository().authentication(crypto.sha256Hex(bearer));
      expect(auth!.persona.id).toBe(personaId);
      const recoveredSources = await administrativeGet(`/api/admin/personas/${personaId}/fontes`);
      expect(recoveredSources.status).toBe(200);
      const recovered = recoveredSources.body as { fontes: Source[] };
      expect(recovered.fontes.map((source) => source.id).sort()).toEqual(
        sources.map((source) => source.id).sort(),
      );
      for (const source of sources) {
        const result = await tool("consultar_dados", {
          fonteId: source.id,
          params: { minimum: 0 },
        });
        expect(result.isError, `${source.dialect}: ${JSON.stringify(result.value)}`).toBe(false);
        expect(result.value.rows).toHaveLength(1);
        expect(Number(result.value.rows[0].amount)).toBe(10.25);
      }
    },
    fullRestartTimeoutMs,
  );
}

const operationFixtureTable = (s: TrainedSource): string =>
  (s.dialect === "postgres" ? "public" : s.dialect === "mssql" ? "dbo" : "dba") +
  ".operation_fixture";
const operationTraining = (s: TrainedSource): OperationTraining => ({
  sourceId: s.id,
  dialect: s.dialect,
  purpose: "INSERT, UPDATE e DELETE transacionais na fixture",
  mode: "somente_parametros",
  approval: "human",
  maxAffectedRows: 3,
  timeoutMs: 30000,
  parameters: [
    { name: "marker", type: "string", nullable: false, meaning: "Chave sintética" },
    { name: "amount", type: "decimal", nullable: false, meaning: "BRL" },
    { name: "revision", type: "integer", nullable: false, meaning: "Versão inicial" },
    { name: "expected_revision", type: "integer", nullable: false, meaning: "Versão esperada" },
  ],
  tables: [
    {
      name: operationFixtureTable(s),
      meaning: "Fixture descartável",
      identity: ["id"],
      concurrency: ["revision"],
      uniqueKeys: [["marker"]],
      columns: [
        { name: "id", type: "integer", writable: false, meaning: "ID gerado pelo motor" },
        { name: "marker", type: "string", writable: true, meaning: "Chave" },
        { name: "amount", type: "decimal", writable: true, meaning: "BRL" },
        { name: "revision", type: "integer", writable: true, meaning: "Versão" },
      ],
    },
  ],
  steps: [
    {
      id: "insert_row",
      effect: "insert",
      table: operationFixtureTable(s),
      values: ["marker", "amount", "revision"].map((column) => ({
        column,
        binding: { kind: "input", name: column },
      })),
      where: [],
      outputs: [{ column: "id", type: "integer" }],
      rows: { min: 1, max: 1 },
    },
    {
      id: "update_row",
      effect: "update",
      table: operationFixtureTable(s),
      values: [{ column: "amount", binding: { kind: "input", name: "amount" } }],
      where: [
        { column: "id", binding: { kind: "step_output", stepId: "insert_row", output: "id" } },
        { column: "revision", binding: { kind: "input", name: "expected_revision" } },
      ],
      outputs: [{ column: "revision", type: "integer" }],
      rows: { min: 1, max: 1 },
    },
    {
      id: "delete_row",
      effect: "delete",
      table: operationFixtureTable(s),
      values: [],
      where: [
        { column: "id", binding: { kind: "step_output", stepId: "insert_row", output: "id" } },
        {
          column: "revision",
          binding: { kind: "step_output", stepId: "update_row", output: "revision" },
        },
      ],
      outputs: [],
      rows: { min: 1, max: 1 },
    },
  ],
  rules: ["Toda condição é obrigatória."],
  indirectEffects: "Sem triggers/cascatas.",
  reconciliation: "Não reenviar resultado desconhecido.",
});
const input = {
  marker: { type: "string", value: "chain" },
  amount: { type: "decimal", value: "12.34" },
  revision: { type: "integer", value: "1" },
  expected_revision: { type: "integer", value: "1" },
};
async function sharedOperationTraining(
  source: TrainedSource,
  relations?: Pick<ReturnType<typeof relationshipFixture>, "content" | "training">,
) {
  const relatedContent = relations ? structuredClone(relations.content) : undefined;
  const training = operationTraining(source);
  const table = training.tables[0]!;
  const schema =
    source.dialect === "postgres"
      ? "public"
      : source.dialect === "mssql"
        ? "dbo"
        : source.dialect === "sybase"
          ? "DBA"
          : null;
  const inspection = await post(`/api/admin/personas/${personaId}/fontes/${source.id}/estrutura`, {
    resources: [
      { schema, name: "operation_fixture", type: "table" },
      ...(relations?.content.tables.map((t) => ({ schema, name: t.name, type: "table" })) ?? []),
    ],
    offset: 0,
    pageSize: relations ? 4 : 1,
  });
  expect(inspection.status, JSON.stringify(inspection.body)).toBe(200);
  const observed = sourceSchemaResultSchema.parse(inspection.body.evidence).resources[0]!;
  table.grain = ["id"];
  table.columns.forEach((c) => {
    c.classification = "livre";
  });
  if (relations) {
    training.relationships = relations.training.relationships;
    for (const related of relatedContent!.tables) {
      related.keys = [
        { id: "identity", kind: "primary", columns: [...related.grain], status: "enabled" },
      ];
      training.tables.push({
        name: related.physicalNames[0]!.name,
        meaning: related.meaning,
        grain: [...related.grain],
        identity: [...related.grain],
        concurrency: [],
        columns: related.columns.map((c) => ({
          name: c.name,
          meaning: c.meaning,
          type: "integer",
          writable: false,
          classification: "livre",
        })),
      });
    }
  }
  const catalog = await post("/api/admin/catalogos", {
    name: `Operações compartilhadas ${source.dialect}`,
  });
  expect(catalog.status).toBe(201);
  const catalogId = catalog.body.catalog.id as string;
  const pattern = await post(`/api/admin/catalogos/${catalogId}/padroes`, {
    slug: `operation-${source.dialect}`,
    name: "Estrutura de fixture para lançamentos",
    content: {
      system: "Fixture, não Data7",
      label: "v1",
      dialects: [source.dialect],
      relationships: relatedContent?.relationships ?? [],
      examples: [],
      rules: training.rules,
      tables: [
        ...(relatedContent?.tables ?? []),
        {
          id: "operation-fixture",
          name: table.name,
          meaning: table.meaning,
          resourceType: "table",
          grain: table.grain,
          physicalNames: [{ dialect: source.dialect, name: table.name }],
          keys: [
            { id: "identity", kind: "primary", columns: table.identity, status: "enabled" },
            ...(table.uniqueKeys ?? []).map((columns, index) => ({
              id: `lookup-${index}`,
              kind: "unique",
              columns,
              status: "enabled",
            })),
          ],
          columns: table.columns.map((c) => {
            const native = observed.columns.find((o) => o.name === c.name)!;
            expect(native, c.name).toBeDefined();
            return {
              name: c.name,
              meaning: c.meaning,
              classification: c.classification,
              logicalType: c.type,
              nullable: native.nullable,
              nativeTypes: [{ dialect: source.dialect, type: native.nativeType }],
            };
          }),
        },
      ],
    },
  });
  expect(pattern.status, JSON.stringify(pattern.body)).toBe(201);
  const root = `/api/admin/catalogos/${catalogId}/padroes/${pattern.body.pattern.id}`;
  const preview = await post(`${root}/preview`, {});
  expect(preview.status, JSON.stringify(preview.body)).toBe(200);
  const published = await post(`${root}/publicar`, {
    confirmationHash: preview.body.confirmationHash,
  });
  expect(published.status, JSON.stringify(published.body)).toBe(201);
  training.sharedKnowledge = {
    catalogId,
    publicationId: published.body.publication.id as string,
    evidenceId: inspection.body.id as string,
  };
  return training;
}
for (const dialect of chainEngines) {
  it(`${dialect}: transporte MCP/hub da guarda estrutural executa, deduplica e recusa divergência sem efeitos`, async () => {
    const source = sources.find((s) => s.dialect === dialect)!;
    const baseline = await tool("consultar_dados", {
      fonteId: source.id,
      skillIds: [source.skillId],
      params: { minimum: 0 },
    });
    expect(baseline.isError, JSON.stringify(baseline.value)).toBe(false);
    expect(baseline.value.completeness.complete).toBe(true);
    const schema =
      dialect === "postgres"
        ? "public"
        : dialect === "mssql"
          ? "dbo"
          : dialect === "sybase"
            ? "DBA"
            : null;
    const inspection = await post(
      `/api/admin/personas/${personaId}/fontes/${source.id}/estrutura`,
      {
        resources: [{ schema, name: "operation_fixture", type: "table" }],
        offset: 0,
        pageSize: 1,
      },
    );
    expect(inspection.status, JSON.stringify(inspection.body)).toBe(200);
    const observed = sourceSchemaResultSchema.parse(inspection.body.evidence).resources[0]!;
    expect(observed.status).toBe("available");
    const expectedStructure = {
      version: 1 as const,
      resources: [
        {
          resource: observed.resource,
          columns: observed.columns.map(({ ordinal: _ordinal, ...column }) => column),
        },
      ],
    };
    const adapter = new PlugServerRestAdapter(hub.hubUrl, new SilentTestLogger());
    expect(
      (await adapter.getAgentAccessStatus(clientJwt, source.source.agentId)).sqlOperations
        ?.structureGuard,
    ).toBe(1);
    const gateway = new PersonaSqlOperationGateway(
      new PostgresSourceCredentials(db),
      adapter,
      adapter,
      crypto,
      hub.hubUrl,
    );
    const compiled = compileOperationTraining(
      operationTraining(source),
      source.source,
      crypto,
      "Transporte isolado da guarda",
    );
    const makeCommand = () => {
      const { fingerprint: _fingerprint, ...content } = compileOperationCommand(
        compiled,
        source.source,
        randomUUID(),
        input,
        crypto,
      );
      const guarded = { ...content, expectedStructure: structuredClone(expectedStructure) };
      return { ...guarded, fingerprint: crypto.sha256Hex(canonicalJson(guarded)) };
    };
    const command = makeCommand();
    const receipt = await gateway.execute(source.source, command);
    expect(receipt).toMatchObject({ state: "concluida", directlyAffectedRows: 3 });
    expect(await gateway.execute(source.source, command)).toEqual(receipt);
    const invalid = makeCommand();
    invalid.expectedStructure.resources[0]!.columns[0]!.nativeType = "__incompatible__";
    invalid.fingerprint = crypto.sha256Hex(canonicalJson(invalid.expectedStructure));
    const refused = await gateway.execute(source.source, invalid);
    expect(refused.state).toBe("cancelada");
    expect(refused.failureCode).toBe("SOURCE_STRUCTURE_MISMATCH");
    expect(await gateway.get(source.source, invalid.operationId, invalid.fingerprint)).toEqual(
      refused,
    );
    expect(await gateway.execute(source.source, invalid)).toEqual(refused);
    verifyRefusalsAfterRestart.push(async () => {
      expect(await gateway.get(source.source, invalid.operationId, invalid.fingerprint)).toEqual(
        refused,
      );
      expect(await gateway.execute(source.source, invalid)).toEqual(refused);
    });
    const emptyResult = await tool("consultar_dados", {
      fonteId: source.id,
      skillIds: [source.skillId],
      params: { minimum: 0 },
    });
    expect(emptyResult.isError, JSON.stringify(emptyResult.value)).toBe(false);
    expect(emptyResult.value.completeness.complete).toBe(true);
    expect(emptyResult.value.rows).toEqual(baseline.value.rows);
    // Operator transport fixture, not publication/adoption of shared DML for a consumer.
  });
}
for (const dialect of chainEngines) {
  it(`${dialect}: casos nativos com rollback, publicação, preparação, aprovação Client, DML e journal reais`, async () => {
    const s = sources.find((s) => s.dialect === dialect)!;
    const sharedTraining = await sharedOperationTraining(s);

    const created = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: `write-${dialect}`,
      name: `Write ${dialect}`,
      kind: "operacao_sql",
      training: sharedTraining,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const skillId = created.body.skill.id as string;
    const path = `/api/admin/personas/${personaId}/skills/${skillId}`;
    expect((await post(`${path}/preview`, {})).status).not.toBe(200);
    for (const stale of [false, true]) {
      const content = {
        name: stale ? "Concorrência" : "IDs gerados e três comandos",
        input: {
          parameters: {
            ...input,
            ...(stale ? { expected_revision: { type: "integer", value: "2" } } : {}),
          },
          fixtures: [{ table: "operation_fixture", generated: ["id"], rows: [] }],
        },
        expected: stale
          ? { error: "ROW_CONDITION_FAILED" }
          : { affectedRows: 3, tables: [{ table: "operation_fixture", rows: [] }] },
      };
      expect((await post(`${path}/casos`, { required: true, content })).status).toBe(201);
    }
    const executor: IsolatedOperationCaseExecutor = {
      supportsStructureGuard: true,
      evaluate: async (_pkg, command, test) => {
        const jobPath = join(sessionRoot, `${randomUUID()}.case-job.json`);
        const commandWithIdentity = {
          ...command,
          contractVersion: 1,
          expectedSource: expectedSourceFor(s.source),
          sourcePhysicalId: createHash("sha256")
            .update(JSON.stringify([new URL(hub.hubUrl).origin, s.source.identityHash]))
            .digest("hex"),
        };
        writeFileSync(
          `${jobPath}.tmp`,
          JSON.stringify({ engine: dialect, command: commandWithIdentity, test }),
        );
        renameSync(`${jobPath}.tmp`, jobPath);
        const report = await waitFile(`${jobPath}.result`, 45000);
        return report.passed === true;
      },
    };

    await expect(
      repository().transaction({ personaIds: [personaId], tokenIds: [] }, (tx) =>
        runOperationCases(tx, personaId, skillId, crypto, { evaluate: async () => true }),
      ),
    ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });

    const report = await repository().transaction({ personaIds: [personaId], tokenIds: [] }, (tx) =>
      runOperationCases(tx, personaId, skillId, crypto, executor),
    );
    expect(report.approved, JSON.stringify(report)).toBe(true);
    const published = await publish(skillId);
    const writer = await issue(
      [s],
      [
        {
          skillId,
          capabilities: published.capabilities,
          effects: ["select", "insert", "update", "delete"],
          operationLimits: { maxAffectedRows: 5, timeoutMs: 10000 },
        },
      ],
    );

    const boundedWriter = await issue(
      [s],
      [
        {
          skillId,
          capabilities: published.capabilities,
          effects: ["select", "insert", "update", "delete"],
        },
      ],
      personaId,
      { operationLimits: { maxAffectedRows: 2 } },
    );
    const refusedBudget = await tool(
      "preparar_operacao",
      { publicationId: published.publicationId, input },
      boundedWriter,
    );
    expect(refusedBudget.isError).toBe(true);
    expect(refusedBudget.value.error.code).toBe("BUDGET_EXCEEDED");
    const context = await tool("obter_skill", { slug: `write-${dialect}` }, writer);
    expect(context.isError, JSON.stringify(context.value)).toBe(false);
    expect(context.value.limits).toMatchObject({ maxAffectedRows: 3, timeoutMs: 10000 });
    expect(context.value.sharedKnowledge.publicationId).toBe(
      sharedTraining.sharedKnowledge!.publicationId,
    );
    expect(
      context.value.sharedKnowledge.expectedStructure.resources[0].constraints.primaryKeys[0]
        .status,
    ).toBe("enabled");
    const oldKnowledge = sharedTraining.sharedKnowledge!;
    const baseKnowledge = await repository().transaction(
      { personaIds: [personaId], tokenIds: [] },
      (tx) => tx.knowledge!.publication(oldKnowledge.catalogId, oldKnowledge.publicationId),
    );
    expect(baseKnowledge).not.toBeNull();
    const patternPath = `/api/admin/catalogos/${oldKnowledge.catalogId}/padroes/${baseKnowledge!.patternId}`;
    expect(
      (
        await post(`${patternPath}/editar`, {
          expectedRevision: baseKnowledge!.revision,
          name: "Operação revisão seguinte",
          content: { ...baseKnowledge!.content, label: "v2" },
        })
      ).status,
    ).toBe(200);
    const patternPreview = await post(`${patternPath}/preview`, {});
    expect(patternPreview.status).toBe(200);
    const patternPublished = await post(`${patternPath}/publicar`, {
      confirmationHash: patternPreview.body.confirmationHash,
    });
    expect(patternPublished.status).toBe(201);
    const second = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: `write-history-${dialect}`,
      name: "Operação revisão seguinte",
      kind: "operacao_sql",
      training: {
        ...sharedTraining,
        sharedKnowledge: {
          ...oldKnowledge,
          publicationId: patternPublished.body.publication.id,
        },
      },
    });
    expect(second.status).toBe(201);
    const secondId = second.body.skill.id as string;
    for (const stale of [false, true]) {
      expect(
        (
          await post(`/api/admin/personas/${personaId}/skills/${secondId}/casos`, {
            required: true,
            content: {
              name: stale ? "Concorrência" : "Três comandos",
              input: {
                parameters: {
                  ...input,
                  ...(stale ? { expected_revision: { type: "integer", value: "2" } } : {}),
                },
                fixtures: [{ table: "operation_fixture", generated: ["id"], rows: [] }],
              },
              expected: stale
                ? { error: "ROW_CONDITION_FAILED" }
                : { affectedRows: 3, tables: [{ table: "operation_fixture", rows: [] }] },
            },
          })
        ).status,
      ).toBe(201);
    }
    const secondReport = await repository().transaction(
      { personaIds: [personaId], tokenIds: [] },
      (tx) => runOperationCases(tx, personaId, secondId, crypto, executor),
    );
    expect(secondReport.approved).toBe(true);
    const secondPublication = await publish(secondId);
    const both = await issue(
      [s],
      [
        {
          skillId,
          capabilities: published.capabilities,
          effects: ["select", "insert", "update", "delete"],
        },
        {
          skillId: secondId,
          capabilities: secondPublication.capabilities,
          effects: ["select", "insert", "update", "delete"],
        },
      ],
    );
    const history = await tool("listar_historico_conhecimento", { skillId }, both);
    expect(history.isError, JSON.stringify(history.value)).toBe(false);
    expect(Array.from(history.value.versions as { skillId: string }[], (v) => v.skillId)).toEqual([
      secondId,
      skillId,
    ]);
    const comparisonInput = { fromSkillId: skillId, toSkillId: secondId };
    const operationDispatches = () =>
      readFileSync(join(sessionRoot, `${dialect}-rpc.jsonl`), "utf8")
        .split("\n")
        .filter(
          (line) =>
            line && (JSON.parse(line) as { method: string }).method === "sql.operation.execute",
        ).length;
    const beforeKnowledgeOAuth = operationDispatches();
    const compared = await tool("comparar_conhecimento", comparisonInput, both);
    expect(compared.isError, JSON.stringify(compared.value)).toBe(false);
    expect(compared.value.changes).toContainEqual({ section: "label", before: "v1", after: "v2" });
    expect(compared.value.grantsExecution).toBe(false);
    expect((await tool("comparar_conhecimento", comparisonInput, writer)).isError).toBe(true);
    expect(
      (await tool("listar_historico_conhecimento", { skillId: secondId }, writer)).isError,
    ).toBe(true);
    expect(
      (await tool("listar_historico_conhecimento", { skillId }, writer)).value.versions,
    ).toHaveLength(1);

    const queryGrants: { skillId: string; capabilities: string[]; effects: string[] }[] = [];
    for (let i = 0; i < 20; i++) {
      const query = await post(`/api/admin/personas/${personaId}/skills`, {
        kind: "consulta",
        slug: `mixed-history-${dialect}-${i}`,
        name: "Leitura compartilhada",
        training: {
          ...localQueryTraining(s.id, dialect),
          rules: baseKnowledge!.content.rules,
          sqlModel: sql.replace(
            "FROM operation_fixture",
            `FROM ${baseKnowledge!.content.tables[0]!.name}`,
          ),
          tables: baseKnowledge!.content.tables.map((t) => ({
            name: t.name,
            meaning: t.meaning,
            grain: t.grain,
          })),
          columns: baseKnowledge!.content.tables.flatMap((t) =>
            t.columns.map((c) => ({
              table: t.name,
              name: c.name,
              meaning: c.meaning,
              classification: c.classification,
            })),
          ),
          sharedKnowledge: { ...oldKnowledge, publicationId: patternPublished.body.publication.id },
        },
      });
      expect(query.status, JSON.stringify(query.body)).toBe(201);
      const queryId = query.body.skill.id as string;
      const queryPublication = await publish(queryId);
      queryGrants.push({
        skillId: queryId,
        capabilities: queryPublication.capabilities,
        effects: ["select"],
      });
    }
    const mixed = await issue(
      [s],
      [
        ...queryGrants,
        {
          skillId,
          capabilities: published.capabilities,
          effects: ["select", "insert", "update", "delete"],
        },
        {
          skillId: secondId,
          capabilities: secondPublication.capabilities,
          effects: ["select", "insert", "update", "delete"],
        },
      ],
    );
    const firstPage = await tool("listar_historico_conhecimento", { skillId }, mixed);
    expect(firstPage.isError, JSON.stringify(firstPage.value)).toBe(false);
    expect(firstPage.value.versions).toHaveLength(20);
    expect(firstPage.value.nextCursor).toBeTruthy();
    const lastPage = await tool(
      "listar_historico_conhecimento",
      {
        skillId,
        afterSkillId: firstPage.value.nextCursor,
      },
      mixed,
    );
    expect(lastPage.isError).toBe(false);
    expect(lastPage.value.versions).toHaveLength(2);
    expect(lastPage.value.nextCursor).toBeNull();
    interface HistoryRow {
      skillId: string;
      revision: number;
    }
    const rows = [...firstPage.value.versions, ...lastPage.value.versions] as HistoryRow[];
    const expectedRows = [
      ...queryGrants.map((g) => ({
        skillId: g.skillId,
        revision: patternPublished.body.publication.revision as number,
      })),
      { skillId: secondId, revision: patternPublished.body.publication.revision as number },
      { skillId, revision: baseKnowledge!.revision },
    ].sort((a, b) => b.revision - a.revision || a.skillId.localeCompare(b.skillId));
    expect(rows.map((row) => row.skillId)).toEqual(expectedRows.map((row) => row.skillId));
    expect(new Set(rows.map((row) => row.skillId)).size).toBe(22);
    const queryId = queryGrants[0]!.skillId;
    const mixedInput = { fromSkillId: skillId, toSkillId: queryId };
    const mixedComparison = await tool("comparar_conhecimento", mixedInput, mixed);
    expect(mixedComparison.isError).toBe(false);
    expect(mixedComparison.value.changes).toContainEqual({
      section: "label",
      before: "v1",
      after: "v2",
    });
    expect(mixedComparison.value.grantsExecution).toBe(false);
    const reverseMixed = await tool(
      "comparar_conhecimento",
      {
        fromSkillId: queryId,
        toSkillId: skillId,
      },
      mixed,
    );
    expect(reverseMixed.isError).toBe(false);
    interface Difference {
      section: string;
      before: unknown;
      after: unknown;
    }
    expect(reverseMixed.value.changes).toEqual(
      Array.from(mixedComparison.value.changes as Difference[], (c) => ({
        section: c.section,
        before: c.after,
        after: c.before,
      })),
    );
    const reader = await issue([s], queryGrants);
    expect((await tool("comparar_conhecimento", mixedInput, reader)).isError).toBe(true);
    expect((await tool("comparar_conhecimento", mixedInput, writer)).isError).toBe(true);
    expect(
      (
        await tool(
          "listar_historico_conhecimento",
          {
            skillId: queryId,
            afterSkillId: secondId,
          },
          reader,
        )
      ).isError,
    ).toBe(true);
    expect(
      (
        await tool(
          "listar_historico_conhecimento",
          {
            skillId,
            afterSkillId: queryId,
          },
          writer,
        )
      ).isError,
    ).toBe(true);

    const oauthOriginator = await issue(
      [s],
      [
        {
          skillId,
          capabilities: published.capabilities,
          effects: ["select", "insert", "update", "delete"],
        },
        {
          skillId: secondId,
          capabilities: secondPublication.capabilities,
          effects: ["select", "insert", "update", "delete"],
        },
      ],
    );
    const oauthCandidate = await composePersonaV2(
      testConfig({
        DATABASE_URL: manifest.controlDatabaseUrl,
        PLUG_SERVER_BASE_URL: hub.hubUrl,
        PUBLIC_BASE_URL: "https://mcp.fixture.test",
        LOG_LEVEL: "silent",
        PERSONA_V2_OAUTH_ENABLED: true,
        PERSONA_V2_OAUTH_CLIENTS: { [physicalOAuthClient]: [physicalOAuthRedirect] },
      }),
      { oauthClient: { validate: async () => Promise.resolve() } },
    );
    try {
      await exerciseKnowledgeHistoryOAuth(
        oauthCandidate.app,
        oauthOriginator,
        s.id,
        skillId,
        secondId,
        async () => {
          const state = await new PostgresPersonaRepository(db, crypto).authentication(
            crypto.sha256Hex(oauthOriginator),
          );
          expect(state).not.toBeNull();
          expect(
            (await post(`/api/admin/personas/${personaId}/tokens/${state!.token.id}/revogar`, {}))
              .status,
          ).toBe(204);
        },
      );
      const mixedOAuthOriginator = await issue(
        [s],
        [
          ...queryGrants,
          {
            skillId,
            capabilities: published.capabilities,
            effects: ["select", "insert", "update", "delete"],
          },
          {
            skillId: secondId,
            capabilities: secondPublication.capabilities,
            effects: ["select", "insert", "update", "delete"],
          },
        ],
      );
      await exerciseKnowledgeHistoryOAuth(
        oauthCandidate.app,
        mixedOAuthOriginator,
        s.id,
        skillId,
        queryId,
        async () => {
          const state = await repository().authentication(crypto.sha256Hex(mixedOAuthOriginator));
          expect(state).not.toBeNull();
          expect(
            (await post(`/api/admin/personas/${personaId}/tokens/${state!.token.id}/revogar`, {}))
              .status,
          ).toBe(204);
        },
        {
          skillIds: expectedRows.map((v) => v.skillId),
          expectedOrder: expectedRows.map((v) => v.skillId),
        },
      );
    } finally {
      await oauthCandidate.close();
    }
    expect(operationDispatches()).toBe(beforeKnowledgeOAuth);

    for (const stale of [false, true]) {
      const prepared = await tool(
        "preparar_operacao",
        {
          publicationId: published.publicationId,
          limits: { maxAffectedRows: 4, timeoutMs: 8000 },
          input: {
            ...input,
            ...(stale ? { expected_revision: { type: "integer", value: "2" } } : {}),
          },
        },
        writer,
      );
      expect(prepared.isError, JSON.stringify(prepared.value)).toBe(false);

      const reviewed = await administrativeGet(
        `/api/admin/personas/${personaId}/operations/${prepared.value.operationId}`,
      );
      expect(reviewed.status, JSON.stringify(reviewed.body)).toBe(200);
      expect(reviewed.body.command.expectedStructure.resources).toHaveLength(1);
      expect(reviewed.body.command).toMatchObject({ maxAffectedRows: 3, timeoutMs: 8000 });

      const ref = {
        operationId: prepared.value.operationId,
        fingerprint: prepared.value.fingerprint,
      };
      expect((await tool("executar_operacao", ref, writer)).isError).toBe(true);
      expect((await post(`/api/admin/personas/${personaId}/operations/approve`, ref)).status).toBe(
        200,
      );
      const result = await tool("executar_operacao", ref, writer);
      const operationMetadata = result.isError
        ? readFileSync(join(sessionRoot, `${dialect}-rpc.jsonl`), "utf8")
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line) as Record<string, unknown>)
            .filter((entry) => String(entry.method).startsWith("sql.operation."))
            .slice(-4)
            .map(({ method, code, stage, failure_code }) => ({
              method,
              code,
              stage,
              failure_code,
            }))
        : [];
      expect(result.isError, JSON.stringify({ result: result.value, operationMetadata })).toBe(
        false,
      );
      expect(result.value.receipt.state).toBe(stale ? "rollback_confirmado" : "concluida");
      expect(result.value.receipt.directlyAffectedRows).toBe(stale ? null : 3);
      expect((await tool("executar_operacao", ref, writer)).isError).toBe(true);
      const status = await tool("obter_operacao", ref, writer);
      expect(status.isError, JSON.stringify(status.value)).toBe(false);
      expect(status.value.receipt).toEqual(result.value.receipt);
      const after = await tool("consultar_dados", { fonteId: s.id, params: { minimum: 0 } });
      expect(after.isError).toBe(false);
      expect(after.value.rows).toHaveLength(1);
      expect(Number(after.value.rows[0].amount)).toBe(10.25);
    }
    const faultJob = join(sessionRoot, `${randomUUID()}.case-job.json`);
    writeFileSync(
      `${faultJob}.tmp`,
      JSON.stringify({ engine: dialect, kind: "lose-commit-confirmation" }),
    );
    renameSync(`${faultJob}.tmp`, faultJob);
    expect((await waitFile(`${faultJob}.result`)).passed).toBe(true);
    const uncertain = await tool(
      "preparar_operacao",
      { publicationId: published.publicationId, input },
      writer,
    );
    expect(uncertain.isError).toBe(false);
    const uncertainRef = {
      operationId: uncertain.value.operationId,
      fingerprint: uncertain.value.fingerprint,
    };
    expect(
      (await post(`/api/admin/personas/${personaId}/operations/approve`, uncertainRef)).status,
    ).toBe(200);
    const unknown = await tool("executar_operacao", uncertainRef, writer);
    expect(unknown.isError, JSON.stringify(unknown.value)).toBe(false);
    expect(unknown.value.receipt.state).toBe("resultado_desconhecido");
    expect(unknown.value.receipt.directlyAffectedRows).toBeNull();
    uncertainReceipts.push({
      source: s,
      operationId: uncertainRef.operationId,
      fingerprint: uncertainRef.fingerprint,
      executionId: unknown.value.receipt.executionId,
    });
    const dispatchCount = () =>
      readFileSync(join(sessionRoot, `${dialect}-rpc.jsonl`), "utf8")
        .split("\n")
        .filter(
          (line) =>
            line && (JSON.parse(line) as { method: string }).method === "sql.operation.execute",
        ).length;
    const beforeDuplicate = dispatchCount();
    expect((await tool("executar_operacao", uncertainRef, writer)).isError).toBe(true);
    expect(dispatchCount()).toBe(beforeDuplicate);
    const journalStatus = await tool("obter_operacao", uncertainRef, writer);
    expect(journalStatus.isError, JSON.stringify(journalStatus.value)).toBe(false);
    expect(journalStatus.value.receipt).toEqual(unknown.value.receipt);

    const canceled = await tool(
      "preparar_operacao",
      {
        publicationId: published.publicationId,
        input,
      },
      writer,
    );
    expect(canceled.isError).toBe(false);
    const cancelRef = {
      operationId: canceled.value.operationId,
      fingerprint: canceled.value.fingerprint,
    };
    expect(
      (
        await post(`/api/admin/personas/${personaId}/operations/approve`, {
          ...cancelRef,
          fingerprint: "0".repeat(64),
        })
      ).status,
    ).not.toBe(200);
    expect((await tool("cancelar_operacao", cancelRef, writer)).value.state).toBe("cancelada");
    expect((await tool("executar_operacao", cancelRef, writer)).isError).toBe(true);

    const pending = await tool(
      "preparar_operacao",
      {
        publicationId: published.publicationId,
        input,
      },
      writer,
    );
    expect(pending.isError).toBe(false);
    const pendingRef = {
      operationId: pending.value.operationId,
      fingerprint: pending.value.fingerprint,
    };
    expect(
      (await post(`/api/admin/personas/${personaId}/operations/approve`, pendingRef)).status,
    ).toBe(200);

    const ref = sharedTraining.sharedKnowledge!;
    const beforeSuspension = dispatchCount();
    expect(
      (
        await post(
          `/api/admin/catalogos/${ref.catalogId}/publicacoes/${ref.publicationId}/suspender`,
          {},
        )
      ).status,
    ).toBe(204);
    expect((await tool("executar_operacao", pendingRef, writer)).isError).toBe(true);
    expect((await tool("obter_skill", { slug: `write-${dialect}` }, writer)).isError).toBe(true);
    expect(dispatchCount()).toBe(beforeSuspension);
    expect((await tool("comparar_conhecimento", mixedInput, mixed)).isError).toBe(true);
    expect(
      (
        await tool(
          "listar_historico_conhecimento",
          {
            skillId: queryId,
            afterSkillId: skillId,
          },
          mixed,
        )
      ).isError,
    ).toBe(true);
    const mixedAuth = await repository().authentication(crypto.sha256Hex(mixed));
    expect(mixedAuth).not.toBeNull();
    expect(
      (await post(`/api/admin/personas/${personaId}/tokens/${mixedAuth!.token.id}/revogar`, {}))
        .status,
    ).toBe(204);
    await request(mcpUrl)
      .post("/mcp")
      .set("Host", new URL(mcpUrl).host)
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${mixed}`)
      .send({
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "tools/call",
        params: {
          name: "listar_historico_conhecimento",
          arguments: { skillId: queryId, afterSkillId: firstPage.value.nextCursor },
        },
      })
      .expect(401);
    expect((await tool("comparar_conhecimento", comparisonInput, both)).isError).toBe(true);
    expect(
      (await tool("listar_historico_conhecimento", { skillId: secondId }, both)).value.versions,
    ).toHaveLength(1);
    const reviewed = await administrativeGet(
      `/api/admin/personas/${personaId}/operations/${pendingRef.operationId}`,
    );
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.state).toBe("aprovada");

    const auth = await repository().authentication(crypto.sha256Hex(writer));
    expect(auth).not.toBeNull();
    expect(
      (await post(`/api/admin/personas/${personaId}/tokens/${auth!.token.id}/revogar`, {})).status,
    ).toBe(204);
    await request(mcpUrl)
      .post("/mcp")
      .set("Host", new URL(mcpUrl).host)
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${writer}`)
      .send({
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "tools/call",
        params: { name: "executar_operacao", arguments: pendingRef },
      })
      .expect(401);
  });
}

it(
  "recupera os journals dos motores vigentes após novo reinício do agente sem perder operações incertas",
  async () => {
    expect(uncertainReceipts).toHaveLength(chainEngines.length);
    await restartAgents();
    expect(verifyRefusalsAfterRestart).toHaveLength(chainEngines.length);
    for (const verify of verifyRefusalsAfterRestart) {
      await verify();
    }
    const credentials = JSON.parse(readFileSync(join(sessionRoot, "agents-ready.json"), "utf8"));
    for (const receipt of uncertainReceipts) {
      const source = receipt.source;
      // Read through the hub/RPC, avoiding a cached local MCP receipt.
      const response = await fetch(`${hub.hubUrl}/api/v1/agents/commands`, {
        method: "POST",
        headers: { authorization: `Bearer ${clientJwt}`, "content-type": "application/json" },
        body: JSON.stringify({
          agentId: source.source.agentId,
          command: {
            jsonrpc: "2.0",
            id: randomUUID(),
            method: "sql.operation.get",
            params: {
              contractVersion: 1,
              operationId: receipt.operationId,
              fingerprint: receipt.fingerprint,
              database: source.source.database,
              expectedSource: expectedSourceFor(source.source),
              sourcePhysicalId: crypto.sha256Hex(
                JSON.stringify([new URL(hub.hubUrl).origin, source.source.identityHash]),
              ),
              client_token: credentials[source.dialect].clientToken,
            },
          },
        }),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        response: {
          item: { result: { state: string; executionId: string; directlyAffectedRows: null } };
        };
      };
      expect(body.response.item.result.state).toBe("resultado_desconhecido");
      expect(body.response.item.result.executionId).toBe(receipt.executionId);
      expect(body.response.item.result.directlyAffectedRows).toBeNull();
      const stored = await db.query<{ payload_enc: string }>(
        "SELECT payload_enc FROM operacao_v2 WHERE persona_id=$1 AND id=$2",
        [personaId, receipt.operationId],
      );
      const command = JSON.parse(crypto.decrypt(stored.rows[0]!.payload_enc));
      const duplicate = await fetch(`${hub.hubUrl}/api/v1/agents/commands`, {
        method: "POST",
        headers: { authorization: `Bearer ${clientJwt}`, "content-type": "application/json" },
        body: JSON.stringify({
          agentId: source.source.agentId,
          command: {
            jsonrpc: "2.0",
            id: randomUUID(),
            method: "sql.operation.execute",
            params: {
              ...command,
              contractVersion: 1,
              expectedSource: expectedSourceFor(source.source),
              sourcePhysicalId: crypto.sha256Hex(
                JSON.stringify([new URL(hub.hubUrl).origin, source.source.identityHash]),
              ),
              client_token: credentials[source.dialect].clientToken,
            },
          },
        }),
      });
      expect(duplicate.status).toBe(200);
      const repeated = (await duplicate.json()) as typeof body;
      expect(repeated.response.item.result).toEqual(body.response.item.result);
      const queried = await tool("consultar_dados", { fonteId: source.id, params: { minimum: 0 } });
      expect(queried.isError).toBe(false);
      expect(queried.value.rows).toHaveLength(1);
      expect(Number(queried.value.rows[0].amount)).toBe(10.25);
    }
  },
  agentRestartTimeoutMs,
);

for (const dialect of chainEngines.slice(1)) {
  it(`cruza PostgreSQL e ${dialect} com dependências publicadas e registra proveniência`, async () => {
    const selected = [sources[0]!, sources.find((source) => source.dialect === dialect)!];
    const training = federationTraining(selected);
    const created = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: `cross-${dialect}`,
      name: "Cruzamento real",
      kind: "cruzamento",
      training,
    });
    expect(created.status).toBe(201);
    const skillId = created.body.skill.id as string;
    const content = federationCase(selected);
    content.input.plan = {
      ...content.input.plan,
      steps: content.input.plan.steps.map((step) =>
        step.kind === "local" ? { ...step, sql } : step,
      ),
    };
    expect(
      (
        await post(`/api/admin/personas/${personaId}/skills/${skillId}/casos`, {
          required: true,
          content,
        })
      ).status,
    ).toBe(201);
    const report = await repository().transaction({ personaIds: [personaId], tokenIds: [] }, (tx) =>
      runFederationCases(tx, personaId, skillId, crypto),
    );
    expect(report.approved).toBe(true);
    const published = await publish(skillId);
    const token = await issue(selected, [
      { skillId, capabilities: published.capabilities, effects: ["select"] },
    ]);
    const original = federationPlan(selected, published.publicationId);
    const plan = {
      ...original,
      steps: original.steps.map((step) => (step.kind === "local" ? { ...step, sql } : step)),
    };
    const result = await tool("executar_cruzamento", { plan }, token);
    expect(result.isError, JSON.stringify(result.value)).toBe(false);
    expect(result.value.rows).toHaveLength(1);
    expect(result.value.rows[0]).toMatchObject({ id: 1 });
    expect(Number(result.value.rows[0].amount_a)).toBe(10.25);
    expect(Number(result.value.rows[0].amount_b)).toBe(10.25);
    expect(
      (result.value.provenance as { sourceId: string }[]).map((item) => item.sourceId),
    ).toEqual(selected.map((source) => source.id));
    const restricted = await issue(
      [selected[0]!],
      [{ skillId, capabilities: published.capabilities, effects: ["select"] }],
    );
    expect((await tool("executar_cruzamento", { plan }, restricted)).isError).toBe(true);
    if (persistence === "prisma") {
      const authority = new pg.Pool({ connectionString: manifest.hubDatabaseUrl });
      const access = await authority.query<{
        client_id: string;
        agent_id: string;
        created_at: Date;
        approved_at: Date;
        client_token: string | null;
      }>("SELECT * FROM client_agent_accesses WHERE agent_id=$1", [selected[0]!.source.agentId]);
      expect(access.rowCount).toBe(1);
      const saved = access.rows[0]!;
      let revoked = false;
      let sqlCount = 0;
      class RevokingHub extends PlugServerRestAdapter {
        override async executeSql(input: Parameters<PlugServerRestAdapter["executeSql"]>[0]) {
          const response = await super.executeSql(input);
          sqlCount++;
          if (sqlCount === 2) {
            const removal = await authority.query(
              "DELETE FROM client_agent_accesses WHERE client_id=$1 AND agent_id=$2",
              [saved.client_id, saved.agent_id],
            );
            expect(removal.rowCount).toBe(1);
            revoked = true;
          }
          return response;
        }
      }
      const candidate = await composePersonaV2(
        testConfig({
          DATABASE_URL: manifest.controlDatabaseUrl,
          PLUG_SERVER_BASE_URL: hub.hubUrl,
          PUBLIC_BASE_URL: "http://127.0.0.1:5188",
          LOG_LEVEL: "silent",
        }),
        { hub: new RevokingHub(hub.hubUrl, new SilentTestLogger()) },
      );
      try {
        const response = await request(candidate.app)
          .post("/mcp")
          .set("Host", "127.0.0.1:5188")
          .set("Authorization", `Bearer ${token}`)
          .set("Accept", "application/json, text/event-stream")
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "executar_cruzamento", arguments: { plan } },
          });
        expect(response.status).toBe(200);
        const payload = parseMcpPayload(response);
        expect(payload.result).toMatchObject({ isError: true });
        const refused = payload.result as { content: { text: string }[] };
        expect(JSON.parse(refused.content[0]!.text)).toMatchObject({
          error: { code: "AUTHORIZATION_DENIED" },
        });
        expect(sqlCount).toBe(2);
        expect(revoked).toBe(true);
        expect(JSON.stringify(payload.result)).not.toContain("amount_a");
      } finally {
        await candidate.close();
        if (revoked) {
          await authority.query(
            "INSERT INTO client_agent_accesses (client_id,agent_id,created_at,approved_at,client_token) VALUES ($1,$2,$3,$4,$5)",
            [
              saved.client_id,
              saved.agent_id,
              saved.created_at,
              saved.approved_at,
              saved.client_token,
            ],
          );
        }
        await authority.end();
      }
    }
  });
}

for (const dialect of chainEngines) {
  it(`${dialect}: recupera fonte pela identidade real e substitui sem herdar treinamento ou permissões`, async () => {
    const original = sources.find((s) => s.dialect === dialect)!;
    const credentials = JSON.parse(readFileSync(join(sessionRoot, "agents-ready.json"), "utf8"));
    const persona = await post("/api/admin/personas", {
      name: `Ciclo ${dialect}`,
      specialty: "Fixture",
      instructions: "Use somente resultados verificados.",
    });
    expect(persona.status).toBe(201);
    const target = persona.body.persona.id as string;
    const path = `/api/admin/personas/${target}`;
    const registration = {
      name: `Fonte ${dialect}`,
      purpose: "Ciclo isolado",
      environment: "test",
      dialect,
      agentId: original.source.agentId,
      email: hub.client.email,
      password: hub.client.password,
      clientToken: credentials[dialect].clientToken,
    };
    const added = await post(`${path}/fontes`, registration);
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    const source = added.body.fonte as Source;
    expect(source.identityHash).toBe(original.source.identityHash);
    const draft = await post(`${path}/skills`, {
      slug: "consulta-ciclo",
      kind: "consulta",
      name: "Consulta do ciclo",
      training: localQueryTraining(source.id, dialect),
    });
    expect(draft.status).toBe(201);
    const skillId = draft.body.skill.id as string;
    const published = await publish(skillId, target);
    const selected = { dialect, source, id: source.id, skillId, ...published };
    const token = await issue([selected], [], target);
    const query = () =>
      tool("consultar_dados", { fonteId: source.id, params: { minimum: 0 } }, token);
    expect((await query()).isError).toBe(false);
    expect(
      (await post(`${path}/fontes/${source.id}/suspender`, { expectedVersion: 1 })).status,
    ).toBe(200);
    expect((await query()).isError).toBe(true);
    expect(
      (await tool("consultar_dados", { fonteId: original.id, params: { minimum: 0 } })).isError,
    ).toBe(false);
    const recovered = await post(`${path}/fontes/${source.id}/recuperar`, { expectedVersion: 2 });
    expect(recovered.status, JSON.stringify(recovered.body)).toBe(200);
    expect(recovered.body.fonte).toMatchObject({
      id: source.id,
      identityHash: source.identityHash,
      active: true,
      authorizationVersion: 3,
    });
    expect((await query()).isError).toBe(true);
    expect(
      (await administrativeGet(`${path}/skills/${skillId}/publicacao`)).body.publication,
    ).toBeNull();
    const replacement = await post(`${path}/fontes/${source.id}/substituir`, {
      expectedVersion: 3,
      source: { ...registration, name: "Substituta" },
    });
    expect(replacement.status, JSON.stringify(replacement.body)).toBe(201);
    const next = replacement.body.fonte as Source;
    expect(next.id).not.toBe(source.id);
    expect(next.identityHash).toBe(source.identityHash);
    const bindings = (await administrativeGet(`${path}/fontes`)).body.fontes as Source[];
    expect(bindings.find((s) => s.id === source.id)).toMatchObject({
      active: false,
      authorizationVersion: 4,
      replacedBySourceId: next.id,
    });
    expect(
      (await post(`${path}/fontes/${source.id}/recuperar`, { expectedVersion: 4 })).status,
    ).toBe(403);
    const replacementDraft = await post(`${path}/skills`, {
      slug: "consulta-substituta",
      kind: "consulta",
      name: "Consulta substituta",
      training: localQueryTraining(next.id, dialect),
    });
    expect(replacementDraft.status).toBe(201);
    const nextSkillId = replacementDraft.body.skill.id as string;
    const nextPublication = await publish(nextSkillId, target);
    expect(
      (await tool("consultar_dados", { fonteId: next.id, params: { minimum: 0 } }, token)).isError,
    ).toBe(true);
    const nextToken = await issue(
      [{ dialect, id: next.id, source: next, skillId: nextSkillId, ...nextPublication }],
      [],
      target,
    );
    const result = await tool(
      "consultar_dados",
      { fonteId: next.id, params: { minimum: 0 } },
      nextToken,
    );
    expect(result.isError, JSON.stringify(result.value)).toBe(false);
    expect(result.value.rows).toHaveLength(1);
    expect(Number(result.value.rows[0].amount)).toBe(10.25);
    expect(result.value.provenance.sourceId).toBe(next.id);
    expect(
      (await tool("consultar_dados", { fonteId: original.id, params: { minimum: 0 } })).isError,
    ).toBe(false);
    const history = (await administrativeGet(`${path}/historico`)).body.items as {
      event: string;
    }[];
    expect(history.map((i) => i.event)).toEqual(
      expect.arrayContaining(["source.suspended", "source.recovered", "source.replaced"]),
    );
  });
}

for (const dialect of chainEngines) {
  it(`${dialect}: identidade divergente e revogação técnica bloqueiam SQL pela cadeia real`, async () => {
    const source = sources.find((item) => item.dialect === dialect)!;
    const credentials = JSON.parse(readFileSync(join(sessionRoot, "agents-ready.json"), "utf8"));
    const wrong = await fetch(`${hub.hubUrl}/api/v1/agents/commands`, {
      method: "POST",
      headers: { authorization: `Bearer ${clientJwt}`, "content-type": "application/json" },
      body: JSON.stringify({
        agentId: hub.engines[dialect]!.agentId,
        command: {
          jsonrpc: "2.0",
          id: randomUUID(),
          method: "sql.execute",
          params: {
            sql: "SELECT missing_column FROM operation_fixture",
            database: source.source.database,
            client_token: credentials[dialect].clientToken,
            expectedSource: { ...expectedSourceFor(source.source), identityHash: "0".repeat(64) },
            options: { execution_mode: "preserve", max_rows: 10 },
          },
        },
      }),
    });
    expect(wrong.status).toBe(200);
    const failure = (await wrong.json()) as {
      response: { item: { error: { data: { failure_code: string } } } };
    };
    expect(failure.response.item.error.data.failure_code).toBe("SOURCE_IDENTITY_MISMATCH");

    const jobPath = join(sessionRoot, `${randomUUID()}.case-job.json`);
    writeFileSync(
      `${jobPath}.tmp`,
      JSON.stringify({ engine: dialect, kind: "revoke-technical-token" }),
    );
    renameSync(`${jobPath}.tmp`, jobPath);
    expect((await waitFile(`${jobPath}.result`)).passed).toBe(true);
    const result = await tool("consultar_dados", { fonteId: source.id, params: { minimum: 0 } });
    expect(result.isError).toBe(true);
    expect(result.value.error.code).toBe("ACCESS_REVOKED");
  });
}
