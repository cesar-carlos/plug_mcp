import { reviewDateFixture } from "../helpers/review-deadline.js";
import { operationTraining, operationInput } from "../helpers/persona-v2-operation.js";
import { federationTraining, federationCase } from "../helpers/persona-v2-federation.js";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { PostgresPersonaRepository } from "../../src/infrastructure/persistence/persona-v2/repository.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { MemoryAdministrativeSessions } from "../../src/infrastructure/persistence/persona-v2/admin-sessions.js";
import { PersonaAdministration } from "../../src/application/persona-v2/administration.js";
import { PersonaMaintenance } from "../../src/application/persona-v2/maintenance.js";
import { PersonaOwnerDelegation } from "../../src/application/persona-v2/owner-delegation.js";
import { PersonaTemporarySetups } from "../../src/application/persona-v2/setup.js";
import { PersonaExternalIntegrations } from "../../src/application/persona-v2/external-integrations.js";
import { PersonaIntegrationManagement } from "../../src/application/persona-v2/integration-management.js";
import { seedExternalConnection } from "../helpers/persona-external-action.js";
import { PersonaExternalActions } from "../../src/application/persona-v2/external-actions.js";
import { PersonaRetentionWorker } from "../../src/application/persona-v2/retention-worker.js";
import { PostgresPersonaRetentionWorker } from "../../src/infrastructure/persistence/persona-v2/retention-worker.js";
import { externalProviderFixture } from "../helpers/external-provider.js";
import { executeExternalManifest } from "../../src/infrastructure/persistence/persona-v2/run-external-cases.js";
import { ExternalHttpsFixtureControl } from "../../src/infrastructure/persona-v2/external-fixture-control.js";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  externalContractSchema,
  type ExternalActionTransport,
  type ExternalTransport,
} from "../../src/domain/persona-v2/external-contract.js";
import { PersonaOAuth } from "../../src/application/persona-v2/oauth.js";
import { PostgresPersonaOAuthStore } from "../../src/infrastructure/persistence/persona-v2/oauth.js";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { testConfig } from "../../src/config/env.js";
import type {
  ConsumerIdentity,
  AdministrativePermission,
  Permissions,
} from "../../src/domain/persona-v2/model.js";
import { PersonaAdministrativeAuthorization } from "../../src/application/persona-v2/administrative-authorization.js";
import { PersonaCatalog } from "../../src/application/persona-v2/catalog.js";
import { PersonaConsumerCatalog } from "../../src/application/persona-v2/consumer-catalog.js";
import { PersonaKnowledgeTraining } from "../../src/application/persona-v2/knowledge-training.js";
import { SharedKnowledge } from "../../src/application/persona-v2/shared-knowledge.js";
import { PostgresSharedKnowledgeRepository } from "../../src/infrastructure/persistence/persona-v2/shared-knowledge.js";
import { structureContent } from "../helpers/persona-v2-structure.js";
import { sourceProof } from "../helpers/persona-v2-training.js";
import { sourceSchemaResultSchema } from "../../src/domain/persona-v2/source-schema.js";
import { canonicalJson } from "../../src/domain/persona-v2/catalog.js";
import { queryTrainingSchema } from "../../src/application/persona-v2/query-training.js";
import { PersonaDelegatedTokens } from "../../src/application/persona-v2/delegated-tokens.js";
import { queryTraining } from "../helpers/persona-v2-training.js";
import { ADMINISTRATIVE_PERMISSIONS } from "../../src/domain/persona-v2/administrative-permissions.js";
import { parseMcpPayload } from "../helpers/mcp-rpc.js";
import type { OwnerDelegationHubPort } from "../../src/domain/ports/persona-security.port.js";
const url = new URL(personaV2TestDatabaseUrl()),
  adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const name = `setup_delegation_${randomUUID().replaceAll("-", "")}_test`;
url.pathname = `/${name}`;
const adminDb = new pg.Pool({ connectionString: adminUrl.toString() }),
  db = new pg.Pool({ connectionString: url.toString() });
const crypto = new NodeCryptoAdapter("03".repeat(32)),
  repository = new PostgresPersonaRepository(db, crypto);
const origin = "https://mcp.fixture.test";
let now = new Date(),
  clientId = "owner-fixture",
  active = true,
  remoteRevoked = false,
  remoteUnavailable = false;
let remoteId: string, remoteCredential: string;
let remoteAdministrative: AdministrativePermission[] = ["gerenciar_fontes"];
const hub: OwnerDelegationHubPort = {
  create: vi.fn(async (_jwt, input) => {
    remoteRevoked = false;
    remoteAdministrative = [...input.administrative];
    remoteId = randomUUID();
    remoteCredential = "pdv2_" + crypto.randomToken(32);
    return {
      ...input,
      id: remoteId,
      clientId: "owner-fixture",
      credential: remoteCredential,
      expiresAt: new Date(now.getTime() + 30 * 86400000).toISOString(),
    };
  }),
  verify: vi.fn(async (_credential, input) => {
    if (remoteRevoked || remoteUnavailable) throw new Error("Fixture authority unavailable");
    return {
      ...input,
      id: remoteId,
      clientId: "owner-fixture",
      expiresAt: new Date(now.getTime() + 30 * 86400000).toISOString(),
      active: true,
      administrative: remoteAdministrative,
    };
  }),
  revoke: vi.fn(async () => {
    remoteRevoked = true;
  }),
};
const ownerAuth = {
  hubOrigin: "https://hub.fixture.test",
  login: vi.fn(async () => ({ accessToken: "fixture-jwt-memory-only" })),
  profile: vi.fn(async () => ({ clientId, active })),
};
const sourceVerifier = {
  verify: vi.fn(async () => ({
    database: "fixture",
    dialect: "mssql" as const,
    identityHash: "f".repeat(64),
    verifiedAt: now.toISOString(),
  })),
};
const services = {
  repository,
  crypto,
  sessions: new MemoryAdministrativeSessions(crypto),
  ownerAuth,
  sourceVerifier,
  now: () => now,
};
const admin = new PersonaAdministration(services),
  maintenance = new PersonaMaintenance(services, admin, {
    verifyIdentity: sourceVerifier.verify,
    discardSession: vi.fn(),
    invalidateIdentity: vi.fn(),
  });
const delegation = new PersonaOwnerDelegation(services, admin, hub, origin),
  setups = new PersonaTemporarySetups(services, delegation, admin, maintenance, origin);
const administrative = new PersonaAdministrativeAuthorization(services, admin, delegation);
const catalog = new PersonaCatalog(services, admin, administrative);
const tokensAdministration = new PersonaDelegatedTokens(services, administrative);
let session: string, identity: ConsumerIdentity, bearer: string;
let runtime: Awaited<ReturnType<typeof composePersonaV2>>;
const sourceInput = {
  name: "Base fixture",
  purpose: "Teste isolado",
  environment: "homologacao",
  agentId: randomUUID(),
  dialect: "mssql",
  email: "source@fixture.test",
  password: "fixture-source-password",
  clientToken: "fixture-source-token",
};
const ownerInput = { email: "owner@fixture.test", password: "fixture-owner-password" };
const link = async () => {
  const r = await setups.start(identity);
  const u = new URL(r.url);
  return { r, code: u.pathname.split("/").at(-1)!, csrf: u.hash.slice(1) };
};
beforeAll(async () => {
  await adminDb.query(`CREATE DATABASE "${name}"`);
  await applyPersonaMigrations(url.toString());
  await applyPersonaMigrations(url.toString());
  runtime = await composePersonaV2(
    testConfig({
      DATABASE_URL: url.toString(),
      PUBLIC_BASE_URL: origin,
      MCP_ENCRYPTION_KEY: "03".repeat(32),
    }),
    { ownerAuth, sourceVerifier, delegationHub: hub },
  );
});
afterAll(async () => {
  await runtime?.close();
  await db.end();
  await adminDb.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await adminDb.end();
});
beforeEach(async () => {
  now = new Date();
  clientId = "owner-fixture";
  active = true;
  remoteRevoked = false;
  remoteUnavailable = false;
  vi.clearAllMocks();
  session = (await admin.login(ownerInput.email, ownerInput.password)).sessionId;
  const persona = await admin.createPersona(session, {
    name: "Persona fixture",
    specialty: "Consulta",
    instructions: "Sem dados inventados",
  });
  const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const token = await admin.issueToken(session, {
    personaId: persona.id,
    name: "Consumidor admin",
    permissions: { ...empty, administrative: ["gerenciar_fontes"] },
    delegation: empty,
    expiresAt: null,
  });
  bearer = token.bearer;
  identity = {
    personaId: persona.id,
    personaVersion: persona.authorizationVersion,
    tokenId: token.tokenId,
    tokenVersion: 1,
  };
  await delegation.create(session, persona.id, 0);
});
const emptyPermissions: Permissions = {
  sourceIds: [],
  skills: [],
  externalOperationIds: [],
  administrative: [],
};
const administrator = async (
  permissions: readonly AdministrativePermission[] = ["treinar", "publicar", "gerenciar_tokens"],
) => {
  const source = await admin.addSource(session, {
    ...sourceInput,
    dialect: "mssql",
    personaId: identity.personaId,
  });
  const grants: Permissions = {
    ...emptyPermissions,
    sourceIds: [source.id],
    administrative: permissions,
  };
  const issued = await admin.issueToken(session, {
    personaId: identity.personaId,
    name: "Administrador limitado",
    permissions: grants,
    delegation: grants,
    expiresAt: new Date(now.getTime() + 86400000),
  });
  await delegation.create(session, identity.personaId, 1, permissions);
  const actor = { ...identity, tokenId: issued.tokenId };
  const training = { ...queryTraining(source.id), dialect: "mssql" };
  return {
    actor,
    source,
    grants,
    issued,
    draft: { slug: "pedidos", name: "Pedidos", kind: "consulta", training },
  };
};
const mcpCall = async (token: string, name: string, args: object, app = runtime.app) => {
  const response = await request(app)
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
  const payload = parseMcpPayload(response);
  if (payload.error) return { isError: true, value: payload.error };
  const result = payload.result as { isError?: boolean; content: { text: string }[] };
  return { isError: result.isError === true, value: JSON.parse(result.content[0]!.text) };
};
const ownTokenLink = async (actor: ConsumerIdentity) => {
  const u = new URL((await setups.start(actor, undefined, true)).url);
  return { code: u.pathname.split("/").at(-1)!, csrf: u.hash.slice(1) };
};
const issuanceLink = async (actor: ConsumerIdentity, proposal: unknown) => {
  const u = new URL((await setups.start(actor, undefined, false, proposal)).url);
  return { code: u.pathname.split("/").at(-1)!, csrf: u.hash.slice(1) };
};
it("issues exact restricted grants once without altering the issuer or returning a secret over MCP", async () => {
  const f = await administrator(["gerenciar_tokens"]);
  const proposal = {
    name: "Consumidor limitado",
    expiresAt: new Date(now.getTime() + 600000).toISOString(),
    permissions: { ...emptyPermissions, sourceIds: [f.source.id] },
    delegation: emptyPermissions,
  };
  const started = await mcpCall(f.issued.bearer, "iniciar_emissao_token_persona", proposal);
  expect(started.isError).toBe(false);
  expect(started.value.bearer).toBeUndefined();
  const u = new URL(started.value.url),
    code = u.pathname.split("/").at(-1)!,
    csrf = u.hash.slice(1);
  const get = await request(runtime.app).get(u.pathname).set("Host", "mcp.fixture.test");
  expect(get.text).toContain("Consumidor limitado");
  expect(get.text).toContain(f.source.id);
  expect(get.text).not.toContain("CLIENT_PASSWORD");
  const results = await Promise.allSettled(
    [1, 2].map(() => setups.complete(code, csrf, ownerInput, { confirmed: "issue" })),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const result = results.find((r) => r.status === "fulfilled")!;
  if (result.status !== "fulfilled" || !("bearer" in result.value))
    throw new Error("Missing browser credential");
  const issued = await repository.authentication(crypto.sha256Hex(result.value.bearer));
  expect(issued?.token.id).not.toBe(f.actor.tokenId);
  expect(issued?.token.permissions).toEqual(proposal.permissions);
  expect(issued?.token.delegation).toEqual(emptyPermissions);
  expect(issued?.token.expiresAt?.toISOString()).toBe(proposal.expiresAt);
  expect(await repository.authentication(crypto.sha256Hex(f.issued.bearer))).not.toBeNull();
  const rows = await db.query("SELECT * FROM setup_v2 WHERE code_hash=$1", [
    crypto.sha256Hex(code),
  ]);
  expect(JSON.stringify(rows.rows)).not.toContain(proposal.name);
  expect(JSON.stringify(rows.rows)).not.toContain(result.value.bearer);
});
it("denies issuance above source, administrative, delegation or expiry ceilings", async () => {
  const f = await administrator(["gerenciar_tokens"]);
  const proposal = {
    name: "Limitado",
    expiresAt: new Date(now.getTime() + 600000).toISOString(),
    permissions: emptyPermissions,
    delegation: emptyPermissions,
  };
  for (const invalid of [
    { ...proposal, permissions: { ...emptyPermissions, sourceIds: [randomUUID()] } },
    { ...proposal, permissions: { ...emptyPermissions, administrative: ["publicar"] } },
    { ...proposal, delegation: f.grants },
    { ...proposal, expiresAt: null },
    { ...proposal, expiresAt: new Date(now.getTime() + 2 * 86400000).toISOString() },
    { ...proposal, personaId: randomUUID() },
  ]) {
    await expect(issuanceLink(f.actor, invalid)).rejects.toThrow();
  }
  await expect(issuanceLink(identity, proposal)).rejects.toThrow();
});
it("issuance rejects modified proposals, wrong CSRF/owner and stale originator", async () => {
  const f = await administrator(["gerenciar_tokens"]);
  const proposal = {
    name: "Limitado",
    expiresAt: new Date(now.getTime() + 600000).toISOString(),
    permissions: emptyPermissions,
    delegation: emptyPermissions,
  };
  const link = await issuanceLink(f.actor, proposal);
  await expect(
    setups.complete(link.code, link.csrf, ownerInput, {
      confirmed: "issue",
      permissions: f.grants,
    }),
  ).rejects.toThrow();
  await expect(
    setups.complete(link.code, "x".repeat(43), ownerInput, { confirmed: "issue" }),
  ).rejects.toThrow();
  clientId = "other-owner";
  await expect(
    setups.complete(link.code, link.csrf, ownerInput, { confirmed: "issue" }),
  ).rejects.toThrow();
  clientId = "owner-fixture";
  await admin.revokeToken(session, identity.personaId, f.actor.tokenId);
  await expect(
    setups.complete(link.code, link.csrf, ownerInput, { confirmed: "issue" }),
  ).rejects.toThrow();
  expect((await setups.inspect(link.code)).consumedAt).toBeNull();
});
it("issuance rolls back token and consumption when audit fails", async () => {
  const f = await administrator(["gerenciar_tokens"]);
  const link = await issuanceLink(f.actor, {
    name: "Limitado",
    expiresAt: new Date(now.getTime() + 600000).toISOString(),
    permissions: emptyPermissions,
    delegation: emptyPermissions,
  });
  const before = (await admin.listTokens(session, identity.personaId)).length;
  const guard = `fail_issue_${identity.personaId.replaceAll("-", "")}`;
  await db.query(
    `CREATE FUNCTION ${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.evento='token.issued' THEN RAISE EXCEPTION 'fixture'; END IF; RETURN NEW; END $$`,
  );
  await db.query(
    `CREATE TRIGGER ${guard} BEFORE INSERT ON audit_v2 FOR EACH ROW EXECUTE FUNCTION ${guard}()`,
  );
  try {
    await expect(
      setups.complete(link.code, link.csrf, ownerInput, { confirmed: "issue" }),
    ).rejects.toThrow();
    expect((await setups.inspect(link.code)).consumedAt).toBeNull();
    expect((await admin.listTokens(session, identity.personaId)).length).toBe(before);
  } finally {
    await db.query(`DROP TRIGGER ${guard} ON audit_v2`);
    await db.query(`DROP FUNCTION ${guard}()`);
  }
});
it("OAuth rotation requires consent and revokes access/refresh of the originating family", async () => {
  const f = await administrator(["gerenciar_tokens"]);
  const hash = (s: string) => createHash("sha256").update(s).digest("base64url");
  const verifier = "v".repeat(43),
    client = "https://client.fixture.test/client.json",
    redirect = "https://client.fixture.test/callback";
  const oauth = new PersonaOAuth(
    new PostgresPersonaOAuthStore(db, crypto),
    repository,
    crypto,
    { validate: async () => undefined },
    { issuer: origin, resource: `${origin}/mcp/chatgpt`, clients: { [client]: [redirect] } },
    hash,
    () => now.getTime(),
    async () => ["gerenciar_tokens"],
  );
  const connect = async (administrative: AdministrativePermission[]) => {
    const start = await oauth.begin({
      client_id: client,
      redirect_uri: redirect,
      response_type: "code",
      scope: "se7e:persona",
      resource: `${origin}/mcp/chatgpt`,
      code_challenge_method: "S256",
      code_challenge: hash(verifier),
    });
    const review = await oauth.authenticate(start.id, start.nonce, start.csrf, f.issued.bearer);
    const location = await oauth.consent(start.id, start.nonce, review.csrf, {
      sources: [],
      skills: [],
      external: [],
      administrative,
    });
    return oauth.token({
      client_id: client,
      redirect_uri: redirect,
      grant_type: "authorization_code",
      resource: `${origin}/mcp/chatgpt`,
      code: new URL(location).searchParams.get("code")!,
      code_verifier: verifier,
    });
  };
  const denied = await connect([]);
  await expect(ownTokenLink(await oauth.resolve(denied.access_token))).rejects.toThrow();
  const allowed = await connect(["gerenciar_tokens"]);
  const actor = await oauth.resolve(allowed.access_token);
  const proposal = {
    name: "OAuth limitado",
    expiresAt: new Date(now.getTime() + 120000).toISOString(),
    permissions: emptyPermissions,
    delegation: emptyPermissions,
  };
  await expect(issuanceLink(await oauth.resolve(denied.access_token), proposal)).rejects.toThrow();
  await expect(issuanceLink(actor, { ...proposal, permissions: f.grants })).rejects.toThrow();
  await expect(
    issuanceLink(actor, {
      ...proposal,
      expiresAt: new Date(now.getTime() + 3600000).toISOString(),
    }),
  ).rejects.toThrow();
  const issuance = await issuanceLink(actor, proposal);
  const child = await setups.complete(issuance.code, issuance.csrf, ownerInput, {
    confirmed: "issue",
  });
  expect("bearer" in child).toBe(true);
  const link = await ownTokenLink(await oauth.resolve(allowed.access_token));
  await setups.complete(link.code, link.csrf, ownerInput, { confirmed: "rotate" });
  await expect(oauth.resolve(allowed.access_token)).rejects.toThrow();
  await expect(oauth.resolve(denied.access_token)).rejects.toThrow();
  await expect(
    oauth.token({
      client_id: client,
      grant_type: "refresh_token",
      resource: `${origin}/mcp/chatgpt`,
      refresh_token: allowed.refresh_token,
    }),
  ).rejects.toThrow();
});
it("failed rotation audit rolls back the token hash and setup consumption together", async () => {
  const f = await administrator(["gerenciar_tokens"]);
  const link = await ownTokenLink(f.actor);
  const guard = `fail_token_${identity.personaId.replaceAll("-", "")}`;
  await db.query(
    `CREATE FUNCTION ${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.evento='token.rotated' THEN RAISE EXCEPTION 'fixture'; END IF; RETURN NEW; END $$`,
  );
  await db.query(
    `CREATE TRIGGER ${guard} BEFORE INSERT ON audit_v2 FOR EACH ROW EXECUTE FUNCTION ${guard}()`,
  );
  try {
    await expect(
      setups.complete(link.code, link.csrf, ownerInput, { confirmed: "rotate" }),
    ).rejects.toThrow();
    expect(await repository.authentication(crypto.sha256Hex(f.issued.bearer))).not.toBeNull();
    expect((await setups.inspect(link.code)).consumedAt).toBeNull();
  } finally {
    await db.query(`DROP TRIGGER ${guard} ON audit_v2`);
    await db.query(`DROP FUNCTION ${guard}()`);
  }
});
it("rotates only the initiating token, preserving grants and expiry with single-use completion", async () => {
  const f = await administrator(["gerenciar_tokens"]);
  const before = await repository.authorization(f.actor);
  const link = await ownTokenLink(f.actor);
  const result = await setups.complete(link.code, link.csrf, ownerInput, { confirmed: "rotate" });
  expect("bearer" in result).toBe(true);
  if (!("bearer" in result)) throw new Error("Missing browser credential");
  expect(await repository.authentication(crypto.sha256Hex(f.issued.bearer))).toBeNull();
  const after = await repository.authentication(crypto.sha256Hex(result.bearer));
  expect(after?.token.id).toBe(f.actor.tokenId);
  expect(after?.token.permissions).toEqual(before?.token.permissions);
  expect(after?.token.delegation).toEqual(before?.token.delegation);
  expect(after?.token.expiresAt).toEqual(before?.token.expiresAt);
  expect(after?.token.authorizationVersion).toBe(2);
  expect(await repository.authentication(crypto.sha256Hex(bearer))).not.toBeNull();
  await expect(
    setups.complete(link.code, link.csrf, ownerInput, { confirmed: "rotate" }),
  ).rejects.toThrow();
  const rows = await db.query("SELECT * FROM audit_v2 WHERE persona_id=$1", [identity.personaId]);
  expect(JSON.stringify(rows.rows)).not.toContain(result.bearer);
});
it("requires token permission, explicit human confirmation, same owner and exact CSRF", async () => {
  expect(await setups.visible(identity, "gerenciar_tokens")).toBe(false);
  await expect(ownTokenLink(identity)).rejects.toThrow();
  const f = await administrator(["gerenciar_tokens"]);
  const link = await ownTokenLink(f.actor);
  await expect(setups.complete(link.code, link.csrf, ownerInput, {})).rejects.toThrow();
  await expect(
    setups.complete(link.code, "x".repeat(43), ownerInput, { confirmed: "rotate" }),
  ).rejects.toThrow();
  await expect(
    setups.complete(link.code, link.csrf, ownerInput, {
      confirmed: "rotate",
      tokenId: identity.tokenId,
    }),
  ).rejects.toThrow();
  clientId = "other-owner";
  await expect(
    setups.complete(link.code, link.csrf, ownerInput, { confirmed: "rotate" }),
  ).rejects.toThrow();
  expect((await setups.inspect(link.code)).consumedAt).toBeNull();
});
it("competing token setups produce only one new secret and stale authority cannot rotate again", async () => {
  const f = await administrator(["gerenciar_tokens"]);
  const a = await ownTokenLink(f.actor),
    b = await ownTokenLink(f.actor);
  const results = await Promise.allSettled(
    [a, b].map((v) => setups.complete(v.code, v.csrf, ownerInput, { confirmed: "rotate" })),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (await admin.listTokens(session, identity.personaId)).find((t) => t.id === f.actor.tokenId)
      ?.authorizationVersion,
  ).toBe(2);
  await expect(ownTokenLink(f.actor)).rejects.toThrow();
});
it("expiry and delegation revocation prevent token rotation without consuming setup", async () => {
  const f = await administrator(["gerenciar_tokens"]);
  const link = await ownTokenLink(f.actor);
  remoteRevoked = true;
  await expect(
    setups.complete(link.code, link.csrf, ownerInput, { confirmed: "rotate" }),
  ).rejects.toThrow();
  remoteRevoked = false;
  expect((await setups.inspect(link.code)).consumedAt).toBeNull();
  now = new Date(now.getTime() + 900001);
  await expect(
    setups.complete(link.code, link.csrf, ownerInput, { confirmed: "rotate" }),
  ).rejects.toThrow();
});
it("token setup MCP returns only a link; browser POST alone receives the replacement", async () => {
  const f = await administrator(["gerenciar_tokens"]);
  const started = await mcpCall(f.issued.bearer, "iniciar_rotacao_token_persona", {});
  expect(started.isError).toBe(false);
  expect(started.value.bearer).toBeUndefined();
  const u = new URL(started.value.url);
  const get = await request(runtime.app).get(u.pathname).set("Host", "mcp.fixture.test");
  expect(get.text).toContain("Rotacionar token");
  expect(get.text).not.toContain("CLIENT_PASSWORD");
  expect(get.headers["cache-control"]).toBe("no-store");
  const response = await request(runtime.app)
    .post(u.pathname)
    .set("Host", "mcp.fixture.test")
    .set("Origin", origin)
    .type("form")
    .send({
      csrf: u.hash.slice(1),
      ownerEmail: ownerInput.email,
      ownerPassword: ownerInput.password,
      confirmed: "rotate",
    });
  expect(response.status).toBe(200);
  expect(response.text).toContain('id="rotated-token"');
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.text).not.toContain(ownerInput.password);
  expect((await mcpCall(f.issued.bearer, "iniciar_rotacao_token_persona", {})).isError).toBe(true);
  const replay = await request(runtime.app).get(u.pathname).set("Host", "mcp.fixture.test");
  expect(replay.text).not.toContain('id="rotated-token"');
});
it("MCP inativa exemplo por CAS sem apagar conteúdo ou alterar publicação e recusa replay", async () => {
  const f = await administrator();
  const example = {
    id: "retiring",
    purpose: "Sintético",
    sql: queryTraining().sqlModel,
    explanation: "Preservar para revisão",
    state: "approved",
  };
  const other = { ...example, id: "keep" };
  const draft = await catalog.create(f.actor, identity.personaId, {
    ...f.draft,
    training: { ...f.draft.training, examples: [example, other] },
  });
  await catalog.setReviewDeadline(session, identity.personaId, draft.id, {
    dueAt: reviewDateFixture(),
  });
  const preview = await catalog.preview(f.actor, identity.personaId, draft.id);
  const publication = await catalog.publish(
    f.actor,
    identity.personaId,
    draft.id,
    preview.confirmationHash,
  );
  const stale = await catalog.preview(f.actor, identity.personaId, draft.id);
  const args = { skillId: draft.id, expectedRevision: draft.revision, exampleId: example.id };
  expect(
    (await mcpCall(f.issued.bearer, "inativar_exemplo_sql", { ...args, exampleId: "absent" }))
      .isError,
  ).toBe(true);
  const results = await Promise.all(
    [1, 2].map(() => mcpCall(f.issued.bearer, "inativar_exemplo_sql", args)),
  );
  expect(results.filter((r) => !r.isError)).toHaveLength(1);
  const edited = results.find((r) => !r.isError)!.value;
  expect(edited.revision).toBe(draft.revision + 1);
  expect(edited.training).toEqual({
    ...queryTrainingSchema.parse(draft.training),
    examples: [{ ...example, state: "inactive" }, other],
  });
  expect(await catalog.active(session, identity.personaId, draft.id)).toEqual(publication);
  await expect(
    catalog.publish(f.actor, identity.personaId, draft.id, stale.confirmationHash),
  ).rejects.toThrow();
  expect(
    (
      await mcpCall(f.issued.bearer, "inativar_exemplo_sql", {
        ...args,
        expectedRevision: edited.revision,
      })
    ).isError,
  ).toBe(true);
  remoteRevoked = true;
  expect(
    (
      await mcpCall(f.issued.bearer, "inativar_exemplo_sql", {
        ...args,
        exampleId: other.id,
        expectedRevision: edited.revision,
      })
    ).isError,
  ).toBe(true);
  const audit = await db.query("SELECT * FROM audit_v2 WHERE persona_id=$1", [identity.personaId]);
  expect(JSON.stringify(audit.rows)).not.toContain(example.sql);
});

it("inativação editorial exige treinar, fonte concedida e a própria persona", async () => {
  const f = await administrator();
  const example = {
    id: "candidate",
    purpose: "Sintético",
    sql: queryTraining().sqlModel,
    explanation: "Exemplo explícito para revisão",
    state: "candidate",
  };
  const draft = await catalog.create(f.actor, identity.personaId, {
    ...f.draft,
    training: { ...f.draft.training, examples: [example] },
  });
  const args = { expectedRevision: draft.revision, exampleId: example.id };
  await expect(
    catalog.deactivateSqlExample(identity, identity.personaId, draft.id, args),
  ).rejects.toThrow();
  await expect(
    catalog.deactivateSqlExample(f.actor, randomUUID(), draft.id, args),
  ).rejects.toThrow();
  const limited = await admin.issueToken(session, {
    personaId: identity.personaId,
    name: "Sem fontes",
    permissions: { ...emptyPermissions, administrative: ["treinar"] },
    delegation: emptyPermissions,
    expiresAt: null,
  });
  expect(
    (await mcpCall(limited.bearer, "inativar_exemplo_sql", { ...args, skillId: draft.id })).isError,
  ).toBe(true);
  const edited = await catalog.deactivateSqlExample(f.actor, identity.personaId, draft.id, args);
  expect(queryTrainingSchema.parse(edited.training).examples?.[0]?.state).toBe("inactive");
});

it("MCP substitui exemplo explicitamente por CAS sem herdar aprovação ou alterar publicação", async () => {
  const f = await administrator();
  const example = {
    id: "editable",
    purpose: "Sintético",
    sql: queryTraining().sqlModel,
    explanation: "Inicial",
    state: "approved",
  };
  const draft = await catalog.create(f.actor, identity.personaId, {
    ...f.draft,
    training: { ...f.draft.training, examples: [example] },
  });
  await catalog.setReviewDeadline(session, identity.personaId, draft.id, {
    dueAt: reviewDateFixture(),
  });
  const preview = await catalog.preview(f.actor, identity.personaId, draft.id);
  const publication = await catalog.publish(
    f.actor,
    identity.personaId,
    draft.id,
    preview.confirmationHash,
  );
  const args = {
    skillId: draft.id,
    expectedRevision: draft.revision,
    replace: true,
    example: { ...example, explanation: "Correção explícita" },
  };
  expect(
    (
      await mcpCall(f.issued.bearer, "registrar_exemplo_sql", {
        ...args,
        example: { ...example, id: "missing" },
      })
    ).isError,
  ).toBe(true);
  expect(
    (
      await mcpCall(f.issued.bearer, "registrar_exemplo_sql", {
        ...args,
        example: { ...example, sql: "DELETE FROM orders" },
      })
    ).isError,
  ).toBe(true);
  const replaced = await mcpCall(f.issued.bearer, "registrar_exemplo_sql", args);
  expect(replaced.isError).toBe(false);
  expect(replaced.value.training.examples).toEqual([{ ...args.example, state: "candidate" }]);
  expect(replaced.value.training.sqlModel).toBe(queryTraining().sqlModel);
  expect(replaced.value.revision).toBe(draft.revision + 1);
  expect((await catalog.active(session, identity.personaId, draft.id))?.id).toBe(publication.id);
  expect((await mcpCall(f.issued.bearer, "registrar_exemplo_sql", args)).isError).toBe(true);
  remoteRevoked = true;
  expect(
    (
      await mcpCall(f.issued.bearer, "registrar_exemplo_sql", {
        ...args,
        expectedRevision: draft.revision + 1,
      })
    ).isError,
  ).toBe(true);
});

it("MCP registra exemplo explícito candidato, preserva modelo e parâmetros e exige revisão editorial", async () => {
  const f = await administrator(),
    draft = await catalog.create(f.actor, identity.personaId, f.draft);
  await expect(catalog.preview(f.actor, identity.personaId, draft.id)).rejects.toMatchObject({
    code: "INCOMPLETE_INPUT",
  });
  await expect(
    catalog.preview(f.actor, identity.personaId, draft.id, reviewDateFixture()),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await catalog.setReviewDeadline(session, identity.personaId, draft.id, {
    dueAt: reviewDateFixture(),
  });
  const initial = await catalog.preview(f.actor, identity.personaId, draft.id);
  const published = await catalog.publish(
    f.actor,
    identity.personaId,
    draft.id,
    initial.confirmationHash,
  );
  const example = {
    id: "explicit",
    purpose: "Exemplo sintético",
    sql: queryTraining().sqlModel,
    explanation: "Sem execução automática",
    state: "approved",
  };
  const registered = await mcpCall(f.issued.bearer, "registrar_exemplo_sql", {
    skillId: draft.id,
    expectedRevision: 1,
    example,
  });
  expect(registered.isError).toBe(false);
  expect(registered.value.training.examples[0].state).toBe("candidate");
  expect(registered.value.training.sqlModel).toBe(queryTraining().sqlModel);
  expect(registered.value.training.parameters).toEqual(queryTraining().parameters);
  expect((await catalog.active(session, identity.personaId, draft.id))?.id).toBe(published.id);
  await catalog.setReviewDeadline(session, identity.personaId, draft.id, {
    dueAt: reviewDateFixture(),
  });
  const pending = await catalog.preview(f.actor, identity.personaId, draft.id);
  expect(pending.warnings).toContain("EXEMPLOS_CANDIDATOS_EXIGEM_REVISAO");
  await expect(
    catalog.publish(f.actor, identity.personaId, draft.id, pending.confirmationHash),
  ).rejects.toThrow(/candidato/i);
  expect(
    (
      await mcpCall(f.issued.bearer, "registrar_exemplo_sql", {
        skillId: draft.id,
        expectedRevision: 1,
        example,
      })
    ).isError,
  ).toBe(true);
  expect(
    (
      await mcpCall(f.issued.bearer, "registrar_exemplo_sql", {
        skillId: draft.id,
        expectedRevision: 2,
        example: { ...example, id: "invalid", sql: "DELETE FROM orders" },
      })
    ).isError,
  ).toBe(true);
  expect(
    (
      await mcpCall(f.issued.bearer, "registrar_exemplo_sql", {
        skillId: draft.id,
        expectedRevision: 2,
        example,
      })
    ).isError,
  ).toBe(true);
  const current = queryTrainingSchema.parse(registered.value.training);
  await catalog.update(f.actor, identity.personaId, draft.id, {
    name: draft.name,
    expectedRevision: 2,
    training: {
      ...current,
      examples: current.examples!.map((e) => ({ ...e, state: "approved" })),
    },
  });
  await catalog.setReviewDeadline(session, identity.personaId, draft.id, {
    dueAt: reviewDateFixture(),
  });
  const reviewed = await catalog.preview(f.actor, identity.personaId, draft.id);
  await catalog.publish(f.actor, identity.personaId, draft.id, reviewed.confirmationHash);
  remoteRevoked = true;
  expect(
    (
      await mcpCall(f.issued.bearer, "registrar_exemplo_sql", {
        skillId: draft.id,
        expectedRevision: 3,
        example: { ...example, id: "revoked" },
      })
    ).isError,
  ).toBe(true);
  const audit = await db.query("SELECT * FROM audit_v2 WHERE persona_id=$1", [identity.personaId]);
  expect(JSON.stringify(audit.rows)).not.toContain("SELECT p.id");
});
it("MCP recorta conhecimento concedido; propor exige skill, papel, consentimento e delegação vigentes", async () => {
  const f = await administrator(),
    shared = new SharedKnowledge(services, admin, new PostgresSharedKnowledgeRepository(db));
  const c = await shared.create(session, { name: "Catálogo sintético" });
  const base = structureContent();
  const content = {
    ...base,
    dialects: ["mssql"],
    examples: [],
    tables: base.tables.map((t) => ({
      ...t,
      columns: t.columns.map((c) => ({
        ...c,
        nativeTypes: [
          {
            dialect: "mssql",
            type: c.name === "id" ? "int" : "decimal",
            ...(c.name === "amount" ? { precision: 18, scale: 2 } : {}),
          },
        ],
      })),
    })),
  };
  const pattern = await shared.createPattern(session, c.id, {
    slug: "synthetic",
    name: "Estrutura sintética",
    content,
  });
  const sp = await shared.preview(session, c.id, pattern.id, reviewDateFixture());
  const pub = await shared.publish(session, c.id, pattern.id, {
    confirmationHash: sp.confirmationHash,
  });
  const evidenceId = randomUUID();
  // Synthetic metadata tests authority only. Real engine evidence is recorded by the chain suite.
  const evidence = sourceSchemaResultSchema.parse({
    contractVersion: 1,
    identity: sourceProof(f.source),
    observedAt: now.toISOString(),
    resources: [
      {
        resource: { schema: null, name: "orders", type: "table" },
        status: "available",
        columns: [
          { name: "id", nativeType: "int", ordinal: 1, nullable: false, size: null, scale: null },
          {
            name: "amount",
            nativeType: "decimal",
            ordinal: 2,
            nullable: false,
            size: 18,
            scale: 2,
          },
        ],
        primaryKeys: [],
        foreignKeys: [],
        coverage: {
          columns: true,
          primaryKeys: false,
          foreignKeys: false,
          constraintStatus: false,
        },
        limitations: ["constraint_status_unverified"],
      },
    ],
    metadataPage: { offset: 0, pageSize: 1, nextOffset: null },
  });
  await repository.transaction({ personaIds: [identity.personaId], tokenIds: [] }, async (tx) =>
    tx.recordStructureEvidence({
      id: evidenceId,
      source: f.source,
      scope: {
        resources: [{ schema: null, name: "orders", type: "table" }],
        offset: 0,
        pageSize: 1,
      },
      evidence,
      hash: crypto.sha256Hex(canonicalJson(evidence)),
      expiresAt: new Date(now.getTime() + 600000),
    }),
  );
  const training = {
    ...f.draft.training,
    tables: content.tables.map((t) => ({ name: t.name, meaning: t.meaning, grain: t.grain })),
    columns: content.tables.flatMap((t) =>
      t.columns.map((column) => ({
        table: t.name,
        name: column.name,
        meaning: column.meaning,
        classification: column.classification,
      })),
    ),
    rules: content.rules,
    sharedKnowledge: { catalogId: c.id, publicationId: pub.id, evidenceId },
  };
  const draft = await catalog.create(session, identity.personaId, { ...f.draft, training });
  await catalog.setReviewDeadline(session, identity.personaId, draft.id, {
    dueAt: reviewDateFixture(),
  });
  const preview = await catalog.preview(session, identity.personaId, draft.id);
  await catalog.publish(session, identity.personaId, draft.id, preview.confirmationHash);
  const permissions: Permissions = {
    ...f.grants,
    skills: [
      {
        skillId: draft.id,
        capabilities: preview.package.requiredCapabilities,
        effects: ["select"],
        requireHumanApproval: false,
      },
    ],
  };
  const issued = await admin.issueToken(session, {
    personaId: identity.personaId,
    name: "Colaborador",
    permissions,
    delegation: emptyPermissions,
    expiresAt: null,
  });
  const actor = { ...identity, tokenId: issued.tokenId };
  expect((await mcpCall(f.issued.bearer, "listar_padroes", {})).value.patterns).toEqual([]);
  const listed = await mcpCall(issued.bearer, "listar_padroes", {});
  expect(listed.isError).toBe(false);
  expect(listed.value.catalogBrowsing).toBe(false);
  expect(listed.value.patterns).toHaveLength(1);
  const read = await mcpCall(issued.bearer, "obter_padrao", { skillId: draft.id });
  expect(read.value.knowledge.publicationId).toBe(pub.id);
  expect(read.value.knowledge.content.examples).toEqual([]);
  expect((await mcpCall(issued.bearer, "obter_padrao", { skillId: randomUUID() })).isError).toBe(
    true,
  );
  const input = {
    skillId: draft.id,
    summary: "Regra proposta explicitamente",
    change: { kind: "regra", value: "Revisar calendário sintético" },
  };
  const proposal = await mcpCall(issued.bearer, "propor_conhecimento", input);
  expect(proposal.isError).toBe(false);
  expect(proposal.value).toMatchObject({
    state: "pending",
    published: false,
    semanticApproval: false,
  });
  const reference = { skillId: draft.id, proposalId: proposal.value.proposalId };
  expect(
    (await mcpCall(issued.bearer, "obter_proposta_conhecimento", reference)).value.submitted,
  ).toBeUndefined();
  const detail = await mcpCall(issued.bearer, "obter_proposta_conhecimento", {
    ...reference,
    includeContent: true,
  });
  expect(detail.isError).toBe(false);
  expect(detail.value.submitted).toMatchObject({
    summary: input.summary,
    change: input.change,
    basePublicationId: pub.id,
  });
  expect(detail.value.submitted).not.toHaveProperty("reason");
  expect(
    (
      await mcpCall(f.issued.bearer, "obter_proposta_conhecimento", {
        ...reference,
        includeContent: true,
      })
    ).isError,
  ).toBe(true);
  const other = await admin.createPersona(session, {
    name: "Outra persona",
    specialty: "Teste",
    instructions: "Fixture isolada",
  });
  await expect(
    db.query(
      `INSERT INTO knowledge_proposal_v2(id,catalog_id,pattern_id,base_publication_id,base_hash,owner_id,origin,persona_id,token_id,source_id,skill_id,summary,change,hash,created_at)
    SELECT $1,catalog_id,pattern_id,base_publication_id,base_hash,owner_id,origin,$2,token_id,source_id,skill_id,summary,change,hash,created_at FROM knowledge_proposal_v2 WHERE id=$3`,
      [randomUUID(), other.id, proposal.value.proposalId],
    ),
  ).rejects.toMatchObject({ code: "23503" });
  expect(
    (
      await mcpCall(issued.bearer, "obter_proposta_conhecimento", {
        skillId: draft.id,
        proposalId: proposal.value.proposalId,
      })
    ).isError,
  ).toBe(false);
  expect(
    (
      await mcpCall(f.issued.bearer, "obter_proposta_conhecimento", {
        skillId: draft.id,
        proposalId: proposal.value.proposalId,
      })
    ).isError,
  ).toBe(true);
  const knowledge = new PersonaKnowledgeTraining(
    services,
    administrative,
    new PersonaConsumerCatalog(services),
  );
  for (let n = 0; n < 20; n++)
    await knowledge.propose(actor, { ...input, summary: `Proposta sintética ${n}` });
  const ownPage = await mcpCall(issued.bearer, "listar_minhas_propostas_conhecimento", {
    skillId: draft.id,
  });
  expect(ownPage.isError).toBe(false);
  expect(ownPage.value.proposals).toHaveLength(20);
  expect(ownPage.value.nextCursor).toBeTruthy();
  expect(ownPage.value.proposals[0]).not.toHaveProperty("change");
  expect(ownPage.value.proposals[0]).not.toHaveProperty("summary");
  const lastPage = await knowledge.listOwn(actor, {
    skillId: draft.id,
    before: ownPage.value.nextCursor,
  });
  expect(lastPage.proposals).toHaveLength(1);
  expect(lastPage.nextCursor).toBeNull();
  expect(
    new Set([...ownPage.value.proposals, ...lastPage.proposals].map((p) => p.proposalId)).size,
  ).toBe(21);
  await expect(
    knowledge.listOwn(actor, { skillId: draft.id, before: randomUUID() }),
  ).rejects.toThrow();
  const grantId = randomUUID();
  await db.query(
    "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,$4,'fixture',$5)",
    [
      grantId,
      identity.personaId,
      issued.tokenId,
      JSON.stringify({ ...permissions, administrative: [] }),
      new Date(now.getTime() + 100000),
    ],
  );
  await expect(knowledge.propose({ ...actor, grant: { id: grantId } }, input)).rejects.toThrow();
  const fullGrantId = randomUUID();
  await db.query(
    "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,$4,'fixture',$5)",
    [
      fullGrantId,
      identity.personaId,
      issued.tokenId,
      JSON.stringify(permissions),
      new Date(now.getTime() + 100000),
    ],
  );
  const oauthActor = { ...actor, grant: { id: fullGrantId } };
  await expect(
    knowledge.get(oauthActor, draft.id, proposal.value.proposalId, true),
  ).rejects.toThrow();
  const oauthProposal = await knowledge.propose(oauthActor, input);
  expect(
    (await knowledge.listOwn(oauthActor, { skillId: draft.id })).proposals.map((p) => p.proposalId),
  ).toEqual([oauthProposal.proposalId]);
  await expect(
    knowledge.listOwn(oauthActor, { skillId: draft.id, before: ownPage.value.nextCursor }),
  ).rejects.toThrow();
  await expect(
    knowledge.listOwn(actor, { skillId: draft.id, before: oauthProposal.proposalId }),
  ).rejects.toThrow();
  expect(
    (await knowledge.get(oauthActor, draft.id, oauthProposal.proposalId, true)).submitted?.summary,
  ).toBe(input.summary);
  await expect(knowledge.get(actor, draft.id, oauthProposal.proposalId, true)).rejects.toThrow();
  remoteRevoked = true;
  expect((await mcpCall(issued.bearer, "propor_conhecimento", input)).isError).toBe(true);
  expect(
    (await mcpCall(issued.bearer, "listar_minhas_propostas_conhecimento", { skillId: draft.id }))
      .isError,
  ).toBe(true);
  expect(
    (
      await mcpCall(issued.bearer, "obter_proposta_conhecimento", {
        ...reference,
        includeContent: true,
      })
    ).isError,
  ).toBe(true);
  remoteRevoked = false;
  await expect(
    shared.setMember(session, c.id, {
      expectedVersion: 1,
      hubClientId: "owner-fixture",
      role: "reader",
    }),
  ).rejects.toThrow();
  await shared.suspend(session, c.id, pub.id);
  expect((await mcpCall(issued.bearer, "obter_padrao", { skillId: draft.id })).isError).toBe(true);
  expect((await mcpCall(issued.bearer, "propor_conhecimento", input)).isError).toBe(true);
});
it("requires explicit hub ceilings, without expanding old delegations", async () => {
  const f = await administrator(ADMINISTRATIVE_PERMISSIONS);
  expect((await delegation.status(session, identity.personaId)).administrative).toEqual(
    [...ADMINISTRATIVE_PERMISSIONS].sort(),
  );
  expect(await administrative.available(f.actor)).toContain("gerenciar_integracoes");
  await delegation.create(session, identity.personaId, 2);
  expect(await administrative.available(f.actor)).toEqual(["gerenciar_fontes"]);
  await expect(catalog.create(f.actor, identity.personaId, f.draft)).rejects.toThrow();
  remoteAdministrative = ["treinar"];
  await expect(delegation.verify(f.actor)).rejects.toThrow();
});
it("reads query cases through delegated MCP/HTTP without running or approving them", async () => {
  const f = await administrator(["treinar"]);
  const draft = await catalog.create(f.actor, identity.personaId, f.draft);
  await catalog.addCase(f.actor, identity.personaId, draft.id, {
    required: true,
    content: { name: "Consulta sintética", input: { parameters: {} }, expected: { rows: [] } },
  });
  const args = { skillId: draft.id, kind: "consulta" };
  const result = await mcpCall(f.issued.bearer, "obter_testes_skill", args);
  expect(result.isError).toBe(false);
  expect(result.value).toMatchObject({ revision: 2, reports: [], requiredApproved: false });
  expect(result.value.cases).toHaveLength(1);
  const http = (query: object) =>
    request(runtime.app)
      .get(`/api/consumer/bearer/administration/skills/${draft.id}/testes`)
      .set("Host", "mcp.fixture.test")
      .set("Origin", origin)
      .set("Authorization", `Bearer ${f.issued.bearer}`)
      .query(query);
  expect((await http({ kind: "consulta" })).status).toBe(200);
  expect((await http({ kind: "consulta", after: "invalid" })).status).toBe(400);
  expect((await http({ kind: "operacao_sql" })).status).toBe(409);
  const hiddenSource = await admin.addSource(session, {
    ...sourceInput,
    dialect: "mssql",
    personaId: identity.personaId,
  });
  const hidden = await catalog.create(session, identity.personaId, {
    ...f.draft,
    slug: "hidden-query",
    training: { ...f.draft.training, sourceId: hiddenSource.id },
  });
  expect(
    (await mcpCall(f.issued.bearer, "obter_testes_skill", { ...args, skillId: hidden.id })).isError,
  ).toBe(true);
  await expect(catalog.queryTests(f.actor, randomUUID(), draft.id)).rejects.toThrow();
  const grantId = randomUUID();
  await db.query(
    "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,$4,'fixture',$5)",
    [
      grantId,
      identity.personaId,
      f.actor.tokenId,
      JSON.stringify({ ...f.grants, sourceIds: [] }),
      new Date(now.getTime() + 100000),
    ],
  );
  await expect(
    catalog.queryTests({ ...f.actor, grant: { id: grantId } }, identity.personaId, draft.id),
  ).rejects.toThrow();
  remoteRevoked = true;
  expect((await mcpCall(f.issued.bearer, "obter_testes_skill", args)).isError).toBe(true);
  expect(
    (
      await db.query("SELECT count(*)::int n FROM relatorio_teste_v2 WHERE persona_id=$1", [
        identity.personaId,
      ])
    ).rows[0].n,
  ).toBe(0);
});

it("edits declarative query cases with CAS, removal and no execution authority", async () => {
  const f = await administrator(["treinar"]);
  const draft = await catalog.create(f.actor, identity.personaId, f.draft);
  const content = {
    name: "Empty query fixture",
    input: { params: {}, fixtures: [{ table: "orders", generated: [], rows: [] }] },
    expected: { columns: [{ name: "id", type: "integer" }], rows: [], ordered: true },
  };
  const input = { expectedRevision: 1, required: true, content };
  const args = { ...input, skillId: draft.id, kind: "consulta" };
  expect(await mcpCall(f.issued.bearer, "editar_caso_skill", args)).toMatchObject({
    isError: false,
    value: { revision: 2 },
  });
  expect((await mcpCall(f.issued.bearer, "editar_caso_skill", args)).isError).toBe(true);
  const details = await catalog.queryTests(f.actor, identity.personaId, draft.id);
  const id = details.cases[0]!.id;
  const http = (body: object) =>
    request(runtime.app)
      .post(`/api/consumer/bearer/administration/skills/${draft.id}/testes`)
      .set("Host", "mcp.fixture.test")
      .set("Origin", origin)
      .set("Authorization", `Bearer ${f.issued.bearer}`)
      .send({ kind: "consulta", ...body });
  expect(
    (
      await http({
        ...input,
        expectedRevision: 2,
        id,
        content: { ...content, name: "Revised fixture" },
      })
    ).status,
  ).toBe(200);
  const current = await catalog.queryTests(f.actor, identity.personaId, draft.id);
  expect(current).toMatchObject({ revision: 3, reports: [], requiredApproved: false });
  expect(current.cases[0]!.content).toMatchObject({ name: "Revised fixture" });
  const conflict = await Promise.all([
    http({ ...input, id, expectedRevision: 3 }),
    http({ ...input, id, expectedRevision: 3 }),
  ]);
  expect(conflict.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    (
      await http({
        ...input,
        expectedRevision: 4,
        content: { name: "Invalid", input: {}, expected: {} },
      })
    ).status,
  ).toBe(400);
  expect(
    (await http({ ...input, expectedRevision: 4, id: randomUUID() })).status,
  ).toBeGreaterThanOrEqual(400);
  expect((await catalog.queryTests(f.actor, identity.personaId, draft.id)).revision).toBe(4);
  expect((await http({ ...input, expectedRevision: 4, id, remove: true })).status).toBe(200);
  expect(await catalog.queryTests(f.actor, identity.personaId, draft.id)).toMatchObject({
    revision: 5,
    cases: [],
    reports: [],
    requiredApproved: false,
  });
  await expect(
    catalog.editQueryCase(f.actor, randomUUID(), draft.id, { ...input, expectedRevision: 5 }),
  ).rejects.toThrow();
  remoteRevoked = true;
  expect(
    (await mcpCall(f.issued.bearer, "editar_caso_skill", { ...args, expectedRevision: 5 })).isError,
  ).toBe(true);
  expect(
    (await db.query("SELECT publicacao_ativa_id FROM skill_v2 WHERE id=$1", [draft.id])).rows[0]
      .publicacao_ativa_id,
  ).toBeNull();
});

it("paginates query reports and marks them stale after training changes", async () => {
  const f = await administrator(["treinar"]);
  const draft = await catalog.create(f.actor, identity.personaId, f.draft);
  const details = await catalog.queryTests(f.actor, identity.personaId, draft.id);
  expect(details.packageHash).not.toBeNull();
  // Metadata-only fixture reports are deliberately failed; no SQL evidence is fabricated.
  await db.query(
    `INSERT INTO relatorio_teste_v2(id,persona_id,skill_id,revisao,pacote_hash,casos_hash,runner_id,aprovado,resultados)
     SELECT gen_random_uuid(),$1,$2,$3,$4,$5,'persona-query-fixtures-v1',false,'[]'::jsonb FROM generate_series(1,21)`,
    [identity.personaId, draft.id, details.revision, details.packageHash, details.casesHash],
  );
  const first = await catalog.queryTests(f.actor, identity.personaId, draft.id);
  expect(first.reports).toHaveLength(20);
  expect(first.reports.every((r) => r.current && !r.approved)).toBe(true);
  expect(first.requiredApproved).toBe(false);
  const next = await catalog.queryTests(f.actor, identity.personaId, draft.id, first.nextCursor!);
  expect(next.reports).toHaveLength(1);
  expect(next.nextCursor).toBeNull();
  expect(new Set([...first.reports, ...next.reports].map((r) => r.id)).size).toBe(21);
  await catalog.addCase(f.actor, identity.personaId, draft.id, {
    required: true,
    content: { name: "New case", input: {}, expected: {} },
  });
  const changed = await catalog.queryTests(f.actor, identity.personaId, draft.id);
  expect(changed.reports.every((r) => !r.current)).toBe(true);
  expect(changed.requiredApproved).toBe(false);
});

it("reads and edits SQL cases through delegated MCP/HTTP with CAS and live revocation", async () => {
  const f = await administrator(["treinar"]);
  const draft = await catalog.create(f.actor, identity.personaId, {
    slug: "delegated-operation",
    name: "Operation fixture",
    kind: "operacao_sql",
    training: { ...operationTraining(f.source.id), dialect: "mssql" },
  });
  const args = { skillId: draft.id, kind: "operacao_sql" };
  const content = {
    name: "Empty fixture",
    input: { parameters: operationInput, fixtures: [{ table: "orders", generated: [], rows: [] }] },
    expected: { error: "ROW_CONDITION_FAILED" },
  };
  const read = await mcpCall(f.issued.bearer, "obter_testes_skill", args);
  expect(read.isError).toBe(false);
  expect(read.value).toMatchObject({
    revision: 1,
    cases: [],
    reports: [],
    requiredApproved: false,
  });
  const edited = await mcpCall(f.issued.bearer, "editar_caso_skill", {
    ...args,
    expectedRevision: 1,
    required: true,
    content,
  });
  expect(edited).toMatchObject({ isError: false, value: { revision: 2 } });
  expect(
    (
      await mcpCall(f.issued.bearer, "editar_caso_skill", {
        ...args,
        expectedRevision: 1,
        required: true,
        content,
      })
    ).isError,
  ).toBe(true);
  const path = `/api/consumer/bearer/administration/skills/${draft.id}/testes`;
  const response = await request(runtime.app)
    .get(path)
    .query({ kind: "operacao_sql" })
    .set("Host", "mcp.fixture.test")
    .set("Origin", origin)
    .set("Authorization", `Bearer ${f.issued.bearer}`);
  expect(response.status).toBe(200);
  expect(response.body.cases).toHaveLength(1);
  expect(response.body.requiredApproved).toBe(false);
  const removed = await request(runtime.app)
    .post(path)
    .set("Host", "mcp.fixture.test")
    .set("Origin", origin)
    .set("Authorization", `Bearer ${f.issued.bearer}`)
    .send({
      kind: "operacao_sql",
      expectedRevision: 2,
      id: response.body.cases[0].id,
      remove: true,
      required: true,
      content,
    });
  expect(removed.status).toBe(200);
  expect(removed.body.revision).toBe(3);
  const hiddenSource = await admin.addSource(session, {
    ...sourceInput,
    dialect: "mssql",
    personaId: identity.personaId,
  });
  const hidden = await catalog.create(session, identity.personaId, {
    slug: "hidden-operation",
    name: "Hidden fixture",
    kind: "operacao_sql",
    training: { ...operationTraining(hiddenSource.id), dialect: "mssql" },
  });
  expect(
    (await mcpCall(f.issued.bearer, "obter_testes_skill", { ...args, skillId: hidden.id })).isError,
  ).toBe(true);
  expect(
    (
      await mcpCall(f.issued.bearer, "editar_caso_skill", {
        ...args,
        skillId: hidden.id,
        expectedRevision: 1,
        required: true,
        content,
      })
    ).isError,
  ).toBe(true);
  expect(
    (await mcpCall(f.issued.bearer, "obter_testes_skill", { ...args, kind: "cruzamento" })).isError,
  ).toBe(true);
  expect(
    (await mcpCall(f.issued.bearer, "obter_testes_skill", { ...args, skillId: randomUUID() }))
      .isError,
  ).toBe(true);
  remoteRevoked = true;
  expect((await mcpCall(f.issued.bearer, "obter_testes_skill", args)).isError).toBe(true);
  expect(
    (
      await mcpCall(f.issued.bearer, "editar_caso_skill", {
        ...args,
        expectedRevision: 3,
        required: true,
        content,
      })
    ).isError,
  ).toBe(true);
  expect(
    (
      await db.query("SELECT count(*)::int n FROM relatorio_teste_v2 WHERE persona_id=$1", [
        identity.personaId,
      ])
    ).rows[0].n,
  ).toBe(0);
});

it("delegated federation cases intersect real OAuth consent and revoke the connection", async () => {
  const f = await administrator(["treinar"]);
  const second = await admin.addSource(session, {
    ...sourceInput,
    dialect: "mssql",
    personaId: identity.personaId,
  });
  const references: { id: string; publicationId: string }[] = [];
  const skills: Permissions["skills"][number][] = [];
  for (const source of [f.source, second]) {
    const query = await catalog.create(session, identity.personaId, {
      ...f.draft,
      slug: `query-${references.length}`,
      training: { ...f.draft.training, sourceId: source.id },
    });
    await catalog.setReviewDeadline(session, identity.personaId, query.id, {
      dueAt: reviewDateFixture(),
    });
    const preview = await catalog.preview(session, identity.personaId, query.id);
    const published = await catalog.publish(
      session,
      identity.personaId,
      query.id,
      preview.confirmationHash,
    );
    references.push({ id: source.id, publicationId: published.id });
    skills.push({
      skillId: query.id,
      capabilities: published.package.requiredCapabilities,
      effects: ["select"],
      requireHumanApproval: false,
    });
  }
  const permissions: Permissions = { ...f.grants, sourceIds: references.map((s) => s.id), skills };
  const issued = await admin.issueToken(session, {
    personaId: identity.personaId,
    name: "Federation training",
    permissions,
    delegation: emptyPermissions,
    expiresAt: new Date(now.getTime() + 86400000),
  });
  const actor = { ...f.actor, tokenId: issued.tokenId };
  const draft = await catalog.create(actor, identity.personaId, {
    slug: "federation-cases",
    name: "Federation fixture",
    kind: "cruzamento",
    training: federationTraining(references),
  });
  const client = "https://client.fixture.test/client.json",
    redirect = "https://client.fixture.test/callback";
  const hash = (s: string) => createHash("sha256").update(s).digest("base64url");
  const oauth = new PersonaOAuth(
    new PostgresPersonaOAuthStore(db, crypto),
    repository,
    crypto,
    { validate: async () => Promise.resolve() },
    { issuer: origin, resource: `${origin}/mcp/chatgpt`, clients: { [client]: [redirect] } },
    hash,
    () => now.getTime(),
    async (i) => {
      await delegation.verify(i);
      return ["treinar"];
    },
  );
  const connect = async (
    administrative: readonly AdministrativePermission[],
    sources = permissions.sourceIds,
    selectedSkills = skills.map((s) => s.skillId),
  ) => {
    const verifier = "z".repeat(43);
    const start = await oauth.begin({
      client_id: client,
      redirect_uri: redirect,
      response_type: "code",
      scope: "se7e:persona",
      resource: `${origin}/mcp/chatgpt`,
      code_challenge_method: "S256",
      code_challenge: hash(verifier),
    });
    const review = await oauth.authenticate(start.id, start.nonce, start.csrf, issued.bearer);
    const location = await oauth.consent(start.id, start.nonce, review.csrf, {
      sources,
      skills: selectedSkills,
      external: [],
      administrative,
    });
    return oauth.token({
      client_id: client,
      redirect_uri: redirect,
      grant_type: "authorization_code",
      resource: `${origin}/mcp/chatgpt`,
      code: new URL(location).searchParams.get("code")!,
      code_verifier: verifier,
    });
  };
  const oauthRuntime = await composePersonaV2(
    testConfig({
      DATABASE_URL: url.toString(),
      PUBLIC_BASE_URL: origin,
      MCP_ENCRYPTION_KEY: "03".repeat(32),
      PERSONA_V2_OAUTH_ENABLED: true,
      PERSONA_V2_OAUTH_CLIENTS: { [client]: [redirect] },
    }),
    { ownerAuth, sourceVerifier, delegationHub: hub },
  );
  try {
    const allowed = await connect(["treinar"]),
      limited = await connect([]);
    const narrowed = await connect(["treinar"], [f.source.id], [skills[0]!.skillId]);
    const path = `/api/consumer/oauth/administration/skills/${draft.id}/testes`;
    const get = (access: string) =>
      request(oauthRuntime.app)
        .get(path)
        .query({ kind: "cruzamento" })
        .set("Host", "mcp.fixture.test")
        .set("Origin", origin)
        .set("Authorization", `Bearer ${access}`);
    expect((await get(limited.access_token)).status).toBe(403);
    expect((await get(narrowed.access_token)).status).toBe(403);
    expect((await get(allowed.access_token)).body).toMatchObject({
      cases: [],
      requiredApproved: false,
    });
    const call = async (name: string, args: object) => {
      const response = await request(oauthRuntime.app)
        .post("/mcp/chatgpt")
        .set("Host", "mcp.fixture.test")
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", `Bearer ${allowed.access_token}`)
        .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
      const result = parseMcpPayload(response).result as {
        isError?: boolean;
        content: { text: string }[];
      };
      expect(result.isError).not.toBe(true);
      return JSON.parse(result.content[0]!.text);
    };
    const scope = { skillId: draft.id, kind: "cruzamento" };
    expect(
      await call("editar_caso_skill", {
        ...scope,
        expectedRevision: 1,
        required: true,
        content: federationCase(references),
      }),
    ).toEqual({ revision: 2 });
    const details = await call("obter_testes_skill", scope);
    expect(details.cases).toHaveLength(1);
    expect(details.reports).toEqual([]);
    expect(details.requiredApproved).toBe(false);
    const edit = (access: string, expectedRevision: number) =>
      request(oauthRuntime.app)
        .post(path)
        .set("Host", "mcp.fixture.test")
        .set("Origin", origin)
        .set("Authorization", `Bearer ${access}`)
        .send({
          kind: "cruzamento",
          expectedRevision,
          required: true,
          content: federationCase(references),
        });
    expect((await edit(limited.access_token, 2)).status).toBe(403);
    expect((await edit(narrowed.access_token, 2)).status).toBe(403);
    expect((await edit(allowed.access_token, 1)).status).toBe(409);
    const resolved = await oauth.resolve(allowed.access_token);
    await db.query("UPDATE oauth_concessao_v2 SET revoked_at=$2 WHERE id=$1", [
      resolved.grant!.id,
      now,
    ]);
    expect((await get(allowed.access_token)).status).not.toBe(200);
    expect((await mcpCall(issued.bearer, "obter_testes_skill", scope)).isError).toBe(false);
  } finally {
    await oauthRuntime.close();
  }
});

it("trains and publishes without expanding execution grants or substituting human approval", async () => {
  const f = await administrator();
  const draft = await catalog.create(f.actor, identity.personaId, f.draft);
  await catalog.setReviewDeadline(session, identity.personaId, draft.id, {
    dueAt: reviewDateFixture(),
  });
  const preview = await catalog.preview(f.actor, identity.personaId, draft.id);
  await expect(
    catalog.publish(session, identity.personaId, draft.id, preview.confirmationHash),
  ).rejects.toThrow();
  const publication = await catalog.publish(
    f.actor,
    identity.personaId,
    draft.id,
    preview.confirmationHash,
  );
  expect(publication.package.name).toBe("Pedidos");
  expect((await repository.authorization(f.actor))?.token.permissions.skills).toEqual([]);
  const events = await db.query(
    "SELECT actor_token_id,actor_grant_id,evento FROM audit_v2 WHERE persona_id=$1 AND skill_id=$2",
    [identity.personaId, draft.id],
  );
  expect(
    events.rows
      .filter((r) => r.evento !== "publicacao_prazo_definido")
      .every((r) => r.actor_token_id === f.actor.tokenId && r.actor_grant_id === null),
  ).toBe(true);
  expect(events.rows.filter((r) => r.evento === "publicacao_prazo_definido")).toEqual([
    expect.objectContaining({ actor_token_id: null, actor_grant_id: null }),
  ]);
  expect(JSON.stringify(events.rows)).not.toContain(f.draft.training.sqlModel);
  expect(
    (await maintenance.history(session, identity.personaId, {})).items
      .filter((e) => e.resourceId === draft.id && e.event !== "publicacao_prazo_definido")
      .every((e) => e.actor.id === f.actor.tokenId),
  ).toBe(true);
  await expect(
    catalog.publish(f.actor, identity.personaId, draft.id, preview.confirmationHash),
  ).rejects.toThrow();
});
it("separates training from publishing and hides drafts in ungranted sources", async () => {
  const f = await administrator(["treinar"]);
  const draft = await catalog.create(f.actor, identity.personaId, f.draft);
  await catalog.setReviewDeadline(session, identity.personaId, draft.id, {
    dueAt: reviewDateFixture(),
  });
  await expect(catalog.preview(f.actor, identity.personaId, draft.id)).rejects.toThrow();
  const other = await admin.addSource(session, {
    ...sourceInput,
    dialect: "mssql",
    personaId: identity.personaId,
  });
  const hidden = await catalog.create(session, identity.personaId, {
    ...f.draft,
    slug: "privada",
    training: { ...f.draft.training, sourceId: other.id },
  });
  expect((await catalog.list(f.actor, identity.personaId)).map((d) => d.id)).toEqual([draft.id]);
  await expect(
    catalog.update(f.actor, identity.personaId, hidden.id, {
      name: "Tentativa",
      expectedRevision: 1,
      training: hidden.training,
    }),
  ).rejects.toThrow();
  await expect(catalog.create(f.actor, randomUUID(), f.draft)).rejects.toThrow();
});
it("rejects stale previews after renewal, token changes and OAuth actor changes", async () => {
  const f = await administrator();
  const draft = await catalog.create(f.actor, identity.personaId, f.draft);
  await catalog.setReviewDeadline(session, identity.personaId, draft.id, {
    dueAt: reviewDateFixture(),
  });
  const preview = await catalog.preview(f.actor, identity.personaId, draft.id);
  await delegation.create(session, identity.personaId, 2, f.grants.administrative);
  await expect(
    catalog.publish(f.actor, identity.personaId, draft.id, preview.confirmationHash),
  ).rejects.toThrow();
  const fresh = await catalog.preview(f.actor, identity.personaId, draft.id);
  const grantId = randomUUID();
  await db.query(
    "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,$4,'fixture',$5)",
    [
      grantId,
      identity.personaId,
      f.actor.tokenId,
      JSON.stringify(f.grants),
      new Date(now.getTime() + 100000),
    ],
  );
  await expect(
    catalog.publish(
      { ...f.actor, grant: { id: grantId } },
      identity.personaId,
      draft.id,
      fresh.confirmationHash,
    ),
  ).rejects.toThrow();
  await admin.changeToken(session, {
    personaId: identity.personaId,
    tokenId: f.actor.tokenId,
    expectedVersion: 1,
    name: "Alterado",
    permissions: f.grants,
    delegation: f.grants,
    expiresAt: new Date(now.getTime() + 100000),
  });
  await expect(
    catalog.publish(f.actor, identity.personaId, draft.id, fresh.confirmationHash),
  ).rejects.toThrow();
});
it("rolls back writes and metadata when the token expires before commit", async () => {
  const f = await administrator();
  await expect(
    administrative.run(f.actor, identity.personaId, "treinar", async (tx) => {
      await tx.catalog.create({
        ...f.draft,
        kind: "consulta",
        id: randomUUID(),
        personaId: identity.personaId,
        revision: 1,
        activePublicationId: null,
      });
      now = new Date(now.getTime() + 86400000);
    }),
  ).rejects.toThrow();
  session = (await admin.login(ownerInput.email, ownerInput.password)).sessionId;
  expect(await catalog.list(session, identity.personaId)).toHaveLength(0);
  expect(
    (
      await db.query("SELECT id FROM audit_v2 WHERE persona_id=$1 AND actor_token_id=$2", [
        identity.personaId,
        f.actor.tokenId,
      ])
    ).rowCount,
  ).toBe(0);
});
it("fails closed when hub authority is unavailable, without retry or mutation", async () => {
  const f = await administrator();
  remoteUnavailable = true;
  const calls = vi.mocked(hub.verify).mock.calls.length;
  await expect(catalog.create(f.actor, identity.personaId, f.draft)).rejects.toThrow();
  expect(vi.mocked(hub.verify).mock.calls.length).toBe(calls + 1);
  expect(await catalog.list(session, identity.personaId)).toHaveLength(0);
});
it("enforces token ceilings, CAS, self-administration refusal and delegated expiry", async () => {
  const f = await administrator();
  const child = await admin.issueToken(session, {
    personaId: identity.personaId,
    name: "Filho",
    permissions: { ...emptyPermissions, sourceIds: [f.source.id] },
    delegation: emptyPermissions,
    expiresAt: new Date(now.getTime() + 100000),
  });
  const wider = await admin.issueToken(session, {
    personaId: identity.personaId,
    name: "Superior",
    permissions: { ...emptyPermissions, administrative: ["gerenciar_integracoes"] },
    delegation: emptyPermissions,
    expiresAt: null,
  });
  const edit = {
    tokenId: child.tokenId,
    expectedVersion: 1,
    name: "Filho editado",
    permissions: emptyPermissions,
    delegation: emptyPermissions,
    expiresAt: new Date(now.getTime() + 50000).toISOString(),
  };
  expect((await tokensAdministration.list(f.actor)).map((t) => t.id)).toContain(child.tokenId);
  expect((await tokensAdministration.list(f.actor)).map((t) => t.id)).not.toContain(wider.tokenId);
  await expect(
    tokensAdministration.edit(f.actor, { ...edit, tokenId: f.actor.tokenId }),
  ).rejects.toThrow();
  await expect(tokensAdministration.edit(f.actor, { ...edit, expiresAt: null })).rejects.toThrow();
  await expect(
    tokensAdministration.edit(f.actor, {
      ...edit,
      permissions: { ...emptyPermissions, administrative: ["gerenciar_integracoes"] },
    }),
  ).rejects.toThrow();
  await expect(
    tokensAdministration.revoke(f.actor, { tokenId: wider.tokenId, expectedVersion: 1 }),
  ).rejects.toThrow();
  expect((await tokensAdministration.edit(f.actor, edit)).version).toBe(2);
  await expect(
    tokensAdministration.revoke(f.actor, { tokenId: child.tokenId, expectedVersion: 1 }),
  ).rejects.toThrow();
  expect(
    await tokensAdministration.revoke(f.actor, { tokenId: child.tokenId, expectedVersion: 2 }),
  ).toEqual({ tokenId: child.tokenId, revoked: true });
});
it("intersects OAuth consent and filters discovery; calls after revocation cannot bypass authorization", async () => {
  const f = await administrator();
  const grantId = randomUUID();
  await db.query(
    "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,$4,'fixture',$5)",
    [
      grantId,
      identity.personaId,
      f.actor.tokenId,
      JSON.stringify({ ...f.grants, administrative: ["treinar"] }),
      new Date(now.getTime() + 100000),
    ],
  );
  const actor = { ...f.actor, grant: { id: grantId } };
  const draft = await catalog.create(actor, identity.personaId, f.draft);
  await catalog.setReviewDeadline(session, identity.personaId, draft.id, {
    dueAt: reviewDateFixture(),
  });
  await expect(catalog.preview(actor, identity.personaId, draft.id)).rejects.toThrow();
  await expect(tokensAdministration.list(actor)).rejects.toThrow();
  const call = (method: string, params: unknown) =>
    request(runtime.app)
      .post("/mcp")
      .set("Host", "mcp.fixture.test")
      .set("Authorization", `Bearer ${f.issued.bearer}`)
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method, params });
  const tools = await call("tools/list", {});
  const payload = parseMcpPayload(tools);
  expect(payload).toHaveProperty("result");
  const names = (payload.result as { tools: { name: string }[] }).tools.map((t) => t.name);
  expect(names).toContain("criar_rascunho_skill");
  expect(names).toContain("obter_testes_skill");
  expect(names).toContain("editar_caso_skill");
  expect(names).not.toContain("aprovar_operacao");
  const route = await request(runtime.app)
    .get("/api/consumer/bearer/administration/skills")
    .set("Host", "mcp.fixture.test")
    .set("Origin", origin)
    .set("Authorization", `Bearer ${f.issued.bearer}`);
  expect(route.status).toBe(200);
  remoteRevoked = true;
  const denied = await call("tools/call", {
    name: "criar_rascunho_skill",
    arguments: { ...f.draft, slug: "negada" },
  });
  const rejected = parseMcpPayload(denied);
  expect((rejected.result as { isError?: boolean } | undefined)?.isError ?? !!rejected.error).toBe(
    true,
  );
});
it("imports exact editorial versions through delegated MCP and HTTP without inheriting authority", async () => {
  const f = await administrator(["treinar"]);
  const knowledge = new SharedKnowledge(services, admin, new PostgresSharedKnowledgeRepository(db));
  const c = await knowledge.create(session, { name: "Biblioteca isolada" });
  const content = { ...structureContent(), examples: [...structureContent().examples] };
  content.examples.push({
    ...structuredClone(content.examples[0]!),
    id: "orders-second",
    purpose: "Segundo exemplo",
  });
  const material = await knowledge.library.save(session, c.id, {
    slug: "template-delegado",
    name: "Material editorial",
    expectedVersion: 0,
    payload: { kind: "template", content },
  });
  const dataset = await knowledge.library.save(session, c.id, {
    slug: "dataset-delegado",
    name: "Material sintético",
    expectedVersion: 0,
    payload: {
      kind: "dataset",
      templateId: material.id,
      templateVersion: 1,
      templateHash: material.hash,
      provenance: { kind: "synthetic", description: "Fixture" },
      tables: [{ tableId: "orders", columns: [{ name: "id", type: "integer" }], rows: [[1]] }],
    },
  });
  const input = {
    catalogId: c.id,
    templateId: material.id,
    templateVersion: 1,
    templateHash: material.hash,
    sourceId: f.source.id,
    sourceVersion: f.source.authorizationVersion,
    dialect: "mssql",
    exampleId: "orders-after-id",
    additionalExampleIds: ["orders-second"],
    slug: "importado-mcp",
    name: "Novo rascunho",
    dataset: { id: dataset.id, version: 1, hash: dataset.hash },
  };
  const call = async (method: string, params: unknown) =>
    parseMcpPayload(
      await request(runtime.app)
        .post("/mcp")
        .set("Host", "mcp.fixture.test")
        .set("Authorization", `Bearer ${f.issued.bearer}`)
        .set("Accept", "application/json, text/event-stream")
        .send({ jsonrpc: "2.0", id: 1, method, params }),
    );
  const discovery = await call("tools/list", {});
  const names = (discovery.result as { tools: { name: string }[] }).tools.map((t) => t.name);
  expect(names).toContain("criar_rascunho_de_template");
  expect(names).toContain("obter_template_treinamento");
  expect(names).not.toContain("listar_biblioteca");
  const readInput = {
    catalogId: c.id,
    templateId: material.id,
    templateVersion: 1,
    templateHash: material.hash,
    sourceId: f.source.id,
    sourceVersion: f.source.authorizationVersion,
    dialect: "mssql",
  };
  const read = await call("tools/call", {
    name: "obter_template_treinamento",
    arguments: readInput,
  });
  const readResponse = read.result as { content: { text: string }[]; isError?: boolean };
  expect(readResponse.isError).not.toBe(true);
  const editorial = JSON.parse(readResponse.content[0]!.text) as Awaited<
    ReturnType<PersonaCatalog["readTemplate"]>
  >;
  expect(editorial).toMatchObject({
    templateId: material.id,
    version: 1,
    hash: material.hash,
    executable: false,
  });
  expect(editorial.content.examples).toHaveLength(2);
  expect(JSON.stringify(editorial)).not.toMatch(/payloadEnc|"rows"/);
  expect(
    editorial.content.examples.every((e: { variants: { dialect: string }[] }) =>
      e.variants.every((v) => v.dialect === "mssql"),
    ),
  ).toBe(true);
  const readHttp = (body: object) =>
    request(runtime.app)
      .post("/api/consumer/bearer/administration/templates/ler")
      .set("Host", "mcp.fixture.test")
      .set("Origin", origin)
      .set("Authorization", `Bearer ${f.issued.bearer}`)
      .send(body);
  expect((await readHttp(readInput)).status).toBe(200);
  await expect(catalog.readTemplate(f.actor, randomUUID(), readInput)).rejects.toThrow();
  for (const changed of [
    { templateHash: "f".repeat(64) },
    { sourceVersion: 2 },
    { sourceId: randomUUID() },
    { dialect: "postgres" },
    { templateId: dataset.id, templateHash: dataset.hash },
    { catalogId: randomUUID() },
    { templateVersion: 2 },
  ])
    expect((await readHttp({ ...readInput, ...changed })).status).toBeGreaterThanOrEqual(400);
  const result = await call("tools/call", { name: "criar_rascunho_de_template", arguments: input });
  expect(result.error).toBeUndefined();
  const response = result.result as { content: { text: string }[]; isError?: boolean };
  expect(response.isError, JSON.stringify(response)).not.toBe(true);
  const draft = JSON.parse(response.content[0]!.text) as {
    id: string;
    activePublicationId: string | null;
    training: unknown;
  };
  expect(draft.activePublicationId).toBeNull();
  const training = queryTrainingSchema.parse(draft.training);
  expect(training.examples?.map((e) => [e.id, e.state])).toEqual([
    ["orders-after-id", "candidate"],
    ["orders-second", "candidate"],
  ]);
  expect(training.sharedKnowledge).toBeUndefined();
  expect(JSON.stringify(response)).not.toContain('"rows"');
  expect(await repository.authorization(f.actor)).toMatchObject({
    token: { permissions: f.grants },
  });
  expect(
    (await db.query("SELECT count(*)::int n FROM caso_teste_v2 WHERE skill_id=$1", [draft.id]))
      .rows[0].n,
  ).toBe(0);
  const seeds = await catalog.datasetCaseSeeds(session, identity.personaId, draft.id, {
    expectedRevision: 1,
  });
  const caseContent = {
    name: "Origem editorial explícita",
    editorialOrigin: seeds.origin,
    input: { params: { minimum: "0" }, fixtures: seeds.fixtures },
    expected: { columns: [{ name: "id", type: "integer" }], rows: [], ordered: true },
  };
  await expect(
    catalog.editQueryCase(f.actor, identity.personaId, draft.id, {
      expectedRevision: 1,
      required: true,
      content: caseContent,
    }),
  ).rejects.toThrow("console Client");
  await catalog.editQueryCase(session, identity.personaId, draft.id, {
    expectedRevision: 1,
    required: true,
    content: caseContent,
  });
  const testId = (await catalog.queryTests(f.actor, identity.personaId, draft.id)).cases[0]!.id;
  await expect(
    catalog.editQueryCase(f.actor, identity.personaId, draft.id, {
      id: testId,
      expectedRevision: 2,
      required: true,
      content: {
        ...caseContent,
        editorialOrigin: {
          ...seeds.origin,
          dataset: { ...seeds.origin.dataset, id: randomUUID() },
        },
      },
    }),
  ).rejects.toThrow("Trocar a origem");
  const editedContent = {
    name: caseContent.name,
    input: structuredClone(caseContent.input),
    expected: structuredClone(caseContent.expected),
  };
  editedContent.input.fixtures[0]!.rows[0]!.id = { type: "integer", value: "2" };
  await catalog.editQueryCase(f.actor, identity.personaId, draft.id, {
    id: testId,
    expectedRevision: 2,
    required: true,
    content: editedContent,
  });
  expect(
    (await catalog.queryTests(f.actor, identity.personaId, draft.id)).cases[0]!.content,
  ).toMatchObject({
    editorialOrigin: { ...seeds.origin, modified: true, caseSeedsHash: expect.any(String) },
  });
  const http = (body: object) =>
    request(runtime.app)
      .post("/api/consumer/bearer/administration/skills/template")
      .set("Host", "mcp.fixture.test")
      .set("Origin", origin)
      .set("Authorization", `Bearer ${f.issued.bearer}`)
      .send(body);
  expect((await http({ ...input, slug: "importado-http" })).status).toBe(201);
  await expect(
    catalog.createFromTemplate(f.actor, randomUUID(), { ...input, slug: "outra-persona" }),
  ).rejects.toThrow();
  const other = await admin.addSource(session, {
    ...sourceInput,
    dialect: "mssql",
    personaId: identity.personaId,
  });
  await expect(
    catalog.createFromTemplate(f.actor, identity.personaId, {
      ...input,
      slug: "outra-fonte",
      sourceId: other.id,
    }),
  ).rejects.toThrow("concessões");
  await expect(
    catalog.createFromTemplate(f.actor, identity.personaId, {
      ...input,
      slug: "hash-incorreto",
      templateHash: "f".repeat(64),
    }),
  ).rejects.toThrow();
  remoteUnavailable = true;
  expect((await readHttp(readInput)).status).toBe(503);
  expect((await http({ ...input, slug: "sem-autoridade" })).status).toBe(503);
  remoteUnavailable = false;
  remoteRevoked = true;
  // This fixture models upstream revocation as an unavailable authority response.
  await expect(
    catalog.editQueryCase(f.actor, identity.personaId, draft.id, {
      id: testId,
      expectedRevision: 3,
      required: true,
      content: editedContent,
    }),
  ).rejects.toThrow();
  expect((await readHttp(readInput)).status).toBe(503);
  const denied = await call("tools/call", {
    name: "criar_rascunho_de_template",
    arguments: { ...input, slug: "revogado" },
  });
  expect((denied.result as { isError?: boolean } | undefined)?.isError ?? !!denied.error).toBe(
    true,
  );
});

it("template import intersects OAuth consent, source grants and catalog membership", async () => {
  const f = await administrator(["treinar"]);
  const knowledge = new SharedKnowledge(services, admin, new PostgresSharedKnowledgeRepository(db));
  clientId = "curator-fixture";
  const otherSession = (await admin.login("curator@fixture.test", "fixture-password")).sessionId;
  const c = await knowledge.create(otherSession, { name: "Catálogo de outro responsável" });
  const material = await knowledge.library.save(otherSession, c.id, {
    slug: "material",
    name: "Template",
    expectedVersion: 0,
    payload: { kind: "template", content: structureContent() },
  });
  clientId = "owner-fixture";
  const input = {
    catalogId: c.id,
    templateId: material.id,
    templateVersion: 1,
    templateHash: material.hash,
    sourceId: f.source.id,
    sourceVersion: 1,
    dialect: "mssql",
    exampleId: "orders-after-id",
    slug: "oauth-template",
    name: "Template OAuth",
  };
  const readInput = {
    catalogId: c.id,
    templateId: material.id,
    templateVersion: 1,
    templateHash: material.hash,
    sourceId: f.source.id,
    sourceVersion: 1,
    dialect: "mssql",
  };
  await expect(catalog.readTemplate(f.actor, identity.personaId, readInput)).rejects.toThrow(
    "indisponível",
  );
  await expect(catalog.createFromTemplate(f.actor, identity.personaId, input)).rejects.toThrow(
    "indisponível",
  );
  clientId = "curator-fixture";
  await knowledge.setMember(otherSession, c.id, {
    expectedVersion: 1,
    hubClientId: "owner-fixture",
    role: "contributor",
  });
  clientId = "owner-fixture";
  const consent = async (permissions: Permissions) => {
    const grantId = randomUUID();
    await db.query(
      "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,$4,'fixture',$5)",
      [
        grantId,
        identity.personaId,
        f.actor.tokenId,
        JSON.stringify(permissions),
        new Date(now.getTime() + 100000),
      ],
    );
    return { ...f.actor, grant: { id: grantId } };
  };
  const noSource = await consent({ ...f.grants, sourceIds: [] });
  await expect(catalog.readTemplate(noSource, identity.personaId, readInput)).rejects.toThrow(
    "concessões",
  );
  await expect(catalog.createFromTemplate(noSource, identity.personaId, input)).rejects.toThrow(
    "concessões",
  );
  const actor = await consent(f.grants);
  expect(await catalog.readTemplate(actor, identity.personaId, readInput)).toMatchObject({
    executable: false,
    templateId: material.id,
  });
  expect(
    (await catalog.createFromTemplate(actor, identity.personaId, input)).activePublicationId,
  ).toBeNull();
  const noTraining = await consent({ ...f.grants, administrative: [] });
  await expect(catalog.readTemplate(noTraining, identity.personaId, readInput)).rejects.toThrow();
  await expect(
    catalog.createFromTemplate(noTraining, identity.personaId, {
      ...input,
      slug: "sem-consentimento",
    }),
  ).rejects.toThrow();
  await db.query("UPDATE oauth_concessao_v2 SET revoked_at=$2 WHERE id=$1", [actor.grant.id, now]);
  await expect(catalog.readTemplate(actor, identity.personaId, readInput)).rejects.toThrow();
  await expect(
    catalog.createFromTemplate(actor, identity.personaId, {
      ...input,
      slug: "consentimento-revogado",
    }),
  ).rejects.toThrow();
  clientId = "curator-fixture";
  await knowledge.setMember(otherSession, c.id, {
    expectedVersion: 2,
    hubClientId: "owner-fixture",
    role: null,
  });
  clientId = "owner-fixture";
  await expect(
    catalog.createFromTemplate(f.actor, identity.personaId, { ...input, slug: "sem-catalogo" }),
  ).rejects.toThrow("indisponível");
  await expect(catalog.readTemplate(f.actor, identity.personaId, readInput)).rejects.toThrow(
    "indisponível",
  );
});

it("stores only encrypted delegation and setup content, without password or JWT", async () => {
  const { code, csrf } = await link();
  const d = await db.query("SELECT * FROM responsavel_delegacao_v2 WHERE persona_id=$1", [
    identity.personaId,
  ]);
  expect(JSON.stringify(d.rows)).not.toContain(remoteCredential);
  expect(JSON.stringify(d.rows)).not.toContain("fixture-jwt-memory-only");
  const s = await db.query("SELECT * FROM setup_v2 WHERE persona_id=$1", [identity.personaId]);
  expect(JSON.stringify(s.rows)).not.toContain(code);
  expect(JSON.stringify(s.rows)).not.toContain(csrf);
  expect((await setups.inspect(code)).consumedAt).toBeNull();
  expect((await setups.inspect(code)).consumedAt).toBeNull();
});
it("creates one source and consumes the setup in the same transaction; no permission is added", async () => {
  const { code, csrf } = await link();
  expect((await setups.complete(code, csrf, ownerInput, sourceInput)).completed).toBe(true);
  const state = await repository.authorization(identity);
  expect(state?.sources).toHaveLength(1);
  expect(state?.token.permissions.sourceIds).toEqual([]);
  await expect(setups.complete(code, csrf, ownerInput, sourceInput)).rejects.toThrow();
  expect(
    (
      await db.query(
        "SELECT evento FROM audit_v2 WHERE persona_id=$1 AND evento='setup.completed'",
        [identity.personaId],
      )
    ).rowCount,
  ).toBe(1);
});
it("accepts only one concurrent completion", async () => {
  const { code, csrf } = await link();
  const result = await Promise.allSettled([
    setups.complete(code, csrf, ownerInput, sourceInput),
    setups.complete(code, csrf, ownerInput, sourceInput),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await repository.authorization(identity))?.sources).toHaveLength(1);
});
it("rolls back source creation and link consumption when the metadata audit fails", async () => {
  const { code, csrf } = await link();
  const guard = `fail_setup_${identity.personaId.replaceAll("-", "")}`;
  await db.query(
    `CREATE FUNCTION ${guard}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.evento='setup.completed' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$`,
  );
  await db.query(
    `CREATE TRIGGER ${guard} BEFORE INSERT ON audit_v2 FOR EACH ROW EXECUTE FUNCTION ${guard}()`,
  );
  try {
    await expect(setups.complete(code, csrf, ownerInput, sourceInput)).rejects.toThrow();
    expect((await setups.inspect(code)).consumedAt).toBeNull();
    expect((await repository.authorization(identity))?.sources).toHaveLength(0);
  } finally {
    await db.query(`DROP TRIGGER ${guard} ON audit_v2`);
    await db.query(`DROP FUNCTION ${guard}()`);
  }
});
it("omits setup tools for unprivileged consumers and denies direct calls", async () => {
  const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const issued = await admin.issueToken(session, {
    personaId: identity.personaId,
    name: "Read-only fixture",
    permissions: empty,
    delegation: empty,
    expiresAt: null,
  });
  const call = async (method: string, params?: unknown) =>
    request(runtime.app)
      .post("/mcp")
      .set("Host", "mcp.fixture.test")
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${issued.bearer}`)
      .send({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) });
  const list = await call("tools/list");
  expect(list.text).not.toContain('"name":"iniciar_cadastro_fonte"');
  const direct = await call("tools/call", { name: "iniciar_cadastro_fonte", arguments: {} });
  expect(direct.text).not.toContain("/app/setup/");
  expect(await setups.visible({ ...identity, tokenId: issued.tokenId })).toBe(false);
  await expect(setups.start({ ...identity, tokenId: issued.tokenId })).rejects.toThrow();
});
it("refuses wrong CSRF and different responsible Client before source verification", async () => {
  const { code, csrf } = await link();
  await expect(setups.complete(code, "x".repeat(43), ownerInput, sourceInput)).rejects.toThrow(
    "CSRF",
  );
  clientId = "another-owner";
  await expect(setups.complete(code, csrf, ownerInput, sourceInput)).rejects.toThrow();
  expect(sourceVerifier.verify).not.toHaveBeenCalled();
});
it("refuses expiry, remote revocation and unavailable authority without a local write", async () => {
  const { code, csrf } = await link();
  remoteRevoked = true;
  await expect(setups.complete(code, csrf, ownerInput, sourceInput)).rejects.toThrow();
  remoteRevoked = false;
  remoteUnavailable = true;
  await expect(setups.start(identity)).rejects.toThrow();
  remoteUnavailable = false;
  now = new Date(now.getTime() + 900001);
  await expect(setups.inspect(code)).rejects.toThrow();
  expect((await repository.authorization(identity))?.sources).toHaveLength(0);
});
it("local revocation or renewal invalidates old setups even if the remote proof would pass", async () => {
  const { code, csrf } = await link();
  await delegation.create(session, identity.personaId, 1);
  await expect(setups.complete(code, csrf, ownerInput, sourceInput)).rejects.toThrow();
  const fresh = await link();
  await delegation.revoke(session, identity.personaId, 2);
  remoteRevoked = false;
  await expect(setups.complete(fresh.code, fresh.csrf, ownerInput, sourceInput)).rejects.toThrow();
});
it("revocation during source verification prevents credential write and setup consumption", async () => {
  const { code, csrf } = await link();
  sourceVerifier.verify.mockImplementationOnce(async () => {
    await admin.revokeToken(session, identity.personaId, identity.tokenId);
    return {
      database: "fixture",
      dialect: "mssql",
      identityHash: "f".repeat(64),
      verifiedAt: now.toISOString(),
    };
  });
  await expect(setups.complete(code, csrf, ownerInput, sourceInput)).rejects.toThrow();
  expect((await setups.inspect(code)).consumedAt).toBeNull();
  expect(
    (await db.query("SELECT id FROM fonte WHERE persona_id=$1", [identity.personaId])).rowCount,
  ).toBe(0);
});
it("rotation confirms the same physical source, preserves its identity and consumes the bound version", async () => {
  const source = await admin.addSource(session, {
    ...sourceInput,
    dialect: "mssql",
    personaId: identity.personaId,
  });
  const started = await setups.start(identity, {
    id: source.id,
    version: source.authorizationVersion,
  });
  const u = new URL(started.url);
  await setups.complete(u.pathname.split("/").at(-1)!, u.hash.slice(1), ownerInput, {
    email: "new@fixture.test",
    password: "new-password",
    clientToken: "new-token",
  });
  const updated = (await repository.authorization(identity))?.sources[0];
  expect(updated?.identityHash).toBe(source.identityHash);
  expect(updated?.credentialVersion).toBe(2);
  expect(updated?.authorizationVersion).toBe(2);
});
it("GET never consumes or reveals CSRF; POST requires exact origin and safe errors discard credentials", async () => {
  const { code, csrf } = await link();
  const get = await request(runtime.app).get(`/app/setup/${code}`).set("Host", "mcp.fixture.test");
  expect(get.status).toBe(200);
  expect(get.text).not.toContain(csrf);
  expect(get.headers["referrer-policy"]).toBe("same-origin");
  expect((await setups.inspect(code)).consumedAt).toBeNull();
  const bad = await request(runtime.app)
    .post(`/app/setup/${code}`)
    .set("Host", "mcp.fixture.test")
    .set("Origin", "https://evil.fixture.test")
    .type("form")
    .send({
      csrf,
      ...sourceInput,
      ownerEmail: ownerInput.email,
      ownerPassword: ownerInput.password,
    });
  expect(bad.status).toBe(403);
  expect(bad.text).not.toContain(sourceInput.password);
  const good = await request(runtime.app)
    .post(`/app/setup/${code}`)
    .set("Host", "mcp.fixture.test")
    .set("Origin", origin)
    .type("form")
    .send({
      csrf,
      ...sourceInput,
      ownerEmail: ownerInput.email,
      ownerPassword: ownerInput.password,
    });
  expect(good.status).toBe(200);
  expect(good.text).not.toContain(sourceInput.password);
});
it("OAuth administrative consent requires active delegation, explicit selection and token permission", async () => {
  const hash = (s: string) => createHash("sha256").update(s).digest("base64url"),
    verifier = "v".repeat(43);
  const clientId = "https://client.fixture.test/client.json",
    redirect = "https://client.fixture.test/callback";
  const oauth = new PersonaOAuth(
    new PostgresPersonaOAuthStore(db, crypto),
    repository,
    crypto,
    {
      validate: async () => {
        return;
      },
    },
    { issuer: origin, resource: `${origin}/mcp/chatgpt`, clients: { [clientId]: [redirect] } },
    hash,
    () => now.getTime(),
    async (i) => {
      await delegation.verify(i);
      return ["gerenciar_fontes"];
    },
  );
  const start = await oauth.begin({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: "se7e:persona",
    resource: `${origin}/mcp/chatgpt`,
    code_challenge_method: "S256",
    code_challenge: hash(verifier),
  });
  const review = await oauth.authenticate(start.id, start.nonce, start.csrf, bearer);
  expect(review.permissions.administrative).toEqual(["gerenciar_fontes"]);
  const location = await oauth.consent(start.id, start.nonce, review.csrf, {
    sources: [],
    skills: [],
    external: [],
    administrative: ["gerenciar_fontes"],
  });
  const tokens = await oauth.token({
    client_id: clientId,
    redirect_uri: redirect,
    grant_type: "authorization_code",
    resource: `${origin}/mcp/chatgpt`,
    code: new URL(location).searchParams.get("code")!,
    code_verifier: verifier,
  });
  const consumer = await oauth.resolve(tokens.access_token);
  expect((await repository.authorization(consumer))?.grant?.permissions.administrative).toEqual([
    "gerenciar_fontes",
  ]);
  const s = await setups.start(consumer);
  expect(s.requiresOwnerLogin).toBe(true);
  const u = new URL(s.url);
  await setups.complete(u.pathname.split("/").at(-1)!, u.hash.slice(1), ownerInput, sourceInput);
  await delegation.revoke(session, identity.personaId, 1);
  await expect(setups.start(consumer)).rejects.toThrow();
});

const integrationInput = {
  name: "Integração fixture",
  kind: "rest",
  destination: "https://api.example.com/v1",
  credentialType: "bearer",
  token: "fixture-external-only",
  confirmed: "save",
};
const integrationLink = async (
  actor: ConsumerIdentity,
  target?: { id: string; version: number },
) => {
  const u = new URL((await setups.startIntegration(actor, target)).url);
  return { code: u.pathname.split("/").at(-1)!, csrf: u.hash.slice(1) };
};
it("setup de integração cifra credencial, consome uma vez e mantém operações inativas", async () => {
  const { actor, issued } = await administrator(["gerenciar_integracoes"]);
  const call = await mcpCall(issued.bearer, "iniciar_cadastro_integracao", {});
  expect(call.isError).toBe(false);
  expect(JSON.stringify(call)).not.toContain(integrationInput.token);
  const l = await integrationLink(actor);
  const outcomes = await Promise.allSettled(
    [1, 2].map(() => setups.complete(l.code, l.csrf, ownerInput, integrationInput)),
  );
  expect(outcomes.filter((v) => v.status === "fulfilled")).toHaveLength(1);
  const row = (await db.query("SELECT * FROM integracao WHERE persona_id=$1", [actor.personaId]))
    .rows[0]!;
  expect(row.ativa).toBe(false);
  expect(row.credencial_versao).toBe(1);
  expect(row.credencial_enc).not.toContain(integrationInput.token);
  expect(JSON.parse(crypto.decrypt(row.credencial_enc)).credential.token).toBe(
    integrationInput.token,
  );
  expect(JSON.stringify(outcomes)).not.toContain(integrationInput.token);
  const audit = (await db.query("SELECT * FROM audit_v2 WHERE integracao_id=$1", [row.id])).rows;
  expect(audit).toHaveLength(1);
  expect(audit[0].responsavel_id).toBeTruthy();
  expect(JSON.stringify(audit)).not.toContain(integrationInput.token);
  const history = await repository.transaction(
    { personaIds: [actor.personaId], tokenIds: [] },
    (tx) => tx.history(actor.personaId, { resourceId: row.id }),
  );
  expect(history.items[0]?.event).toBe("integration.created");
  expect(history.items[0]?.version).toBe(1);
});
it("rotação fixa destino e versão, impede outra persona e desativa operações", async () => {
  const { actor } = await administrator(["gerenciar_integracoes"]);
  const l = await integrationLink(actor);
  const created = await setups.complete(l.code, l.csrf, ownerInput, integrationInput);
  if (!("integrationId" in created)) throw new Error("Expected integration");
  const target = { id: created.integrationId, version: 1 };
  const a = await integrationLink(actor, target),
    b = await integrationLink(actor, target);
  await db.query(
    "INSERT INTO integracao_operacao(id,persona_id,integracao_id,nome,contrato,contrato_hash,efeito,ativa) VALUES($1,$2,$3,'fixture','{}','fixture','consulta',true)",
    [randomUUID(), actor.personaId, target.id],
  );
  await expect(
    setups.complete(a.code, a.csrf, ownerInput, {
      ...integrationInput,
      destination: "https://other.example.com",
    }),
  ).rejects.toThrow();
  await setups.complete(a.code, a.csrf, ownerInput, {
    credentialType: "api_key",
    header: "X-Api-Key",
    apiKey: "replacement-fixture",
    confirmed: "save",
  });
  await expect(
    setups.complete(b.code, b.csrf, ownerInput, {
      credentialType: "basic",
      username: "fixture",
      password: "fixture",
      confirmed: "save",
    }),
  ).rejects.toThrow();
  expect((await setups.inspect(b.code)).consumedAt).toBeNull();
  const row = (await db.query("SELECT * FROM integracao WHERE id=$1", [target.id])).rows[0]!;
  expect(row.destino).toBe(integrationInput.destination);
  expect(row.credencial_versao).toBe(2);
  expect(
    (await db.query("SELECT ativa FROM integracao_operacao WHERE integracao_id=$1", [target.id]))
      .rows[0].ativa,
  ).toBe(false);
  const other = await admin.createPersona(session, {
    name: "Outra",
    specialty: "Fixture",
    instructions: "Fixture",
  });
  await expect(
    setups.startIntegration({ ...actor, personaId: other.id }, target),
  ).rejects.toThrow();
});
it("integração recusa autoridade ausente, CSRF, responsável, prazo e revogação", async () => {
  await expect(setups.startIntegration(identity)).rejects.toThrow();
  expect((await mcpCall(bearer, "iniciar_cadastro_integracao", {})).isError).toBe(true);
  const { actor } = await administrator(["gerenciar_integracoes"]);
  const l = await integrationLink(actor);
  await expect(
    setups.complete(l.code, "x".repeat(43), ownerInput, integrationInput),
  ).rejects.toThrow();
  clientId = "other-owner";
  await expect(setups.complete(l.code, l.csrf, ownerInput, integrationInput)).rejects.toThrow();
  clientId = "owner-fixture";
  remoteUnavailable = true;
  await expect(setups.complete(l.code, l.csrf, ownerInput, integrationInput)).rejects.toThrow();
  remoteUnavailable = false;
  await admin.revokeToken(session, actor.personaId, actor.tokenId);
  await expect(setups.complete(l.code, l.csrf, ownerInput, integrationInput)).rejects.toThrow();
  expect(
    (
      await db.query("SELECT count(*) AS count FROM integracao WHERE persona_id=$1", [
        actor.personaId,
      ])
    ).rows[0].count,
  ).toBe("0");
  expect((await setups.inspect(l.code)).consumedAt).toBeNull();
  now = new Date(now.getTime() + 900001);
  await expect(setups.inspect(l.code)).rejects.toThrow();
});
it("falha de auditoria reverte credencial e consumo do setup de integração", async () => {
  const { actor } = await administrator(["gerenciar_integracoes"]);
  const l = await integrationLink(actor);
  await db.query(
    `CREATE FUNCTION fixture_fail_integration_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.evento='integration.created' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END $$`,
  );
  await db.query(
    "CREATE TRIGGER fixture_integration_audit BEFORE INSERT ON audit_v2 FOR EACH ROW EXECUTE FUNCTION fixture_fail_integration_audit()",
  );
  try {
    await expect(setups.complete(l.code, l.csrf, ownerInput, integrationInput)).rejects.toThrow();
    expect((await setups.inspect(l.code)).consumedAt).toBeNull();
    expect(
      (
        await db.query("SELECT count(*) AS count FROM integracao WHERE persona_id=$1", [
          actor.personaId,
        ])
      ).rows[0].count,
    ).toBe("0");
  } finally {
    await db.query("DROP TRIGGER fixture_integration_audit ON audit_v2");
    await db.query("DROP FUNCTION fixture_fail_integration_audit()");
  }
});

it("setup de integração intersecta consentimento OAuth e revalida concessão antes do consumo", async () => {
  const f = await administrator(["gerenciar_integracoes"]);
  const grantId = randomUUID();
  await db.query(
    "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,$4,'fixture',$5)",
    [
      grantId,
      f.actor.personaId,
      f.actor.tokenId,
      JSON.stringify({ ...f.grants, administrative: [] }),
      new Date(now.getTime() + 100000),
    ],
  );
  const actor = { ...f.actor, grant: { id: grantId, expiresAt: now.getTime() + 50000 } };
  await expect(setups.startIntegration(actor)).rejects.toThrow();
  const allowedGrantId = randomUUID();
  await db.query(
    "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,$4,'fixture',$5)",
    [
      allowedGrantId,
      f.actor.personaId,
      f.actor.tokenId,
      JSON.stringify(f.grants),
      new Date(now.getTime() + 100000),
    ],
  );
  actor.grant.id = allowedGrantId;
  const l = await integrationLink(actor);
  expect((await setups.inspect(l.code)).expiresAt.getTime()).toBe(actor.grant.expiresAt);
  await db.query("UPDATE oauth_concessao_v2 SET revoked_at=$2 WHERE id=$1", [allowedGrantId, now]);
  await expect(setups.complete(l.code, l.csrf, ownerInput, integrationInput)).rejects.toThrow();
  expect((await setups.inspect(l.code)).consumedAt).toBeNull();
});

it("importação externa é proposta isolada, revalida autoridade/credencial e cria só rascunho explícito", async () => {
  const f = await administrator(["gerenciar_integracoes"]),
    link = await integrationLink(f.actor);
  const saved = await setups.complete(link.code, link.csrf, ownerInput, integrationInput);
  if (!("integrationId" in saved)) throw new Error("integration expected");
  const shape = {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  };
  const external = new PersonaExternalIntegrations(services, administrative, {
    invoke: async () => {
      throw new Error("No execution");
    },
  });
  const doc = {
    openapi: "3.1.0",
    paths: {
      "/lookup": {
        get: {
          responses: {
            200: { description: "Registro", content: { "application/json": { schema: shape } } },
          },
        },
      },
    },
  };
  const input = { kind: "openapi", integrationId: saved.integrationId, version: 1, document: doc };
  await expect(external.importCandidates(f.actor, identity.personaId, input)).rejects.toMatchObject(
    { code: "AUTHORIZATION_DENIED" },
  );
  const setScope = async (ids: string[]) =>
    db.query("UPDATE persona_token SET permissoes=$2 WHERE id=$1", [
      f.actor.tokenId,
      JSON.stringify({ ...f.grants, managedIntegrationIds: ids }),
    ]);
  await setScope([saved.integrationId]);
  const delegatedProposal = await mcpCall(f.issued.bearer, "propor_contrato_externo", {
    import: input,
  });
  expect(delegatedProposal.isError).toBe(false);
  expect(delegatedProposal.value.connection.id).toBe(saved.integrationId);
  const proposal = await external.importCandidates(session, identity.personaId, input);
  expect(proposal.candidates[0]?.proposal?.transport).toEqual({
    kind: "rest",
    method: "GET",
    path: "/lookup",
  });
  expect(JSON.stringify(proposal)).not.toContain(integrationInput.token);
  expect(await catalog.list(session, identity.personaId)).toHaveLength(0);
  await expect(
    external.importCandidates(session, identity.personaId, { ...input, version: 2 }),
  ).rejects.toThrow();
  const other = await admin.createPersona(session, {
    name: "Outra",
    specialty: "Fixture",
    instructions: "Sem dados",
  });
  await expect(external.importCandidates(session, other.id, input)).rejects.toThrow();
  const metadata = proposal.connection;
  const mcpId = await seedExternalConnection(db, crypto, identity.personaId, "mcp_http");
  const rotateFixture = async (id: string) => {
    const row = await db.query<{ credencial_enc: string }>(
      "SELECT credencial_enc FROM integracao WHERE id=$1",
      [id],
    );
    const envelope = JSON.parse(crypto.decrypt(row.rows[0]!.credencial_enc)) as { version: number };
    envelope.version++;
    await db.query("UPDATE integracao SET credencial_versao=$2,credencial_enc=$3 WHERE id=$1", [
      id,
      envelope.version,
      crypto.encrypt(JSON.stringify(envelope)),
    ]);
  };
  const discover = vi.fn(
    async (_c: unknown, _signal: AbortSignal, beforeDispatch: () => Promise<void>) => {
      await beforeDispatch();
      return { complete: true, tools: [{ name: "read", inputSchema: shape, outputSchema: shape }] };
    },
  );
  const discovered = new PersonaExternalIntegrations(
    services,
    administrative,
    { invoke: async () => ({}) },
    { discover },
  );
  const mcpInput = {
    kind: "mcp",
    integrationId: mcpId,
    version: 1,
    confirmed: "discover",
  };
  await expect(
    discovered.importCandidates(f.actor, identity.personaId, mcpInput),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  expect(discover).not.toHaveBeenCalled();
  await setScope([saved.integrationId, mcpId]);
  expect(
    (await discovered.connections(f.actor, identity.personaId)).map((c) => c.id).sort(),
  ).toEqual([saved.integrationId, mcpId].sort());
  discover.mockImplementationOnce(async (_c, _signal, beforeDispatch) => {
    await beforeDispatch();
    await setScope([saved.integrationId]);
    return { complete: true, tools: [{ name: "read", inputSchema: shape, outputSchema: shape }] };
  });
  await expect(
    discovered.importCandidates(f.actor, identity.personaId, mcpInput),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await setScope([saved.integrationId, mcpId]);
  expect(
    (await discovered.importCandidates(f.actor, identity.personaId, mcpInput)).candidates,
  ).toHaveLength(1);
  expect(
    (await discovered.importCandidates(session, identity.personaId, mcpInput)).candidates[0]
      ?.proposal?.effect,
  ).toBe("acao");
  discover.mockImplementationOnce(async () => ({ complete: false, tools: [] }));
  await expect(discovered.importCandidates(session, identity.personaId, mcpInput)).rejects.toThrow(
    "incompleto",
  );
  discover.mockImplementationOnce(async (_c, _signal, beforeDispatch) => {
    await beforeDispatch();
    active = false;
    return { complete: true, tools: [] };
  });
  await expect(
    discovered.importCandidates(session, identity.personaId, mcpInput),
  ).rejects.toThrow();
  active = true;
  // Revocation deliberately invalidates the old administrative session.
  session = (await admin.login(ownerInput.email, ownerInput.password)).sessionId;
  discover.mockImplementationOnce(async (_c, _signal, beforeDispatch) => {
    await beforeDispatch();
    await rotateFixture(mcpId);
    return { complete: true, tools: [] };
  });
  await expect(
    discovered.importCandidates(session, identity.personaId, mcpInput),
  ).rejects.toThrow();
  await rotateFixture(saved.integrationId);
  const create = {
    slug: "importada",
    name: "Importada",
    expectedConnection: metadata,
    contract: {
      ...proposal.candidates[0]!.proposal,
      integrationId: saved.integrationId,
      timeoutMs: 1000,
      maxResponseBytes: 4096,
    },
  };
  await expect(external.create(session, identity.personaId, create)).rejects.toThrow(
    "Integração mudou",
  );
  const created = await external.create(session, identity.personaId, {
    ...create,
    expectedConnection: { ...metadata, version: 2 },
  });
  expect(await external.detail(session, identity.personaId, created.skillId)).toMatchObject({
    revision: 1,
    published: false,
    publication: null,
  });
  active = false;
  await expect(
    external.importCandidates(session, identity.personaId, { ...input, version: 2 }),
  ).rejects.toThrow();
});
it("editor externo delegado limita integração e vincula publicação à autoridade e ao prazo humano", async () => {
  const f = await administrator(["gerenciar_integracoes", "treinar", "publicar"]);
  const link = await integrationLink(f.actor);
  const saved = await setups.complete(link.code, link.csrf, ownerInput, integrationInput);
  if (!("integrationId" in saved)) throw new Error("integration expected");
  const invoke = vi.fn(async () => ({ name: "fixture" }));
  const external = new PersonaExternalIntegrations(services, administrative, { invoke });
  const input = {
    slug: "delegated-editor",
    name: "Delegado",
    contract: {
      integrationId: saved.integrationId,
      purpose: "Fixture",
      effect: "consulta",
      transport: { kind: "rest", method: "GET", path: "/lookup" },
      input: { id: { type: "string", required: true, purpose: "Chave", classification: "livre" } },
      output: {
        name: { type: "string", required: true, purpose: "Nome", classification: "livre" },
      },
      timeoutMs: 1000,
      maxResponseBytes: 2048,
    },
  };
  await expect(external.create(f.actor, identity.personaId, input)).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  await db.query("UPDATE persona_token SET permissoes=$2 WHERE id=$1", [
    f.actor.tokenId,
    JSON.stringify({ ...f.grants, managedIntegrationIds: [saved.integrationId] }),
  ]);
  const createdResponse = await request(runtime.app)
    .post("/api/consumer/bearer/administration/external-skills")
    .set("Host", new URL(origin).host)
    .set("Origin", origin)
    .set("Authorization", `Bearer ${f.issued.bearer}`)
    .send(input);
  expect(createdResponse.status).toBe(201);
  const draft = createdResponse.body as { skillId: string; operationId: string };
  expect((await mcpCall(f.issued.bearer, "listar_rascunhos_externos", {})).value).toEqual([
    expect.objectContaining({ skillId: draft.skillId }),
  ]);
  expect(
    (await mcpCall(f.issued.bearer, "obter_rascunho_externo", { skillId: draft.skillId })).isError,
  ).toBe(false);
  const detail = await external.detail(f.actor, identity.personaId, draft.skillId);
  expect((await external.drafts(f.actor, identity.personaId)).map((d) => d.skillId)).toEqual([
    draft.skillId,
  ]);
  await expect(
    external.update(f.actor, identity.personaId, draft.skillId, {
      expectedRevision: 1,
      name: "Fora do escopo",
      contract: { ...detail.contract, integrationId: randomUUID() },
    }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  expect(
    (
      await mcpCall(f.issued.bearer, "editar_skill_externa", {
        skillId: draft.skillId,
        expectedRevision: 1,
        name: "Revisado",
        contract: detail.contract,
      })
    ).isError,
  ).toBe(false);
  expect(
    (
      await mcpCall(f.issued.bearer, "editar_caso_skill", {
        kind: "acao_externa",
        skillId: draft.skillId,
        expectedRevision: 2,
        required: true,
        content: { name: "Caso", input: { id: "1" }, expected: { name: "fixture" } },
      })
    ).isError,
  ).toBe(false);
  expect((await external.tests(f.actor, identity.personaId, draft.skillId)).cases).toHaveLength(1);
  await external.runFixtureCases(
    session,
    identity.personaId,
    draft.skillId,
    {
      destination: "https://isolated.example.com",
      credential: { credentialType: "bearer", token: "fixture-only" },
    },
    { invoke },
  );
  await expect(
    external.preview(f.actor, identity.personaId, draft.skillId, reviewDateFixture()),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  const humanPreview = await external.preview(
    session,
    identity.personaId,
    draft.skillId,
    reviewDateFixture(),
  );
  await expect(
    external.publish(f.actor, identity.personaId, draft.skillId, humanPreview.confirmationHash),
  ).rejects.toMatchObject({ code: "OPERATION_CONFLICT" });
  const reviewed = await mcpCall(f.issued.bearer, "revisar_publicacao_externa", {
    skillId: draft.skillId,
  });
  expect(reviewed.isError).toBe(false);
  const preview = reviewed.value as { confirmationHash: string };
  await expect(
    external.publish(session, identity.personaId, draft.skillId, preview.confirmationHash),
  ).rejects.toMatchObject({ code: "OPERATION_CONFLICT" });
  const published = await mcpCall(f.issued.bearer, "publicar_skill_externa", {
    skillId: draft.skillId,
    confirmationHash: preview.confirmationHash,
  });
  expect(published.isError).toBe(false);
  expect(published.value.skillId).toBe(draft.skillId);
  expect(await external.list(f.actor)).toEqual([]);
  remoteRevoked = true;
  await expect(external.detail(f.actor, identity.personaId, draft.skillId)).rejects.toThrow();
});

it("editor externo preserva identidade, aplica CAS e não altera contrato já publicado", async () => {
  const f = await administrator(["gerenciar_integracoes"]),
    link = await integrationLink(f.actor);
  const saved = await setups.complete(link.code, link.csrf, ownerInput, integrationInput);
  if (!("integrationId" in saved)) {
    throw new Error("integration expected");
  }
  const invoke = vi.fn(async () => ({ name: "fixture" }));
  const external = new PersonaExternalIntegrations(services, administrative, { invoke });
  const connections = await external.connections(session, identity.personaId);
  expect(connections).toContainEqual(
    expect.objectContaining({ id: saved.integrationId, active: false }),
  );
  expect(JSON.stringify(connections)).not.toContain(integrationInput.token);
  expect(connections.every((c) => !Object.hasOwn(c, "credential"))).toBe(true);
  const created = await external.create(session, identity.personaId, {
    slug: "editor",
    name: "Editor",
    contract: {
      integrationId: saved.integrationId,
      purpose: "Fixture",
      effect: "consulta",
      transport: { kind: "rest", method: "GET", path: "/lookup" },
      input: { id: { type: "string", required: true, purpose: "Chave", classification: "livre" } },
      output: {
        name: { type: "string", required: true, purpose: "Nome", classification: "livre" },
      },
      timeoutMs: 1000,
      maxResponseBytes: 2048,
    },
  });
  const d = await external.detail(session, identity.personaId, created.skillId);
  expect(d).toMatchObject({
    slug: "editor",
    revision: 1,
    published: false,
    publication: null,
    contract: { operationId: created.operationId },
  });
  await expect(
    external.update(session, identity.personaId, created.skillId, {
      expectedRevision: 1,
      name: "Outro",
      contract: { ...d.contract, operationId: randomUUID() },
    }),
  ).rejects.toThrow("Identidade");
  await expect(
    external.update(session, identity.personaId, created.skillId, {
      expectedRevision: 1,
      name: "Outro",
      contract: { ...d.contract, integrationId: randomUUID() },
    }),
  ).rejects.toThrow();
  const edits = await Promise.allSettled([
    external.update(session, identity.personaId, created.skillId, {
      expectedRevision: 1,
      name: "Revisada",
      contract: d.contract,
    }),
    external.update(session, identity.personaId, created.skillId, {
      expectedRevision: 1,
      name: "Revisada",
      contract: d.contract,
    }),
  ]);
  expect(edits.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await external.detail(session, identity.personaId, created.skillId)).revision).toBe(2);
  await external.changeCase(session, identity.personaId, created.skillId, {
    expectedRevision: 2,
    required: true,
    content: { name: "Caso", input: { id: "1" }, expected: { name: "fixture" } },
  });
  await external.runFixtureCases(
    session,
    identity.personaId,
    created.skillId,
    {
      destination: "https://isolated.example.com",
      credential: { credentialType: "bearer", token: "fixture-only" },
    },
    { invoke },
  );
  const preview = await external.preview(
    session,
    identity.personaId,
    created.skillId,
    reviewDateFixture(),
  );
  expect(preview).toMatchObject({
    revision: 3,
    reviewDueAt: expect.any(String),
    review: {
      cases: { total: 1, required: 1, requiredApproved: true },
      existingTokensExpanded: false,
    },
  });
  expect(preview.review.sections.flatMap((s) => s.changes)).toContainEqual(
    expect.objectContaining({ path: "training/transport/path", after: "/lookup" }),
  );
  await external.update(session, identity.personaId, created.skillId, {
    expectedRevision: 3,
    name: "Nova revisão",
    contract: d.contract,
  });
  await expect(
    external.publish(session, identity.personaId, created.skillId, preview.confirmationHash),
  ).rejects.toThrow();
  expect(
    (await external.tests(session, identity.personaId, created.skillId)).requiredApproved,
  ).toBe(false);
  await external.runFixtureCases(
    session,
    identity.personaId,
    created.skillId,
    {
      destination: "https://isolated.example.com",
      credential: { credentialType: "bearer", token: "fixture-only" },
    },
    { invoke },
  );
  const fresh = await external.preview(
    session,
    identity.personaId,
    created.skillId,
    reviewDateFixture(),
  );
  const publication = await external.publish(
    session,
    identity.personaId,
    created.skillId,
    fresh.confirmationHash,
  );
  await expect(
    external.update(session, identity.personaId, created.skillId, {
      expectedRevision: 4,
      name: "Alterada",
      contract: d.contract,
    }),
  ).rejects.toThrow("já foi publicado");
  expect(
    (await external.detail(session, identity.personaId, created.skillId)).publication?.id,
  ).toBe(publication.id);
  expect(await external.list(f.actor)).toEqual([]);
  await expect(external.detail(session, randomUUID(), created.skillId)).rejects.toThrow();
  active = false;
  await expect(external.connections(session, identity.personaId)).rejects.toThrow();
});

it("publica consulta externa com relatório, prazo e concessão exatos; rotação e revogação bloqueiam entrega", async () => {
  const f = await administrator(["gerenciar_integracoes"]);
  const l = await integrationLink(f.actor);
  const saved = await setups.complete(l.code, l.csrf, ownerInput, integrationInput);
  if (!("integrationId" in saved)) throw new Error("integration expected");
  const invoke = vi.fn(
    async (
      _connection: unknown,
      _contract: unknown,
      _input: unknown,
      _signal: AbortSignal,
      dispatch: () => Promise<void>,
    ) => {
      await dispatch();
      return { name: "fixture" };
    },
  );
  const external = new PersonaExternalIntegrations(services, administrative, { invoke });
  const contract = externalContractSchema.parse({
    operationId: randomUUID(),
    integrationId: saved.integrationId,
    purpose: "Consulta externa treinada",
    effect: "consulta",
    transport: { kind: "rest", method: "GET", path: "/lookup" },
    input: { id: { type: "string", required: true, purpose: "Chave", classification: "livre" } },
    output: { name: { type: "string", required: true, purpose: "Nome", classification: "livre" } },
    timeoutMs: 1000,
    maxResponseBytes: 2048,
  });
  const draft = await external.create(session, identity.personaId, {
    slug: "externa",
    name: "Consulta externa",
    contract,
  });
  await expect(
    external.preview(session, identity.personaId, draft.skillId, reviewDateFixture()),
  ).rejects.toThrow();
  await catalog.addCase(session, identity.personaId, draft.skillId, {
    required: true,
    content: { name: "Fixture", input: { id: "1" }, expected: { name: "fixture" } },
  });
  await expect(
    external.preview(session, identity.personaId, draft.skillId, reviewDateFixture()),
  ).rejects.toThrow();
  const fixture = {
    destination: "https://isolated.example.com",
    credential: { credentialType: "bearer" as const, token: "fixture-only" },
  };
  expect(
    await external.runFixtureCases(session, identity.personaId, draft.skillId, fixture, { invoke }),
  ).toEqual({ approved: true });
  const preview = await external.preview(
    session,
    identity.personaId,
    draft.skillId,
    reviewDateFixture(),
  );
  const publication = await external.publish(
    session,
    identity.personaId,
    draft.skillId,
    preview.confirmationHash,
  );
  await expect(
    external.publish(session, identity.personaId, draft.skillId, preview.confirmationHash),
  ).rejects.toThrow();
  expect(await external.list(f.actor)).toEqual([]);
  const permissions = {
    ...emptyPermissions,
    externalOperationIds: [draft.operationId],
    skills: [
      {
        skillId: draft.skillId,
        capabilities: publication.package.requiredCapabilities,
        effects: [],
        requireHumanApproval: false,
      },
    ],
  };
  const issued = await admin.issueToken(session, {
    personaId: identity.personaId,
    name: "Consulta API",
    permissions,
    delegation: emptyPermissions,
    expiresAt: null,
  });
  const consumer = { ...identity, tokenId: issued.tokenId };
  expect(await external.list(consumer)).toHaveLength(1);
  const deniedPermissions = [
    { ...permissions, externalOperationIds: [] },
    { ...permissions, skills: [{ ...permissions.skills[0]!, capabilities: [] }] },
    { ...permissions, skills: [{ ...permissions.skills[0]!, requireHumanApproval: true }] },
  ];
  for (const restricted of deniedPermissions) {
    const token = await admin.issueToken(session, {
      personaId: identity.personaId,
      name: "Restrito",
      permissions: restricted,
      delegation: emptyPermissions,
      expiresAt: null,
    });
    const calls = invoke.mock.calls.length;
    await expect(
      external.query(
        { ...consumer, tokenId: token.tokenId },
        { skillId: draft.skillId, input: { id: "1" } },
      ),
    ).rejects.toThrow();
    expect(invoke).toHaveBeenCalledTimes(calls);
  }
  expect((await mcpCall(issued.bearer, "listar_operacoes_externas", {})).value).toHaveLength(1);
  expect(
    (await external.query(consumer, { skillId: draft.skillId, input: { id: "1" } })).data,
  ).toEqual({ name: "fixture" });
  await expect(
    external.query(consumer, {
      skillId: draft.skillId,
      input: { id: "1" },
      limits: { maxBytes: 1 },
    }),
  ).rejects.toThrow();
  const limited = await admin.issueToken(session, {
    personaId: identity.personaId,
    name: "Limite externo",
    permissions: {
      ...permissions,
      queryLimits: { maxBytes: 1800 },
      skills: [{ ...permissions.skills[0]!, queryLimits: { timeoutMs: 700 } }],
    },
    delegation: emptyPermissions,
    expiresAt: null,
  });
  expect(
    (
      await external.query(
        { ...consumer, tokenId: limited.tokenId },
        { skillId: draft.skillId, input: { id: "1" }, limits: { maxBytes: 1500 } },
      )
    ).limits,
  ).toEqual({ maxBytes: 1500, timeoutMs: 700 });
  const grantId = randomUUID();
  await db.query(
    "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,$4,'fixture',$5)",
    [
      grantId,
      identity.personaId,
      issued.tokenId,
      JSON.stringify({ ...permissions, externalOperationIds: [] }),
      new Date(now.getTime() + 60000),
    ],
  );
  await expect(
    external.query(
      { ...consumer, grant: { id: grantId } },
      { skillId: draft.skillId, input: { id: "1" } },
    ),
  ).rejects.toThrow();
  invoke.mockImplementationOnce(async (_c, _t, _i, _s, dispatch) => {
    await dispatch();
    await admin.revokeToken(session, identity.personaId, issued.tokenId);
    return { name: "must-not-deliver" };
  });
  await expect(
    external.query(consumer, { skillId: draft.skillId, input: { id: "1" } }),
  ).rejects.toThrow();
  const next = await admin.issueToken(session, {
    personaId: identity.personaId,
    name: "Outro",
    permissions,
    delegation: emptyPermissions,
    expiresAt: null,
  });
  const rotation = await integrationLink(f.actor, { id: saved.integrationId, version: 1 });
  await setups.complete(rotation.code, rotation.csrf, ownerInput, {
    credentialType: "bearer",
    token: "replacement",
    confirmed: "save",
  });
  expect(await external.list({ ...consumer, tokenId: next.tokenId })).toEqual([]);
  expect(
    (await db.query("SELECT count(*) AS count FROM publicacao WHERE id=$1", [publication.id]))
      .rows[0].count,
  ).toBe("1");
  const audit = (
    await db.query("SELECT * FROM audit_v2 WHERE integracao_id=$1", [saved.integrationId])
  ).rows;
  expect(JSON.stringify(audit)).not.toContain("must-not-deliver");
});

const actionRef = (a: { operationId: string; fingerprint: string }) => ({
  operationId: a.operationId,
  fingerprint: a.fingerprint,
});
it("delegates external cases by exact publication without executing or inheriting reports", async () => {
  const f = await actionFixture();
  const status = await delegation.status(session, identity.personaId);
  await delegation.create(session, identity.personaId, status.version, ["treinar"]);
  const permissions: Permissions = { ...f.permissions, administrative: ["treinar"] };
  const issued = await admin.issueToken(session, {
    personaId: identity.personaId,
    name: "Editor externo",
    permissions,
    delegation: emptyPermissions,
    expiresAt: new Date(now.getTime() + 600000),
  });
  const actor = { ...identity, tokenId: issued.tokenId };
  f.transport.invoke.mockClear();
  const args = { skillId: f.draft.skillId, kind: "acao_externa" };
  const initial = await f.external.tests(actor, identity.personaId, f.draft.skillId);
  expect(initial.requiredApproved).toBe(true);
  expect(await mcpCall(issued.bearer, "obter_testes_skill", args)).toMatchObject({
    isError: false,
    value: { revision: initial.revision, requiredApproved: true },
  });
  const edit = {
    ...args,
    expectedRevision: initial.revision,
    required: true,
    content: { name: "Outro caso sintético", input: { id: "2" }, expected: { name: "fixture" } },
  };
  expect(await mcpCall(issued.bearer, "editar_caso_skill", edit)).toMatchObject({
    isError: false,
    value: { revision: initial.revision + 1 },
  });
  expect((await mcpCall(issued.bearer, "editar_caso_skill", edit)).isError).toBe(true);
  const details = await f.external.tests(actor, identity.personaId, f.draft.skillId);
  expect(details.requiredApproved).toBe(false);
  expect(details.reports.every((r) => !r.current)).toBe(true);
  const added = details.cases.find(
    (c) => (c.content as { name: string }).name === edit.content.name,
  )!;
  const response = await request(runtime.app)
    .post(`/api/consumer/bearer/administration/skills/${f.draft.skillId}/testes`)
    .set("Host", "mcp.fixture.test")
    .set("Origin", origin)
    .set("Authorization", `Bearer ${issued.bearer}`)
    .send({
      kind: "acao_externa",
      required: true,
      content: edit.content,
      expectedRevision: details.revision,
      id: added.id,
      remove: true,
    });
  expect(response.status).toBe(200);
  expect((await f.external.tests(actor, identity.personaId, f.draft.skillId)).cases).toHaveLength(
    1,
  );
  expect(f.transport.invoke).not.toHaveBeenCalled();
  expect(f.transport.executeAction).not.toHaveBeenCalled();
  expect(
    (await repository.transaction({ personaIds: [identity.personaId], tokenIds: [] }, (tx) =>
      tx.external!.publication(identity.personaId, f.draft.skillId),
    ))!.id,
  ).toBe(f.publication.id);
  remoteRevoked = true;
  expect((await mcpCall(issued.bearer, "obter_testes_skill", args)).isError).toBe(true);
});

it("refuses external editorial access without operation, skill, consent or current authority", async () => {
  const f = await actionFixture();
  const status = await delegation.status(session, identity.personaId);
  await delegation.create(session, identity.personaId, status.version, ["treinar"]);
  const permissions: Permissions = { ...f.permissions, administrative: ["treinar"] };
  const issue = (grants: Permissions) =>
    admin.issueToken(session, {
      personaId: identity.personaId,
      name: "Editor limitado",
      permissions: grants,
      delegation: emptyPermissions,
      expiresAt: new Date(now.getTime() + 600000),
    });
  for (const grants of [
    { ...permissions, externalOperationIds: [] },
    { ...permissions, skills: [] },
    { ...permissions, administrative: [] },
  ]) {
    const issued = await issue(grants);
    await expect(
      f.external.tests(
        { ...identity, tokenId: issued.tokenId },
        identity.personaId,
        f.draft.skillId,
      ),
    ).rejects.toThrow();
  }
  const issued = await issue(permissions),
    actor = { ...identity, tokenId: issued.tokenId };
  const grantId = randomUUID();
  await db.query(
    "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,$4,'fixture',$5)",
    [
      grantId,
      identity.personaId,
      issued.tokenId,
      JSON.stringify({ ...permissions, externalOperationIds: [] }),
      new Date(now.getTime() + 100000),
    ],
  );
  await expect(
    f.external.tests({ ...actor, grant: { id: grantId } }, identity.personaId, f.draft.skillId),
  ).rejects.toThrow();
  const completeGrantId = randomUUID();
  await db.query(
    "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,$4,'fixture',$5)",
    [
      completeGrantId,
      identity.personaId,
      issued.tokenId,
      JSON.stringify(permissions),
      new Date(now.getTime() + 100000),
    ],
  );
  expect(
    (
      await f.external.tests(
        { ...actor, grant: { id: completeGrantId } },
        identity.personaId,
        f.draft.skillId,
      )
    ).skillId,
  ).toBe(f.draft.skillId);
  await db.query("UPDATE oauth_concessao_v2 SET revoked_at=now() WHERE id=$1", [completeGrantId]);
  await expect(
    f.external.tests(
      { ...actor, grant: { id: completeGrantId } },
      identity.personaId,
      f.draft.skillId,
    ),
  ).rejects.toThrow();
  await expect(f.external.tests(actor, randomUUID(), f.draft.skillId)).rejects.toThrow();
  await expect(f.external.tests(actor, identity.personaId, randomUUID())).rejects.toThrow();
  remoteUnavailable = true;
  await expect(f.external.tests(actor, identity.personaId, f.draft.skillId)).rejects.toThrow();
  remoteUnavailable = false;
  await admin.revokeToken(session, identity.personaId, issued.tokenId);
  await expect(f.external.tests(actor, identity.personaId, f.draft.skillId)).rejects.toThrow();
});

async function actionFixture(
  approval?: "human" | "automatic",
  provider?: Awaited<ReturnType<typeof externalProviderFixture>>,
) {
  const f = await administrator(["gerenciar_integracoes"]),
    l = await integrationLink(f.actor);
  const saved = await setups.complete(l.code, l.csrf, ownerInput, {
    ...integrationInput,
    ...(provider ? { kind: provider.contract.transport.kind } : {}),
  });
  if (!("integrationId" in saved)) throw new Error("integration expected");
  let effects = 0;
  const transport = {
    invoke: vi.fn(async (...args: Parameters<ExternalTransport["invoke"]>) =>
      provider ? provider.adapter.invoke(...args) : { name: "fixture" },
    ),
    executeAction: vi.fn(async (...args: Parameters<ExternalActionTransport["executeAction"]>) => {
      if (provider) return provider.adapter.executeAction(...args);
      await args[4]();
      await args[5]();
      effects++;
      return { name: "fixture" };
    }),
  };
  const external = new PersonaExternalIntegrations(services, administrative, transport);
  const actions = new PersonaExternalActions(services, admin, external, transport);
  const draft = await external.create(session, identity.personaId, {
    slug: "external-action",
    name: "Registrar fixture",
    contract: {
      operationId: randomUUID(),
      integrationId: saved.integrationId,
      purpose: "Ação isolada",
      effect: "acao",
      ...(approval ? { approval } : {}),
      effectDescription: "Criar registro de fixture",
      reconciliation: "Conferir chave da fixture no serviço, sem reenviar",
      transport: { kind: "rest", method: "POST", path: "/write" },
      input: {
        id: { type: "string", required: true, purpose: "Identidade", classification: "livre" },
      },
      output: {
        name: { type: "string", required: true, purpose: "Confirmação", classification: "livre" },
      },
      timeoutMs: 1000,
      maxResponseBytes: 4096,
      ...(provider ? { ...provider.contract, integrationId: saved.integrationId } : {}),
    },
  });
  await catalog.addCase(session, identity.personaId, draft.skillId, {
    required: true,
    content: { name: "Fixture", input: { id: "1" }, expected: { name: "fixture" } },
  });
  await external.runFixtureCases(
    session,
    identity.personaId,
    draft.skillId,
    {
      destination: "https://fixture.example.com",
      credential: { credentialType: "bearer", token: "isolated" },
    },
    transport,
  );
  const preview = await external.preview(
    session,
    identity.personaId,
    draft.skillId,
    reviewDateFixture(),
  );
  const publication = await external.publish(
    session,
    identity.personaId,
    draft.skillId,
    preview.confirmationHash,
  );
  const permissions = {
    ...emptyPermissions,
    externalOperationIds: [draft.operationId],
    skills: [
      {
        skillId: draft.skillId,
        capabilities: publication.package.requiredCapabilities,
        effects: [],
        requireHumanApproval: false,
      },
    ],
  };
  const issued = await admin.issueToken(session, {
    personaId: identity.personaId,
    name: "Ação",
    permissions,
    delegation: emptyPermissions,
    expiresAt: null,
  });
  const consumer = { ...identity, tokenId: issued.tokenId };
  effects = 0;
  transport.executeAction.mockClear();
  return {
    f,
    external,
    actions,
    transport,
    draft,
    publication,
    permissions,
    issued,
    consumer,
    effects: () => effects,
  };
}
it.each(["rest", "mcp_http"] as const)(
  "homologa %s: confirmação perdida, reinício e conciliação TLS sem reenviar",
  async (kind) => {
    const provider = await externalProviderFixture(kind);
    let candidate: Awaited<ReturnType<typeof composePersonaV2>> | undefined;
    const start = () =>
      composePersonaV2(
        testConfig({
          DATABASE_URL: url.toString(),
          PUBLIC_BASE_URL: origin,
          MCP_ENCRYPTION_KEY: "03".repeat(32),
        }),
        { ownerAuth, sourceVerifier, delegationHub: hub, externalTransport: provider.adapter },
      );
    try {
      const f = await actionFixture("automatic", provider);
      const baseline = provider.state.writes;
      candidate = await start();
      const prepared = await mcpCall(
        f.issued.bearer,
        "preparar_acao_externa",
        { skillId: f.draft.skillId, input: { id: randomUUID() } },
        candidate.app,
      );
      expect(prepared.isError).toBe(false);
      const reference = actionRef(prepared.value);
      provider.state.loseResponse = true;
      expect(
        (await mcpCall(f.issued.bearer, "executar_acao_externa", reference, candidate.app)).isError,
      ).toBe(true);
      const unknown = await f.actions.get(f.consumer, reference);
      expect(unknown.state).toBe("resultado_desconhecido");
      await candidate.close();
      candidate = await start();
      const reconciled = await mcpCall(
        f.issued.bearer,
        "conciliar_acao_externa",
        reference,
        candidate.app,
      );
      expect(reconciled.isError).toBe(false);
      expect(reconciled.value).toMatchObject({
        status: "applied_verified",
        reason: "trained_evidence_matches",
        permitsRetry: false,
      });
      const after = await f.actions.get(f.consumer, reference);
      expect(after.receipt).toEqual(unknown.receipt);
      expect(after.state).toBe("resultado_desconhecido");
      expect(after.reconciliation?.id).toBe(reconciled.value.id);
      expect(
        (await mcpCall(f.issued.bearer, "executar_acao_externa", reference, candidate.app)).isError,
      ).toBe(true);
      const rejected = [
        ["absent", "not_unique"],
        ["duplicate", "not_unique"],
        ["partial", "incomplete"],
        ["mismatch", "correlation_mismatch"],
        ["pending", "outcome_unconfirmed"],
        ["invalid", "provider_unavailable"],
      ];
      for (const [mode, reason] of rejected) {
        provider.state.mode = mode!;
        const evidence = await f.actions.reconcile(f.consumer, reference);
        expect(evidence).toMatchObject({ status: "inconclusive", reason, permitsRetry: false });
      }
      provider.state.mode = "normal";
      if (kind === "mcp_http") {
        provider.state.drift = true;
        const reads = provider.state.reads;
        expect(await f.actions.reconcile(f.consumer, reference)).toMatchObject({
          status: "inconclusive",
          reason: "provider_unavailable",
        });
        expect(provider.state.reads).toBe(reads);
        provider.state.drift = false;
      }
      const counts = await db.query(
        "SELECT * FROM external_action_reconciliation_v2 WHERE operacao_id=$1",
        [reference.operationId],
      );
      expect(counts.rowCount).toBe(kind === "rest" ? 7 : 8);
      await expect(
        db.query(
          "UPDATE external_action_reconciliation_v2 SET reason='incomplete' WHERE operacao_id=$1",
          [reference.operationId],
        ),
      ).rejects.toThrow();
      const fake = counts.rows[0]!;
      await expect(
        db.query(
          `INSERT INTO external_action_reconciliation_v2(id,persona_id,operacao_id,publicacao_id,fingerprint,contract_hash,observed_at,status,reason,response_hash)
      VALUES($1,$2,$3,$4,$5,$6,now(),'inconclusive','provider_unavailable',NULL)`,
          [
            randomUUID(),
            identity.personaId,
            reference.operationId,
            f.publication.id,
            "f".repeat(64),
            fake.contract_hash,
          ],
        ),
      ).rejects.toThrow();
      provider.state.beforeRead = async () => {
        await admin.revokeToken(session, identity.personaId, f.issued.tokenId);
      };
      await expect(f.actions.reconcile(f.consumer, reference)).rejects.toThrow();
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM external_action_reconciliation_v2 WHERE operacao_id=$1",
            [reference.operationId],
          )
        ).rows[0].n,
      ).toBe(counts.rowCount);
      expect(provider.state.writes).toBe(baseline + 1);
      expect(provider.state.invalidCredential).toBe(0);
      expect(provider.state.invalidProtocol).toBe(0);
      expect(
        JSON.stringify(
          (
            await db.query("SELECT * FROM audit_v2 WHERE external_action_id=$1", [
              reference.operationId,
            ])
          ).rows,
        ),
      ).not.toContain("provider-secret");
      expect(JSON.stringify(counts.rows)).not.toContain("fixture-external-only");
    } finally {
      await candidate?.close();
      await provider.close();
    }
  },
);
it.each(["rest", "mcp_http"] as const)(
  "runner CLI %s fixa manifesto, limpa fixture e recusa replay ou limpeza incerta",
  async (kind) => {
    const provider = await externalProviderFixture(kind),
      directory = await mkdtemp(join(tmpdir(), "se7e-external-runner-")),
      path = join(directory, "run.json");
    const fixtureDestination = `https://runner-${randomUUID()}.example.com/v1`;
    try {
      const f = await actionFixture("automatic", provider),
        link = await integrationLink(f.f.actor);
      const fixture = await setups.complete(link.code, link.csrf, ownerInput, {
        ...integrationInput,
        kind,
        destination: fixtureDestination,
        token: "isolated",
      });
      if (!("integrationId" in fixture)) throw new Error("Fixture registration expected");
      const details = await f.external.tests(session, identity.personaId, f.draft.skillId);
      const manifest = {
        version: 1,
        runId: randomUUID(),
        personaId: identity.personaId,
        ownerId: details.ownerId,
        skillId: f.draft.skillId,
        revision: details.revision,
        packageHash: details.packageHash,
        casesHash: details.casesHash,
        fixtureIntegrationId: fixture.integrationId,
        fixtureCredentialVersion: 1,
        fixtureDestinationHash: crypto.sha256Hex(fixtureDestination),
        confirmation: "isolated-external-effects",
      };
      const config = testConfig({
        DATABASE_URL: url.toString(),
        PUBLIC_BASE_URL: origin,
        MCP_ENCRYPTION_KEY: "03".repeat(32),
      });
      provider.state.fixtureRunId = manifest.runId;
      await writeFile(
        path,
        JSON.stringify({
          ...manifest,
          fixtureIntegrationId: f.publication.package.training.integrationId,
        }),
      );
      const before = provider.state.writes;
      await expect(executeExternalManifest(path, config, provider.adapter)).rejects.toThrow();
      expect(provider.state.writes).toBe(before);
      await writeFile(path, JSON.stringify(manifest));
      expect(await executeExternalManifest(path, config, provider.adapter)).toMatchObject({
        approved: true,
        state: "passed",
        runId: manifest.runId,
      });
      expect(JSON.parse(await readFile(provider.ledger, "utf8"))).toEqual({});
      expect(provider.state.cleanups).toBe(1);
      expect(provider.state.writes).toBe(before + 1);
      const approved = await f.external.tests(session, identity.personaId, f.draft.skillId);
      expect(approved.requiredApproved).toBe(true);
      expect(approved.reports[0]).toMatchObject({
        runId: manifest.runId,
        current: true,
        approved: true,
        runState: "passed",
      });
      await expect(executeExternalManifest(path, config, provider.adapter)).rejects.toThrow();
      expect(provider.state.writes).toBe(before + 1);
      const changed = await f.external.changeCase(session, identity.personaId, f.draft.skillId, {
        expectedRevision: details.revision,
        required: true,
        content: { name: "Segundo caso", input: { id: "2" }, expected: { name: "fixture" } },
      });
      expect(changed.revision).toBe(details.revision + 1);
      expect(
        (await f.external.tests(session, identity.personaId, f.draft.skillId)).reports.every(
          (r) => !r.current,
        ),
      ).toBe(true);
      await expect(executeExternalManifest(path, config, provider.adapter)).rejects.toThrow();
      const next = await f.external.tests(session, identity.personaId, f.draft.skillId),
        runId = randomUUID();
      provider.state.fixtureRunId = runId;
      provider.state.loseCleanup = true;
      await writeFile(
        path,
        JSON.stringify({
          ...manifest,
          runId,
          revision: next.revision,
          packageHash: next.packageHash,
          casesHash: next.casesHash,
        }),
      );
      expect(await executeExternalManifest(path, config, provider.adapter)).toMatchObject({
        approved: false,
        state: "unknown",
      });
      const writes = provider.state.writes;
      const blockedId = randomUUID();
      provider.state.fixtureRunId = blockedId;
      await writeFile(
        path,
        JSON.stringify({
          ...manifest,
          runId: blockedId,
          revision: next.revision,
          packageHash: next.packageHash,
          casesHash: next.casesHash,
        }),
      );
      await expect(executeExternalManifest(path, config, provider.adapter)).rejects.toThrow();
      expect(provider.state.writes).toBe(writes);
      expect(
        (await f.external.tests(session, identity.personaId, f.draft.skillId)).requiredApproved,
      ).toBe(false);
      await expect(
        db.query("UPDATE external_runner_v2 SET estado='passed' WHERE id=$1", [runId]),
      ).rejects.toThrow();
      expect(
        JSON.stringify(
          (await db.query("SELECT * FROM audit_v2 WHERE persona_id=$1", [identity.personaId])).rows,
        ),
      ).not.toContain("isolated");
    } finally {
      await provider.close();
      await rm(directory, { recursive: true });
    }
  },
);
it("ownership recusado impede casos e cleanup externo, mantendo rodada bloqueada", async () => {
  const provider = await externalProviderFixture("rest");
  try {
    const f = await actionFixture("automatic", provider),
      link = await integrationLink(f.f.actor),
      destination = `https://fixture-${randomUUID()}.example.com`;
    const fixture = await setups.complete(link.code, link.csrf, ownerInput, {
      ...integrationInput,
      destination,
      token: "isolated",
    });
    if (!("integrationId" in fixture)) throw new Error("Fixture expected");
    const details = await f.external.tests(session, identity.personaId, f.draft.skillId),
      runId = randomUUID();
    provider.state.fixtureRunId = runId;
    provider.state.invalidOwnership = true;
    const before = provider.state.writes;
    const report = await f.external.runOperatorFixtureCases(
      {
        version: 1,
        runId,
        personaId: identity.personaId,
        ownerId: details.ownerId,
        skillId: f.draft.skillId,
        revision: details.revision,
        packageHash: details.packageHash,
        casesHash: details.casesHash,
        fixtureIntegrationId: fixture.integrationId,
        fixtureCredentialVersion: 1,
        fixtureDestinationHash: crypto.sha256Hex(destination),
        confirmation: "isolated-external-effects",
      },
      provider.adapter,
      new ExternalHttpsFixtureControl(provider.adapter),
    );
    expect(report).toMatchObject({ approved: false, state: "unknown" });
    expect(provider.state.writes).toBe(before);
    expect(provider.state.cleanups).toBe(0);
  } finally {
    await provider.close();
  }
});
it("casos externos usam CAS, relatórios isolados e rotas sem execução/aprovação técnica", async () => {
  const f = await actionFixture("automatic"),
    details = await f.external.tests(session, identity.personaId, f.draft.skillId);
  const content = { name: "CAS", input: { id: "new" }, expected: { name: "fixture" } };
  const outcomes = await Promise.allSettled(
    [1, 2].map(() =>
      f.external.changeCase(session, identity.personaId, f.draft.skillId, {
        expectedRevision: details.revision,
        required: true,
        content,
      }),
    ),
  );
  expect(outcomes.filter((v) => v.status === "fulfilled")).toHaveLength(1);
  await expect(
    f.external.changeCase(session, identity.personaId, f.draft.skillId, {
      expectedRevision: details.revision + 1,
      required: true,
      content: { ...content, input: { id: "x", password: "secret" } },
    }),
  ).rejects.toThrow();
  const login = await request(runtime.app)
    .post("/api/admin/login")
    .set("Host", "mcp.fixture.test")
    .set("Origin", origin)
    .send(ownerInput);
  const cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  const root = `/api/admin/personas/${identity.personaId}/integracoes/skills`;
  const response = await request(runtime.app)
    .get(`${root}/${f.draft.skillId}/testes`)
    .set("Host", "mcp.fixture.test")
    .set("Origin", origin)
    .set("x-csrf-token", login.body.csrfToken)
    .set("Cookie", cookie);
  expect(response.status).toBe(200);
  expect(response.body.requiredApproved).toBe(false);
  expect(response.body.cases).toHaveLength(2);
  expect(JSON.stringify(response.body)).not.toContain(integrationInput.token);
  await db.query(
    `INSERT INTO relatorio_teste_v2(id,persona_id,skill_id,revisao,pacote_hash,casos_hash,runner_id,aprovado,resultados)
    SELECT gen_random_uuid(),$1,$2,$3,$4,$5,'persona-external-fixtures-v1',false,'[]'::jsonb FROM generate_series(1,52)`,
    [identity.personaId, f.draft.skillId, details.revision, details.packageHash, details.casesHash],
  );
  const firstPage = await f.external.tests(session, identity.personaId, f.draft.skillId);
  expect(firstPage.reports).toHaveLength(50);
  expect(firstPage.nextCursor).not.toBeNull();
  const secondPage = await f.external.tests(
    session,
    identity.personaId,
    f.draft.skillId,
    firstPage.nextCursor!,
  );
  expect(secondPage.reports.length).toBeGreaterThan(0);
  expect(secondPage.reports.every((r) => !firstPage.reports.some((p) => p.id === r.id))).toBe(true);
  expect(
    (
      await request(runtime.app)
        .post(`${root}/${f.draft.skillId}/casos`)
        .set("Host", "mcp.fixture.test")
        .set("Origin", origin)
        .set("Cookie", cookie)
        .send({ expectedRevision: details.revision + 1, required: true, content })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(runtime.app)
        .post(`${root}/${f.draft.skillId}/executar-testes`)
        .set("Host", "mcp.fixture.test")
        .set("Origin", origin)
        .set("Cookie", cookie)
        .set("x-csrf-token", login.body.csrfToken)
        .send({ approved: true })
    ).status,
  ).toBe(404);
  const added = outcomes.find((v) => v.status === "fulfilled");
  if (added?.status !== "fulfilled") throw new Error("CAS case expected");
  await f.external.changeCase(session, identity.personaId, f.draft.skillId, {
    expectedRevision: details.revision + 1,
    id: added.value.case.id,
    remove: true,
    required: true,
    content,
  });
  const history = await db.query("SELECT * FROM external_case_history_v2 WHERE caso_id=$1", [
    added.value.case.id,
  ]);
  expect(history.rowCount).toBe(1);
  expect(history.rows[0].caso).toEqual(content);
  await expect(
    db.query("DELETE FROM external_case_history_v2 WHERE caso_id=$1", [added.value.case.id]),
  ).rejects.toThrow();
  clientId = "other-owner";
  await expect(f.external.tests(session, identity.personaId, f.draft.skillId)).rejects.toThrow();
});
it("contrato antigo não ganha conciliação e preparação não enviada não aceita prova", async () => {
  const f = await actionFixture("automatic"),
    a = await f.actions.prepare(f.consumer, { skillId: f.draft.skillId, input: { id: "1" } });
  await expect(f.actions.reconcile(f.consumer, actionRef(a))).rejects.toThrow();
  await f.actions.execute(f.consumer, actionRef(a));
  await expect(f.actions.reconcile(f.consumer, actionRef(a))).rejects.toThrow();
  expect(f.transport.invoke).not.toHaveBeenCalled();
});
it("MCP prepara ação; navegador aprova conteúdo exato e CAS permite um único envio", async () => {
  const f = await actionFixture();
  await expect(
    f.actions.prepare(f.consumer, {
      skillId: f.draft.skillId,
      expectedPublicationId: randomUUID(),
      input: { id: "1" },
    }),
  ).rejects.toThrow("publicação mudou");
  expect(f.effects()).toBe(0);
  const prepared = await mcpCall(f.issued.bearer, "preparar_acao_externa", {
    skillId: f.draft.skillId,
    expectedPublicationId: f.publication.id,
    input: { id: "1" },
  });
  expect(prepared.isError).toBe(false);
  const reference = prepared.value as { operationId: string; fingerprint: string; state: string };
  expect(reference.state).toBe("aprovacao_pendente");
  expect(f.effects()).toBe(0);
  await expect(f.actions.execute(f.consumer, actionRef(reference))).rejects.toThrow();
  const login = await request(runtime.app)
    .post("/api/admin/login")
    .set("Host", "mcp.fixture.test")
    .set("Origin", origin)
    .send(ownerInput);
  expect(login.status).toBe(200);
  const cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  const root = `/api/admin/personas/${identity.personaId}/external-actions`;
  expect(
    (
      await request(runtime.app)
        .get(`${root}/${reference.operationId}`)
        .set("Host", "mcp.fixture.test")
        .set("Origin", origin)
        .set("Cookie", cookie)
        .set("x-csrf-token", login.body.csrfToken)
    ).body.input,
  ).toEqual({ id: "1" });
  const approve = () =>
    request(runtime.app)
      .post(`${root}/approve`)
      .set("Host", "mcp.fixture.test")
      .set("Origin", origin)
      .set("Cookie", cookie);
  expect((await approve().send(reference)).status).toBe(403);
  expect(
    (
      await approve()
        .set("x-csrf-token", login.body.csrfToken)
        .send({ ...reference, fingerprint: "f".repeat(64) })
    ).status,
  ).not.toBe(200);
  expect(
    (
      await approve()
        .set("x-csrf-token", login.body.csrfToken)
        .send({ operationId: reference.operationId, fingerprint: reference.fingerprint })
    ).status,
  ).toBe(200);
  const outcomes = await Promise.allSettled([
    f.actions.execute(f.consumer, actionRef(reference)),
    f.actions.execute(f.consumer, actionRef(reference)),
  ]);
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(f.effects()).toBe(1);
  const result = await f.actions.get(f.consumer, actionRef(reference));
  expect(result.state).toBe("concluida");
  expect(result.data).toEqual({ name: "fixture" });
  expect(result.receipt?.provesBusinessOutcome).toBe(false);
  expect(
    (
      await mcpCall(f.issued.bearer, "obter_acao_externa", {
        operationId: reference.operationId,
        fingerprint: reference.fingerprint,
      })
    ).isError,
  ).toBe(false);
  await expect(f.actions.execute(f.consumer, actionRef(reference))).rejects.toThrow();
  expect(f.effects()).toBe(1);
  const stored = (
    await db.query("SELECT payload_enc,result_enc FROM external_action_v2 WHERE id=$1", [
      reference.operationId,
    ])
  ).rows[0];
  expect(stored.payload_enc).not.toContain('"input"');
  expect(stored.result_enc).not.toContain("fixture");
  const audit = (
    await db.query("SELECT * FROM audit_v2 WHERE external_action_id=$1", [reference.operationId])
  ).rows;
  expect(audit.some((r) => r.responsavel_id)).toBe(true);
  expect(JSON.stringify(audit)).not.toContain('"input"');
});
it("retenção externa mantém leitura autorizada de metadata, sem fabricar dados nem reexecutar", async () => {
  const f = await actionFixture("automatic");
  const a = await f.actions.prepare(f.consumer, { skillId: f.draft.skillId, input: { id: "1" } });
  await f.actions.execute(f.consumer, actionRef(a));
  for (const days of [2, 91]) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      // Only fixture operator ages protected metadata, with an exclusive table lock.
      await c.query("ALTER TABLE external_action_v2 DISABLE TRIGGER a_operation_retention");
      await c.query(
        "UPDATE external_action_v2 SET terminal_at=clock_timestamp()-$2*interval '1 day',payload_purge_at=clock_timestamp()-$2*interval '1 day'+interval '24 hours',versao=versao+1 WHERE id=$1",
        [a.operationId, days],
      );
      await c.query("ALTER TABLE external_action_v2 ENABLE TRIGGER a_operation_retention");
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
    await new PersonaRetentionWorker(
      new PostgresPersonaRetentionWorker(db),
      randomUUID(),
      () => new Date(),
    ).runOnce();
    const result = await f.actions.get(f.consumer, actionRef(a));
    expect(result).toMatchObject({ state: "concluida", data: null, dataAvailability: "purged" });
    expect(result.retention?.payloadPurgedAt).toBeTruthy();
    const review = await f.actions.review(session, identity.personaId, a.operationId);
    expect(review).toMatchObject({ contract: null, input: null, limits: null });
    if (days === 91) {
      expect(result.receipt).toBeNull();
      expect(result.retention?.receiptPurgedAt).toBeTruthy();
    }
    await expect(f.actions.execute(f.consumer, actionRef(a))).rejects.toThrow();
  }
  expect(f.transport.executeAction).toHaveBeenCalledTimes(1);
  await db.query("UPDATE persona_token SET revoked_at=now() WHERE id=$1", [f.consumer.tokenId]);
  await expect(f.actions.get(f.consumer, actionRef(a))).rejects.toThrow();
});
it.each(["bearer", "api_key", "basic"] as const)(
  "cadastro direto de integração %s cifra credenciais, isola persona e recusa replay",
  async (credentialType) => {
    const management = new PersonaIntegrationManagement(services, admin, administrative);
    const credential =
      credentialType === "bearer"
        ? { credentialType, token: "private-create-fixture" }
        : credentialType === "api_key"
          ? { credentialType, header: "X-Fixture-Key", apiKey: "private-create-fixture" }
          : { credentialType, username: "technical", password: "private-create-fixture" };
    const input = {
      requestId: randomUUID(),
      confirmed: "create",
      owner: ownerInput,
      credential,
      registration: {
        name: "Nova conexão",
        kind: "mcp_http",
        destination: "https://isolated.example.com/mcp",
      },
    };
    const attempts = await Promise.allSettled([
      management.create(session, identity.personaId, input),
      management.create(session, identity.personaId, input),
    ]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const created = attempts.find((r) => r.status === "fulfilled")!;
    expect(created).toMatchObject({
      value: { id: input.requestId, active: false, version: 1, credentialsReturned: false },
    });
    const row = (await db.query("SELECT * FROM integracao WHERE id=$1", [input.requestId])).rows[0];
    expect(row).toMatchObject({
      persona_id: identity.personaId,
      ativa: false,
      credencial_versao: 1,
    });
    expect(row.credencial_enc).not.toContain("private-create-fixture");
    expect(JSON.parse(crypto.decrypt(row.credencial_enc))).toMatchObject({
      registration: input.registration,
      credential,
    });
    await expect(
      management.create(session, identity.personaId, {
        ...input,
        registration: { ...input.registration, name: "Reaproveitado" },
      }),
    ).rejects.toMatchObject({ code: "OPERATION_CONFLICT" });
    expect(
      (await management.list(session, identity.personaId)).find((i) => i.id === input.requestId)
        ?.name,
    ).toBe("Nova conexão");
    const audit = (
      await db.query("SELECT * FROM audit_v2 WHERE integracao_id=$1", [input.requestId])
    ).rows;
    expect(audit.filter((a) => a.evento === "integration.created")).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain("private-create-fixture");
    expect(JSON.stringify(audit)).not.toContain(ownerInput.password);
    expect(JSON.stringify(await management.list(session, identity.personaId))).not.toContain(
      "private-create-fixture",
    );
    expect(
      (
        await db.query("SELECT count(*) FROM integracao_operacao WHERE persona_id=$1", [
          identity.personaId,
        ])
      ).rows[0].count,
    ).toBe("0");
    expect(
      (await db.query("SELECT count(*) FROM skill_v2 WHERE persona_id=$1", [identity.personaId]))
        .rows[0].count,
    ).toBe("0");
    // Different Client ownership is checked from the hub, never from the email.
    clientId = "other-client";
    const otherSession = await admin.login("another@fixture.test", "fixture");
    await expect(
      management.create(otherSession.sessionId, identity.personaId, {
        ...input,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow();
    clientId = "owner-fixture";
  },
);
it("cadastro direto exige o mesmo Client reautenticado e autoridade vigente antes do commit", async () => {
  const management = new PersonaIntegrationManagement(services, admin, administrative);
  const input = {
    requestId: randomUUID(),
    confirmed: "create",
    owner: ownerInput,
    registration: {
      name: "REST privada",
      kind: "rest",
      destination: "https://isolated.example.com",
    },
    credential: { credentialType: "bearer", token: "private-create-fixture" },
  };
  ownerAuth.profile
    .mockResolvedValueOnce({ clientId, active: true })
    .mockResolvedValueOnce({ clientId, active: true })
    .mockResolvedValueOnce({ clientId: "other-client", active: true });
  await expect(management.create(session, identity.personaId, input)).rejects.toThrow(
    "mesmo responsável",
  );
  ownerAuth.login.mockImplementationOnce(async () => {
    await db.query("UPDATE persona SET ativa=false WHERE id=$1", [identity.personaId]);
    return { accessToken: "fixture-jwt-memory-only" };
  });
  await expect(management.create(session, identity.personaId, input)).rejects.toThrow();
  expect(
    (await db.query("SELECT id FROM integracao WHERE id=$1", [input.requestId])).rows,
  ).toHaveLength(0);
});
it("auditoria recusada reverte todo o cadastro direto e conserva a identidade de tentativa", async () => {
  const management = new PersonaIntegrationManagement(services, admin, administrative);
  const input = {
    requestId: randomUUID(),
    confirmed: "create",
    owner: ownerInput,
    registration: { name: "Fixture", kind: "rest", destination: "https://isolated.example.com" },
    credential: { credentialType: "bearer", token: "private-create-fixture" },
  };
  await db.query(
    `CREATE FUNCTION fixture_fail_creation_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.evento='integration.created' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$`,
  );
  await db.query(
    "CREATE TRIGGER fixture_creation_audit BEFORE INSERT ON audit_v2 FOR EACH ROW EXECUTE FUNCTION fixture_fail_creation_audit()",
  );
  try {
    await expect(management.create(session, identity.personaId, input)).rejects.toThrow(
      "fixture audit failure",
    );
    expect(
      (await db.query("SELECT id FROM integracao WHERE id=$1", [input.requestId])).rows,
    ).toHaveLength(0);
  } finally {
    await db.query("DROP TRIGGER fixture_creation_audit ON audit_v2");
    await db.query("DROP FUNCTION fixture_fail_creation_audit()");
  }
  expect(await management.create(session, identity.personaId, input)).toMatchObject({
    id: input.requestId,
    active: false,
  });
});
it("HTTP de cadastro direto exige sessão, CSRF, Origin, confirmação e contrato seguros", async () => {
  const login = await request(runtime.app)
    .post("/api/admin/login")
    .set("Host", "mcp.fixture.test")
    .set("Origin", origin)
    .send(ownerInput);
  expect(login.status).toBe(200);
  const cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  const root = `/api/admin/personas/${identity.personaId}/integracoes/gestao`;
  const input = {
    requestId: randomUUID(),
    confirmed: "create",
    owner: ownerInput,
    registration: {
      name: "HTTP fixture",
      kind: "rest",
      destination: "https://isolated.example.com",
    },
    credential: { credentialType: "bearer", token: "private-http-create" },
  };
  const post = (csrf = true, withCookie = true, requestOrigin = origin) => {
    const r = request(runtime.app)
      .post(root)
      .set("Host", "mcp.fixture.test")
      .set("Origin", requestOrigin);
    if (withCookie) r.set("Cookie", cookie);
    if (csrf) r.set("X-CSRF-Token", login.body.csrfToken);
    return r;
  };
  expect((await post(false).send(input)).status).toBe(403);
  expect((await post(true, false).send(input)).status).toBe(403);
  expect((await post(true, true, "https://other.example.com").send(input)).status).toBe(403);
  for (const registration of [
    { ...input.registration, destination: "http://isolated.example.com" },
    { ...input.registration, destination: "https://secret@isolated.example.com" },
    {
      ...input.registration,
      destination: "https://isolated.example.com?token=private-http-create",
    },
  ]) {
    const reply = await post().send({ ...input, registration });
    expect(reply.status).toBe(400);
    expect(reply.text).not.toContain("private-http-create");
  }
  expect((await post().send({ ...input, confirmed: false })).status).toBe(400);
  const reply = await post().send(input);
  expect(reply.status).toBe(201);
  expect(reply.body).toEqual({
    id: input.requestId,
    version: 1,
    active: false,
    credentialsReturned: false,
  });
  expect(reply.text).not.toContain("private-http-create");
  expect((await post().send(input)).status).toBe(409);
});
it("gestão suspende com CAS, bloqueia novas publicações e preserva journal desconhecido", async () => {
  const f = await actionFixture("automatic"),
    management = new PersonaIntegrationManagement(services, admin, administrative),
    id = f.publication.package.training.integrationId;
  const draft = await f.external.create(session, identity.personaId, {
    slug: "pending-preview",
    name: "Revisão pendente",
    contract: JSON.parse(
      JSON.stringify({
        ...f.publication.package.training,
        effect: "consulta",
        approval: undefined,
        effectDescription: undefined,
        reconciliation: undefined,
        transport: { kind: "rest", method: "GET", path: "/lookup" },
      }),
    ),
  });
  await catalog.addCase(session, identity.personaId, draft.skillId, {
    required: true,
    content: { name: "Fixture", input: { id: "1" }, expected: { name: "fixture" } },
  });
  await f.external.runFixtureCases(
    session,
    identity.personaId,
    draft.skillId,
    {
      destination: "https://isolated.example.com",
      credential: { credentialType: "bearer", token: "fixture" },
    },
    f.transport,
  );
  const pendingPreview = await f.external.preview(
    session,
    identity.personaId,
    draft.skillId,
    reviewDateFixture(),
  );
  const a = await f.actions.prepare(f.consumer, { skillId: f.draft.skillId, input: { id: "1" } });
  f.transport.executeAction.mockImplementationOnce(async (...args) => {
    await args[4]();
    await args[5]();
    throw new Error("lost response");
  });
  await expect(f.actions.execute(f.consumer, actionRef(a))).rejects.toThrow();
  const before = await db.query(
    "SELECT estado,fingerprint,payload_enc,comprovante FROM external_action_v2 WHERE id=$1",
    [a.operationId],
  );
  const review = await management.review(session, identity.personaId, id);
  expect(review.pendingOperations).toBe(1);
  expect(review.publications).toContainEqual(
    expect.objectContaining({ publicationId: f.publication.id }),
  );
  expect(JSON.stringify(review)).not.toContain(integrationInput.token);
  const confirmation = {
    expectedVersion: review.connection.managementVersion,
    fingerprint: review.fingerprint,
    confirmed: true,
  };
  const results = await Promise.allSettled([
    management.state(session, identity.personaId, id, true, confirmation),
    management.state(session, identity.personaId, id, true, confirmation),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await f.external.list(f.consumer)).toEqual([]);
  expect(
    (await management.review(session, identity.personaId, id)).connection.suspendedAt,
  ).not.toBeNull();
  await expect(
    f.external.create(session, identity.personaId, {
      slug: "blocked",
      name: "Bloqueada",
      contract: f.publication.package.training,
    }),
  ).rejects.toThrow();
  const suspended = await management.review(session, identity.personaId, id);
  await management.state(session, identity.personaId, id, false, {
    expectedVersion: suspended.connection.managementVersion,
    fingerprint: suspended.fingerprint,
    confirmed: true,
  });
  expect(await f.external.list(f.consumer)).toEqual([]);
  expect((await management.review(session, identity.personaId, id)).connection).toMatchObject({
    active: false,
    suspendedAt: null,
  });
  await expect(
    f.external.publish(session, identity.personaId, draft.skillId, pendingPreview.confirmationHash),
  ).rejects.toThrow();
  await expect(f.actions.execute(f.consumer, actionRef(a))).rejects.toThrow();
  expect(
    (
      await db.query(
        "SELECT estado,fingerprint,payload_enc,comprovante FROM external_action_v2 WHERE id=$1",
        [a.operationId],
      )
    ).rows,
  ).toEqual(before.rows);
  expect(f.transport.executeAction).toHaveBeenCalledTimes(1);
  const other = await admin.createPersona(session, {
    name: "Outra",
    specialty: "Fixture",
    instructions: "Isolar",
  });
  await expect(management.review(session, other.id, id)).rejects.toThrow();
});
it.each(["bearer", "api_key", "basic"] as const)(
  "rotação de integração %s exige mesmo Client, fixa destino e não reativa operações",
  async (kind) => {
    const f = await actionFixture("automatic"),
      management = new PersonaIntegrationManagement(services, admin, administrative),
      id = f.publication.package.training.integrationId;
    const review = await management.review(session, identity.personaId, id);
    const credential =
      kind === "bearer"
        ? { credentialType: kind, token: "new-private-fixture" }
        : kind === "api_key"
          ? { credentialType: kind, header: "X-Fixture-Key", apiKey: "new-private-fixture" }
          : { credentialType: kind, username: "fixture", password: "new-private-fixture" };
    const input = {
      expectedVersion: review.connection.managementVersion,
      fingerprint: review.fingerprint,
      confirmed: true,
      owner: ownerInput,
      credential,
    };
    ownerAuth.profile
      .mockResolvedValueOnce({ clientId, active: true })
      .mockResolvedValueOnce({ clientId: "other", active: true });
    await expect(management.rotate(session, identity.personaId, id, input)).rejects.toThrow(
      "mesmo responsável",
    );
    expect((await management.review(session, identity.personaId, id)).connection.version).toBe(1);
    const results = await Promise.allSettled([
      management.rotate(session, identity.personaId, id, input),
      management.rotate(session, identity.personaId, id, input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const current = await management.review(session, identity.personaId, id);
    expect(current.connection).toMatchObject({
      active: false,
      version: 2,
      destination: review.connection.destination,
      kind: review.connection.kind,
    });
    expect(await f.external.list(f.consumer)).toEqual([]);
    const row = await db.query<{ credencial_enc: string }>(
      "SELECT credencial_enc FROM integracao WHERE id=$1",
      [id],
    );
    expect(JSON.parse(crypto.decrypt(row.rows[0]!.credencial_enc)).credential).toEqual(credential);
    const audit = await db.query("SELECT * FROM audit_v2 WHERE integracao_id=$1", [id]);
    expect(JSON.stringify(audit.rows)).not.toContain("new-private-fixture");
    expect(JSON.stringify(current)).not.toContain("new-private-fixture");
    const suspended = await management.state(session, identity.personaId, id, true, {
      expectedVersion: current.connection.managementVersion,
      fingerprint: current.fingerprint,
      confirmed: true,
    });
    expect(suspended.suspended).toBe(true);
    const next = await management.review(session, identity.personaId, id);
    await management.rotate(session, identity.personaId, id, {
      ...input,
      expectedVersion: next.connection.managementVersion,
      fingerprint: next.fingerprint,
    });
    expect((await management.review(session, identity.personaId, id)).connection).toMatchObject({
      active: false,
      version: 3,
      suspendedAt: next.connection.suspendedAt,
    });
  },
);
it("auditoria recusada reverte suspensão e rotação da integração", async () => {
  const f = await actionFixture("automatic"),
    management = new PersonaIntegrationManagement(services, admin, administrative),
    id = f.publication.package.training.integrationId;
  const before = await db.query("SELECT * FROM integracao WHERE id=$1", [id]);
  const review = await management.review(session, identity.personaId, id),
    input = {
      expectedVersion: review.connection.managementVersion,
      fingerprint: review.fingerprint,
      confirmed: true,
    };
  await db.query(
    `CREATE FUNCTION fixture_fail_management_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.evento IN ('integration.suspended','integration.credential_rotated') THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$`,
  );
  await db.query(
    "CREATE TRIGGER fixture_management_audit BEFORE INSERT ON audit_v2 FOR EACH ROW EXECUTE FUNCTION fixture_fail_management_audit()",
  );
  try {
    await expect(management.state(session, identity.personaId, id, true, input)).rejects.toThrow(
      "fixture audit failure",
    );
    await expect(
      management.rotate(session, identity.personaId, id, {
        ...input,
        owner: ownerInput,
        credential: { credentialType: "bearer", token: "fixture-new" },
      }),
    ).rejects.toThrow("fixture audit failure");
    expect((await db.query("SELECT * FROM integracao WHERE id=$1", [id])).rows).toEqual(
      before.rows,
    );
    expect((await management.review(session, identity.personaId, id)).fingerprint).toBe(
      review.fingerprint,
    );
    expect(await f.external.list(f.consumer)).toHaveLength(1);
  } finally {
    await db.query("DROP TRIGGER fixture_management_audit ON audit_v2");
    await db.query("DROP FUNCTION fixture_fail_management_audit()");
  }
});
it("perda de confirmação, reinício e duplicata preservam desconhecido sem reenvio", async () => {
  const f = await actionFixture("automatic");
  const a = await f.actions.prepare(f.consumer, { skillId: f.draft.skillId, input: { id: "1" } });
  f.transport.executeAction.mockImplementationOnce(async (...args) => {
    await args[4]();
    await args[5]();
    throw new Error("lost response");
  });
  await expect(f.actions.execute(f.consumer, actionRef(a))).rejects.toThrow();
  expect((await f.actions.get(f.consumer, actionRef(a))).state).toBe("resultado_desconhecido");
  await expect(f.actions.execute(f.consumer, actionRef(a))).rejects.toThrow();
  expect(f.transport.executeAction).toHaveBeenCalledTimes(1);
  const pending = await f.actions.prepare(f.consumer, {
    skillId: f.draft.skillId,
    input: { id: "2" },
  });
  await repository.transaction(
    { personaIds: [identity.personaId], tokenIds: [f.consumer.tokenId] },
    async (tx) => {
      const row = await tx.external!.actions.find(identity.personaId, pending.operationId);
      await tx.external!.actions.save(
        { ...row!, state: "executando", version: row!.version + 1, claimedAt: now },
        row!.version,
      );
    },
  );
  now = new Date(now.getTime() + 7000);
  const restarted = new PersonaExternalActions(services, admin, f.external, f.transport);
  expect((await restarted.get(f.consumer, actionRef(pending))).state).toBe(
    "resultado_desconhecido",
  );
  await expect(restarted.execute(f.consumer, actionRef(pending))).rejects.toThrow();
  expect(f.transport.executeAction).toHaveBeenCalledTimes(1);
});
it("revogação após efeito conserva receipt e recusa entrega; antes do envio impede claim", async () => {
  const f = await actionFixture("automatic");
  const a = await f.actions.prepare(f.consumer, { skillId: f.draft.skillId, input: { id: "1" } });
  f.transport.executeAction.mockImplementationOnce(async (...args) => {
    await args[4]();
    await args[5]();
    await admin.revokeToken(session, identity.personaId, f.issued.tokenId);
    return { name: "private-output" };
  });
  await expect(f.actions.execute(f.consumer, actionRef(a))).rejects.toThrow();
  const review = await f.actions.review(session, identity.personaId, a.operationId);
  expect(review.state).toBe("concluida");
  expect(review.receipt?.responseHash).toBeTruthy();
  expect(review).not.toHaveProperty("data");
  await expect(f.actions.get(f.consumer, actionRef(a))).rejects.toThrow();
  const next = await admin.issueToken(session, {
    personaId: identity.personaId,
    name: "Next",
    permissions: f.permissions,
    delegation: emptyPermissions,
    expiresAt: null,
  });
  const actor = { ...identity, tokenId: next.tokenId },
    b = await f.actions.prepare(actor, { skillId: f.draft.skillId, input: { id: "2" } });
  f.transport.executeAction.mockImplementationOnce(async (...args) => {
    await admin.revokeToken(session, identity.personaId, next.tokenId);
    await args[4]();
    await args[5]();
    return { name: "must-not-send" };
  });
  await expect(f.actions.execute(actor, actionRef(b))).rejects.toThrow();
  expect((await f.actions.review(session, identity.personaId, b.operationId)).state).toBe(
    "preparada",
  );
});
it("expiração, cancelamento, rotação e aprovação adicional impedem envio indevido", async () => {
  const f = await actionFixture("automatic");
  const extra = await admin.issueToken(session, {
    personaId: identity.personaId,
    name: "Approval",
    permissions: {
      ...f.permissions,
      skills: [{ ...f.permissions.skills[0]!, requireHumanApproval: true }],
    },
    delegation: emptyPermissions,
    expiresAt: null,
  });
  const actor = { ...identity, tokenId: extra.tokenId };
  const pending = await f.actions.prepare(actor, { skillId: f.draft.skillId, input: { id: "1" } });
  expect(pending.state).toBe("aprovacao_pendente");
  await expect(f.actions.execute(actor, actionRef(pending))).rejects.toThrow();
  const cancelled = await f.actions.cancel(actor, actionRef(pending));
  expect(cancelled.state).toBe("cancelada");
  await expect(f.actions.execute(actor, actionRef(pending))).rejects.toThrow();
  const expired = await f.actions.prepare(f.consumer, {
    skillId: f.draft.skillId,
    input: { id: "2" },
  });
  now = new Date(now.getTime() + 16 * 60000);
  expect((await f.actions.get(f.consumer, actionRef(expired))).state).toBe("expirada");
  await expect(f.actions.execute(f.consumer, actionRef(expired))).rejects.toThrow();
  now = new Date();
  const a = await f.actions.prepare(f.consumer, { skillId: f.draft.skillId, input: { id: "3" } });
  const rotation = await integrationLink(f.f.actor, {
    id: f.publication.package.training.integrationId,
    version: 1,
  });
  await setups.complete(rotation.code, rotation.csrf, ownerInput, {
    credentialType: "bearer",
    token: "fixture-next",
    confirmed: "save",
  });
  await expect(f.actions.approve(session, identity.personaId, actionRef(a))).rejects.toThrow();
  await expect(f.actions.execute(f.consumer, actionRef(a))).rejects.toThrow();
  expect(f.transport.executeAction).not.toHaveBeenCalled();
});
it("journal e aprovação externos recusam alteração do conteúdo e ressurreição no banco", async () => {
  const f = await actionFixture();
  const a = await f.actions.prepare(f.consumer, { skillId: f.draft.skillId, input: { id: "1" } });
  await expect(
    db.query("UPDATE external_action_v2 SET fingerprint=$2,versao=versao+1 WHERE id=$1", [
      a.operationId,
      "a".repeat(64),
    ]),
  ).rejects.toThrow();
  await expect(
    db.query("UPDATE external_action_v2 SET payload_enc='changed',versao=versao+1 WHERE id=$1", [
      a.operationId,
    ]),
  ).rejects.toThrow();
  const owner = (
    await db.query<{ responsavel_id: string }>("SELECT responsavel_id FROM persona WHERE id=$1", [
      identity.personaId,
    ])
  ).rows[0]!.responsavel_id;
  await expect(
    db.query(
      "INSERT INTO external_action_approval_v2(persona_id,operacao_id,responsavel_id,fingerprint,expires_at) VALUES($1,$2,$3,$4,$5)",
      [identity.personaId, a.operationId, owner, "b".repeat(64), a.expiresAt],
    ),
  ).rejects.toThrow();
  await expect(f.actions.approve(session, randomUUID(), actionRef(a))).rejects.toThrow();
  await f.actions.approve(session, identity.personaId, actionRef(a));
  active = false;
  await expect(f.actions.approve(session, identity.personaId, actionRef(a))).rejects.toThrow();
  active = true;
  f.transport.executeAction.mockImplementationOnce(async (...args) => {
    await args[4]();
    await args[5]();
    throw new Error("confirmation lost");
  });
  await expect(f.actions.execute(f.consumer, actionRef(a))).rejects.toThrow();
  await expect(
    db.query("UPDATE external_action_v2 SET estado='aprovada',versao=versao+1 WHERE id=$1", [
      a.operationId,
    ]),
  ).rejects.toThrow();
  await expect(
    db.query("UPDATE external_action_v2 SET comprovante='{}',versao=versao+1 WHERE id=$1", [
      a.operationId,
    ]),
  ).rejects.toThrow();
  expect((await f.actions.get(f.consumer, actionRef(a))).state).toBe("resultado_desconhecido");
});
it("ação intersecta OAuth e refresh não estende preparação ou troca sua origem", async () => {
  const f = await actionFixture("automatic"),
    grantId = randomUUID(),
    deniedId = randomUUID();
  for (const [id, permissions] of [
    [grantId, f.permissions],
    [deniedId, { ...f.permissions, externalOperationIds: [] }],
  ] as const)
    await db.query(
      "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,$4,'fixture',$5)",
      [
        id,
        identity.personaId,
        f.issued.tokenId,
        JSON.stringify(permissions),
        new Date(now.getTime() + 3600000),
      ],
    );
  await expect(
    f.actions.prepare(
      { ...f.consumer, grant: { id: deniedId } },
      { skillId: f.draft.skillId, input: { id: "1" } },
    ),
  ).rejects.toThrow();
  const original = { ...f.consumer, grant: { id: grantId, expiresAt: now.getTime() + 10000 } };
  const a = await f.actions.prepare(original, { skillId: f.draft.skillId, input: { id: "1" } });
  expect(a.expiresAt.getTime()).toBe(original.grant.expiresAt);
  const unexecuted = await f.actions.prepare(original, {
    skillId: f.draft.skillId,
    input: { id: "2" },
  });
  await f.actions.execute(original, actionRef(a));
  now = new Date(now.getTime() + 11000);
  const refreshed = { ...original, grant: { id: grantId, expiresAt: now.getTime() + 15000 } };
  expect((await f.actions.get(refreshed, actionRef(a))).state).toBe("concluida");
  await expect(f.actions.execute(refreshed, actionRef(unexecuted))).rejects.toThrow();
  await expect(f.actions.get(f.consumer, actionRef(a))).rejects.toThrow();
  await db.query("UPDATE oauth_concessao_v2 SET revoked_at=$2 WHERE id=$1", [grantId, now]);
  await expect(f.actions.get(refreshed, actionRef(a))).rejects.toThrow();
  expect(f.effects()).toBe(1);
});
