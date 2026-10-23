import { reviewDateFixture } from "../helpers/review-deadline.js";
import { randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { testConfig } from "../../src/config/env.js";
import { queryTraining } from "../helpers/persona-v2-training.js";
import type { Persona, Source } from "../../src/domain/persona-v2/model.js";
import { PostgresPersonaRepository } from "../../src/infrastructure/persistence/persona-v2/repository.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { canonicalJson } from "../../src/domain/persona-v2/catalog.js";
import { assertConsumer } from "../../src/domain/persona-v2/authorization.js";
import { parseMcpPayload } from "../helpers/mcp-rpc.js";
import type {
  ConsumerDiagnosis,
  PersonaProgress,
  HistoryPage,
} from "../../src/domain/persona-v2/console.js";

const url = new URL(personaV2TestDatabaseUrl());
const name = `persona_maintenance_${randomUUID().replaceAll("-", "")}_test`;
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
url.pathname = `/${name}`;
const db = new pg.Pool({ connectionString: url.toString() });
let runtime: Awaited<ReturnType<typeof composePersonaV2>>;
let owner = "owner-a",
  active = true;
const verify = vi.fn(async (_input: unknown) => ({
  database: "fixture",
  dialect: "postgres" as const,
  identityHash: "f".repeat(64),
  verifiedAt: new Date().toISOString(),
}));
let session: { cookie: string; csrf: string };
const api = (method: "get" | "post", path: string) =>
  request(runtime.app)
    [method](path)
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .set("Cookie", session.cookie)
    .set("X-CSRF-Token", session.csrf);
let loginRound = 0;
async function login() {
  // Advance only the rate-limit clock; production limits remain intact.
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + ++loginRound * 61000);
  const r = await request(runtime.app)
    .post("/api/admin/login")
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .send({ email: "owner@fixture.test", password: "fixture" });
  clock.mockRestore();
  expect(r.status).toBe(200);
  session = {
    cookie: (r.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!,
    csrf: r.body.csrfToken as string,
  };
}
async function persona(): Promise<Persona> {
  const r = await api("post", "/api/admin/personas").send({
    name: "Financeiro",
    specialty: "Contas",
    instructions: "Use dados publicados.",
  });
  expect(r.status).toBe(201);
  return r.body.persona as Persona;
}
async function source(p: Persona): Promise<Source> {
  const r = await api("post", `/api/admin/personas/${p.id}/fontes`).send({
    name: "ERP",
    purpose: "Pedidos",
    environment: "test",
    agentId: randomUUID(),
    dialect: "postgres",
    email: "source-b@fixture.test",
    password: "fixture",
    clientToken: "fixture-token",
  });
  expect(r.status).toBe(201);
  return r.body.fonte as Source;
}
async function publish(p: Persona, s: Source) {
  const path = `/api/admin/personas/${p.id}/skills`;
  const draft = await api("post", path).send({
    slug: `orders-${randomUUID()}`,
    kind: "consulta",
    name: "Pedidos",
    training: queryTraining(s.id),
  });
  expect(draft.status).toBe(201);
  const id = draft.body.skill.id as string;
  const preview = await api("post", `${path}/${id}/preview`).send({
    reviewDueAt: reviewDateFixture(),
  });
  expect(preview.status).toBe(200);
  const publication = await api("post", `${path}/${id}/publicar`).send({
    confirmationHash: preview.body.confirmationHash,
  });
  expect(publication.status).toBe(201);
  return {
    id,
    publication: publication.body.publication as { id: string; package: unknown },
    path: `${path}/${id}`,
  };
}
const metadata = (s: Source) => ({
  expectedVersion: s.authorizationVersion,
  name: s.name,
  purpose: s.purpose,
  environment: s.environment,
  rowRestrictions: [],
});
const credential = (s: Source) => ({
  expectedVersion: s.authorizationVersion,
  email: "rotated@fixture.test",
  password: "new-fixture-password",
  clientToken: "new-fixture-token",
});
const replacement = (s: Source) => ({
  expectedVersion: s.authorizationVersion,
  source: {
    name: "ERP substituto",
    purpose: "Nova instalação",
    environment: "test",
    agentId: randomUUID(),
    dialect: "postgres",
    email: "replacement@fixture.test",
    password: "replacement-fixture-password",
    clientToken: "replacement-fixture-token",
  },
});
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  await applyPersonaMigrations(url.toString());
  runtime = await composePersonaV2(testConfig({ DATABASE_URL: url.toString() }), {
    ownerAuth: {
      hubOrigin: "http://hub.fixture.test",
      login: async () => ({ accessToken: "jwt" }),
      profile: async () => ({ clientId: owner, active }),
    },
    sourceVerifier: { verify },
  });
});
beforeEach(async () => {
  owner = "owner-a";
  active = true;
  verify.mockClear();
  await login();
});
afterAll(async () => {
  await runtime?.close();
  await db.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
});

it("roteiro usa registros atuais, aceita persona sem bases e não exige Data7", async () => {
  const p = await persona();
  const result = await api("get", `/api/admin/personas/${p.id}/progresso`);
  expect(result.status).toBe(200);
  const progress = result.body as PersonaProgress;
  expect(progress.steps).toHaveLength(8);
  expect(progress.steps.find((s) => s.id === "persona")?.state).toBe("concluido");
  expect(progress.steps.find((s) => s.id === "sources")?.state).toBe("disponivel");
  expect(progress.steps.find((s) => s.id === "permissions")?.state).toBe("pendente");
  expect(progress.currentAvailabilityVerified).toBe(false);
  expect(verify).not.toHaveBeenCalled();
});

it("histórico é transacional, isolado e pagina timestamps iguais sem perder precisão", async () => {
  const p = await persona();
  const first = await api("get", `/api/admin/personas/${p.id}/historico`);
  expect(first.status).toBe(200);
  const item = (first.body as HistoryPage).items[0]!;
  expect(item).toMatchObject({
    event: "persona.created",
    actor: { kind: "responsavel" },
    version: 1,
  });
  await db.query(
    `INSERT INTO audit_v2(id,persona_id,evento,origem,sucesso,created_at)
    SELECT gen_random_uuid(),$1,'fixture.event','fixture',true,'2026-10-12T12:00:00.123456Z'::timestamptz FROM generate_series(1,53)`,
    [p.id],
  );
  const path = `/api/admin/personas/${p.id}/historico?event=fixture.event`;
  const page1 = (await api("get", path)).body as HistoryPage;
  expect(page1.items).toHaveLength(50);
  expect(page1.nextCursor?.at).toBe("2026-10-12T12:00:00.123456Z");
  const after = new URLSearchParams({
    afterAt: page1.nextCursor!.at,
    afterId: page1.nextCursor!.id,
  });
  const page2 = (await api("get", `${path}&${after.toString()}`)).body as HistoryPage;
  expect(page2.items).toHaveLength(3);
  expect(new Set([...page1.items, ...page2.items].map((i) => i.id)).size).toBe(53);
  expect(page2.nextCursor).toBeNull();
  expect(page2.items.every((i) => i.actor.kind === "nao_registrado" && i.version === null)).toBe(
    true,
  );
  expect((await api("get", `${path}&afterAt=2026-10-12T12:00:00Z`)).status).toBe(400);
  expect(
    (await api("get", `${path}&from=2026-11-01T00:00:00Z&to=2026-10-01T00:00:00Z`)).status,
  ).toBe(400);
  const another = await persona();
  expect(
    (
      (await api("get", `/api/admin/personas/${another.id}/historico?resourceId=${p.id}`))
        .body as HistoryPage
    ).items,
  ).toEqual([]);
  owner = "owner-b";
  await login();
  expect((await api("get", `/api/admin/personas/${p.id}/historico`)).status).toBe(403);
  expect((await api("get", `/api/admin/personas/${p.id}/progresso`)).status).toBe(403);
});

it("diagnóstico não vaza skills não concedidas nem substitui revogação e publicação atuais", async () => {
  const p = await persona(),
    s = await source(p),
    published = await publish(p, s);
  const second = await publish(p, s);
  const { rows } = await db.query<{ pacote: { requiredCapabilities: string[] } }>(
    "SELECT pacote FROM publicacao WHERE id=$1",
    [published.publication.id],
  );
  const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const token = await api("post", `/api/admin/personas/${p.id}/tokens`).send({
    name: "Diagnóstico",
    expiresAt: null,
    delegation: empty,
    permissions: {
      ...empty,
      sourceIds: [s.id],
      skills: [
        {
          skillId: published.id,
          capabilities: rows[0]!.pacote.requiredCapabilities,
          effects: ["select"],
          requireHumanApproval: false,
        },
      ],
    },
  });
  const bearer = token.body.bearer as string;
  const diagnose = () =>
    request(runtime.app)
      .post("/mcp")
      .set("Host", "127.0.0.1:3333")
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${bearer}`)
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "diagnosticar_permissoes", arguments: {} },
      });
  const response = await diagnose();
  expect(response.status).toBe(200);
  const result = parseMcpPayload(response).result as { content: { text: string }[] };
  const diagnosis = JSON.parse(result.content[0]!.text) as ConsumerDiagnosis;
  expect(diagnosis.skills).toHaveLength(1);
  expect(diagnosis.skills[0]).toMatchObject({
    state: "permitido",
    skillId: published.id,
    revision: 1,
  });
  expect(JSON.stringify(diagnosis)).not.toContain(second.id);
  expect(JSON.stringify(diagnosis)).not.toMatch(/tokenHash|password|sqlModel|SELECT p/);
  expect(diagnosis.remoteAuthority).toBe("nao_verificado");
  const progress = (await api("get", `/api/admin/personas/${p.id}/progresso`))
    .body as PersonaProgress;
  expect(progress.steps.find((i) => i.id === "connection")?.state).toBe("concluido");
  expect(progress.steps.find((i) => i.id === "permissions")?.state).toBe("concluido");
  await api("post", `/api/admin/personas/${p.id}/fontes/${s.id}/editar`).send(metadata(s));
  const blocked = parseMcpPayload(await diagnose()).result as { content: { text: string }[] };
  const skill = (JSON.parse(blocked.content[0]!.text) as ConsumerDiagnosis).skills[0]!;
  expect(skill.state).toBe("bloqueado");
  expect(skill.name).toBeUndefined();
  await api(
    "post",
    `/api/admin/personas/${p.id}/tokens/${token.body.tokenId as string}/revogar`,
  ).send({});
  expect((await diagnose()).status).toBe(401);
  const history = (await api("get", `/api/admin/personas/${p.id}/historico`)).body as HistoryPage;
  expect(history.items.map((i) => i.event)).toEqual(
    expect.arrayContaining([
      "source.created",
      "token.issued",
      "consumer.connected",
      "token.revoked",
      "skill_publicacao_suspensa",
    ]),
  );
});

it("edita persona vazia com CAS e não permite sobrescrever edição concorrente", async () => {
  const p = await persona();
  const body = {
    name: "Financeiro atualizado",
    specialty: "Contas a receber",
    instructions: "Sempre informe origem.",
    expectedVersion: p.authorizationVersion,
  };
  const responses = await Promise.all([
    api("post", `/api/admin/personas/${p.id}/editar`).send(body),
    api("post", `/api/admin/personas/${p.id}/editar`).send({ ...body, name: "Concorrente" }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const list = await api("get", "/api/admin/personas");
  expect(
    (list.body.personas as Persona[]).find((item) => item.id === p.id)?.authorizationVersion,
  ).toBe(2);
  expect(
    (await db.query("SELECT count(*)::int n FROM fonte WHERE persona_id=$1", [p.id])).rows[0].n,
  ).toBe(0);
});

it("suspensão bloqueia consumidor, preserva snapshots e recuperação não ressuscita concessões", async () => {
  const p = await persona(),
    s = await source(p),
    skill = await publish(p, s);
  const path = `/api/admin/personas/${p.id}`;
  const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const token = await api("post", `${path}/tokens`).send({
    name: "Ciclo de vida",
    expiresAt: null,
    permissions: empty,
    delegation: empty,
  });
  expect(token.status).toBe(201);
  const bearer = token.body.bearer as string;
  const crypto = new NodeCryptoAdapter("test-key-32-bytes-long-aaaaaaaaaa");
  const repository = new PostgresPersonaRepository(db);
  const state = (await repository.authentication(crypto.sha256Hex(bearer)))!;
  const identity = {
    personaId: p.id,
    personaVersion: state.persona.authorizationVersion,
    tokenId: state.token.id,
    tokenVersion: state.token.authorizationVersion,
  };
  const discover = () =>
    request(runtime.app)
      .post("/mcp")
      .set("Host", "127.0.0.1:3333")
      .set("Authorization", `Bearer ${bearer}`)
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  expect((await discover()).status).toBe(200);
  const preview = await api("post", `${skill.path}/preview`).send({
    reviewDueAt: reviewDateFixture(),
  });
  const grantId = randomUUID();
  await db.query(
    `INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at)
    VALUES($1,$2,$3,1,$4,'fixture-client',now()+interval '1 day')`,
    [grantId, p.id, token.body.tokenId, JSON.stringify(empty)],
  );
  const responses = await Promise.all([
    api("post", `${path}/suspender`).send({ expectedVersion: 1 }),
    api("post", `${path}/suspender`).send({ expectedVersion: 1 }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  expect((await discover()).status).toBe(401);
  expect((await api("get", `${path}/fontes`)).status).toBe(403);
  expect(
    (
      await api("post", `${path}/editar`).send({
        name: p.name,
        specialty: p.specialty,
        instructions: p.instructions,
        expectedVersion: 2,
      })
    ).status,
  ).toBe(403);
  const history = (await api("get", `${path}/historico`)).body as HistoryPage;
  expect(history.items.filter((i) => i.event === "persona.suspended")).toHaveLength(1);
  expect(
    (await db.query("SELECT revoked_at FROM oauth_concessao_v2 WHERE id=$1", [grantId])).rows[0]
      .revoked_at,
  ).not.toBeNull();
  // Independent revocation stays terminal after recovery, even if the token hash is unchanged.
  await db.query("UPDATE persona_token SET revoked_at=now() WHERE id=$1", [token.body.tokenId]);
  const recover = await api("post", `${path}/recuperar`).send({ expectedVersion: 2 });
  expect(recover.status).toBe(200);
  expect(recover.body.persona).toMatchObject({ active: true, authorizationVersion: 3 });
  expect((await discover()).status).toBe(401);
  expect(() =>
    assertConsumer(identity, { ...state, persona: recover.body.persona as Persona }, new Date()),
  ).toThrow("autorização mudou");
  expect(
    (
      await api("post", `${skill.path}/publicar`).send({
        confirmationHash: preview.body.confirmationHash,
      })
    ).status,
  ).toBe(409);
  const old = await db.query("SELECT pacote FROM publicacao WHERE id=$1", [skill.publication.id]);
  expect(old.rows[0].pacote).toEqual(skill.publication.package);
  expect(
    (
      await db.query("SELECT count(*)::int n FROM publicacao_suspensao WHERE publicacao_id=$1", [
        skill.publication.id,
      ])
    ).rows[0].n,
  ).toBe(1);
  expect((await api("get", `${skill.path}/publicacao`)).body.publication).toBeNull();
  expect((await api("post", `${path}/recuperar`).send({ expectedVersion: 3 })).status).toBe(409);
  expect((await api("get", `${path}/fontes`)).body.fontes).toHaveLength(1);
});

it("estado da persona exige responsável vigente, CAS e proteção de origem/CSRF", async () => {
  const p = await persona(),
    path = `/api/admin/personas/${p.id}/suspender`;
  const bad = await request(runtime.app)
    .post(path)
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .set("Cookie", session.cookie)
    .send({ expectedVersion: 1 });
  expect(bad.status).toBe(403);
  expect((await api("post", path).send({ expectedVersion: 0 })).status).toBe(400);
  owner = "owner-b";
  await login();
  expect((await api("post", path).send({ expectedVersion: 1 })).status).toBe(403);
  owner = "owner-a";
  await login();
  active = false;
  expect((await api("post", path).send({ expectedVersion: 1 })).status).toBe(401);
  expect(
    (await db.query("SELECT ativa,authorization_version FROM persona WHERE id=$1", [p.id])).rows[0],
  ).toEqual({ ativa: true, authorization_version: 1 });
});

it("falha no registro da suspensão desfaz estado, publicações e revogação na mesma transação", async () => {
  const p = await persona(),
    s = await source(p),
    skill = await publish(p, s);
  const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const token = await api("post", `/api/admin/personas/${p.id}/tokens`).send({
    name: "Rollback",
    expiresAt: null,
    permissions: empty,
    delegation: empty,
  });
  const grantId = randomUUID();
  await db.query(
    `INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at)
    VALUES($1,$2,$3,1,$4,'fixture-client',now()+interval '1 day')`,
    [grantId, p.id, token.body.tokenId, JSON.stringify(empty)],
  );
  await db.query(`CREATE FUNCTION fixture_deny_state_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.evento='persona.suspended' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fixture_deny_state_audit BEFORE INSERT ON audit_v2 FOR EACH ROW EXECUTE FUNCTION fixture_deny_state_audit()`);
  try {
    const response = await api("post", `/api/admin/personas/${p.id}/suspender`).send({
      expectedVersion: 1,
    });
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("fixture audit failure");
    expect(
      (await db.query("SELECT ativa,authorization_version FROM persona WHERE id=$1", [p.id]))
        .rows[0],
    ).toEqual({ ativa: true, authorization_version: 1 });
    expect(
      (await db.query("SELECT revoked_at FROM oauth_concessao_v2 WHERE id=$1", [grantId])).rows[0]
        .revoked_at,
    ).toBeNull();
    expect(
      (
        await db.query("SELECT count(*)::int n FROM publicacao_suspensao WHERE publicacao_id=$1", [
          skill.publication.id,
        ])
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await db.query(
      "DROP TRIGGER fixture_deny_state_audit ON audit_v2; DROP FUNCTION fixture_deny_state_audit()",
    );
  }
});

it("validação identifica campos públicos sem refletir valores, SQL ou nomes dinâmicos", async () => {
  const p = await persona();
  const response = await api("post", `/api/admin/personas/${p.id}/fontes`).send({
    name: "Fixture",
    purpose: "Pedidos",
    environment: "test",
    agentId: "not-a-uuid",
    email: "not-an-email",
    password: "fixture-private-password",
    clientToken: "fixture-private-token",
    dialect: "postgres",
    "private-dynamic-field": "SELECT sensitive FROM private",
  });
  expect(response.status).toBe(400);
  expect(response.body.error.fields).toEqual(["agentId", "email"]);
  expect(JSON.stringify(response.body)).not.toMatch(
    /fixture-private|private-dynamic|SELECT sensitive|not-an-email/,
  );
});

it("impacto exige responsável vigente e não expõe dependências a outro responsável", async () => {
  const p = await persona(),
    s = await source(p);
  await publish(p, s);
  const path = `/api/admin/personas/${p.id}/fontes/${s.id}/impacto?expectedVersion=1`;
  owner = "owner-b";
  await login();
  const denied = await api("get", path);
  expect(denied.status).toBe(403);
  expect(denied.body).not.toHaveProperty("publications");
  owner = "owner-a";
  await login();
  active = false;
  expect((await api("get", path)).status).toBe(401);
});

it("edição da persona invalida preview, sem alterar snapshot publicado", async () => {
  const p = await persona(),
    s = await source(p),
    skill = await publish(p, s);
  const preview = await api("post", `${skill.path}/preview`).send({
    reviewDueAt: reviewDateFixture(),
  });
  expect(
    (
      await api("post", `/api/admin/personas/${p.id}/editar`).send({
        expectedVersion: 1,
        name: p.name,
        specialty: "Outra especialidade",
        instructions: p.instructions,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await api("post", `${skill.path}/publicar`).send({
        confirmationHash: preview.body.confirmationHash,
      })
    ).status,
  ).toBe(409);
  expect((await api("get", `${skill.path}/publicacao`)).body.publication.package).toEqual(
    skill.publication.package,
  );
});

it("editar fonte suspende somente publicações afetadas e dependências transitivas", async () => {
  const p = await persona(),
    a = await source(p),
    b = await source(p),
    skillA = await publish(p, a),
    skillB = await publish(p, b);
  const other = await persona(),
    shared = await source(other),
    otherSkill = await publish(other, shared);
  const dependent = randomUUID(),
    leaf = randomUUID();
  for (const [id, parent] of [
    [dependent, skillA.publication.id],
    [leaf, dependent],
  ] as const) {
    const skill = randomUUID();
    await db.query(
      "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,$3,'cruzamento','Fixture','{}')",
      [skill, p.id, `dependent-${skill}`],
    );
    await db.query(
      "INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash) VALUES($1,$2,$3,1,'{}',$4)",
      [id, p.id, skill, "a".repeat(64)],
    );
    await db.query(
      "INSERT INTO publicacao_dependencia(persona_id,publicacao_id,dependencia_id) VALUES($1,$2,$3)",
      [p.id, id, parent],
    );
  }
  await db.query("UPDATE skill_v2 SET nome='Rascunho posterior' WHERE id=$1", [skillA.id]);
  const impactPath = `/api/admin/personas/${p.id}/fontes/${a.id}/impacto?expectedVersion=1`;
  const impact = await api("get", impactPath);
  expect(impact.status).toBe(200);
  expect(impact.body).toMatchObject({ sourceVersion: 1, total: 3 });
  expect(impact.body.publications).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        publicationId: skillA.publication.id,
        name: "Pedidos",
        revision: 1,
        active: true,
        direct: true,
      }),
      expect.objectContaining({ publicationId: leaf, active: false, direct: false }),
    ]),
  );
  expect(JSON.stringify(impact.body)).not.toContain("Rascunho posterior");
  expect(Object.keys(impact.body.publications[0]).sort()).toEqual([
    "active",
    "direct",
    "kind",
    "name",
    "publicationId",
    "revision",
    "skillId",
    "suspended",
  ]);
  expect(
    (await api("get", `/api/admin/personas/${other.id}/fontes/${a.id}/impacto?expectedVersion=1`))
      .status,
  ).toBe(403);
  expect(
    (await api("get", impactPath.replace("expectedVersion=1", "expectedVersion=2"))).status,
  ).toBe(409);
  expect((await api("get", impactPath.split("?")[0]!)).status).toBe(400);
  const r = await api("post", `/api/admin/personas/${p.id}/fontes/${a.id}/editar`).send({
    ...metadata(a),
    purpose: "Novo significado",
    rowRestrictions: [{ table: "orders", column: "id", parameter: "__scope_owner", value: 1 }],
  });
  expect(r.status).toBe(200);
  expect(r.body.fonte.authorizationVersion).toBe(2);
  expect((await api("get", impactPath)).status).toBe(409);
  const suspendedImpact = await api(
    "get",
    impactPath.replace("expectedVersion=1", "expectedVersion=2"),
  );
  expect(
    (suspendedImpact.body.publications as { suspended: boolean }[]).every(
      (item: { suspended: boolean }) => item.suspended,
    ),
  ).toBe(true);
  expect(
    (
      await db.query(
        "SELECT publicacao_id FROM publicacao_suspensao WHERE persona_id=$1 ORDER BY publicacao_id",
        [p.id],
      )
    ).rows
      .map((item) => item.publicacao_id)
      .sort(),
  ).toEqual([skillA.publication.id, dependent, leaf].sort());
  expect((await api("get", `${skillA.path}/publicacao`)).body.publication).toBeNull();
  expect((await api("get", `${skillB.path}/publicacao`)).body.publication.id).toBe(
    skillB.publication.id,
  );
  expect((await api("get", `${otherSkill.path}/publicacao`)).body.publication.id).toBe(
    otherSkill.publication.id,
  );
  expect(
    (await api("post", `/api/admin/personas/${p.id}/fontes/${a.id}/editar`).send(metadata(a)))
      .status,
  ).toBe(409);
});

it("suspende e recupera somente o vínculo revisado, sem reativar suas publicações", async () => {
  const p = await persona(),
    s = await source(p),
    independent = await source(p);
  const skill = await publish(p, s),
    otherSkill = await publish(p, independent);
  const other = await persona(),
    shared = await source(other),
    sharedSkill = await publish(other, shared);
  const path = `/api/admin/personas/${p.id}/fontes/${s.id}`;
  const snapshot = skill.publication.package;
  verify.mockClear();
  const responses = await Promise.all([
    api("post", `${path}/suspender`).send({ expectedVersion: 1 }),
    api("post", `${path}/suspender`).send({ expectedVersion: 1 }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(verify).not.toHaveBeenCalled();
  expect((await api("get", `${path}/impacto?expectedVersion=2`)).status).toBe(200);
  expect((await api("get", `${skill.path}/publicacao`)).body.publication).toBeNull();
  expect((await api("get", `${otherSkill.path}/publicacao`)).body.publication.id).toBe(
    otherSkill.publication.id,
  );
  expect((await api("get", `${sharedSkill.path}/publicacao`)).body.publication.id).toBe(
    sharedSkill.publication.id,
  );
  const recovery = await api("post", `${path}/recuperar`).send({ expectedVersion: 2 });
  expect(recovery.status).toBe(200);
  expect(recovery.body.fonte).toMatchObject({
    id: s.id,
    active: true,
    authorizationVersion: 3,
    credentialVersion: 1,
    identityHash: s.identityHash,
  });
  expect(verify).toHaveBeenLastCalledWith({
    agentId: s.agentId,
    database: s.database,
    dialect: s.dialect,
    email: "source-b@fixture.test",
    password: "fixture",
    clientToken: "fixture-token",
  });
  expect((await api("get", `${skill.path}/publicacao`)).body.publication).toBeNull();
  expect(
    (await db.query("SELECT pacote FROM publicacao WHERE id=$1", [skill.publication.id])).rows[0]
      .pacote,
  ).toEqual(snapshot);
  const events = (
    (await api("get", `/api/admin/personas/${p.id}/historico?resourceId=${s.id}`))
      .body as HistoryPage
  ).items;
  expect(events.filter((e) => e.event === "source.suspended")).toHaveLength(1);
  expect(events.find((e) => e.event === "source.recovered")).toMatchObject({
    previousVersion: 2,
    version: 3,
    actor: { kind: "responsavel" },
  });
});

it("recuperação pode trocar credenciais da mesma base, sem devolver ou auditar segredos", async () => {
  const p = await persona(),
    s = await source(p),
    path = `/api/admin/personas/${p.id}/fontes/${s.id}`;
  await api("post", `${path}/suspender`).send({ expectedVersion: 1 });
  const { expectedVersion: _version, ...credentials } = credential(s);
  const response = await api("post", `${path}/recuperar`).send({ expectedVersion: 2, credentials });
  expect(response.status).toBe(200);
  expect(response.body.fonte).toMatchObject({
    active: true,
    credentialVersion: 2,
    authorizationVersion: 3,
  });
  const crypto = new NodeCryptoAdapter(testConfig().MCP_ENCRYPTION_KEY);
  const stored = (await db.query("SELECT * FROM fonte_credencial WHERE id=$1", [s.credentialId]))
    .rows[0];
  expect(crypto.decrypt(stored.email_enc)).toBe(credentials.email);
  const audit = (await db.query("SELECT * FROM audit_v2 WHERE persona_id=$1", [p.id])).rows;
  for (const value of Object.values(credentials))
    expect(JSON.stringify([response.body, stored, audit])).not.toContain(value);
});

it("recuperação recusa prova divergente e falha de transporte sem reassociar a base", async () => {
  const p = await persona(),
    s = await source(p),
    path = `/api/admin/personas/${p.id}/fontes/${s.id}`;
  await api("post", `${path}/suspender`).send({ expectedVersion: 1 });
  verify.mockRejectedValueOnce(new Error("fixture-upstream-private-error"));
  const failed = await api("post", `${path}/recuperar`).send({ expectedVersion: 2 });
  expect(failed.status).toBe(503);
  expect(JSON.stringify(failed.body)).not.toContain("fixture-upstream-private");
  verify.mockResolvedValueOnce({
    database: "fixture",
    dialect: "postgres",
    identityHash: "e".repeat(64),
    verifiedAt: new Date().toISOString(),
  });
  expect((await api("post", `${path}/recuperar`).send({ expectedVersion: 2 })).status).toBe(409);
  const listed = (await api("get", `/api/admin/personas/${p.id}/fontes`)).body as {
    fontes: Source[];
  };
  const current = listed.fontes.find((x) => x.id === s.id);
  expect(current).toMatchObject({
    active: false,
    authorizationVersion: 2,
    physicalSourceId: s.physicalSourceId,
    identityHash: s.identityHash,
  });
});

it("recuperação revalida CAS e responsável após a prova sem manter lock durante a rede", async () => {
  const p = await persona(),
    s = await source(p),
    path = `/api/admin/personas/${p.id}/fontes/${s.id}`;
  await api("post", `${path}/suspender`).send({ expectedVersion: 1 });
  const proof = {
    database: s.database,
    dialect: "postgres" as const,
    identityHash: s.identityHash!,
    verifiedAt: new Date().toISOString(),
  };
  verify.mockImplementationOnce(async () => {
    const tx = await db.connect();
    try {
      await tx.query("BEGIN");
      await tx.query("SET LOCAL lock_timeout='500ms'");
      await tx.query("SELECT id FROM persona WHERE id=$1 FOR UPDATE", [p.id]);
      await tx.query("UPDATE fonte SET authorization_version=authorization_version+1 WHERE id=$1", [
        s.id,
      ]);
      await tx.query("COMMIT");
    } finally {
      tx.release();
    }
    return proof;
  });
  expect((await api("post", `${path}/recuperar`).send({ expectedVersion: 2 })).status).toBe(409);
  verify.mockImplementationOnce(async () => {
    active = false;
    return proof;
  });
  expect((await api("post", `${path}/recuperar`).send({ expectedVersion: 3 })).status).toBe(401);
  expect((await db.query("SELECT ativa FROM fonte WHERE id=$1", [s.id])).rows[0].ativa).toBe(false);
});

it("substituição concorrente cria só uma fonte e preserva referências e concessões anteriores", async () => {
  const p = await persona(),
    s = await source(p),
    skill = await publish(p, s);
  const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const token = await api("post", `/api/admin/personas/${p.id}/tokens`).send({
    name: "Fonte original",
    expiresAt: null,
    permissions: {
      ...empty,
      sourceIds: [s.id],
      skills: [
        {
          skillId: skill.id,
          capabilities: (skill.publication.package as { requiredCapabilities: string[] })
            .requiredCapabilities,
          effects: ["select"],
          requireHumanApproval: false,
        },
      ],
    },
    delegation: empty,
  });
  expect(token.status).toBe(201);
  const originalPermissions = (
    await db.query("SELECT permissoes FROM persona_token WHERE id=$1", [token.body.tokenId])
  ).rows[0].permissoes;
  const path = `/api/admin/personas/${p.id}/fontes/${s.id}`;
  const input = replacement(s);
  const responses = await Promise.all([
    api("post", `${path}/substituir`).send(input),
    api("post", `${path}/substituir`).send(input),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  const next = responses.find((r) => r.status === 201)!.body.fonte as Source;
  expect(next.id).not.toBe(s.id);
  expect(next.credentialId).not.toBe(s.credentialId);
  const all = (await api("get", `/api/admin/personas/${p.id}/fontes`)).body.fontes as Source[];
  expect(all).toHaveLength(2);
  expect(all.find((x) => x.id === s.id)).toMatchObject({
    active: false,
    authorizationVersion: 2,
    replacedBySourceId: next.id,
  });
  expect(
    (await db.query("SELECT pacote FROM publicacao WHERE id=$1", [skill.publication.id])).rows[0]
      .pacote,
  ).toEqual(skill.publication.package);
  expect(
    (
      await db.query("SELECT fonte_id FROM publicacao_fonte WHERE publicacao_id=$1", [
        skill.publication.id,
      ])
    ).rows[0].fonte_id,
  ).toBe(s.id);
  expect(
    (await db.query("SELECT permissoes FROM persona_token WHERE id=$1", [token.body.tokenId]))
      .rows[0].permissoes,
  ).toEqual(originalPermissions);
  expect((await api("get", `${skill.path}/publicacao`)).body.publication).toBeNull();
  verify.mockClear();
  expect((await api("post", `${path}/recuperar`).send({ expectedVersion: 2 })).status).toBe(403);
  expect(
    (await api("post", `${path}/substituir`).send({ ...input, expectedVersion: 2 })).status,
  ).toBe(403);
  expect(verify).not.toHaveBeenCalled();
  const reply = await request(runtime.app)
    .post("/mcp")
    .set("Host", "127.0.0.1:3333")
    .set("Authorization", `Bearer ${token.body.bearer as string}`)
    .set("Accept", "application/json, text/event-stream")
    .send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "listar_fontes", arguments: {} },
    });
  const result = parseMcpPayload(reply).result as { content: { text: string }[] };
  expect(JSON.parse(result.content[0]!.text)).toEqual([]);
  const serialized = JSON.stringify([
    responses.map((r) => r.body),
    (await db.query("SELECT * FROM audit_v2 WHERE persona_id=$1", [p.id])).rows,
  ]);
  expect(serialized).not.toMatch(
    /replacement-fixture-password|replacement-fixture-token|replacement@fixture.test/,
  );
});

it("substituição exige responsável, CSRF e versão vigente antes de enviar credenciais", async () => {
  const p = await persona(),
    s = await source(p),
    path = `/api/admin/personas/${p.id}/fontes/${s.id}/substituir`;
  verify.mockClear();
  const noCsrf = await request(runtime.app)
    .post(path)
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .set("Cookie", session.cookie)
    .send(replacement(s));
  expect(noCsrf.status).toBe(403);
  expect((await api("post", path).send({ ...replacement(s), expectedVersion: 2 })).status).toBe(
    409,
  );
  owner = "owner-b";
  await login();
  expect((await api("post", path).send(replacement(s))).status).toBe(403);
  expect(verify).not.toHaveBeenCalled();
});

it("substituição malsucedida desfaz a nova credencial, vínculo, suspensão e auditoria", async () => {
  const p = await persona(),
    s = await source(p),
    skill = await publish(p, s);
  await db.query(`CREATE FUNCTION fixture_deny_replacement() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.evento='source.replaced' THEN RAISE EXCEPTION 'fixture replacement failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fixture_deny_replacement BEFORE INSERT ON audit_v2 FOR EACH ROW EXECUTE FUNCTION fixture_deny_replacement()`);
  try {
    expect(
      (
        await api("post", `/api/admin/personas/${p.id}/fontes/${s.id}/substituir`).send(
          replacement(s),
        )
      ).status,
    ).toBe(503);
    expect(
      (await db.query("SELECT count(*)::int n FROM fonte WHERE persona_id=$1", [p.id])).rows[0].n,
    ).toBe(1);
    expect(
      (await db.query("SELECT count(*)::int n FROM fonte_credencial WHERE persona_id=$1", [p.id]))
        .rows[0].n,
    ).toBe(1);
    expect((await api("get", `${skill.path}/publicacao`)).body.publication.id).toBe(
      skill.publication.id,
    );
    expect(
      (await db.query("SELECT ativa,substituida_por_id FROM fonte WHERE id=$1", [s.id])).rows[0],
    ).toEqual({ ativa: true, substituida_por_id: null });
  } finally {
    await db.query(
      "DROP TRIGGER fixture_deny_replacement ON audit_v2; DROP FUNCTION fixture_deny_replacement()",
    );
  }
});

it("validação de cadastro substituto e credenciais de recuperação revela somente campos públicos", async () => {
  const p = await persona(),
    s = await source(p),
    path = `/api/admin/personas/${p.id}/fontes/${s.id}`;
  const input = replacement(s);
  verify.mockClear();
  const response = await api("post", `${path}/substituir`).send({
    ...input,
    source: {
      ...input.source,
      agentId: "private-invalid-agent",
      "private-field": "SELECT secret FROM private",
    },
  });
  expect(response.status).toBe(400);
  expect(response.body.error.fields).toEqual(["agentId"]);
  expect(JSON.stringify(response.body)).not.toMatch(
    /private-invalid-agent|SELECT secret|private-field|replacement-fixture/,
  );
  await api("post", `${path}/suspender`).send({ expectedVersion: 1 });
  const invalid = await api("post", `${path}/recuperar`).send({
    expectedVersion: 2,
    credentials: {
      email: "private-invalid-email",
      password: "fixture-private-password",
      clientToken: "fixture-private-token",
    },
  });
  expect(invalid.status).toBe(400);
  expect(invalid.body.error.fields).toEqual(["email"]);
  expect(JSON.stringify(invalid.body)).not.toMatch(/private-invalid-email|fixture-private/);
  expect(verify).not.toHaveBeenCalled();
});

it("constraints impedem substituição entre personas, recuperação e alteração do histórico", async () => {
  const p = await persona(),
    s = await source(p),
    other = await persona(),
    foreign = await source(other);
  await expect(
    db.query("UPDATE fonte SET ativa=false,substituida_por_id=$2 WHERE id=$1", [s.id, foreign.id]),
  ).rejects.toMatchObject({ code: "23503" });
  const next = (
    await api("post", `/api/admin/personas/${p.id}/fontes/${s.id}/substituir`).send(replacement(s))
  ).body.fonte as Source;
  expect(next.id).toBeTruthy();
  await expect(db.query("UPDATE fonte SET ativa=true WHERE id=$1", [s.id])).rejects.toMatchObject({
    code: "23514",
  });
  await expect(
    db.query("UPDATE fonte SET substituida_por_id=NULL WHERE id=$1", [s.id]),
  ).rejects.toMatchObject({ code: "P0001" });
});

it("troca credencial sem rebind, cifra valores, incrementa versões e exige republicação", async () => {
  const p = await persona(),
    s = await source(p),
    skill = await publish(p, s);
  const r = await api("post", `/api/admin/personas/${p.id}/fontes/${s.id}/credencial`).send(
    credential(s),
  );
  expect(r.status).toBe(200);
  expect(r.body.fonte).toMatchObject({
    id: s.id,
    physicalSourceId: s.physicalSourceId,
    identityHash: s.identityHash,
    agentId: s.agentId,
    database: s.database,
    credentialVersion: 2,
    authorizationVersion: 2,
  });
  expect(verify).toHaveBeenLastCalledWith(
    expect.objectContaining({
      database: s.database,
      dialect: s.dialect,
      agentId: s.agentId,
      email: "rotated@fixture.test",
    }),
  );
  const stored = await db.query("SELECT * FROM fonte_credencial WHERE id=$1", [s.credentialId]);
  expect(stored.rows[0].versao).toBe(2);
  for (const value of ["new-fixture-password", "new-fixture-token", "rotated@fixture.test"]) {
    expect(JSON.stringify(stored.rows)).not.toContain(value);
    expect(JSON.stringify(r.body)).not.toContain(value);
    expect(
      JSON.stringify((await db.query("SELECT * FROM audit_v2 WHERE persona_id=$1", [p.id])).rows),
    ).not.toContain(value);
  }
  expect((await api("get", `${skill.path}/publicacao`)).body.publication).toBeNull();
});

it("falha da verificação não modifica credencial nem publicação", async () => {
  const p = await persona(),
    s = await source(p),
    skill = await publish(p, s);
  verify.mockRejectedValueOnce(new Error("upstream-secret-must-not-escape"));
  const r = await api("post", `/api/admin/personas/${p.id}/fontes/${s.id}/credencial`).send(
    credential(s),
  );
  expect(r.status).toBe(503);
  expect(JSON.stringify(r.body)).not.toContain("upstream-secret");
  expect(
    (await db.query("SELECT versao FROM fonte_credencial WHERE id=$1", [s.credentialId])).rows[0]
      .versao,
  ).toBe(1);
  expect((await api("get", `${skill.path}/publicacao`)).body.publication.id).toBe(
    skill.publication.id,
  );
});

it("rotação invalida relatório obrigatório mesmo quando treinamento e capacidades não mudaram", async () => {
  const p = await persona(),
    s = await source(p),
    skill = await publish(p, s);
  const added = await api("post", `${skill.path}/casos`).send({
    required: true,
    content: { name: "Caso sintético de metadados", input: {}, expected: {} },
  });
  expect(added.status).toBe(201);
  // A trusted fixture seeds a report to test freshness; no endpoint accepts report approval.
  const crypto = new NodeCryptoAdapter("a".repeat(64));
  await new PostgresPersonaRepository(db).transaction(
    { personaIds: [p.id], tokenIds: [] },
    async (tx) => {
      const draft = (await tx.catalog.find(p.id, skill.id))!;
      const cases = await tx.catalog.cases(p.id, skill.id);
      await tx.catalog.saveReport(
        p.id,
        skill.id,
        draft.revision,
        crypto.sha256Hex(canonicalJson(skill.publication.package)),
        crypto.sha256Hex(canonicalJson(cases)),
        true,
        cases.map((c) => ({ id: c.id, passed: true })),
      );
    },
  );
  expect(
    (await api("post", `${skill.path}/preview`).send({ reviewDueAt: reviewDateFixture() })).status,
  ).toBe(200);
  expect(
    (await api("post", `/api/admin/personas/${p.id}/fontes/${s.id}/credencial`).send(credential(s)))
      .status,
  ).toBe(200);
  const preview = await api("post", `${skill.path}/preview`).send({
    reviewDueAt: reviewDateFixture(),
  });
  expect(preview.status).toBe(409);
  expect(preview.body.error.code).toBe("INCOMPLETE_INPUT");
});

it("identidade divergente suspende vínculos compartilhados sem gravar novas credenciais", async () => {
  const p = await persona(),
    s = await source(p),
    skill = await publish(p, s);
  const other = await persona(),
    shared = await source(other),
    otherSkill = await publish(other, shared);
  verify.mockResolvedValueOnce({
    database: "fixture",
    dialect: "postgres",
    identityHash: "e".repeat(64),
    verifiedAt: new Date().toISOString(),
  });
  const r = await api("post", `/api/admin/personas/${p.id}/fontes/${s.id}/credencial`).send(
    credential(s),
  );
  expect(r.status).toBe(409);
  expect(r.body.error.code).toBe("STALE_AUTHORIZATION");
  expect(
    (await db.query("SELECT ativa FROM fonte WHERE id=ANY($1::uuid[])", [[s.id, shared.id]])).rows,
  ).toEqual([{ ativa: false }, { ativa: false }]);
  expect(
    (await db.query("SELECT versao FROM fonte_credencial WHERE id=$1", [s.credentialId])).rows[0]
      .versao,
  ).toBe(1);
  expect((await api("get", `${skill.path}/publicacao`)).body.publication).toBeNull();
  expect((await api("get", `${otherSkill.path}/publicacao`)).body.publication).toBeNull();
});

it("revalida responsável e CAS após a rede, sem transação mantida durante a verificação", async () => {
  const p = await persona(),
    s = await source(p);
  verify.mockImplementationOnce(async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='500ms'");
      await client.query("SELECT id FROM persona WHERE id=$1 FOR UPDATE", [p.id]);
      await client.query(
        "UPDATE fonte SET authorization_version=authorization_version+1 WHERE id=$1",
        [s.id],
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    return {
      database: "fixture",
      dialect: "postgres",
      identityHash: "f".repeat(64),
      verifiedAt: new Date().toISOString(),
    };
  });
  expect(
    (await api("post", `/api/admin/personas/${p.id}/fontes/${s.id}/credencial`).send(credential(s)))
      .status,
  ).toBe(409);
  const current = { ...s, authorizationVersion: 2 };
  verify.mockImplementationOnce(async () => {
    active = false;
    return {
      database: "fixture",
      dialect: "postgres",
      identityHash: "f".repeat(64),
      verifiedAt: new Date().toISOString(),
    };
  });
  expect(
    (
      await api("post", `/api/admin/personas/${p.id}/fontes/${s.id}/credencial`).send(
        credential(current),
      )
    ).status,
  ).toBe(401);
  expect(
    (await db.query("SELECT versao FROM fonte_credencial WHERE id=$1", [s.credentialId])).rows[0]
      .versao,
  ).toBe(1);
});

it("nega outro responsável antes de enviar credenciais e mantém CSRF/Origin obrigatórios", async () => {
  const p = await persona(),
    s = await source(p);
  owner = "owner-b";
  await login();
  verify.mockClear();
  const path = `/api/admin/personas/${p.id}/fontes/${s.id}/credencial`;
  expect((await api("post", path).send(credential(s))).status).toBe(403);
  expect(verify).not.toHaveBeenCalled();
  expect(
    (
      await request(runtime.app)
        .post(path)
        .set("Host", "127.0.0.1:3333")
        .set("Cookie", session.cookie)
        .send(credential(s))
    ).status,
  ).toBe(403);
});

it("lista tokens sem hash, usa CAS na edição e rotação invalida Bearer e derivados", async () => {
  const p = await persona();
  const path = `/api/admin/personas/${p.id}/tokens`;
  const permissions = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const issued = await api("post", path).send({
    name: "Consumidor",
    permissions,
    delegation: permissions,
    expiresAt: null,
  });
  expect(issued.status).toBe(201);
  const id = issued.body.tokenId as string,
    bearer = issued.body.bearer as string;
  const repository = new PostgresPersonaRepository(db),
    crypto = new NodeCryptoAdapter("a".repeat(64));
  expect(await repository.authentication(crypto.sha256Hex(bearer))).not.toBeNull();
  const list = await api("get", path);
  expect(list.status).toBe(200);
  expect(JSON.stringify(list.body)).not.toContain("tokenHash");
  expect(JSON.stringify(list.body)).not.toContain(bearer);
  const derived = randomUUID();
  await db.query(
    "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,$4,'fixture',now()+interval '1 hour')",
    [derived, p.id, id, permissions],
  );
  const body = {
    expectedVersion: 1,
    name: "Renomeado",
    permissions,
    delegation: permissions,
    expiresAt: null,
  };
  const concurrent = await Promise.all([
    api("post", `${path}/${id}/editar`).send(body),
    api("post", `${path}/${id}/editar`).send(body),
  ]);
  expect(concurrent.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    (await db.query("SELECT revoked_at FROM oauth_concessao_v2 WHERE id=$1", [derived])).rows[0]
      .revoked_at,
  ).not.toBeNull();
  const rotated = await api("post", `${path}/${id}/rotacionar`).send({
    ...body,
    expectedVersion: 2,
  });
  expect(rotated.status).toBe(200);
  expect(await repository.authentication(crypto.sha256Hex(bearer))).toBeNull();
  expect(
    await repository.authentication(crypto.sha256Hex(rotated.body.bearer as string)),
  ).not.toBeNull();
  expect((await api("post", `${path}/${id}/revogar`).send({})).status).toBe(204);
  expect(
    (await api("post", `${path}/${id}/rotacionar`).send({ ...body, expectedVersion: 4 })).status,
  ).toBe(409);
});

it("nega gestão de token de outra persona e recusa delegação superior ou prazo vencido", async () => {
  const p = await persona();
  const path = `/api/admin/personas/${p.id}/tokens`;
  const permissions = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const issued = await api("post", path).send({
    name: "Consumidor",
    permissions,
    delegation: permissions,
    expiresAt: null,
  });
  const id = issued.body.tokenId as string;
  const body = {
    expectedVersion: 1,
    name: "Consumidor",
    permissions,
    delegation: permissions,
    expiresAt: null,
  };
  expect(
    (
      await api("post", `${path}/${id}/editar`).send({
        ...body,
        delegation: { ...permissions, administrative: ["gerenciar_tokens"] },
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await api("post", `${path}/${id}/editar`).send({
        ...body,
        expiresAt: "2020-01-01T00:00:00.000Z",
      })
    ).status,
  ).toBe(409);
  const other = await persona();
  expect(
    (await api("post", `/api/admin/personas/${other.id}/tokens/${id}/editar`).send(body)).status,
  ).toBe(409);
  owner = "owner-b";
  await login();
  expect((await api("get", path)).status).toBe(403);
  expect((await api("post", `${path}/${id}/rotacionar`).send(body)).status).toBe(403);
});
