import { randomUUID } from "node:crypto";
import { PostgresPersonaEphemeralWorker } from "../../src/infrastructure/persistence/persona-v2/ephemeral-worker.js";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { testConfig } from "../../src/config/env.js";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { INTERACTION_ERROR_REPORTS_PER_HOUR } from "../../src/domain/persona-v2/interaction-error-report.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { parseMcpPayload } from "../helpers/mcp-rpc.js";

const base = new URL(personaV2TestDatabaseUrl());
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const name = `interaction_error_${randomUUID().replaceAll("-", "")}_test`;
base.pathname = `/${name}`;
const adminDb = new pg.Pool({ connectionString: adminUrl.toString() });
const db = new pg.Pool({ connectionString: base.toString() });
let runtime: Awaited<ReturnType<typeof composePersonaV2>>;
let clientId = "interaction-owner-a";
let cookie = "";
let csrf = "";
let personaId = "";
let otherPersonaId = "";
const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
const grantedSkill = "11111111-1111-4111-8111-111111111111";

const post = (path: string, body: object, auth = { cookie, csrf }) =>
  request(runtime.app)
    .post(path)
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .set("Cookie", auth.cookie)
    .set("X-CSRF-Token", auth.csrf)
    .send(body);
const get = (path: string, auth = { cookie, csrf }) =>
  request(runtime.app)
    .get(path)
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .set("Cookie", auth.cookie)
    .set("X-CSRF-Token", auth.csrf);
const call = async (token: string | undefined, args: object) => {
  const response = await request(runtime.app)
    .post("/mcp")
    .set("Host", "127.0.0.1:3333")
    .set("Accept", "application/json, text/event-stream")
    .set(token ? { Authorization: `Bearer ${token}` } : {})
    .send({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "tools/call",
      params: { name: "reportar_erro_interacao", arguments: args },
    });
  if (!token) return { status: response.status, denied: true, value: parseMcpPayload(response) };
  const payload = parseMcpPayload(response);
  if (payload.error) return { status: response.status, denied: true, value: payload.error };
  const result = payload.result as { isError?: boolean; content?: { text: string }[] };
  return {
    status: response.status,
    denied: result.isError === true,
    value: result.content?.[0]
      ? (JSON.parse(result.content[0].text) as Record<string, unknown>)
      : result,
  };
};
const reportIdOf = (value: unknown): string => {
  if (
    !value ||
    typeof value !== "object" ||
    !("reportId" in value) ||
    typeof value.reportId !== "string"
  ) {
    throw new Error("Relato sem reportId.");
  }
  return value.reportId;
};
const report = (supportId: string, question = "Qual o total de pedidos sintéticos?") => ({
  question,
  category: "consulta",
  skillId: grantedSkill,
  error: {
    code: "AUTHORIZATION_DENIED",
    message: "Concessão indisponível para esta consulta.",
    supportId,
    source: "mcp",
    tool: "consultar_dados",
  },
  execution: {
    summary: "Li a skill e a consulta foi recusada.",
    steps: [
      { tool: "obter_skill", outcome: "sucesso", note: "Li a skill concedida." },
      { tool: "consultar_dados", outcome: "erro", note: "A consulta foi recusada." },
    ],
  },
});

beforeAll(async () => {
  await adminDb.query(`CREATE DATABASE "${name}"`);
  await applyPersonaMigrations(base.toString());
  runtime = await composePersonaV2(testConfig({ DATABASE_URL: base.toString() }), {
    ownerAuth: {
      hubOrigin: "http://hub.fixture.test",
      login: async () => ({ accessToken: clientId }),
      profile: async (accessToken) => ({ clientId: accessToken, active: true }),
    },
  });
  const login = async () => {
    const response = await request(runtime.app)
      .post("/api/admin/login")
      .set("Host", "127.0.0.1:3333")
      .set("Origin", "http://127.0.0.1:3333")
      .send({ email: "owner@fixture.test", password: "fixture-password" })
      .expect(200);
    return {
      cookie: (response.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!,
      csrf: response.body.csrfToken as string,
    };
  };
  ({ cookie, csrf } = await login());
  personaId = (
    await post("/api/admin/personas", {
      name: "Relatos",
      specialty: "Teste",
      instructions: "Usar somente fatos publicados",
    }).expect(201)
  ).body.persona.id;
  await db.query(
    "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,'fixture','consulta','Fixture','{}')",
    [grantedSkill, personaId],
  );
  otherPersonaId = (
    await post("/api/admin/personas", {
      name: "Outra persona",
      specialty: "Teste",
      instructions: "Sem relatos",
    }).expect(201)
  ).body.persona.id;
});
afterAll(async () => {
  await runtime?.close();
  await db.end();
  await adminDb.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
    [name],
  );
  await adminDb.query(`DROP DATABASE "${name}"`);
  await adminDb.end();
});

it("grava o relato completo, não o atualiza e limita a persona dona", async () => {
  const issued = await post(`/api/admin/personas/${personaId}/tokens`, {
    name: "Consumidor",
    expiresAt: null,
    permissions: {
      ...empty,
      skills: [
        {
          skillId: grantedSkill,
          capabilities: ["fixture"],
          effects: ["select"],
          requireHumanApproval: false,
        },
      ],
    },
    delegation: empty,
  }).expect(201);
  const token = issued.body.bearer as string;
  const supportId = randomUUID();
  const created = await call(token, report(supportId, "Pergunta original do cliente"));
  expect(created.denied, JSON.stringify(created.value)).toBe(false);
  expect(created.value).toMatchObject({
    trainingChanged: false,
    authorityChanged: false,
    retryAuthorized: false,
  });
  const replay = await call(token, report(supportId, "Pergunta alterada que não pode substituir"));
  expect(replay.value).toMatchObject({ reportId: reportIdOf(created.value) });
  const foreignSkill = await call(token, {
    ...report(randomUUID()),
    skillId: "33333333-3333-4333-8333-333333333333",
  });
  expect(foreignSkill.denied).toBe(true);
  expect(foreignSkill.value).toMatchObject({
    error: { code: "AUTHORIZATION_DENIED" },
  });
  const protocol = await call(token, {
    question: "A conexão caiu antes de qualquer tool.",
    category: "protocolo",
    error: { code: "CAPABILITY_UNAVAILABLE", message: "Serviço indisponível." },
    execution: { summary: "Nenhuma tool chegou a executar.", steps: [] },
  });
  expect(protocol.denied, JSON.stringify(protocol.value)).toBe(false);
  const secret = await call(token, {
    ...report(randomUUID()),
    question: "password=segredo-colado",
  });
  expect(secret.denied).toBe(true);
  for (const pasted of ['{"password":"synthetic123"}', "refresh_token=synthetic123"]) {
    expect((await call(token, { ...report(randomUUID()), question: pasted })).denied).toBe(true);
  }
  const listed = await get(`/api/admin/personas/${personaId}/erros-interacao`).expect(200);
  const items = listed.body.items as { question: string; skillId?: string; category: string }[];
  expect(items.map((item) => item.question)).toEqual([
    "A conexão caiu antes de qualquer tool.",
    "Pergunta original do cliente",
  ]);
  expect(items[1]).toMatchObject({ skillId: grantedSkill, category: "consulta" });
  const other = await get(`/api/admin/personas/${otherPersonaId}/erros-interacao`).expect(200);
  expect(other.body.items).toEqual([]);
  // Seed an already expired payload in the isolated fixture.
  const id = reportIdOf(created.value);
  await db.query(
    `WITH removed AS (DELETE FROM interaction_error_text_v2 WHERE id=$1 RETURNING *)
    INSERT INTO interaction_error_text_v2 SELECT id,question,category_detail,error_message,execution,
    clock_timestamp()-interval '1 second' FROM removed`,
    [id],
  );
  const expired = (
    await get(`/api/admin/personas/${personaId}/erros-interacao`).expect(200)
  ).body.items.find((item: { id: string }) => item.id === id);
  expect(expired).toMatchObject({ textExpired: true, error: { supportId } });
  expect(expired).not.toHaveProperty("question");
  expect(expired).not.toHaveProperty("execution");
  expect(expired.error).not.toHaveProperty("message");
  const worker = new PostgresPersonaEphemeralWorker(db);
  const now = new Date();
  const owner = randomUUID();
  expect(await worker.claim(owner, now, new Date(now.getTime() + 10000))).toBe(true);
  try {
    expect((await worker.process(owner, now)).interactionTexts).toBe(1);
  } finally {
    await worker.release(owner);
  }
  expect(
    (await db.query("SELECT id FROM interaction_error_text_v2 WHERE id=$1", [id])).rowCount,
  ).toBe(0);
  expect((await call(token, report(supportId))).value).toMatchObject({ reportId: id });
  clientId = "interaction-owner-b";
  const outsider = await request(runtime.app)
    .post("/api/admin/login")
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .send({ email: "other@fixture.test", password: "fixture-password" })
    .expect(200);
  const outsiderAuth = {
    cookie: (outsider.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!,
    csrf: outsider.body.csrfToken as string,
  };
  await get(`/api/admin/personas/${personaId}/erros-interacao`, outsiderAuth).expect(403);
  const audits = await db.query(
    "SELECT count(*)::int AS n FROM audit_v2 WHERE persona_id=$1 AND evento='interaction_error.reported'",
    [personaId],
  );
  expect(audits.rows[0].n).toBe(2);
  await expect(
    db.query("UPDATE interaction_error_report_v2 SET error_code='ALTERADO' WHERE persona_id=$1", [
      personaId,
    ]),
  ).rejects.toThrow(/immutable/i);
  const anonymous = await call(undefined, report(randomUUID()));
  expect(anonymous.status).toBeGreaterThanOrEqual(200);
  expect(
    (await db.query("SELECT count(*)::int AS n FROM interaction_error_report_v2")).rows[0].n,
  ).toBe(2);
  const invalid = await request(runtime.app)
    .post("/mcp")
    .set("Host", "127.0.0.1:3333")
    .set("Authorization", "Bearer invalid")
    .set("Accept", "application/json, text/event-stream")
    .send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "reportar_erro_interacao", arguments: report(randomUUID()) },
    });
  expect(invalid.status).toBe(401);
}, 60_000);

it("recusa o relato novo acima de vinte por hora e preserva o supportId já gravado", async () => {
  const issued = await post(`/api/admin/personas/${personaId}/tokens`, {
    name: "Cota",
    expiresAt: null,
    permissions: empty,
    delegation: empty,
  }).expect(201);
  const token = issued.body.bearer as string;
  const first = randomUUID();
  const created = await call(token, { ...report(first), skillId: undefined });
  expect(created.denied, JSON.stringify(created.value)).toBe(false);
  for (let index = 1; index < INTERACTION_ERROR_REPORTS_PER_HOUR; index += 1) {
    const next = await call(token, { ...report(randomUUID()), skillId: undefined });
    expect(next.denied, JSON.stringify(next.value)).toBe(false);
  }
  const blocked = await call(token, { ...report(randomUUID()), skillId: undefined });
  expect(blocked.denied).toBe(true);
  expect(blocked.value).toMatchObject({ error: { code: "BUDGET_EXCEEDED" } });
  const replay = await call(token, { ...report(first, "não substitui"), skillId: undefined });
  expect(replay.denied, JSON.stringify(replay.value)).toBe(false);
  expect(replay.value).toMatchObject({ reportId: reportIdOf(created.value) });
}, 60_000);
