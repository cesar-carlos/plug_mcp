import { withReviewDeadline } from "../helpers/review-deadline.js";
import { randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { testConfig } from "../../src/config/env.js";
import { queryTraining } from "../helpers/persona-v2-training.js";
import { parseMcpPayload } from "../helpers/mcp-rpc.js";
import { dropKnowledgeContextDatabase } from "../helpers/knowledge-context-cleanup.js";

const base = new URL(personaV2TestDatabaseUrl()),
  adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const name = `knowledge_context_${randomUUID().replaceAll("-", "")}_test`;
base.pathname = `/${name}`;
const adminDb = new pg.Pool({ connectionString: adminUrl.toString() }),
  db = new pg.Pool({ connectionString: base.toString() });
let runtime: Awaited<ReturnType<typeof composePersonaV2>>;
let cookie: string, csrf: string, personaId: string;
const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
const post = (path: string, body: object) =>
  request(runtime.app)
    .post(path)
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .set("Cookie", cookie)
    .set("X-CSRF-Token", csrf)
    .send(withReviewDeadline(path, body));
const get = (path: string) =>
  request(runtime.app)
    .get(path)
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .set("Cookie", cookie)
    .set("X-CSRF-Token", csrf);
const call = async (token: string, tool: string, args: object) => {
  const response = await request(runtime.app)
    .post("/mcp")
    .set("Host", "127.0.0.1:3333")
    .set("Authorization", `Bearer ${token}`)
    .set("Accept", "application/json, text/event-stream")
    .send({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "tools/call",
      params: { name: tool, arguments: args },
    });
  const payload = parseMcpPayload(response);
  if (payload.error) {
    return { denied: true, value: payload.error };
  }
  const result = payload.result as { isError?: boolean; content: { text: string }[] };
  return { denied: result.isError === true, value: JSON.parse(result.content[0]!.text) };
};
const fixture = async (slug = "visible") => {
  const source = await post(`/api/admin/personas/${personaId}/fontes`, {
    name: slug,
    purpose: "Fixture privada",
    environment: "test",
    agentId: randomUUID(),
    dialect: "postgres",
    email: "fixture@fixture.test",
    password: "fixture-password",
    clientToken: randomUUID(),
  }).expect(201);
  const sourceId = source.body.fonte.id as string;
  const training = {
    ...queryTraining(sourceId),
    columns: [
      ...queryTraining(sourceId).columns,
      {
        table: "orders",
        name: "hidden",
        meaning: "Cobalto confidencial",
        classification: "segredo",
      },
    ],
    rules: ["Calendário mercantil certificado"],
    examples: [
      {
        id: "approved",
        state: "approved",
        purpose: "Recebimentos sazonais",
        explanation: "Explicação revisada",
        sql: queryTraining().sqlModel,
      },
      {
        id: "inactive",
        state: "inactive",
        purpose: "Meteorito inativo",
        explanation: "Não buscar",
        sql: queryTraining().sqlModel,
      },
    ],
  };
  const draft = await post(`/api/admin/personas/${personaId}/skills`, {
    slug,
    name: "Consulta publicada",
    kind: "consulta",
    training,
  }).expect(201);
  const skillId = draft.body.skill.id as string,
    root = `/api/admin/personas/${personaId}/skills/${skillId}`;
  const preview = await post(`${root}/preview`, {}).expect(200);
  const published = await post(`${root}/publicar`, {
    confirmationHash: preview.body.confirmationHash,
  }).expect(201);
  const issued = await post(`/api/admin/personas/${personaId}/tokens`, {
    name: "Consumidor",
    expiresAt: null,
    permissions: {
      ...empty,
      sourceIds: [sourceId],
      skills: [
        {
          skillId,
          capabilities: preview.body.package.requiredCapabilities,
          effects: ["select"],
          requireHumanApproval: false,
        },
      ],
    },
    delegation: empty,
  }).expect(201);
  return {
    token: issued.body.bearer as string,
    tokenId: issued.body.tokenId as string,
    skillId,
    sourceId,
    publicationId: published.body.publication.id as string,
    root,
    training,
  };
};
beforeAll(async () => {
  await adminDb.query(`CREATE DATABASE "${name}"`);
  await applyPersonaMigrations(base.toString());
  runtime = await composePersonaV2(testConfig({ DATABASE_URL: base.toString() }), {
    ownerAuth: {
      hubOrigin: "http://hub.fixture.test",
      login: async () => ({ accessToken: "fixture-jwt-memory" }),
      profile: async () => ({ clientId: "curator-fixture", active: true }),
    },
    sourceVerifier: {
      verify: async () => ({
        database: "fixture",
        dialect: "postgres",
        identityHash: "f".repeat(64),
        verifiedAt: new Date().toISOString(),
      }),
    },
  });
  const login = await request(runtime.app)
    .post("/api/admin/login")
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .send({ email: "owner@fixture.test", password: "fixture-password" })
    .expect(200);
  cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  csrf = login.body.csrfToken;
});
beforeEach(async () => {
  personaId = (
    await post("/api/admin/personas", {
      name: "Conhecimento fixture",
      specialty: "Teste",
      instructions: "Usar somente fatos publicados",
    }).expect(201)
  ).body.persona.id;
});
afterAll(async () => {
  await runtime?.close();
  await db.end();
  try {
    await dropKnowledgeContextDatabase(adminDb, name);
  } finally {
    await adminDb.end();
  }
});
it("aguarda o backend real encerrar sem interromper sua conexão durante a limpeza", async () => {
  const ownedName = `knowledge_context_${randomUUID().replaceAll("-", "")}_test`;
  const ownedUrl = new URL(adminUrl);
  ownedUrl.pathname = `/${ownedName}`;
  await adminDb.query(`CREATE DATABASE "${ownedName}"`);
  const held = new pg.Client({ connectionString: ownedUrl.toString() });
  const errors: Error[] = [];
  held.on("error", (error) => errors.push(error));
  let observations = 0;
  let closing: Promise<void> | undefined;
  const observe = () => {
    observations++;
    if (observations === 2) closing = held.end();
  };
  try {
    await held.connect();
    adminDb.on("acquire", observe);
    await dropKnowledgeContextDatabase(adminDb, ownedName);
    expect(observations).toBeGreaterThanOrEqual(2);
    expect(errors).toEqual([]);
    const databases = await adminDb.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      ownedName,
    ]);
    expect(databases.rowCount).toBe(0);
  } finally {
    adminDb.off("acquire", observe);
    await (closing ?? held.end());
  }
});
it("feedback exige item e publicação concedidos e não modifica treinamento ou auditoria editorial", async () => {
  const f = await fixture();
  const search = await call(f.token, "buscar_contexto", { pergunta: "mercantil" });
  const itemId = search.value.matches[0].items[0].id as string;
  const input = {
    skillId: f.skillId,
    publicationId: f.publicationId,
    itemId,
    type: "correcao",
    content: "Calendário exige revisão editorial sintética",
  };
  const before = (
    await db.query("SELECT pacote,pacote_hash FROM publicacao WHERE id=$1", [f.publicationId])
  ).rows;
  const created = await call(f.token, "registrar_feedback_conhecimento", input);
  expect(created.denied, JSON.stringify(created.value)).toBe(false);
  expect(created.value).toMatchObject({
    state: "aberto",
    trainingChanged: false,
    semanticApproval: false,
  });
  for (const patch of [
    { itemId: "column:orders.hidden" },
    { publicationId: randomUUID() },
    { content: "Bearer abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop" },
  ]) {
    expect(
      (await call(f.token, "registrar_feedback_conhecimento", { ...input, ...patch })).denied,
    ).toBe(true);
  }
  expect(
    (await db.query("SELECT pacote,pacote_hash FROM publicacao WHERE id=$1", [f.publicationId]))
      .rows,
  ).toEqual(before);
  const audit = await db.query(
    "SELECT * FROM audit_v2 WHERE persona_id=$1 AND evento='feedback_conhecimento_registrado'",
    [personaId],
  );
  expect(audit.rows).toHaveLength(1);
  expect(JSON.stringify(audit.rows)).not.toContain(input.content);
  await expect(
    db.query(
      "UPDATE knowledge_feedback_v2 SET payload=jsonb_set(payload,'{content}','\"alterado\"') WHERE id=$1",
      [created.value.feedbackId],
    ),
  ).rejects.toThrow("immutable");
  const list = await get(`/api/admin/personas/${personaId}/feedback-conhecimento`).expect(200);
  expect(list.body.items).toHaveLength(1);
  expect(list.body.items[0].origin.kind).toBe("privado");
  const root = `/api/admin/personas/${personaId}/feedback-conhecimento/${created.value.feedbackId}/decidir`;
  const decisions = await Promise.all(
    [1, 2].map(() =>
      post(root, {
        expectedVersion: 1,
        reason: "Encerrado sem modificar o treinamento",
        proposal: null,
      }),
    ),
  );
  expect(decisions.map((d) => d.status).sort()).toEqual([200, 409]);
  const own = await call(f.token, "obter_feedback_conhecimento", {
    skillId: f.skillId,
    publicationId: f.publicationId,
    feedbackId: created.value.feedbackId,
  });
  expect(own.value.state).toBe("encerrado");
  await post(`/api/admin/personas/${personaId}/tokens/${f.tokenId}/revogar`, {}).expect(204);
  expect((await call(f.token, "registrar_feedback_conhecimento", input)).denied).toBe(true);
  expect(
    (
      await call(f.token, "obter_feedback_conhecimento", {
        skillId: f.skillId,
        publicationId: f.publicationId,
        feedbackId: created.value.feedbackId,
      })
    ).denied,
  ).toBe(true);
});
it("feedback e calendário não podem ser usados por outro consumidor ou outra persona", async () => {
  const f = await fixture(),
    other = await fixture("other");
  const data = await call(f.token, "registrar_feedback_conhecimento", {
    skillId: f.skillId,
    publicationId: f.publicationId,
    itemId: "skill",
    type: "lacuna",
    content: "Lacuna sintética",
  });
  expect(data.denied).toBe(false);
  expect(
    (
      await call(other.token, "obter_feedback_conhecimento", {
        skillId: other.skillId,
        publicationId: other.publicationId,
        feedbackId: data.value.feedbackId,
      })
    ).denied,
  ).toBe(true);
  expect(
    (await call(other.token, "obter_revisoes_conhecimento", { skillId: f.skillId })).denied,
  ).toBe(true);
  const previousPersona = personaId;
  personaId = (
    await post("/api/admin/personas", {
      name: "Outra",
      specialty: "Teste",
      instructions: "Isolada",
    }).expect(201)
  ).body.persona.id;
  expect(
    (await get(`/api/admin/personas/${personaId}/feedback-conhecimento`).expect(200)).body.items,
  ).toEqual([]);
  await post(
    `/api/admin/personas/${personaId}/feedback-conhecimento/${data.value.feedbackId}/decidir`,
    { expectedVersion: 1, reason: "Não autorizado", proposal: null },
  ).expect(403);
  personaId = previousPersona;
});
it("calendário exige prazo explícito, CAS e autoria, sem inventar datas ou alterar publicação", async () => {
  const f = await fixture(),
    root = `${f.root}/publicacoes/${f.publicationId}/revisao`;
  const emptyReview = await get(root).expect(200);
  expect(emptyReview.body).toMatchObject({
    state: "em_dia",
    version: 1,
    blocksExecution: false,
  });
  const input = {
    expectedVersion: 1,
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    decision: "configurar",
    reason: "Prazo explicitamente escolhido",
  };
  await post(root, { expectedVersion: 0, decision: "configurar", reason: "Sem data" }).expect(400);
  await post(root, { ...input, dueAt: new Date(Date.now() - 1000).toISOString() }).expect(409);
  await post(root, { ...input, expectedVersion: 0, decision: "revisado" }).expect(409);
  const concurrent = await Promise.all([1, 2].map(() => post(root, input)));
  expect(concurrent.map((r) => r.status).sort()).toEqual([200, 409]);
  const current = await get(root).expect(200);
  expect(current.body).toMatchObject({ state: "em_dia", dueAt: input.dueAt, version: 2 });
  expect(current.body.history[0]).toMatchObject({ reason: input.reason, decision: "configurar" });
  const reviewed = await post(root, {
    ...input,
    expectedVersion: 2,
    decision: "revisado",
    reason: "Conteúdo revisto, sem republicação",
  }).expect(200);
  expect((reviewed.body.history as { version: number }[]).map((h) => h.version)).toEqual([3, 2, 1]);
  const consumer = await call(f.token, "obter_revisoes_conhecimento", { skillId: f.skillId });
  expect(consumer.denied).toBe(false);
  expect(consumer.value.reviews[0]).toMatchObject({
    version: 3,
    state: "em_dia",
    blocksExecution: false,
  });
  expect(JSON.stringify(consumer.value)).not.toMatch(/ownerId|Conteúdo revisto/);
  await expect(
    db.query("UPDATE knowledge_review_history_v2 SET reason='reescrita' WHERE publication_id=$1", [
      f.publicationId,
    ]),
  ).rejects.toThrow("immutable");
  expect((await call(f.token, "obter_skill", { slug: "visible" })).value.publicationId).toBe(
    f.publicationId,
  );
});
it("busca significado, regra e exemplo aprovado sem usar rascunho ou expor campo recusado", async () => {
  const f = await fixture();
  await post(`${f.root}/rascunho`, {
    expectedRevision: 1,
    name: "Nome de rascunho secreto",
    training: { ...f.training, rules: ["Nebulosa rascunho"] },
  }).expect(200);
  for (const pergunta of ["reais", "mercantil", "sazonais"]) {
    const response = await call(f.token, "buscar_contexto", { pergunta });
    expect(response.denied).toBe(false);
    expect(response.value.matches).toHaveLength(1);
    expect(response.value.matches[0]).toMatchObject({
      name: "Consulta publicada",
      publicationId: f.publicationId,
    });
    expect(response.value.matches[0].items[0].origin.kind).toBe("privado");
  }
  for (const pergunta of ["cobalto", "meteorito", "nebulosa"]) {
    expect((await call(f.token, "buscar_contexto", { pergunta })).value.matches).toEqual([]);
  }
  const graph = await call(f.token, "obter_grafo_conhecimento", { skillId: f.skillId });
  expect(graph.denied).toBe(false);
  expect(graph.value.nodes).toHaveLength(3);
  expect(JSON.stringify(graph.value)).not.toMatch(/hidden|Cobalto|Nome de rascunho/);
  expect(graph.value.executionAuthorized).toBe(false);
});
it("índice é reconstruível, íntegro e isolado pela publicação/hash da persona", async () => {
  const f = await fixture();
  const original = await call(f.token, "buscar_contexto", { pergunta: "sazonais" });
  const cached = await db.query(
    "SELECT * FROM publication_knowledge_index_v2 WHERE persona_id=$1",
    [personaId],
  );
  expect(cached.rows).toHaveLength(1);
  expect(JSON.stringify(cached.rows)).not.toMatch(/SELECT|Cobalto|Meteorito|fixture-password/);
  await db.query(
    "UPDATE publication_knowledge_index_v2 SET document_hash=$1 WHERE publication_id=$2",
    ["a".repeat(64), f.publicationId],
  );
  expect((await call(f.token, "buscar_contexto", { pergunta: "sazonais" })).value).toEqual(
    original.value,
  );
  await db.query(
    "UPDATE publication_knowledge_index_v2 SET index_version=1 WHERE publication_id=$1",
    [f.publicationId],
  );
  expect((await call(f.token, "buscar_contexto", { pergunta: "sazonais" })).value).toEqual(
    original.value,
  );
  expect(
    (
      await db.query(
        "SELECT index_version FROM publication_knowledge_index_v2 WHERE publication_id=$1 ORDER BY index_version",
        [f.publicationId],
      )
    ).rows.map((r) => r.index_version),
  ).toEqual([1, 2]);
  await db.query("DELETE FROM publication_knowledge_index_v2 WHERE publication_id=$1", [
    f.publicationId,
  ]);
  expect((await call(f.token, "buscar_contexto", { pergunta: "sazonais" })).value).toEqual(
    original.value,
  );
  await expect(
    db.query("UPDATE publication_knowledge_index_v2 SET package_hash=$1 WHERE publication_id=$2", [
      "b".repeat(64),
      f.publicationId,
    ]),
  ).rejects.toMatchObject({ code: "23503" });
});
it("paginação opaca vincula token, publicação, filtros e tamanho, sem bypass após revogação", async () => {
  const f = await fixture(),
    other = await fixture("other");
  const first = await call(f.token, "obter_grafo_conhecimento", {
    skillId: f.skillId,
    pageSize: 1,
  });
  expect(first.value.page.complete).toBe(false);
  const cursor = first.value.page.nextCursor as string;
  expect(cursor).not.toContain(f.publicationId);
  const second = await call(f.token, "obter_grafo_conhecimento", {
    skillId: f.skillId,
    pageSize: 1,
    cursor,
  });
  expect(second.denied).toBe(false);
  expect(second.value.nodes[0].id).not.toBe(first.value.nodes[0].id);
  expect(
    (await call(f.token, "obter_grafo_conhecimento", { skillId: f.skillId, pageSize: 2, cursor }))
      .denied,
  ).toBe(true);
  expect(
    (
      await call(other.token, "obter_grafo_conhecimento", {
        skillId: f.skillId,
        pageSize: 1,
        cursor,
      })
    ).denied,
  ).toBe(true);
  expect(
    (
      await call(f.token, "obter_grafo_conhecimento", {
        skillId: f.skillId,
        tables: [{ fonteId: f.sourceId, table: "private" }],
      })
    ).denied,
  ).toBe(true);
  await post(`/api/admin/personas/${personaId}/tokens/${f.tokenId}/revogar`, {}).expect(204);
  expect(
    (await call(f.token, "obter_grafo_conhecimento", { skillId: f.skillId, pageSize: 1, cursor }))
      .denied,
  ).toBe(true);
  expect((await call(f.token, "buscar_contexto", { pergunta: "sazonais" })).denied).toBe(true);
});
it("suspensão bloqueia leitura direta e cache existente, mesmo com IDs conhecidos", async () => {
  const f = await fixture();
  await call(f.token, "buscar_contexto", { pergunta: "mercantil" });
  const first = await call(f.token, "obter_grafo_conhecimento", {
    skillId: f.skillId,
    pageSize: 1,
  });
  await post(`${f.root}/suspender`, {}).expect(204);
  expect((await call(f.token, "buscar_contexto", { pergunta: "mercantil" })).value.matches).toEqual(
    [],
  );
  expect(
    (
      await call(f.token, "obter_grafo_conhecimento", {
        skillId: f.skillId,
        pageSize: 1,
        cursor: first.value.page.nextCursor,
      })
    ).denied,
  ).toBe(true);
});
