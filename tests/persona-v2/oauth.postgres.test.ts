import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PersonaOAuth } from "../../src/application/persona-v2/oauth.js";
import { PostgresPersonaOAuthStore } from "../../src/infrastructure/persistence/persona-v2/oauth.js";
import { PostgresPersonaRepository } from "../../src/infrastructure/persistence/persona-v2/repository.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { testConfig } from "../../src/config/env.js";
import { assertConsumer } from "../../src/domain/persona-v2/authorization.js";
import type { Permissions, ConsumerIdentity } from "../../src/domain/persona-v2/model.js";
import type { PersonaOAuthConnection } from "../../src/domain/persona-v2/oauth-connections.js";
import { parseMcpPayload, toolJson } from "../helpers/mcp-rpc.js";
import { assertPluginToolsAvailable } from "../../src/infrastructure/plugins/tool-catalog.js";
import { trainingSource, queryTraining } from "../helpers/persona-v2-training.js";
import { PersonaEphemeralWorker } from "../../src/application/persona-v2/ephemeral-worker.js";
import { PostgresPersonaEphemeralWorker } from "../../src/infrastructure/persistence/persona-v2/ephemeral-worker.js";

const origin = "https://persona.fixture.test";
const clientId = "https://client.fixture.test/oauth.json";
const redirectUri = "https://client.fixture.test/callback";
const policy = {
  issuer: origin,
  resource: `${origin}/mcp/chatgpt`,
  clients: { [clientId]: [redirectUri] },
};
const challenge = (value: string) => createHash("sha256").update(value).digest("base64url");
const verifier = "v".repeat(43);
const url = new URL(personaV2TestDatabaseUrl());
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const name = `oauth_persona_${randomUUID().replaceAll("-", "")}_test`;
url.pathname = `/${name}`;
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const db = new pg.Pool({ connectionString: url.toString() });
const crypto = new NodeCryptoAdapter("01".repeat(32));
const repository = new PostgresPersonaRepository(db);
const store = new PostgresPersonaOAuthStore(db, crypto);
const client = { validate: vi.fn(async () => undefined) };
let clock = Date.now();
const oauth = new PersonaOAuth(store, repository, crypto, client, policy, challenge, () => clock);
let bearer: string;
let identity: ConsumerIdentity;
let permissions: Permissions;
let runtime: Awaited<ReturnType<typeof composePersonaV2>>;
let ownerActive = true;
const authorization = (overrides: Record<string, string> = {}) => ({
  client_id: clientId,
  redirect_uri: redirectUri,
  resource: policy.resource,
  scope: "se7e:persona",
  response_type: "code",
  code_challenge_method: "S256",
  code_challenge: challenge(verifier),
  state: "client-state",
  ...overrides,
});
const exchange = (code: string, overrides: Record<string, string> = {}) => ({
  grant_type: "authorization_code",
  code,
  client_id: clientId,
  redirect_uri: redirectUri,
  resource: policy.resource,
  code_verifier: verifier,
  ...overrides,
});
const refresh = (token: string, overrides: Record<string, string> = {}) => ({
  grant_type: "refresh_token",
  refresh_token: token,
  client_id: clientId,
  resource: policy.resource,
  ...overrides,
});
const flow = async (selected?: {
  sources: readonly string[];
  skills: readonly string[];
  external: readonly string[];
}) => {
  const start = await oauth.begin(authorization());
  const review = await oauth.authenticate(start.id, start.nonce, start.csrf, bearer);
  const location = await oauth.consent(
    start.id,
    start.nonce,
    review.csrf,
    selected ?? {
      sources: permissions.sourceIds,
      skills: permissions.skills.map((g) => g.skillId),
      external: [],
    },
  );
  const code = new URL(location).searchParams.get("code")!;
  return { start, review, code, location };
};

it("consentimento de gestão exige IDs e permissão explícitos, sem ampliar por seleção forjada", async () => {
  const allowed = randomUUID(),
    hidden = randomUUID();
  const scoped = {
    ...permissions,
    administrative: ["gerenciar_integracoes"],
    managedIntegrationIds: [allowed],
  };
  await db.query("UPDATE persona_token SET permissoes=$2 WHERE id=$1", [
    identity.tokenId,
    JSON.stringify(scoped),
  ]);
  const managementOAuth = new PersonaOAuth(
    store,
    repository,
    crypto,
    client,
    policy,
    challenge,
    () => clock,
    async () => ["gerenciar_integracoes"],
  );
  for (const selection of [
    { managedIntegrations: [], administrative: ["gerenciar_integracoes"] as const, expected: [] },
    { managedIntegrations: [allowed], administrative: [] as const, expected: [] },
    {
      managedIntegrations: [allowed, hidden],
      administrative: ["gerenciar_integracoes"] as const,
      expected: [allowed],
    },
  ]) {
    const start = await managementOAuth.begin(authorization());
    const review = await managementOAuth.authenticate(start.id, start.nonce, start.csrf, bearer);
    expect(review.permissions.managedIntegrationIds).toEqual([allowed]);
    const location = await managementOAuth.consent(start.id, start.nonce, review.csrf, {
      sources: [],
      skills: [],
      external: [],
      managedIntegrations: selection.managedIntegrations,
      administrative: selection.administrative,
    });
    const token = await managementOAuth.token(
      exchange(new URL(location).searchParams.get("code")!),
    );
    const actor = await managementOAuth.resolve(token.access_token);
    const snapshot = await repository.authorization(actor);
    expect(snapshot?.grant?.permissions.managedIntegrationIds).toEqual(selection.expected);
  }
});
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  await applyPersonaMigrations(url.toString());
  await applyPersonaMigrations(url.toString());
  runtime = await composePersonaV2(
    testConfig({
      PUBLIC_BASE_URL: origin,
      DATABASE_URL: url.toString(),
      MCP_ENCRYPTION_KEY: "01".repeat(32),
      PERSONA_V2_OAUTH_ENABLED: true,
      PERSONA_V2_OAUTH_CLIENTS: policy.clients,
    }),
    {
      ownerAuth: {
        hubOrigin: "https://hub.fixture.test",
        login: async () => ({ accessToken: "fixture-jwt" }),
        profile: async () => ({ clientId: "fixture-owner", active: ownerActive }),
      },
      oauthClient: client,
    },
  );
});
beforeEach(async () => {
  ownerActive = true;
  clock = Date.now();
  client.validate.mockClear();
  bearer = crypto.randomToken(32);
  permissions = {
    sourceIds: [randomUUID(), randomUUID()],
    skills: [
      {
        skillId: randomUUID(),
        capabilities: ["table:pedidos"],
        effects: ["select"],
        requireHumanApproval: true,
      },
    ],
    externalOperationIds: [],
    administrative: ["publicar"],
  };
  const personaId = randomUUID(),
    tokenId = randomUUID();
  identity = { personaId, tokenId, personaVersion: 1, tokenVersion: 1 };
  await repository.transaction({ personaIds: [], tokenIds: [] }, async (tx) => {
    const owner = await tx.owner("https://hub.fixture.test", "fixture-owner");
    await tx.createPersona({
      id: personaId,
      ownerId: owner.id,
      name: "Contas <fixture>",
      specialty: "Financeiro",
      instructions: "Use publicações e dados verificados.",
      active: true,
      authorizationVersion: 1,
    });
    for (const id of permissions.sourceIds) {
      await tx.addSource(
        {
          ...trainingSource,
          id,
          personaId,
          physicalSourceId: await tx.physicalSource(crypto.sha256Hex(id)),
          credentialId: randomUUID(),
        },
        {
          emailEnc: crypto.encrypt("source@fixture.test"),
          passwordEnc: crypto.encrypt("fixture-password"),
          clientTokenEnc: crypto.encrypt("fixture-token"),
        },
      );
    }
    await tx.catalog.create({
      id: permissions.skills[0]!.skillId,
      personaId,
      slug: "pedidos",
      kind: "consulta",
      name: "Pedidos",
      revision: 1,
      training: queryTraining(permissions.sourceIds[0]),
      activePublicationId: null,
    });
    await tx.issueToken(
      {
        id: tokenId,
        personaId,
        tokenHash: crypto.sha256Hex(bearer),
        permissions,
        delegation: permissions,
        expiresAt: null,
        revokedAt: null,
        authorizationVersion: 1,
      },
      "Consumidor de fixture",
    );
  });
});
afterAll(async () => {
  await runtime?.close();
  await db.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
});

it("consentimento congela um subconjunto e não delega administração", async () => {
  const f = await flow({ sources: [permissions.sourceIds[0]!], skills: [], external: [] });
  expect(new URL(f.location).searchParams.get("state")).toBe("client-state");
  expect(new URL(f.location).searchParams.get("iss")).toBe(origin);
  const tokens = await oauth.token(exchange(f.code));
  const authenticated = await oauth.resolve(tokens.access_token);
  const state = (await repository.authorization(authenticated))!;
  expect(state.grant!.permissions).toMatchObject({
    sourceIds: [permissions.sourceIds[0]],
    skills: [],
    administrative: [],
  });
  expect(assertConsumer(authenticated, state, new Date(clock))).toHaveLength(2);
  expect(tokens.expires_in).toBe(900);
  expect(state.grant!.expiresAt.getTime()).toBe(clock + 30 * 86400000);
  const records = await db.query(
    "SELECT id_hash,conteudo_enc FROM oauth_registro_v2 WHERE persona_id=$1",
    [identity.personaId],
  );
  const persisted = JSON.stringify(records.rows);
  for (const secret of [
    bearer,
    f.code,
    tokens.access_token,
    tokens.refresh_token,
    f.start.nonce,
    f.review.csrf,
  ]) {
    expect(persisted).not.toContain(secret);
  }
});
it("consentimento conserva reduções próprias durante refresh sem ampliar o originador", async () => {
  const start = await oauth.begin(authorization());
  const review = await oauth.authenticate(start.id, start.nonce, start.csrf, bearer);
  const location = await oauth.consent(start.id, start.nonce, review.csrf, {
    sources: permissions.sourceIds,
    skills: permissions.skills.map((g) => g.skillId),
    external: [],
    queryLimits: { maxRows: 7, pageSize: 3, maxBytes: 5000, timeoutMs: 2000 },
    operationLimits: { maxAffectedRows: 2, timeoutMs: 3000 },
  });
  const tokens = await oauth.token(exchange(new URL(location).searchParams.get("code")!));
  for (const access of [
    tokens.access_token,
    (await oauth.token(refresh(tokens.refresh_token))).access_token,
  ]) {
    const resolved = await oauth.resolve(access);
    const current = (await repository.authorization(resolved))!;
    expect(current.grant!.permissions.queryLimits).toEqual({
      maxRows: 7,
      pageSize: 3,
      maxBytes: 5000,
      timeoutMs: 2000,
    });
    expect(current.grant!.permissions.operationLimits).toEqual({
      maxAffectedRows: 2,
      timeoutMs: 3000,
    });
  }
});

it.each([
  ["cliente", { client_id: "https://evil.fixture.test/client" }],
  ["redirect", { redirect_uri: `${redirectUri}/other` }],
  ["audience", { resource: `${origin}/mcp` }],
  ["scope", { scope: "se7e:access" }],
  ["PKCE", { code_verifier: "x".repeat(43) }],
])("troca com %s divergente não consome código nem revoga terceiros", async (_label, override) => {
  const f = await flow();
  await expect(oauth.token(exchange(f.code, override))).rejects.toMatchObject({
    code: "invalid_grant",
  });
  const tokens = await oauth.token(exchange(f.code));
  expect((await oauth.resolve(tokens.access_token)).personaId).toBe(identity.personaId);
});

it("código é de uso único e replay confirmado revoga só sua família", async () => {
  const f = await flow();
  const first = await oauth.token(exchange(f.code));
  const other = await oauth.token(exchange((await flow()).code));
  clock += 60001; // A consumed code still identifies its family after its exchange window.
  await new PersonaEphemeralWorker(
    new PostgresPersonaEphemeralWorker(db),
    randomUUID(),
    () => new Date(clock),
  ).runOnce();
  await expect(oauth.token(exchange(f.code))).rejects.toMatchObject({ code: "invalid_grant" });
  await expect(oauth.resolve(first.access_token)).rejects.toThrow();
  expect((await oauth.resolve(other.access_token)).personaId).toBe(identity.personaId);
});

it("refresh concorrente serializa rotação e replay invalida o sucessor", async () => {
  const tokens = await oauth.token(exchange((await flow()).code));
  const results = await Promise.allSettled([
    oauth.token(refresh(tokens.refresh_token)),
    oauth.token(refresh(tokens.refresh_token)),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const winner = results.find((r) => r.status === "fulfilled")!;
  if (winner.status === "fulfilled") {
    await expect(oauth.resolve(winner.value.access_token)).rejects.toThrow();
  }
});

it("refresh inválido de outro cliente não derruba conexão vigente", async () => {
  const tokens = await oauth.token(exchange((await flow()).code));
  await expect(
    oauth.token(refresh(tokens.refresh_token, { client_id: "other" })),
  ).rejects.toMatchObject({ code: "invalid_grant" });
  expect(await oauth.resolve(tokens.access_token)).toMatchObject(identity);
  const next = await oauth.token(refresh(tokens.refresh_token));
  expect(next.refresh_token).not.toBe(tokens.refresh_token);
});

it("revogação terminal preserva outras conexões e token manual", async () => {
  const one = await oauth.token(exchange((await flow()).code));
  const two = await oauth.token(exchange((await flow()).code));
  const who = await oauth.resolve(one.access_token);
  expect(await oauth.revoke(who)).toMatchObject({
    terminal: true,
    otherConnectionsRevoked: false,
    connectionId: who.grant!.id,
  });
  await expect(oauth.resolve(one.access_token)).rejects.toThrow();
  expect(await oauth.resolve(two.access_token)).toMatchObject(identity);
  expect((await repository.authentication(crypto.sha256Hex(bearer)))!.token.revokedAt).toBeNull();
  await expect(oauth.token(refresh(one.refresh_token))).rejects.toMatchObject({
    code: "invalid_grant",
  });
});

it.each(["ampliação", "redução", "rotação", "revogação"])(
  "%s do originador invalida derivados sem ressuscitar",
  async (action) => {
    const tokens = await oauth.token(exchange((await flow()).code));
    await repository.transaction(
      { personaIds: [identity.personaId], tokenIds: [identity.tokenId] },
      async (tx) => {
        if (action === "revogação") {
          await tx.revokeToken(identity.personaId, identity.tokenId, new Date(clock));
        } else {
          const token = (await tx.listTokens(identity.personaId))[0]!;
          await tx.changeToken(
            {
              ...token,
              permissions: {
                ...token.permissions,
                sourceIds: action === "redução" ? [] : token.permissions.sourceIds,
                skills:
                  action === "ampliação"
                    ? token.permissions.skills.map((g) => ({
                        ...g,
                        capabilities: [...g.capabilities, "field:new"],
                      }))
                    : token.permissions.skills,
              },
            },
            1,
            action === "rotação" ? crypto.sha256Hex(crypto.randomToken(32)) : undefined,
          );
        }
      },
    );
    await expect(oauth.resolve(tokens.access_token)).rejects.toThrow();
    await expect(oauth.token(refresh(tokens.refresh_token))).rejects.toMatchObject({
      code: "invalid_grant",
    });
  },
);

it("expiração de access é revalidada na transação, sem depender de novo HTTP", async () => {
  const tokens = await oauth.token(exchange((await flow()).code));
  const consumer = await oauth.resolve(tokens.access_token);
  const state = (await repository.authorization(consumer))!;
  clock += 900001;
  expect(() => assertConsumer(consumer, state, new Date(clock))).toThrow();
  await expect(oauth.resolve(tokens.access_token)).rejects.toThrow();
  const renewed = await oauth.token(refresh(tokens.refresh_token));
  expect(renewed.expires_in).toBe(900);
  const renewedIdentity = await oauth.resolve(renewed.access_token);
  expect(renewedIdentity.grant?.id).toBe(consumer.grant?.id);
  expect(() => assertConsumer(renewedIdentity, state, new Date(clock))).not.toThrow();
  await expect(oauth.resolve(tokens.access_token)).rejects.toMatchObject({
    authorizationReason: "access_expired",
  });
});

it("transação, código e concessão expiram nos prazos próprios", async () => {
  const start = await oauth.begin(authorization());
  clock += 900001;
  await expect(oauth.authenticate(start.id, start.nonce, start.csrf, bearer)).rejects.toMatchObject(
    { code: "invalid_request" },
  );
  const f = await flow();
  clock += 60001;
  await expect(oauth.token(exchange(f.code))).rejects.toMatchObject({ code: "invalid_grant" });
  const tokens = await oauth.token(exchange((await flow()).code));
  clock += 30 * 86400000 + 1;
  await expect(oauth.token(refresh(tokens.refresh_token))).rejects.toMatchObject({
    code: "invalid_grant",
  });
});

it("validade da concessão e access é limitada pelo token originador", async () => {
  await db.query("UPDATE persona_token SET expires_at=$2 WHERE id=$1", [
    identity.tokenId,
    new Date(clock + 20000),
  ]);
  const tokens = await oauth.token(exchange((await flow()).code));
  expect(tokens.expires_in).toBe(20);
  clock += 20001;
  await expect(oauth.resolve(tokens.access_token)).rejects.toThrow();
});

it("nonce, CSRF, consentimento repetido e seleção não concedida são recusados", async () => {
  const start = await oauth.begin(authorization());
  await expect(
    oauth.authenticate(start.id, crypto.randomToken(32), start.csrf, bearer),
  ).rejects.toMatchObject({ code: "invalid_request" });
  const review = await oauth.authenticate(start.id, start.nonce, start.csrf, bearer);
  await expect(oauth.consent(start.id, start.nonce, start.csrf, null)).rejects.toMatchObject({
    code: "invalid_request",
  });
  await expect(
    oauth.consent(start.id, start.nonce, review.csrf, {
      sources: [randomUUID()],
      skills: [],
      external: [],
    }),
  ).rejects.toMatchObject({ code: "access_denied" });
  const denied = await oauth.consent(start.id, start.nonce, review.csrf, null);
  expect(new URL(denied).searchParams.get("error")).toBe("access_denied");
  await expect(oauth.consent(start.id, start.nonce, review.csrf, null)).rejects.toMatchObject({
    code: "invalid_request",
  });
});

it("mudança do token entre revisão e consentimento exige nova conexão", async () => {
  const start = await oauth.begin(authorization());
  const review = await oauth.authenticate(start.id, start.nonce, start.csrf, bearer);
  await repository.transaction(
    { personaIds: [identity.personaId], tokenIds: [identity.tokenId] },
    (tx) => tx.revokeToken(identity.personaId, identity.tokenId, new Date(clock)),
  );
  await expect(
    oauth.consent(start.id, start.nonce, review.csrf, { sources: [], skills: [], external: [] }),
  ).rejects.toMatchObject({ code: "invalid_grant" });
});

const http = (path: string) => request(runtime.app).post(path).set("Host", "persona.fixture.test");
const rpc = (token: string | undefined, method: string, args?: Record<string, unknown>) => {
  const req = http("/mcp/chatgpt").set("Accept", "application/json, text/event-stream");
  if (token) {
    req.set("Authorization", `Bearer ${token}`);
  }
  return req.send({ jsonrpc: "2.0", id: 1, method, ...(args ? { params: args } : {}) });
};
it("descoberta anuncia apenas v2; inicialização exige OAuth e não aceita Bearer manual", async () => {
  const login = await http("/api/admin/login")
    .set("Origin", origin)
    .send({ email: "owner@fixture.test", password: "fixture" });
  expect(login.status).toBe(200);
  const cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  expect(
    (
      await request(runtime.app)
        .get("/api/admin/oauth")
        .set("Host", "persona.fixture.test")
        .set("Origin", origin)
        .set("Cookie", cookie)
    ).status,
  ).toBe(403);
  const availability = await request(runtime.app)
    .get("/api/admin/oauth")
    .set("Host", "persona.fixture.test")
    .set("Origin", origin)
    .set("Cookie", cookie)
    .set("X-CSRF-Token", login.body.csrfToken as string);
  expect(availability.body).toEqual({
    enabled: true,
    endpoint: policy.resource,
    scope: "se7e:persona",
  });
  const resource = await request(runtime.app)
    .get("/.well-known/oauth-protected-resource/mcp/chatgpt")
    .set("Host", "persona.fixture.test");
  expect(resource.body).toMatchObject({
    resource: policy.resource,
    scopes_supported: ["se7e:persona"],
  });
  const metadata = await request(runtime.app)
    .get("/.well-known/oauth-authorization-server")
    .set("Host", "persona.fixture.test");
  expect(metadata.body.authorization_endpoint).toBe(`${origin}/oauth/persona-v2/authorize`);
  const unauth = await rpc(undefined, "initialize");
  expect(unauth.status).toBe(401);
  expect(unauth.headers["www-authenticate"]).toContain("oauth-protected-resource/mcp/chatgpt");
  expect((await rpc(bearer, "tools/list")).status).toBe(401);
  const tokens = await oauth.token(exchange((await flow()).code));
  expect(
    (
      await http("/mcp")
        .set("Authorization", `Bearer ${tokens.access_token}`)
        .send({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    ).status,
  ).toBe(401);
});

it("MCP real lista ferramentas do pacote e devolve perfil estável e comprovante terminal", async () => {
  const tokens = await oauth.token(exchange((await flow()).code));
  const another = await oauth.token(exchange((await flow()).code));
  const tools = parseMcpPayload(await rpc(tokens.access_token, "tools/list")) as {
    result: { tools: { name: string; _meta?: unknown }[] };
  };
  assertPluginToolsAvailable(
    "persona-v2",
    tools.result.tools.map((t) => t.name),
    "chatgpt",
  );
  expect(tools.result.tools.every((t) => JSON.stringify(t._meta).includes("se7e:persona"))).toBe(
    true,
  );
  expect(tools.result.tools.map((t) => t.name)).toContain("get_profile");
  expect(tools.result.tools.find((t) => t.name === "get_profile")?._meta).toMatchObject({
    "openai/profile": true,
  });
  const capabilities = toolJson(
    parseMcpPayload(
      await rpc(tokens.access_token, "tools/call", { name: "obter_capacidades", arguments: {} }),
    ),
  );
  expect(capabilities).toMatchObject({
    generation: "persona-v2",
    complete: false,
    authentication: "oauth2",
    pluginCompatibility: {
      format: "persona-plugin-compatibility-v1",
      runtime: "persona-v2",
      variant: "chatgpt",
      guidanceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    },
    oauth: { implemented: true, scope: "se7e:persona", originatorBound: true },
    externalQueries: { implemented: true, explicitOperationGrantRequired: true },
    externalActions: { implemented: true, automaticReplay: false },
  });
  const profile = toolJson(
    parseMcpPayload(
      await rpc(tokens.access_token, "tools/call", { name: "get_profile", arguments: {} }),
    ),
  );
  expect(profile).toMatchObject({
    id: crypto.sha256Hex(`se7e:persona:profile:v2:${identity.personaId}`),
    generation: "persona-v2",
  });
  expect(
    toolJson(
      parseMcpPayload(
        await rpc(another.access_token, "tools/call", { name: "get_profile", arguments: {} }),
      ),
    ),
  ).toEqual(profile);
  const revoked = toolJson(
    parseMcpPayload(
      await rpc(tokens.access_token, "tools/call", {
        name: "revogar_conexao_chatgpt",
        arguments: { confirmadoPeloUsuario: true },
      }),
    ),
  );
  expect(revoked).toMatchObject({ terminal: true, otherConnectionsRevoked: false });
  expect((await rpc(tokens.access_token, "tools/list")).status).toBe(401);
  expect((await rpc(another.access_token, "tools/list")).status).toBe(200);
});

it("formulários isolam credenciais, escapam nomes e vinculam CSRF ao navegador", async () => {
  const begun = await request(runtime.app)
    .get("/oauth/persona-v2/authorize")
    .query(authorization())
    .set("Host", "persona.fixture.test");
  expect(begun.status).toBe(200);
  const cookies = begun.headers["set-cookie"] as unknown as string[];
  expect(cookies[0]).toContain("Secure");
  expect(cookies[0]).toContain("HttpOnly");
  const browser = cookies[0]!.split(";")[0]!;
  const field = (html: string, name: string) =>
    new RegExp(`name="${name}" value="([^"]+)"`).exec(html)![1]!;
  const body = {
    transaction: field(begun.text, "transaction"),
    csrf: field(begun.text, "csrf"),
    token: bearer,
  };
  expect(
    (
      await http("/oauth/persona-v2/authenticate")
        .type("form")
        .set("Origin", "https://evil.fixture.test")
        .set("Cookie", browser)
        .send(body)
    ).status,
  ).toBe(403);
  const review = await http("/oauth/persona-v2/authenticate")
    .type("form")
    .set("Origin", origin)
    .set("Cookie", browser)
    .send(body);
  expect(review.status).toBe(200);
  expect(review.text).toContain("Contas &lt;fixture&gt;");
  expect(review.text).not.toContain(bearer);
  const accepted = await http("/oauth/persona-v2/consent")
    .type("form")
    .set("Origin", origin)
    .set("Cookie", browser)
    .send({
      transaction: body.transaction,
      csrf: field(review.text, "csrf"),
      confirmed: "yes",
      sources: permissions.sourceIds[0],
    });
  expect(accepted.status).toBe(303);
  const code = new URL(accepted.headers.location!).searchParams.get("code")!;
  const token = await http("/oauth/persona-v2/token").type("form").send(exchange(code));
  expect(token.status).toBe(200);
  expect(token.headers["cache-control"]).toBe("no-store");
  expect((await rpc(token.body.access_token as string, "tools/list")).status).toBe(200);
});

it("revogação HTTP é idempotente e não vaza existência de tokens desconhecidos", async () => {
  const tokens = await oauth.token(exchange((await flow()).code));
  const body = { client_id: clientId, token: tokens.refresh_token };
  expect(
    (
      await http("/oauth/persona-v2/revoke")
        .type("form")
        .send({ ...body, client_id: "other" })
    ).status,
  ).toBe(400);
  expect((await http("/oauth/persona-v2/revoke").type("form").send(body)).status).toBe(200);
  expect((await http("/oauth/persona-v2/revoke").type("form").send(body)).status).toBe(200);
  expect(
    (
      await http("/oauth/persona-v2/revoke")
        .type("form")
        .send({ ...body, token: crypto.randomToken(32) })
    ).status,
  ).toBe(200);
  await expect(oauth.resolve(tokens.access_token)).rejects.toThrow();
});

it("falha do cliente metadata não cria transação nem expõe a falha interna", async () => {
  client.validate.mockRejectedValueOnce(new Error("secret internal fixture"));
  const result = await request(runtime.app)
    .get("/oauth/persona-v2/authorize")
    .query(authorization())
    .set("Host", "persona.fixture.test");
  expect(result.status).toBe(503);
  expect(result.text).not.toContain("secret internal fixture");
});

it("grants e registros terminais não podem ser restaurados no banco", async () => {
  const f = await flow();
  const tokens = await oauth.token(exchange(f.code));
  const who = await oauth.resolve(tokens.access_token);
  await oauth.revoke(who);
  await expect(
    db.query("UPDATE oauth_concessao_v2 SET revoked_at=NULL WHERE id=$1", [who.grant!.id]),
  ).rejects.toThrow("immutable");
  await expect(
    db.query("UPDATE oauth_registro_v2 SET consumed_at=NULL WHERE id_hash=$1", [
      crypto.sha256Hex(f.code),
    ]),
  ).rejects.toThrow("reused");
});

it("falha de auditoria reverte grant e consumo do consentimento juntos", async () => {
  const start = await oauth.begin(authorization());
  const review = await oauth.authenticate(start.id, start.nonce, start.csrf, bearer);
  await db.query(
    `CREATE FUNCTION fixture_oauth_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.evento='oauth.connected' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$`,
  );
  await db.query(
    "CREATE TRIGGER fixture_oauth_audit_failure BEFORE INSERT ON audit_v2 FOR EACH ROW EXECUTE FUNCTION fixture_oauth_audit_failure()",
  );
  try {
    await expect(
      oauth.consent(start.id, start.nonce, review.csrf, { sources: [], skills: [], external: [] }),
    ).rejects.toThrow("fixture audit failure");
    expect(
      (
        await db.query("SELECT id FROM oauth_concessao_v2 WHERE persona_id=$1", [
          identity.personaId,
        ])
      ).rows,
    ).toHaveLength(0);
    expect((await store.record(crypto.sha256Hex(start.id)))?.consumedAt).toBeUndefined();
  } finally {
    await db.query("DROP TRIGGER fixture_oauth_audit_failure ON audit_v2");
    await db.query("DROP FUNCTION fixture_oauth_audit_failure()");
  }
  const location = await oauth.consent(start.id, start.nonce, review.csrf, {
    sources: [],
    skills: [],
    external: [],
  });
  expect(new URL(location).searchParams.has("code")).toBe(true);
});

async function administrativeHeaders() {
  const login = await http("/api/admin/login")
    .set("Origin", origin)
    .send({ email: "owner@fixture.test", password: "fixture-only" })
    .expect(200);
  const cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  return {
    Host: "persona.fixture.test",
    Origin: origin,
    Cookie: cookie,
    "x-csrf-token": String(login.body.csrfToken),
  };
}
it("responsável lista/revoga conexão exata, bloqueia access/refresh e conserva originador/outras", async () => {
  const first = await oauth.token(exchange((await flow()).code)),
    second = await oauth.token(exchange((await flow()).code));
  const firstIdentity = await oauth.resolve(first.access_token),
    secondIdentity = await oauth.resolve(second.access_token);
  const headers = await administrativeHeaders(),
    base = `/api/admin/personas/${identity.personaId}/oauth-connections`;
  const listed = await request(runtime.app).get(base).set(headers).expect(200);
  expect(listed.body.remoteAuthority).toBe("nao_verificado");
  expect(listed.body.items).toHaveLength(2);
  const row = (listed.body.items as PersonaOAuthConnection[]).find(
    (r) => r.id === firstIdentity.grant!.id,
  )!;
  expect(row).toMatchObject({ clientId, tokenId: identity.tokenId, state: "vigente_localmente" });
  expect(row.health).toMatchObject({
    reason: "available",
    lastRefreshedAt: null,
    tokenExpiresAt: null,
  });
  expect(row.health?.accessExpiresAt).toBe(new Date(clock + 900000).toISOString());
  await oauth.token(refresh(first.refresh_token));
  const refreshed = await request(runtime.app).get(base).set(headers).expect(200);
  const refreshedRow = (refreshed.body.items as PersonaOAuthConnection[]).find(
    (r) => r.id === row.id,
  )!;
  expect(refreshedRow.health?.lastRefreshedAt).toBe(new Date(clock).toISOString());
  expect(refreshedRow.fingerprint).toBe(row.fingerprint);
  for (const secret of [bearer, first.access_token, first.refresh_token, second.access_token])
    expect(listed.text).not.toContain(secret);
  const input = { fingerprint: row.fingerprint, confirmed: true };
  const receipts = await Promise.all([
    request(runtime.app).post(`${base}/${row.id}/revogar`).set(headers).send(input),
    request(runtime.app).post(`${base}/${row.id}/revogar`).set(headers).send(input),
  ]);
  expect(receipts.map((r) => r.status)).toEqual([200, 200]);
  expect(receipts[0].body).toEqual(receipts[1].body);
  await expect(oauth.resolve(first.access_token)).rejects.toThrow();
  await expect(oauth.token(refresh(first.refresh_token))).rejects.toThrow();
  expect((await oauth.resolve(second.access_token)).grant!.id).toBe(secondIdentity.grant!.id);
  expect((await repository.authentication(crypto.sha256Hex(bearer)))!.token.revokedAt).toBeNull();
  const audit = await db.query(
    "SELECT * FROM audit_v2 WHERE oauth_grant_id=$1 AND evento='oauth.revoked'",
    [row.id],
  );
  expect(audit.rows).toHaveLength(1);
  expect(audit.rows[0].origem).toBe("admin");
  expect(audit.rows[0].responsavel_id).not.toBeNull();
  const history = await request(runtime.app)
    .get(`/api/admin/personas/${identity.personaId}/historico`)
    .set(headers)
    .query({ resourceId: row.id })
    .expect(200);
  expect(
    (history.body.items as { event: string; resourceId: string }[]).some(
      (r) => r.event === "oauth.revoked" && r.resourceId === row.id,
    ),
  ).toBe(true);
});
it("revogação administrativa exige confirmação/CSRF/hash e não aceita grant de outra persona", async () => {
  const tokens = await oauth.token(exchange((await flow()).code)),
    who = await oauth.resolve(tokens.access_token);
  const headers = await administrativeHeaders(),
    base = `/api/admin/personas/${identity.personaId}/oauth-connections`,
    id = who.grant!.id;
  const listed = await request(runtime.app).get(base).set(headers).expect(200),
    row = listed.body.items[0];
  await request(runtime.app)
    .post(`${base}/${id}/revogar`)
    .set(headers)
    .send({ fingerprint: row.fingerprint, confirmed: false })
    .expect(400);
  await request(runtime.app)
    .post(`${base}/${id}/revogar`)
    .set({ ...headers, "x-csrf-token": "wrong" })
    .send({ fingerprint: row.fingerprint, confirmed: true })
    .expect(403);
  await request(runtime.app)
    .post(`${base}/${id}/revogar`)
    .set(headers)
    .send({ fingerprint: "0".repeat(64), confirmed: true })
    .expect(409);
  const other = await request(runtime.app)
    .post("/api/admin/personas")
    .set(headers)
    .send({ name: "Outra persona", specialty: "Fixture", instructions: "" })
    .expect(201);
  await request(runtime.app)
    .post(`/api/admin/personas/${other.body.persona.id}/oauth-connections/${id}/revogar`)
    .set(headers)
    .send({ fingerprint: row.fingerprint, confirmed: true })
    .expect(403);
  expect((await oauth.resolve(tokens.access_token)).grant!.id).toBe(id);
  ownerActive = false;
  await request(runtime.app)
    .post(`${base}/${id}/revogar`)
    .set(headers)
    .send({ fingerprint: row.fingerprint, confirmed: true })
    .expect(401);
  expect((await oauth.resolve(tokens.access_token)).grant!.id).toBe(id);
});
it("lista conexões com paginação estável e preserva datas históricas não registradas", async () => {
  await oauth.token(exchange((await flow()).code));
  const template = (
    await db.query("SELECT * FROM oauth_concessao_v2 WHERE persona_id=$1", [identity.personaId])
  ).rows[0];
  for (let n = 0; n < 22; n++)
    await db.query(
      `INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        identity.personaId,
        identity.tokenId,
        template.token_version,
        template.permissoes,
        clientId,
        template.expires_at,
        n === 21 ? null : new Date(clock),
      ],
    );
  const headers = await administrativeHeaders(),
    base = `/api/admin/personas/${identity.personaId}/oauth-connections`;
  const first = (await request(runtime.app).get(base).set(headers).expect(200)).body;
  const second = (
    await request(runtime.app).get(base).set(headers).query({ after: first.nextCursor }).expect(200)
  ).body;
  expect(first.items).toHaveLength(20);
  expect(second.items).toHaveLength(3);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items, ...second.items].map((r: { id: string }) => r.id)).size).toBe(23);
  expect(second.items[2].createdAt).toBeNull();
  await expect(
    db.query("UPDATE oauth_concessao_v2 SET created_at=now() WHERE id=$1", [second.items[2].id]),
  ).rejects.toThrow();
  await expect(
    db.query("DELETE FROM oauth_concessao_v2 WHERE id=$1", [second.items[2].id]),
  ).rejects.toThrow();
});
it("falha de auditoria da revogação administrativa preserva grant e consumidor ativo", async () => {
  const tokens = await oauth.token(exchange((await flow()).code));
  const headers = await administrativeHeaders(),
    base = `/api/admin/personas/${identity.personaId}/oauth-connections`;
  const row = (await request(runtime.app).get(base).set(headers).expect(200)).body.items[0];
  await db.query(
    "CREATE FUNCTION fixture_admin_oauth_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.evento='oauth.revoked' AND NEW.origem='admin' THEN RAISE EXCEPTION 'private fixture failure'; END IF; RETURN NEW; END $$",
  );
  await db.query(
    "CREATE TRIGGER fixture_admin_oauth_audit_failure BEFORE INSERT ON audit_v2 FOR EACH ROW EXECUTE FUNCTION fixture_admin_oauth_audit_failure()",
  );
  try {
    const result = await request(runtime.app)
      .post(`${base}/${row.id}/revogar`)
      .set(headers)
      .send({ fingerprint: row.fingerprint, confirmed: true })
      .expect(503);
    expect(result.text).not.toContain("private fixture failure");
    expect((await oauth.resolve(tokens.access_token)).grant!.id).toBe(row.id);
  } finally {
    await db.query("DROP TRIGGER fixture_admin_oauth_audit_failure ON audit_v2");
    await db.query("DROP FUNCTION fixture_admin_oauth_audit_failure()");
  }
});
