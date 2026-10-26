import { reviewDateFixture } from "../helpers/review-deadline.js";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";
import { z } from "zod";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { testConfig } from "../../src/config/env.js";
import { structureContent } from "../helpers/persona-v2-structure.js";
import { datasetCaseOptionsSchema } from "../../src/domain/persona-v2/dataset-case-options.js";
import { operationTraining } from "../helpers/persona-v2-operation.js";
import { directOperationDatasetSeedsSchema } from "../../src/domain/persona-v2/direct-operation-dataset.js";
import { operationCaseSchema } from "../../src/application/persona-v2/operation-cases.js";
import { datasetCompositionSeedsSchema } from "../../src/domain/persona-v2/dataset-composition.js";
import { federationTraining, federationPlan } from "../helpers/persona-v2-federation.js";
import { queryTrainingSchema } from "../../src/application/persona-v2/query-training.js";
import { federationPublicationCaseSchema } from "../../src/domain/persona-v2/federation-training.js";
import {
  federationDatasetSeedsSchema,
  type FederationDatasetSeeds,
} from "../../src/domain/persona-v2/federation-dataset.js";
import { relationshipFixture } from "../helpers/persona-v2-relationships.js";
import { PostgresPhysicalProfiles } from "../../src/infrastructure/persistence/persona-v2/physical-profiles.js";
import type {
  PhysicalProfile,
  PhysicalProfilePublication,
} from "../../src/domain/persona-v2/physical-profile.js";
import type {
  KnowledgeCatalog,
  KnowledgeImpact,
  StructureDraft,
  StructurePublication,
} from "../../src/domain/persona-v2/shared-knowledge.js";

const url = new URL(personaV2TestDatabaseUrl());
const name = `persona_knowledge_${randomUUID().replaceAll("-", "")}_test`;
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
url.pathname = `/${name}`;
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const db = new pg.Pool({ connectionString: url.toString() });
let runtime: Awaited<ReturnType<typeof composePersonaV2>>;
let inactive = false;
let unavailable = false;
interface Session {
  cookie: string;
  csrf: string;
}
const api = (session: Session, method: "get" | "post", path: string) =>
  request(runtime.app)
    [method](path)
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .set("Cookie", session.cookie)
    .set("X-CSRF-Token", session.csrf);
async function login(clientId: string): Promise<Session> {
  const r = await request(runtime.app)
    .post("/api/admin/login")
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .send({ email: `${clientId}@fixture.test`, password: "fixture" });
  expect(r.status).toBe(200);
  return {
    cookie: (r.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!,
    csrf: r.body.csrfToken as string,
  };
}
let alice: Session, bob: Session;
async function catalog(): Promise<KnowledgeCatalog> {
  const r = await api(alice, "post", "/api/admin/catalogos").send({ name: "Estrutura sintética" });
  expect(r.status).toBe(201);
  return r.body.catalog as KnowledgeCatalog;
}
async function pattern(c: KnowledgeCatalog): Promise<StructureDraft> {
  const r = await api(alice, "post", `/api/admin/catalogos/${c.id}/padroes`).send({
    slug: "fixture-erp",
    name: "Padrão de teste",
    content: structureContent(),
  });
  expect(r.status).toBe(201);
  return r.body.pattern as StructureDraft;
}
async function preview(c: KnowledgeCatalog, p: StructureDraft, session = alice) {
  const r = await api(session, "post", `/api/admin/catalogos/${c.id}/padroes/${p.id}/preview`).send(
    { reviewDueAt: reviewDateFixture() },
  );
  expect(r.status).toBe(200);
  return r.body as { confirmationHash: string; packageHash: string };
}
async function publish(c: KnowledgeCatalog, p: StructureDraft): Promise<StructurePublication> {
  const prepared = await preview(c, p);
  const r = await api(alice, "post", `/api/admin/catalogos/${c.id}/padroes/${p.id}/publicar`).send({
    confirmationHash: prepared.confirmationHash,
  });
  expect(r.status).toBe(201);
  return r.body.publication as StructurePublication;
}
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  await applyPersonaMigrations(url.toString());
  runtime = await composePersonaV2(testConfig({ DATABASE_URL: url.toString() }), {
    sourceVerifier: {
      verify: async () => ({
        database: "fixture",
        dialect: "postgres",
        identityHash: "a".repeat(64),
        verifiedAt: new Date().toISOString(),
      }),
    },
    ownerAuth: {
      hubOrigin: "http://hub.fixture.test",
      login: async (email) => ({ accessToken: email.split("@")[0]! }),
      profile: async (token) => {
        if (unavailable) {
          throw new Error("fixture authority unavailable");
        }
        return { clientId: token, active: !inactive };
      },
    },
  });
  alice = await login("alice");
  bob = await login("bob");
});

it("impacto pagina dependências publicadas sem expor personas de outro responsável", async () => {
  const c = await catalog(),
    p = await pattern(c),
    publication = await publish(c, p);
  const endpoint = `/api/admin/catalogos/${c.id}/publicacoes/${publication.id}/impacto`;
  const seed = async (ownerId: string, count: number) => {
    const personaId = randomUUID();
    await db.query(
      "INSERT INTO persona(id,responsavel_id,nome,especialidade) VALUES($1,$2,'Persona fixture','Fixture')",
      [personaId, ownerId],
    );
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const skillId = randomUUID(),
        id = randomUUID();
      await db.query(
        "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,$3,'consulta','Nome do rascunho','{}')",
        [skillId, personaId, `fixture-${i}`],
      );
      const content = {
        name: `Snapshot ${i}`,
        ...(i === count - 1
          ? {}
          : {
              sharedKnowledge: {
                catalogId: c.id,
                publicationId: publication.id,
                expectedStructure: {
                  version: 1,
                  resources: [
                    {
                      resource: {
                        schema: i % 2 === 0 ? "public" : "audit",
                        name: "orders",
                        type: "table",
                      },
                      columns: [{ name: i === 0 ? "amount" : "id" }],
                    },
                  ],
                },
              },
            }),
      };
      await db.query(
        "INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash) VALUES($1,$2,$3,1,$4,$5)",
        [
          id,
          personaId,
          skillId,
          content,
          createHash("sha256").update(JSON.stringify(content)).digest("hex"),
        ],
      );
      await db.query("UPDATE skill_v2 SET publicacao_ativa_id=$1 WHERE id=$2", [id, skillId]);
      ids.push(id);
    }
    await db.query(
      "INSERT INTO publicacao_dependencia(persona_id,publicacao_id,dependencia_id) VALUES($1,$2,$3)",
      [personaId, ids.at(-1), ids[0]],
    );
    return ids;
  };
  const aliceIds = await seed(c.ownerId, 53);
  const bobOwner = (
    await db.query<{ id: string }>("SELECT id FROM responsavel WHERE hub_client_id='bob'")
  ).rows[0]!.id;
  const bobIds = await seed(bobOwner, 2);
  await api(bob, "get", endpoint).expect(403);
  await api(alice, "post", `/api/admin/catalogos/${c.id}/membros`)
    .send({ expectedVersion: 1, hubClientId: "bob", role: "reader" })
    .expect(204);
  const first = await api(alice, "get", endpoint).expect(200);
  expect(first.body.publications).toHaveLength(50);
  const second = await api(alice, "get", `${endpoint}?after=${first.body.nextCursor}`).expect(200);
  expect(second.body.nextCursor).toBeNull();
  const all = [
    ...(first.body as KnowledgeImpact).publications,
    ...(second.body as KnowledgeImpact).publications,
  ];
  expect(all.map((item) => item.publicationId).sort()).toEqual(aliceIds.sort());
  expect(all.filter((item) => !item.direct)).toHaveLength(1);
  expect(all.every((item) => item.active && item.name.startsWith("Snapshot"))).toBe(true);
  const filtered = await api(alice, "get", `${endpoint}?table=public.orders&column=amount`).expect(
    200,
  );
  expect((filtered.body as KnowledgeImpact).publications.map((item) => item.name).sort()).toEqual([
    "Snapshot 0",
    "Snapshot 52",
  ]);
  expect(
    (await api(alice, "get", `${endpoint}?table=audit.orders&column=amount`).expect(200)).body
      .publications,
  ).toEqual([]);
  expect(
    (await api(alice, "get", `${endpoint}?table=orders&column=amount`).expect(200)).body
      .publications,
  ).toEqual([]);
  expect(
    (await api(alice, "get", `${endpoint}?table=public.orders&column=untrained`).expect(200)).body
      .publications,
  ).toEqual([]);
  await api(alice, "get", `${endpoint}?column=amount`).expect(400);
  const own = await api(bob, "get", endpoint).expect(200);
  expect(
    (own.body as KnowledgeImpact).publications.map((item) => item.publicationId).sort(),
  ).toEqual(bobIds.sort());
  await api(alice, "post", `/api/admin/catalogos/${c.id}/membros`)
    .send({ expectedVersion: 2, hubClientId: "bob", role: null })
    .expect(204);
  await api(bob, "get", endpoint).expect(403);
  await api(alice, "get", `${endpoint}?after=invalid`).expect(400);
  await api(
    alice,
    "get",
    `/api/admin/catalogos/${c.id}/publicacoes/${randomUUID()}/impacto`,
  ).expect(403);
  inactive = true;
  try {
    await api(alice, "get", endpoint).expect(401);
  } finally {
    inactive = false;
    alice = await login("alice");
  }
});

it("biblioteca versiona material cifrado e mantém exemplos candidatos sem alterar snapshots", async () => {
  const c = await catalog(),
    root = `/api/admin/catalogos/${c.id}/biblioteca`;
  const body = {
    slug: "query-template",
    name: "Template sintético",
    expectedVersion: 0,
    payload: { kind: "template", content: structureContent() },
  };
  const first = await api(alice, "post", root).send(body).expect(201);
  expect(first.body.payload.content.examples[0].state).toBe("candidate");
  const stored = await db.query(
    "SELECT payload_enc FROM knowledge_library_version_v2 WHERE library_id=$1",
    [first.body.id],
  );
  expect(stored.rows[0].payload_enc).not.toContain("SELECT p.id");
  const updated = await api(alice, "post", `${root}/${first.body.id}/versoes`)
    .send({ ...body, expectedVersion: 1, name: "Nova revisão" })
    .expect(201);
  expect(updated.body.version).toBe(2);
  await api(alice, "post", `${root}/${first.body.id}/versoes`)
    .send({ ...body, expectedVersion: 1 })
    .expect(409);
  const old = await api(alice, "get", `${root}/${first.body.id}?version=1`).expect(200);
  expect(old.body.name).toBe("Template sintético");
  await expect(
    db.query("UPDATE knowledge_library_version_v2 SET name='Changed' WHERE library_id=$1", [
      first.body.id,
    ]),
  ).rejects.toMatchObject({ code: "P0001" });
  const audit = await db.query(
    "SELECT * FROM knowledge_audit_v2 WHERE catalogo_id=$1 AND evento='biblioteca_versao_criada'",
    [c.id],
  );
  expect(audit.rows).toHaveLength(2);
  expect(JSON.stringify(audit.rows)).not.toContain("SELECT");
});
it("biblioteca editorial não revela material ao leitor, a outro catálogo ou após revogação", async () => {
  const c = await catalog(),
    root = `/api/admin/catalogos/${c.id}`;
  const item = await api(alice, "post", root + "/biblioteca")
    .send({
      slug: "private-template",
      name: "Privado",
      expectedVersion: 0,
      payload: { kind: "template", content: structureContent() },
    })
    .expect(201);
  await api(bob, "get", `${root}/biblioteca/${item.body.id}`).expect(403);
  await api(alice, "post", root + "/membros")
    .send({ expectedVersion: 1, hubClientId: "bob", role: "reader" })
    .expect(204);
  await api(bob, "get", root + "/biblioteca").expect(403);
  await api(alice, "post", root + "/membros")
    .send({ expectedVersion: 2, hubClientId: "bob", role: "contributor" })
    .expect(204);
  await api(bob, "get", `${root}/biblioteca/${item.body.id}`).expect(200);
  const other = await catalog();
  await api(alice, "get", `/api/admin/catalogos/${other.id}/biblioteca/${item.body.id}`).expect(
    403,
  );
  await api(alice, "post", root + "/membros")
    .send({ expectedVersion: 3, hubClientId: "bob", role: null })
    .expect(204);
  await api(bob, "get", `${root}/biblioteca/${item.body.id}`).expect(403);
});
it("dataset fixa template/versão/hash, proveniência e tipos, sem aprovação herdada", async () => {
  const c = await catalog(),
    root = `/api/admin/catalogos/${c.id}/biblioteca`;
  const content = structureContent();
  const datasetContent = {
    ...content,
    tables: content.tables.map((t) => ({
      ...t,
      columns: [
        ...t.columns,
        {
          name: "label",
          meaning: "Texto de fixture",
          logicalType: "varchar(2)",
          nullable: true,
          classification: "livre",
        },
      ],
    })),
  };
  const template = await api(alice, "post", root)
    .send({
      slug: "dataset-template",
      name: "Modelo",
      expectedVersion: 0,
      payload: { kind: "template", content: datasetContent },
    })
    .expect(201);
  const payload = {
    kind: "dataset",
    templateId: template.body.id,
    templateVersion: 1,
    templateHash: template.body.hash,
    provenance: { kind: "synthetic", description: "Valores artificiais" },
    tables: [
      {
        tableId: "orders",
        columns: [
          { name: "id", type: "integer" },
          { name: "amount", type: "decimal" },
        ],
        rows: [[1, "999999999999.25"]],
      },
    ],
  };
  const data = await api(alice, "post", root)
    .send({ slug: "dataset", name: "Dataset sintético", expectedVersion: 0, payload })
    .expect(201);
  expect(data.body.payload.tables[0].rows[0][1]).toBe("999999999999.25");
  const stored = await db.query(
    "SELECT payload_enc FROM knowledge_library_version_v2 WHERE library_id=$1",
    [data.body.id],
  );
  expect(stored.rows[0].payload_enc).not.toContain("999999999999.25");
  await api(alice, "post", root)
    .send({
      slug: "bad-data",
      name: "Dataset errado",
      expectedVersion: 0,
      payload: { ...payload, templateHash: "f".repeat(64) },
    })
    .expect(403);
  await api(alice, "post", root)
    .send({
      slug: "bad-data",
      name: "Dataset errado",
      expectedVersion: 0,
      payload: { ...payload, provenance: { kind: "authorized", description: "Sem referência" } },
    })
    .expect(400);
  const other = await catalog();
  await api(alice, "post", `/api/admin/catalogos/${other.id}/biblioteca`)
    .send({ slug: "wrong-scope", name: "Outro catálogo", expectedVersion: 0, payload })
    .expect(403);
  for (const tables of [
    [
      {
        ...payload.tables[0],
        columns: [
          { name: "id", type: "integer" },
          { name: "amount", type: "string" },
        ],
        rows: [],
      },
    ],
    [{ ...payload.tables[0], rows: [[1, "10000000000000000.25"]] }],
    [{ ...payload.tables[0], rows: [[1, "10.125"]] }],
    [
      {
        ...payload.tables[0],
        columns: [...payload.tables[0]!.columns, { name: "label", type: "string" }],
        rows: [[1, "10.25", "🙂éx"]],
      },
    ],
  ]) {
    await api(alice, "post", root)
      .send({
        slug: "invalid-types",
        name: "Tipos incompatíveis",
        expectedVersion: 0,
        payload: { ...payload, tables },
      })
      .expect(409);
  }
  const count = await db.query(
    "SELECT count(*) n FROM knowledge_library_v2 WHERE catalog_id=$1 AND slug='invalid-types'",
    [c.id],
  );
  expect(Number(count.rows[0].n)).toBe(0);
});
it("template exige mapeamento explícito de fonte/dialeto e cria somente rascunho com candidatos", async () => {
  const c = await catalog(),
    root = `/api/admin/catalogos/${c.id}/biblioteca`;
  const content = { ...structureContent(), examples: [...structureContent().examples] };
  content.examples.push({
    ...structuredClone(content.examples[0]!),
    id: "compatible",
    purpose: "Outra finalidade compatível",
  });
  content.examples.push({
    ...structuredClone(content.examples[0]!),
    id: "different-parameters",
    variants: content.examples[0]!.variants.map((v) => ({
      ...v,
      parameters: v.parameters.map((p) => ({ ...p, type: "decimal" as const })),
    })),
  });
  const template = await api(alice, "post", root)
    .send({
      slug: "apply-template",
      name: "Modelo reutilizável",
      expectedVersion: 0,
      payload: { kind: "template", content },
    })
    .expect(201);
  const p = await api(alice, "post", "/api/admin/personas")
    .send({ name: "Persona sem publicação", specialty: "Fixture", instructions: "Não inventar" })
    .expect(201);
  const persona = p.body.persona;
  const f = await api(alice, "post", `/api/admin/personas/${persona.id}/fontes`)
    .send({
      name: "Base de fixture",
      purpose: "Fixture",
      environment: "test",
      agentId: randomUUID(),
      dialect: "postgres",
      email: "source@fixture.test",
      password: "fixture-password",
      clientToken: "fixture-token",
    })
    .expect(201);
  const source = f.body.fonte;
  const input = {
    catalogId: c.id,
    templateId: template.body.id,
    templateVersion: 1,
    templateHash: template.body.hash,
    sourceId: source.id,
    sourceVersion: source.authorizationVersion,
    dialect: "postgres",
    exampleId: "orders-after-id",
    additionalExampleIds: ["compatible"],
    slug: "from-template",
    name: "Consulta importada",
  };
  const endpoint = `/api/admin/personas/${persona.id}/skills/template`;
  await api(alice, "post", endpoint)
    .send({ ...input, dialect: "mssql" })
    .expect(409);
  await api(bob, "post", endpoint).send(input).expect(403);
  await api(alice, "post", endpoint)
    .send({ ...input, additionalExampleIds: ["different-parameters"] })
    .expect(409);
  await api(alice, "post", endpoint)
    .send({ ...input, additionalExampleIds: ["missing"] })
    .expect(409);
  const result = await api(alice, "post", endpoint).send(input).expect(201),
    skill = result.body.skill;
  expect(skill.activePublicationId).toBeNull();
  expect(skill.training.examples[0].state).toBe("candidate");
  expect(skill.training.examples).toEqual([
    expect.objectContaining({ id: "orders-after-id", state: "candidate" }),
    expect.objectContaining({ id: "compatible", state: "candidate" }),
  ]);
  expect(skill.training.sharedKnowledge).toBeUndefined();
  expect(
    Number(
      (
        await db.query(
          "SELECT count(*) n FROM knowledge_library_draft_origin_v2 WHERE skill_id=$1",
          [skill.id],
        )
      ).rows[0].n,
    ),
  ).toBe(1);
  expect(
    Number(
      (await db.query("SELECT count(*) n FROM caso_teste_v2 WHERE skill_id=$1", [skill.id])).rows[0]
        .n,
    ),
  ).toBe(0);
  const preview = await api(
    alice,
    "post",
    `/api/admin/personas/${persona.id}/skills/${skill.id}/preview`,
  )
    .send({ reviewDueAt: reviewDateFixture() })
    .expect(200);
  await api(alice, "post", `/api/admin/personas/${persona.id}/skills/${skill.id}/publicar`)
    .send({ confirmationHash: preview.body.confirmationHash })
    .expect(409);
});
it("importa dataset diretamente para operação sem consulta e reconfere origem, fonte e papel no salvamento", async () => {
  const c = await catalog();
  const library = `/api/admin/catalogos/${c.id}/biblioteca`;
  const reference = (value: unknown) =>
    z.object(directOperationDatasetSeedsSchema.shape.template.shape).parse(value);
  const template = reference(
    (
      await api(alice, "post", library)
        .send({
          slug: "direct-template",
          name: "Template direto",
          expectedVersion: 0,
          payload: { kind: "template", content: structureContent() },
        })
        .expect(201)
    ).body,
  );
  const dataset = reference(
    (
      await api(alice, "post", library)
        .send({
          slug: "direct-dataset",
          name: "Dataset direto",
          expectedVersion: 0,
          payload: {
            kind: "dataset",
            templateId: template.id,
            templateVersion: template.version,
            templateHash: template.hash,
            provenance: { kind: "synthetic", description: "Fixture direta isolada" },
            tables: [
              {
                tableId: "orders",
                columns: [{ name: "amount", type: "decimal" }],
                rows: [["17.25"]],
              },
            ],
          },
        })
        .expect(201)
    ).body,
  );
  const persona = (
    await api(bob, "post", "/api/admin/personas")
      .send({
        name: "Sem consulta intermediária",
        specialty: "Fixture",
        instructions: "Não inventar",
      })
      .expect(201)
  ).body.persona as { id: string };
  const base = `/api/admin/personas/${persona.id}`;
  const source = (
    await api(bob, "post", `${base}/fontes`)
      .send({
        name: "Fonte isolada",
        purpose: "Fixture",
        environment: "test",
        agentId: randomUUID(),
        dialect: "postgres",
        email: "source@fixture.test",
        password: "fixture-password",
        clientToken: "fixture-token",
      })
      .expect(201)
  ).body.fonte as { id: string };
  const operation = (
    await api(bob, "post", `${base}/skills`)
      .send({
        slug: "direct-operation",
        name: "Operação direta",
        kind: "operacao_sql",
        training: operationTraining(source.id),
      })
      .expect(201)
  ).body.skill as { id: string };
  const root = `${base}/skills/${operation.id}`;
  const endpoint = `${root}/sementes-dataset-operacao-direto`;
  const selection = { expectedRevision: 1, catalogId: c.id, dataset };
  await api(bob, "post", endpoint).send(selection).expect(403);
  await api(alice, "post", `/api/admin/catalogos/${c.id}/membros`)
    .send({ expectedVersion: 1, hubClientId: "bob", role: "reader" })
    .expect(204);
  await api(bob, "post", endpoint).send(selection).expect(403);
  await api(alice, "post", `/api/admin/catalogos/${c.id}/membros`)
    .send({ expectedVersion: 2, hubClientId: "bob", role: "contributor" })
    .expect(204);
  await api(alice, "post", endpoint).send(selection).expect(403);
  await api(bob, "post", endpoint).set("X-CSRF-Token", "wrong").send(selection).expect(403);
  await request(runtime.app)
    .post(endpoint)
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .set("Authorization", "Bearer fixture-not-session")
    .send(selection)
    .expect(403);
  await api(bob, "post", endpoint)
    .send({ ...selection, expectedRevision: 2 })
    .expect(409);
  await api(bob, "post", endpoint)
    .send({ ...selection, dataset: { ...dataset, hash: "0".repeat(64) } })
    .expect(409);
  await api(bob, "post", endpoint)
    .send({ ...selection, dataset: { ...dataset, version: 999 } })
    .expect(403);
  const prepared = directOperationDatasetSeedsSchema.parse(
    (await api(bob, "post", endpoint).send(selection).expect(200)).body,
  );
  expect(prepared.origin).toMatchObject({
    format: "operation-direct-dataset-case-origin-v1",
    sourceId: source.id,
    template,
    dataset,
    modified: false,
  });
  expect(prepared.origin).not.toHaveProperty("querySkillId");
  expect(prepared.fixtures[0]?.rows[0]?.amount).toEqual({ type: "decimal", value: "17.25" });
  expect(
    (await db.query("SELECT count(*) n FROM skill_v2 WHERE persona_id=$1", [persona.id])).rows[0].n,
  ).toBe("1");
  const before = (await api(bob, "get", `${root}/testes-operacao`).expect(200)).body as {
    cases: unknown[];
    reports: unknown[];
    revision: number;
  };
  expect(before).toMatchObject({ cases: [], reports: [], revision: 1 });
  const content = operationCaseSchema.parse({
    name: "Caso direto",
    editorialOrigin: prepared.origin,
    input: { parameters: {}, fixtures: prepared.fixtures },
    expected: { error: "INVALID_PLAN" },
  });
  for (const origin of [
    { ...prepared.origin, sourceVersion: 999 },
    { ...prepared.origin, template: { ...template, hash: "0".repeat(64) } },
    { ...prepared.origin, sourceId: randomUUID() },
  ])
    await api(bob, "post", `${root}/casos-operacao`)
      .send({
        expectedRevision: 1,
        required: true,
        content: { ...content, editorialOrigin: origin },
      })
      .expect(409);
  await api(bob, "post", `${root}/casos-operacao`)
    .send({
      expectedRevision: 1,
      required: true,
      content: {
        ...content,
        editorialOrigin: {
          ...prepared.origin,
          sourceSeedsHash: "0".repeat(64),
          caseSeedsHash: "0".repeat(64),
          modified: true,
        },
      },
    })
    .expect(200);
  const saved = (await api(bob, "get", `${root}/testes-operacao`).expect(200)).body as {
    cases: { id: string; content: unknown }[];
    reports: unknown[];
    requiredApproved: boolean;
  };
  expect(operationCaseSchema.parse(saved.cases[0]!.content).editorialOrigin).toEqual(
    prepared.origin,
  );
  expect(saved.reports).toEqual([]);
  expect(saved.requiredApproved).toBe(false);
  const edited = structuredClone(content);
  delete edited.editorialOrigin;
  edited.input.fixtures[0]!.rows[0]!.amount = { type: "decimal", value: "9.50" };
  await db.query("UPDATE fonte SET authorization_version=authorization_version+1 WHERE id=$1", [
    source.id,
  ]);
  await api(bob, "post", `${root}/casos-operacao`)
    .send({ expectedRevision: 2, id: saved.cases[0]!.id, required: true, content: edited })
    .expect(409);
  await db.query(
    "UPDATE fonte SET authorization_version=authorization_version-1, ativa=false WHERE id=$1",
    [source.id],
  );
  await api(bob, "post", endpoint)
    .send({ ...selection, expectedRevision: 2 })
    .expect(409);
  await db.query("UPDATE fonte SET ativa=true WHERE id=$1", [source.id]);
  await api(bob, "post", `${root}/casos-operacao`)
    .send({ expectedRevision: 2, id: saved.cases[0]!.id, required: true, content: edited })
    .expect(200);
  const reread = (await api(bob, "get", `${root}/testes-operacao`).expect(200)).body as {
    cases: { content: unknown }[];
  };
  expect(operationCaseSchema.parse(reread.cases[0]!.content).editorialOrigin).toMatchObject({
    ...prepared.origin,
    caseSeedsHash: expect.any(String),
    modified: true,
  });
  await api(alice, "post", `/api/admin/catalogos/${c.id}/membros`)
    .send({ expectedVersion: 3, hubClientId: "bob", role: null })
    .expect(204);
  await api(bob, "post", endpoint)
    .send({ ...selection, expectedRevision: 3 })
    .expect(403);
  await api(bob, "post", `${root}/casos-operacao`)
    .send({ expectedRevision: 3, id: saved.cases[0]!.id, required: true, content: edited })
    .expect(403);
  // Removing the case does not re-read revoked editorial data.
  await api(bob, "post", `${root}/casos-operacao`)
    .send({
      expectedRevision: 3,
      id: saved.cases[0]!.id,
      required: true,
      content: edited,
      remove: true,
    })
    .expect(200);
  await api(alice, "post", `/api/admin/catalogos/${c.id}/membros`)
    .send({ expectedVersion: 4, hubClientId: "bob", role: "contributor" })
    .expect(204);
  const other = reference(
    (
      await api(alice, "post", library)
        .send({
          slug: "direct-second",
          name: "Segundo dataset",
          expectedVersion: 0,
          payload: {
            kind: "dataset",
            templateId: template.id,
            templateVersion: template.version,
            templateHash: template.hash,
            provenance: { kind: "synthetic", description: "Outra fixture" },
            tables: [
              {
                tableId: "orders",
                columns: [{ name: "amount", type: "decimal" }],
                rows: [["8.50"]],
              },
            ],
          },
        })
        .expect(201)
    ).body,
  );
  const materials = [
    { catalogId: c.id, dataset },
    { catalogId: c.id, dataset: other },
  ];
  const composed = datasetCompositionSeedsSchema.parse(
    (
      await api(bob, "post", `${root}/compor-sementes-datasets`)
        .send({ expectedRevision: 4, materials })
        .expect(200)
    ).body,
  );
  expect(composed.fixtures[0]!.rows.map((row) => row.amount!.value)).toEqual(["17.25", "8.50"]);
  expect(composed.origin.materials).toHaveLength(2);
  await api(bob, "post", `${root}/compor-sementes-datasets`)
    .send({ expectedRevision: 4, materials: [materials[0], materials[0]] })
    .expect(400);
  const compositeContent = {
    ...content,
    editorialOrigin: composed.origin,
    input: { ...content.input, fixtures: composed.fixtures },
  };
  await api(bob, "post", `${root}/casos-operacao`)
    .send({ expectedRevision: 4, required: true, content: compositeContent })
    .expect(200);
  const compositeSaved = (await api(bob, "get", `${root}/testes-operacao`).expect(200)).body as {
    cases: { id: string; content: unknown }[];
    reports: unknown[];
  };
  expect(operationCaseSchema.parse(compositeSaved.cases[0]!.content).editorialOrigin).toEqual(
    composed.origin,
  );
  expect(compositeSaved.reports).toEqual([]);
  await api(alice, "post", `/api/admin/catalogos/${c.id}/membros`)
    .send({ expectedVersion: 5, hubClientId: "bob", role: null })
    .expect(204);
  await api(bob, "post", `${root}/casos-operacao`)
    .send({
      expectedRevision: 5,
      id: compositeSaved.cases[0]!.id,
      required: true,
      content: compositeContent,
    })
    .expect(403);
});

it("datasets de cruzamento preservam fontes e publicações sem herdar relatório ou aceitar rascunho divergente", async () => {
  const c = await catalog();
  const library = `/api/admin/catalogos/${c.id}/biblioteca`;
  const template = (
    await api(alice, "post", library)
      .send({
        slug: "federation-template",
        name: "Template",
        expectedVersion: 0,
        payload: { kind: "template", content: structureContent() },
      })
      .expect(201)
  ).body;
  const persona = (
    await api(alice, "post", "/api/admin/personas")
      .send({ name: "Cruzamento editorial", specialty: "Fixture", instructions: "Não inventar" })
      .expect(201)
  ).body.persona;
  const base = `/api/admin/personas/${persona.id}`;
  const dependencies: {
    id: string;
    publicationId: string;
    queryId: string;
    queryRevision: number;
  }[] = [];
  for (let index = 0; index < 2; index++) {
    const source = (
      await api(alice, "post", `${base}/fontes`)
        .send({
          name: `Base ${index}`,
          purpose: "Fixture",
          environment: "test",
          agentId: randomUUID(),
          dialect: "postgres",
          email: "source@fixture.test",
          password: "fixture-password",
          clientToken: "fixture-token",
        })
        .expect(201)
    ).body.fonte;
    const dataset = (
      await api(alice, "post", library)
        .send({
          slug: `federation-data-${index}`,
          name: `Dataset ${index}`,
          expectedVersion: 0,
          payload: {
            kind: "dataset",
            templateId: template.id,
            templateVersion: 1,
            templateHash: template.hash,
            provenance: { kind: "synthetic", description: "Fixture exclusiva" },
            tables: [
              {
                tableId: "orders",
                columns: [
                  { name: "id", type: "integer" },
                  { name: "amount", type: "decimal" },
                ],
                rows: [[1, index === 0 ? "10.25" : "20.50"]],
              },
            ],
          },
        })
        .expect(201)
    ).body;
    let query = (
      await api(alice, "post", `${base}/skills/template`)
        .send({
          catalogId: c.id,
          templateId: template.id,
          templateVersion: 1,
          templateHash: template.hash,
          sourceId: source.id,
          sourceVersion: source.authorizationVersion,
          dialect: "postgres",
          exampleId: "orders-after-id",
          slug: `federation-query-${index}`,
          name: `Consulta ${index}`,
          dataset: { id: dataset.id, version: 1, hash: dataset.hash },
        })
        .expect(201)
    ).body.skill;
    query = (
      await api(alice, "post", `${base}/skills/${query.id}/rascunho`)
        .send({
          name: query.name,
          expectedRevision: query.revision,
          training: {
            ...query.training,
            examples: queryTrainingSchema.parse(query.training).examples!.map((example) => ({
              ...example,
              state: "inactive",
            })),
          },
        })
        .expect(200)
    ).body.skill;
    const preview = (
      await api(alice, "post", `${base}/skills/${query.id}/preview`)
        .send({ reviewDueAt: reviewDateFixture() })
        .expect(200)
    ).body;
    const publicationResponse = await api(
      alice,
      "post",
      `${base}/skills/${query.id}/publicar`,
    ).send({ confirmationHash: preview.confirmationHash });
    expect(publicationResponse.status, JSON.stringify(publicationResponse.body)).toBe(201);
    const published = publicationResponse.body.publication;
    dependencies.push({
      id: source.id,
      publicationId: published.id,
      queryId: query.id,
      queryRevision: query.revision,
    });
  }
  const cross = (
    await api(alice, "post", `${base}/skills`)
      .send({
        slug: "editorial-cross",
        name: "Cruzamento",
        kind: "cruzamento",
        training: federationTraining(dependencies),
      })
      .expect(201)
  ).body.skill;
  const root = `${base}/skills/${cross.id}`;
  const selection = (index: number) => ({
    expectedRevision: 1,
    publicationId: dependencies[index]!.publicationId,
    querySkillId: dependencies[index]!.queryId,
    queryRevision: dependencies[index]!.queryRevision,
  });
  await api(bob, "post", `${root}/sementes-dataset-cruzamento`).send(selection(0)).expect(403);
  await api(alice, "post", `${root}/sementes-dataset-cruzamento`)
    .send({ ...selection(0), publicationId: randomUUID() })
    .expect(409);
  const loadedSeeds: FederationDatasetSeeds[] = [];
  for (let index = 0; index < 2; index++)
    loadedSeeds.push(
      federationDatasetSeedsSchema.parse(
        (
          await api(alice, "post", `${root}/sementes-dataset-cruzamento`)
            .send(selection(index))
            .expect(200)
        ).body,
      ),
    );
  const seeds = [loadedSeeds[0]!, loadedSeeds[1]!] as const;
  expect(seeds[0].sourceId).not.toBe(seeds[1].sourceId);
  expect(seeds.map((seed) => seed.fixtures[0]!.rows[0]!.amount!.value)).toEqual(["10.25", "20.50"]);
  const content = {
    name: "Caso editorial",
    editorialOrigin: {
      format: "federation-dataset-case-origin-v1",
      sources: seeds.map((seed) => seed.origin),
    },
    input: {
      plan: federationPlan(dependencies, randomUUID()),
      sources: seeds.map((seed) => ({ sourceId: seed.sourceId, fixtures: seed.fixtures })),
    },
    expected: { errorCode: "INVALID_PLAN" },
  };
  await api(alice, "post", `${root}/casos-cruzamento`)
    .send({
      expectedRevision: 1,
      required: true,
      content: {
        ...content,
        editorialOrigin: {
          ...content.editorialOrigin,
          sources: [seeds[0].origin, seeds[0].origin],
        },
      },
    })
    .expect(400);
  await api(alice, "post", `${root}/casos-cruzamento`)
    .send({ expectedRevision: 1, required: true, content })
    .expect(200);
  const saved = (await api(alice, "get", `${root}/testes-cruzamento`).expect(200)).body;
  expect(saved.reports).toEqual([]);
  expect(saved.requiredApproved).toBe(false);
  expect(saved.cases[0].content.editorialOrigin).toEqual(content.editorialOrigin);
  const changed = structuredClone(content);
  changed.editorialOrigin.sources = [seeds[0].origin];
  changed.input.sources[0]!.fixtures[0]!.rows[0]!.amount!.value = "1.00";
  await api(alice, "post", `${root}/casos-cruzamento`)
    .send({ expectedRevision: 2, id: saved.cases[0].id, required: true, content: changed })
    .expect(200);
  const origins = federationPublicationCaseSchema.parse(
    (await api(alice, "get", `${root}/testes-cruzamento`).expect(200)).body.cases[0].content,
  ).editorialOrigin!.sources;
  expect(origins).toHaveLength(2);
  expect(origins.find((origin) => origin.sourceId === seeds[0].sourceId)!.modified).toBe(true);
  expect(origins.find((origin) => origin.sourceId === seeds[1].sourceId)!.modified).toBe(false);
  const directCross = (
    await api(alice, "post", `${base}/skills`)
      .send({
        slug: "direct-cross",
        name: "Cruzamento direto",
        kind: "cruzamento",
        training: federationTraining(dependencies),
      })
      .expect(201)
  ).body.skill as { id: string };
  const directRoot = `${base}/skills/${directCross.id}`;
  const directSelection = {
    expectedRevision: 1,
    publicationId: dependencies[0]!.publicationId,
    materials: seeds.map((seed) => ({
      catalogId: seed.catalogId,
      dataset: { id: seed.dataset.id, version: seed.dataset.version, hash: seed.dataset.hash },
    })),
  };
  await api(bob, "post", `${directRoot}/compor-sementes-datasets`)
    .send(directSelection)
    .expect(403);
  await api(alice, "post", `${directRoot}/compor-sementes-datasets`)
    .send({ ...directSelection, publicationId: randomUUID() })
    .expect(409);
  const directSeeds = datasetCompositionSeedsSchema.parse(
    (
      await api(alice, "post", `${directRoot}/compor-sementes-datasets`)
        .send(directSelection)
        .expect(200)
    ).body,
  );
  expect(directSeeds.origin.format).toBe("federation-source-dataset-composition-v1");
  expect(directSeeds.fixtures[0]!.rows.map((row) => row.amount!.value)).toEqual(["10.25", "20.50"]);
  const directContent = federationPublicationCaseSchema.parse({
    ...content,
    editorialOrigin: { format: "federation-dataset-case-origin-v1", sources: [directSeeds.origin] },
    input: {
      ...content.input,
      sources: [
        { sourceId: seeds[0].sourceId, fixtures: directSeeds.fixtures },
        content.input.sources[1],
      ],
    },
  });
  await api(alice, "post", `${directRoot}/casos-cruzamento`)
    .send({ expectedRevision: 1, required: true, content: directContent })
    .expect(200);
  const directSaved = (await api(alice, "get", `${directRoot}/testes-cruzamento`).expect(200))
    .body as { cases: { id: string; content: unknown }[]; reports: unknown[] };
  expect(
    federationPublicationCaseSchema.parse(directSaved.cases[0]!.content).editorialOrigin,
  ).toEqual(directContent.editorialOrigin);
  expect(directSaved.reports).toEqual([]);
  await db.query(
    "UPDATE skill_v2 SET rascunho=jsonb_set(rascunho,'{purpose}','\"Mudou\"'), revisao=revisao+1 WHERE id=$1",
    [dependencies[0]!.queryId],
  );
  await api(alice, "post", `${root}/sementes-dataset-cruzamento`)
    .send({
      ...selection(0),
      expectedRevision: 3,
      queryRevision: dependencies[0]!.queryRevision + 1,
    })
    .expect(409);
  await api(alice, "post", `${base}/skills/${dependencies[1]!.queryId}/suspender`)
    .send({})
    .expect(204);
  const suspended = await api(alice, "post", `${root}/sementes-dataset-cruzamento`).send({
    ...selection(1),
    expectedRevision: 3,
  });
  expect(suspended.body.error.code).toBe("STALE_AUTHORIZATION");
  await api(alice, "post", `${root}/compor-sementes-datasets`)
    .send({
      expectedRevision: 3,
      publicationId: dependencies[0]!.publicationId,
      materials: [{ catalogId: c.id, dataset: seeds[0].dataset }].map(({ catalogId, dataset }) => ({
        catalogId,
        dataset: { id: dataset.id, version: dataset.version, hash: dataset.hash },
      })),
    })
    .expect(409);
});

it("sementes do dataset exigem sessão, revisão, origem exata e papel editorial vigente sem criar casos", async () => {
  const c = await catalog();
  const library = `/api/admin/catalogos/${c.id}/biblioteca`;
  const template = await api(alice, "post", library)
    .send({
      slug: "seed-template",
      name: "Template de sementes",
      expectedVersion: 0,
      payload: { kind: "template", content: structureContent() },
    })
    .expect(201);
  const dataset = await api(alice, "post", library)
    .send({
      slug: "seed-dataset",
      name: "Dataset exato",
      expectedVersion: 0,
      payload: {
        kind: "dataset",
        templateId: template.body.id,
        templateVersion: 1,
        templateHash: template.body.hash,
        provenance: { kind: "synthetic", description: "Fixture exclusiva" },
        tables: [
          {
            tableId: "orders",
            columns: [
              { name: "id", type: "integer" },
              { name: "amount", type: "decimal" },
            ],
            rows: [[1, "999999999999.25"]],
          },
        ],
      },
    })
    .expect(201);
  await api(alice, "post", `/api/admin/catalogos/${c.id}/membros`)
    .send({ expectedVersion: 1, hubClientId: "bob", role: "contributor" })
    .expect(204);
  const persona = (
    await api(bob, "post", "/api/admin/personas")
      .send({ name: "Persona com dataset", specialty: "Fixture", instructions: "Não inventar" })
      .expect(201)
  ).body.persona;
  const base = `/api/admin/personas/${persona.id}`;
  const source = (
    await api(bob, "post", `${base}/fontes`)
      .send({
        name: "Fonte isolada",
        purpose: "Fixture",
        environment: "test",
        agentId: randomUUID(),
        dialect: "postgres",
        email: "source@fixture.test",
        password: "fixture-password",
        clientToken: "fixture-token",
      })
      .expect(201)
  ).body.fonte;
  const skill = (
    await api(bob, "post", `${base}/skills/template`)
      .send({
        catalogId: c.id,
        templateId: template.body.id,
        templateVersion: 1,
        templateHash: template.body.hash,
        sourceId: source.id,
        sourceVersion: source.authorizationVersion,
        dialect: "postgres",
        exampleId: "orders-after-id",
        slug: "dataset-case",
        name: "Consulta de dataset",
        dataset: { id: dataset.body.id, version: 1, hash: dataset.body.hash },
      })
      .expect(201)
  ).body.skill;
  const endpoint = `${base}/skills/${skill.id}/sementes-dataset`;
  await request(runtime.app)
    .post(endpoint)
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .set("Authorization", "Bearer fixture-not-a-session")
    .set("X-CSRF-Token", bob.csrf)
    .send({ expectedRevision: 1 })
    .expect(403);
  await api(alice, "post", endpoint).send({ expectedRevision: 1 }).expect(403);
  await api(bob, "post", endpoint).send({ expectedRevision: 2 }).expect(409);
  await api(bob, "post", endpoint)
    .set("X-CSRF-Token", "wrong")
    .send({ expectedRevision: 1 })
    .expect(403);
  const result = await api(bob, "post", endpoint).send({ expectedRevision: 1 }).expect(200);
  expect(result.body).toMatchObject({
    revision: 1,
    sourceId: source.id,
    catalogId: c.id,
    dataset: { id: dataset.body.id, version: 1, hash: dataset.body.hash },
    executable: false,
    technicalApproval: false,
    fixtures: [
      {
        table: "orders",
        generated: [],
        rows: [
          {
            id: { type: "integer", value: "1" },
            amount: { type: "decimal", value: "999999999999.25" },
          },
        ],
      },
    ],
  });
  for (const table of ["caso_teste_v2", "relatorio_teste_v2", "publicacao"]) {
    expect(
      Number(
        (await db.query(`SELECT count(*) n FROM ${table} WHERE skill_id=$1`, [skill.id])).rows[0].n,
      ),
    ).toBe(0);
  }
  const current = await db.query("SELECT revisao FROM skill_v2 WHERE id=$1", [skill.id]);
  expect(current.rows[0].revisao).toBe(1);
  const operation = (
    await api(bob, "post", `${base}/skills`)
      .send({
        slug: "dataset-operation",
        name: "Operação editorial",
        kind: "operacao_sql",
        training: operationTraining(source.id),
      })
      .expect(201)
  ).body.skill;
  const opRoot = `${base}/skills/${operation.id}`;
  const selection = { expectedRevision: 1, querySkillId: skill.id, queryRevision: 1 };
  await api(alice, "post", `${opRoot}/sementes-dataset-operacao`).send(selection).expect(403);
  await api(bob, "post", `${opRoot}/sementes-dataset-operacao`)
    .set("X-CSRF-Token", "wrong")
    .send(selection)
    .expect(403);
  await api(bob, "post", `${opRoot}/sementes-dataset-operacao`)
    .send({ ...selection, expectedRevision: 2 })
    .expect(409);
  await api(bob, "post", `${opRoot}/sementes-dataset-operacao`)
    .send({ ...selection, queryRevision: 2 })
    .expect(409);
  await api(bob, "post", `${opRoot}/sementes-dataset-operacao`)
    .send({ ...selection, querySkillId: randomUUID() })
    .expect(409);
  const opSeeds = (
    await api(bob, "post", `${opRoot}/sementes-dataset-operacao`).send(selection).expect(200)
  ).body;
  expect(opSeeds).toMatchObject({
    executable: false,
    technicalApproval: false,
    origin: {
      format: "operation-dataset-case-origin-v1",
      querySkillId: skill.id,
      queryRevision: 1,
      modified: false,
    },
  });
  expect(opSeeds.fixtures).toEqual(result.body.fixtures);
  const datasetV2 = (
    await api(alice, "post", `${library}/${dataset.body.id}/versoes`)
      .send({
        slug: "seed-dataset",
        name: "Dataset alternativo v2",
        expectedVersion: 1,
        payload: {
          kind: "dataset",
          templateId: template.body.id,
          templateVersion: 1,
          templateHash: template.body.hash,
          provenance: { kind: "synthetic", description: "Fixture exclusiva" },
          tables: [
            {
              tableId: "orders",
              columns: [
                { name: "id", type: "integer" },
                { name: "amount", type: "decimal" },
              ],
              rows: [[2, "4.25"]],
            },
          ],
        },
      })
      .expect(201)
  ).body;
  const explicitDataset = { id: datasetV2.id, version: 2, hash: datasetV2.hash };
  const alternateSeeds = (
    await api(bob, "post", `${opRoot}/sementes-dataset-operacao`)
      .send({ ...selection, dataset: explicitDataset })
      .expect(200)
  ).body;
  expect(alternateSeeds.origin.dataset).toEqual(explicitDataset);
  expect(alternateSeeds.fixtures[0].rows[0].amount).toEqual({ type: "decimal", value: "4.25" });
  await api(bob, "post", `${opRoot}/sementes-dataset-operacao`)
    .send({ ...selection, dataset: { ...explicitDataset, hash: "0".repeat(64) } })
    .expect(409);
  // Publishing another dataset version never updates the original query binding.
  const originalAgain = (
    await api(bob, "post", `${opRoot}/sementes-dataset-operacao`).send(selection).expect(200)
  ).body;
  expect(originalAgain.origin.dataset).toEqual(opSeeds.origin.dataset);
  const opContent = {
    name: "Caso editorial SQL",
    editorialOrigin: { ...opSeeds.origin, modified: true, caseSeedsHash: "0".repeat(64) },
    input: { parameters: {}, fixtures: opSeeds.fixtures },
    expected: { error: "INVALID_PLAN" },
  };
  const opTests = `${opRoot}/testes-operacao`;
  expect((await api(bob, "get", opTests).expect(200)).body.cases).toEqual([]);
  await api(bob, "post", `${opRoot}/casos-operacao`)
    .send({
      expectedRevision: 1,
      required: true,
      content: {
        ...opContent,
        editorialOrigin: { ...opSeeds.origin, sourceId: randomUUID() },
      },
    })
    .expect(409);
  await api(bob, "post", `${opRoot}/casos-operacao`)
    .send({ expectedRevision: 1, required: true, content: opContent })
    .expect(200);
  const opSaved = (await api(bob, "get", opTests).expect(200)).body;
  expect(opSaved.cases[0].content.editorialOrigin).toEqual(opSeeds.origin);
  expect(opSaved.reports).toEqual([]);
  expect(opSaved.requiredApproved).toBe(false);
  const opEdited = structuredClone(opContent);
  delete (opEdited as { editorialOrigin?: unknown }).editorialOrigin;
  opEdited.input.fixtures[0].rows[0].amount.value = "2.25";
  await api(bob, "post", `${opRoot}/casos-operacao`)
    .send({ expectedRevision: 2, id: opSaved.cases[0].id, required: true, content: opEdited })
    .expect(200);
  expect(
    (await api(bob, "get", opTests).expect(200)).body.cases[0].content.editorialOrigin,
  ).toMatchObject({
    modified: true,
    sourceSeedsHash: opSeeds.origin.sourceSeedsHash,
  });
  const caseContent = {
    name: "Caso revisado",
    editorialOrigin: result.body.origin,
    input: { params: { minimum: "0" }, fixtures: result.body.fixtures },
    expected: {
      columns: [
        { name: "id", type: "integer" },
        { name: "amount", type: "decimal" },
      ],
      rows: result.body.fixtures[0].rows,
      ordered: true,
    },
  };
  const casesEndpoint = `${base}/skills/${skill.id}/casos-consulta`;
  for (const origin of [
    { ...result.body.origin, catalogId: randomUUID() },
    { ...result.body.origin, dataset: { ...result.body.origin.dataset, version: 999 } },
  ]) {
    await api(bob, "post", casesEndpoint)
      .send({
        expectedRevision: 1,
        required: true,
        content: { ...caseContent, editorialOrigin: origin },
      })
      .expect(origin.dataset.version === 999 ? 403 : 409);
  }
  await api(bob, "post", `${base}/skills/${skill.id}/casos`)
    .send({
      required: true,
      content: {
        ...caseContent,
        editorialOrigin: { ...result.body.origin, sourceId: randomUUID() },
      },
    })
    .expect(409);
  await api(bob, "post", casesEndpoint)
    .send({
      expectedRevision: 1,
      required: true,
      content: {
        ...caseContent,
        editorialOrigin: {
          ...result.body.origin,
          modified: true,
          caseSeedsHash: "0".repeat(64),
          sourceSeedsHash: "0".repeat(64),
        },
      },
    })
    .expect(200);
  const detailsPath = `${base}/skills/${skill.id}/testes-consulta`;
  const saved = (await api(bob, "get", detailsPath).expect(200)).body;
  const testId = saved.cases[0].id;
  expect(saved.cases[0].content.editorialOrigin).toEqual(result.body.origin);
  expect(saved.reports).toEqual([]);
  expect(saved.requiredApproved).toBe(false);
  const changedContent = structuredClone(caseContent);
  delete changedContent.editorialOrigin;
  changedContent.input.fixtures[0].rows[0].amount.value = "1.25";
  await api(bob, "post", casesEndpoint)
    .send({
      id: testId,
      expectedRevision: 2,
      required: true,
      content: changedContent,
    })
    .expect(200);
  const changed = (await api(bob, "get", detailsPath).expect(200)).body.cases[0].content
    .editorialOrigin;
  expect(changed.modified).toBe(true);
  expect(changed.sourceSeedsHash).toBe(result.body.origin.sourceSeedsHash);
  expect(changed.caseSeedsHash).not.toBe(changed.sourceSeedsHash);
  await api(bob, "post", casesEndpoint)
    .send({
      id: testId,
      expectedRevision: 3,
      required: true,
      content: caseContent,
    })
    .expect(200);
  expect(
    (await api(bob, "get", detailsPath).expect(200)).body.cases[0].content.editorialOrigin,
  ).toEqual(result.body.origin);
  await api(bob, "post", `${base}/fontes/${source.id}/editar`)
    .send({
      expectedVersion: source.authorizationVersion,
      name: "Fonte revisada",
      purpose: "Fixture",
      environment: "test",
      rowRestrictions: [],
    })
    .expect(200);
  await api(bob, "post", endpoint).send({ expectedRevision: 4 }).expect(409);
  await api(bob, "post", casesEndpoint)
    .send({
      id: testId,
      expectedRevision: 4,
      required: true,
      content: caseContent,
    })
    .expect(409);
  await api(alice, "post", `/api/admin/catalogos/${c.id}/membros`)
    .send({ expectedVersion: 2, hubClientId: "bob", role: null })
    .expect(204);
  await api(bob, "post", endpoint).send({ expectedRevision: 4 }).expect(403);
  await api(bob, "post", casesEndpoint)
    .send({
      id: testId,
      expectedRevision: 4,
      required: true,
      content: caseContent,
    })
    .expect(403);
  expect(
    Number(
      (await db.query("SELECT count(*) n FROM caso_teste_v2 WHERE skill_id=$1", [skill.id])).rows[0]
        .n,
    ),
  ).toBe(1);
});

it("escolha de datasets pagina versões exatas do mesmo template sem carregar linhas ou adotar origem automaticamente", async () => {
  const c = await catalog();
  const library = `/api/admin/catalogos/${c.id}/biblioteca`;
  await api(alice, "post", `/api/admin/catalogos/${c.id}/membros`)
    .send({ expectedVersion: 1, hubClientId: "bob", role: "contributor" })
    .expect(204);
  const template = (
    await api(alice, "post", library)
      .send({
        slug: "choices-template",
        name: "Template das escolhas",
        expectedVersion: 0,
        payload: { kind: "template", content: structureContent() },
      })
      .expect(201)
  ).body;
  const payload = (value: number, version = 1, hash = template.hash) => ({
    kind: "dataset",
    templateId: template.id,
    templateVersion: version,
    templateHash: hash,
    provenance: { kind: "synthetic", description: "Somente fixture privada" },
    tables: [{ tableId: "orders", columns: [{ name: "id", type: "integer" }], rows: [[value]] }],
  });
  const dataset = (
    await api(alice, "post", library)
      .send({
        slug: "choices-dataset",
        name: "Dados v1",
        expectedVersion: 0,
        payload: payload(1),
      })
      .expect(201)
  ).body;
  const versions = [dataset];
  for (let version = 2; version <= 23; version++) {
    versions.push(
      (
        await api(alice, "post", `${library}/${dataset.id}/versoes`)
          .send({
            slug: "choices-dataset",
            name: `Dados v${version}`,
            expectedVersion: version - 1,
            payload: payload(version),
          })
          .expect(201)
      ).body,
    );
  }
  const templateV2 = (
    await api(alice, "post", `${library}/${template.id}/versoes`)
      .send({
        slug: "choices-template",
        name: "Template v2",
        expectedVersion: 1,
        payload: { kind: "template", content: { ...structureContent(), label: "v2" } },
      })
      .expect(201)
  ).body;
  const other = (
    await api(alice, "post", library)
      .send({
        slug: "incompatible-template-version",
        name: "Outra versão do template",
        expectedVersion: 0,
        payload: payload(500, 2, templateV2.hash),
      })
      .expect(201)
  ).body;
  const persona = (
    await api(bob, "post", "/api/admin/personas")
      .send({
        name: "Escolhas de dataset",
        specialty: "Fixture",
        instructions: "Dados verificáveis",
      })
      .expect(201)
  ).body.persona;
  const base = `/api/admin/personas/${persona.id}`;
  const source = (
    await api(bob, "post", `${base}/fontes`)
      .send({
        name: "Fonte de escolhas",
        purpose: "Fixture",
        environment: "test",
        agentId: randomUUID(),
        dialect: "postgres",
        email: "source@fixture.test",
        password: "fixture-password",
        clientToken: "fixture-token",
      })
      .expect(201)
  ).body.fonte;
  const skill = (
    await api(bob, "post", `${base}/skills/template`)
      .send({
        catalogId: c.id,
        templateId: template.id,
        templateVersion: 1,
        templateHash: template.hash,
        sourceId: source.id,
        sourceVersion: source.authorizationVersion,
        dialect: "postgres",
        exampleId: "orders-after-id",
        slug: "choices-query",
        name: "Escolha explícita sem dataset inicial",
      })
      .expect(201)
  ).body.skill;
  const root = `${base}/skills/${skill.id}`;
  const list = (body: object, actor = bob) =>
    api(actor, "post", `${root}/datasets-caso`).send(body);
  await request(runtime.app)
    .post(`${root}/datasets-caso`)
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .set("Authorization", "Bearer fixture-not-a-session")
    .send({ expectedRevision: 1 })
    .expect(403);
  await api(bob, "post", `${root}/datasets-caso`)
    .set("X-CSRF-Token", "wrong")
    .send({ expectedRevision: 1 })
    .expect(403);
  const first = datasetCaseOptionsSchema.parse(
    (await list({ expectedRevision: 1 }).expect(200)).body,
  );
  expect(first.datasets.map((item: { version: number }) => item.version)).toEqual(
    Array.from({ length: 20 }, (_, i) => 23 - i),
  );
  expect(JSON.stringify(first)).not.toMatch(/payloadEnc|"rows"|"fixtures"/);
  expect(first.template).toEqual({ id: template.id, version: 1, hash: template.hash });
  const second = datasetCaseOptionsSchema.parse(
    (await list({ expectedRevision: 1, after: first.nextCursor }).expect(200)).body,
  );
  expect(second.datasets.map((item: { version: number }) => item.version)).toEqual([3, 2, 1]);
  expect(second.nextCursor).toBeNull();
  await list({ expectedRevision: 2 }).expect(409);
  await list({ expectedRevision: 1, after: { id: other.id, version: 1 } }).expect(403);
  await list({ expectedRevision: 1 }, alice).expect(403);
  await api(bob, "post", `${root}/sementes-dataset`).send({ expectedRevision: 1 }).expect(409);
  const ref = { id: dataset.id, version: 1, hash: dataset.hash };
  const load = (selection: object) =>
    api(bob, "post", `${root}/sementes-dataset`).send({ expectedRevision: 1, dataset: selection });
  const selected = (await load(ref).expect(200)).body;
  expect(selected.fixtures[0].rows[0].id).toEqual({ type: "integer", value: "1" });
  const newest = (await load({ id: dataset.id, version: 23, hash: versions[22].hash }).expect(200))
    .body;
  expect(newest.fixtures[0].rows[0].id.value).toBe("23");
  await load({ ...ref, hash: "f".repeat(64) }).expect(409);
  await load({ id: other.id, version: 1, hash: other.hash }).expect(403);
  const before = (await api(bob, "get", `${root}/testes-consulta`).expect(200)).body;
  expect(before).toMatchObject({ revision: 1, cases: [], reports: [], requiredApproved: false });
  await api(bob, "post", `${root}/casos-consulta`)
    .send({
      expectedRevision: 1,
      required: true,
      content: {
        name: "Dataset v1 escolhido",
        editorialOrigin: selected.origin,
        input: { params: {}, fixtures: selected.fixtures },
        expected: { columns: [{ name: "id", type: "integer" }], rows: [], ordered: true },
      },
    })
    .expect(200);
  const saved = (await api(bob, "get", `${root}/testes-consulta`).expect(200)).body;
  expect(saved.cases[0].content.editorialOrigin.dataset).toEqual(ref);
  expect(saved.cases[0].content.editorialOrigin.modified).toBe(false);
  await api(alice, "post", `/api/admin/catalogos/${c.id}/membros`)
    .send({ expectedVersion: 2, hubClientId: "bob", role: null })
    .expect(204);
  await list({ expectedRevision: 2, after: first.nextCursor }).expect(403);
  await api(bob, "post", `${root}/sementes-dataset`)
    .send({ expectedRevision: 2, dataset: ref })
    .expect(403);
});

it("importar template conserva ponte composta N:N sem herdar adoção ou habilitar atalho", async () => {
  const c = await catalog(),
    fixture = relationshipFixture();
  fixture.content.examples = [
    {
      id: "bridge-query",
      purpose: fixture.training.purpose,
      explanation: "Consulta sintética pela intermediária",
      state: "approved",
      variants: [
        {
          dialect: "postgres",
          sql: fixture.training.sqlModel,
          parameters: fixture.training.parameters,
        },
      ],
    },
  ];
  const template = await api(alice, "post", `/api/admin/catalogos/${c.id}/biblioteca`)
    .send({
      slug: "bridge-template",
      name: "Ponte sintética",
      expectedVersion: 0,
      payload: { kind: "template", content: fixture.content },
    })
    .expect(201);
  const persona = (
    await api(alice, "post", "/api/admin/personas")
      .send({ name: "Persona ponte", specialty: "Fixture", instructions: "Não inventar" })
      .expect(201)
  ).body.persona;
  const source = (
    await api(alice, "post", `/api/admin/personas/${persona.id}/fontes`)
      .send({
        name: "Fonte da ponte",
        purpose: "Fixture",
        environment: "test",
        agentId: randomUUID(),
        dialect: "postgres",
        email: "bridge@fixture.test",
        password: "fixture-password",
        clientToken: "fixture-token",
      })
      .expect(201)
  ).body.fonte;
  const result = await api(alice, "post", `/api/admin/personas/${persona.id}/skills/template`)
    .send({
      catalogId: c.id,
      templateId: template.body.id,
      templateVersion: 1,
      templateHash: template.body.hash,
      sourceId: source.id,
      sourceVersion: source.authorizationVersion,
      dialect: "postgres",
      exampleId: "bridge-query",
      slug: "bridge-draft",
      name: "Consulta pela ponte",
    })
    .expect(201);
  expect(result.body.skill.training.relationships).toEqual(fixture.training.relationships);
  expect(result.body.skill.training.examples[0].state).toBe("candidate");
  expect(result.body.skill.training.sharedKnowledge).toBeUndefined();
  expect(result.body.skill.activePublicationId).toBeNull();
});
it("importar DDL retorna declarações e nunca cria tabelas nem padrão automaticamente", async () => {
  const c = await catalog(),
    endpoint = `/api/admin/catalogos/${c.id}/importar-ddl`;
  const imported = await api(alice, "post", endpoint)
    .send({
      system: "Fixture",
      label: "v1",
      dialect: "postgres",
      ddl: "CREATE TABLE never_executed_fixture (id int CONSTRAINT fixture_pk PRIMARY KEY);",
    })
    .expect(200);
  expect(imported.body).toMatchObject({ technicalEvidence: false, semanticReview: false });
  expect(imported.body.content.tables[0].columns[0].classification).toBe("inferido");
  expect(imported.body.content.tables[0].keys[0]).toMatchObject({
    id: "fixture_pk",
    kind: "primary",
    status: "unknown",
  });
  expect(
    (await db.query("SELECT to_regclass('never_executed_fixture') name")).rows[0].name,
  ).toBeNull();
  const drafts = await api(alice, "get", `/api/admin/catalogos/${c.id}/padroes`).expect(200);
  expect(drafts.body.patterns).toEqual([]);
  await api(alice, "post", endpoint)
    .send({
      system: "Fixture",
      label: "v1",
      dialect: "postgres",
      ddl: "CREATE TABLE nope (id int); DELETE FROM responsavel;",
    })
    .expect(409);
  await api(alice, "post", endpoint)
    .send({
      system: "Fixture",
      label: "v1",
      dialect: "postgres",
      ddl: "CREATE TABLE never_executed_fixture (id int CONSTRAINT duplicated PRIMARY KEY, code int CONSTRAINT duplicated UNIQUE);",
    })
    .expect(409);
  expect(
    (await db.query("SELECT to_regclass('never_executed_fixture') name")).rows[0].name,
  ).toBeNull();
  expect(
    (await api(alice, "get", `/api/admin/catalogos/${c.id}/biblioteca`).expect(200)).body.items,
  ).toEqual([]);
  await api(bob, "post", endpoint)
    .send({
      system: "Fixture",
      label: "v1",
      dialect: "postgres",
      ddl: "CREATE TABLE nope (id int);",
    })
    .expect(403);
});
beforeEach(() => {
  inactive = false;
  unavailable = false;
});
it("pagina perfis pelo catálogo, identidade física e versão base sem revelar rascunhos ou suspensos ao leitor", async () => {
  const c = await catalog(),
    p = await pattern(c),
    pub = await publish(c, p);
  const physicalSourceId = randomUUID(),
    otherPhysical = randomUUID(),
    identityHash = "c".repeat(64);
  for (const id of [physicalSourceId, otherPhysical]) {
    await db.query("INSERT INTO fonte_fisica(id,identity_hash) VALUES($1,$2)", [id, randomUUID()]);
    await db.query(
      "INSERT INTO physical_native_identity_v2(physical_source_id,identity_hash) VALUES($1,$2)",
      [id, identityHash],
    );
  }
  const client = await db.connect();
  try {
    const profiles = new PostgresPhysicalProfiles(client);
    const ids: string[] = [];
    let hidden: PhysicalProfilePublication | undefined;
    for (let i = 0; i < 22; i++) {
      const profile: PhysicalProfile = {
        id: randomUUID(),
        catalogId: c.id,
        physicalSourceId,
        identityHash,
        basePublicationId: pub.id,
        baseHash: pub.hash,
        name: `Perfil ${i}`,
        revision: 1,
        content: pub.content,
        overrides: { tables: [], relationships: [] },
      };
      await profiles.save(profile, null);
      const published = {
        ...profile,
        publicationId: randomUUID(),
        hash: "d".repeat(64),
        suspended: false,
      };
      await profiles.publish(published);
      ids.push(published.publicationId);
      if (i === 0) {
        hidden = published;
        await profiles.suspend(c.id, published.publicationId, c.ownerId);
      }
    }
    const query = {
      catalogId: c.id,
      physicalSourceId,
      identityHash,
      basePublicationId: pub.id,
      includeDrafts: true,
    };
    const curator = await profiles.list(query);
    expect(curator.drafts).toHaveLength(20);
    expect(curator.publications).toHaveLength(20);
    const remaining = await profiles.list({
      ...query,
      beforeDraft: curator.nextDraftCursor!,
      beforePublication: curator.nextPublicationCursor!,
    });
    expect(remaining.drafts).toHaveLength(2);
    expect(remaining.publications).toHaveLength(2);
    expect(
      new Set([...curator.publications, ...remaining.publications].map((v) => v.publicationId))
        .size,
    ).toBe(22);
    const reader = await profiles.list({ ...query, includeDrafts: false });
    expect(reader.drafts).toEqual([]);
    expect(reader.publications.every((v) => !v.suspended)).toBe(true);
    await expect(
      profiles.list({ ...query, includeDrafts: false, beforePublication: hidden!.publicationId }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      profiles.list({ ...query, physicalSourceId: otherPhysical, beforePublication: ids[1] }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect((await profiles.list({ ...query, identityHash: "e".repeat(64) })).publications).toEqual(
      [],
    );
  } finally {
    client.release();
  }
});
afterAll(async () => {
  await runtime?.close();
  await db.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
});
it("keeps catalogs private, grants readers published snapshots only and revokes direct reads", async () => {
  const c = await catalog();
  const p = await pattern(c);
  const path = `/api/admin/catalogos/${c.id}`;
  expect((await api(bob, "get", `${path}/padroes`)).status).toBe(403);
  const pub = await publish(c, p);
  expect(
    (
      await api(alice, "post", `${path}/membros`).send({
        expectedVersion: 1,
        hubClientId: "bob",
        role: "reader",
      })
    ).status,
  ).toBe(204);
  const read = await api(bob, "get", `${path}/padroes`);
  expect(read.status).toBe(200);
  expect(read.body.patterns).toBeUndefined();
  expect(read.body.publications[0].hash).toBe(pub.hash);
  expect(
    (
      await api(bob, "post", `${path}/padroes/${p.id}/preview`).send({
        reviewDueAt: reviewDateFixture(),
      })
    ).status,
  ).toBe(403);
  expect((await api(bob, "get", `${path}/membros`)).status).toBe(403);
  expect(
    (
      await api(alice, "post", `${path}/membros`).send({
        expectedVersion: 2,
        hubClientId: "bob",
        role: null,
      })
    ).status,
  ).toBe(204);
  expect((await api(bob, "get", `${path}/publicacoes/${pub.id}`)).status).toBe(403);
});
it("requires curator authority, invalidates previews on membership changes and prevents self elevation", async () => {
  const c = await catalog();
  const p = await pattern(c);
  const path = `/api/admin/catalogos/${c.id}`;
  const old = await preview(c, p);
  await api(alice, "post", `${path}/membros`)
    .send({ expectedVersion: 1, hubClientId: "bob", role: "contributor" })
    .expect(204);
  await api(bob, "post", `${path}/padroes/${p.id}/preview`)
    .send({ reviewDueAt: reviewDateFixture() })
    .expect(403);
  await api(bob, "post", `${path}/membros`)
    .send({ expectedVersion: 2, hubClientId: "bob", role: "administrator" })
    .expect(403);
  await api(alice, "post", `${path}/padroes/${p.id}/publicar`)
    .send({ confirmationHash: old.confirmationHash })
    .expect(409);
  await api(alice, "post", `${path}/membros`)
    .send({ expectedVersion: 2, hubClientId: "bob", role: "curator" })
    .expect(204);
  const ready = await preview(c, p, bob);
  await api(bob, "post", `${path}/padroes/${p.id}/publicar`)
    .send({ confirmationHash: ready.confirmationHash })
    .expect(201);
});
it("preserves immutable snapshots and rejects stale edits, previews, replay and another curator's confirmation", async () => {
  const c = await catalog();
  const p = await pattern(c);
  const pub = await publish(c, p);
  const path = `/api/admin/catalogos/${c.id}/padroes/${p.id}`;
  const ready = await preview(c, p);
  const update = {
    expectedRevision: 1,
    name: "Nova proposta",
    content: { ...structureContent(), label: "2.0" },
  };
  await api(alice, "post", `${path}/editar`).send(update).expect(200);
  await api(alice, "post", `${path}/editar`).send(update).expect(409);
  await api(alice, "post", `${path}/publicar`)
    .send({ confirmationHash: ready.confirmationHash })
    .expect(409);
  const old = await api(alice, "get", `/api/admin/catalogos/${c.id}/publicacoes/${pub.id}`);
  expect(old.body.publication.content.label).toBe("1.0");
  await expect(
    db.query("UPDATE structure_publication_v2 SET revisao=99 WHERE id=$1", [pub.id]),
  ).rejects.toThrow(/immutable/);
  const current = await preview(c, p);
  await api(alice, "post", `${path}/publicar`)
    .send({ confirmationHash: current.confirmationHash })
    .expect(201);
  await api(alice, "post", `${path}/publicar`)
    .send({ confirmationHash: current.confirmationHash })
    .expect(409);
  const expiring = await preview(c, p);
  await db.query(
    "UPDATE structure_preview_v2 SET expires_at=now()-interval '1 minute' WHERE hash=$1",
    [expiring.confirmationHash],
  );
  await api(alice, "post", `${path}/publicar`)
    .send({ confirmationHash: expiring.confirmationHash })
    .expect(409);
});
it("blocks suspended publications, cross-catalog references and stale membership versions", async () => {
  const c = await catalog();
  const other = await catalog();
  const p = await pattern(c);
  const pub = await publish(c, p);
  const path = `/api/admin/catalogos/${c.id}`;
  await api(alice, "post", `${path}/membros`)
    .send({ expectedVersion: 1, hubClientId: "bob", role: "reader" })
    .expect(204);
  await api(alice, "post", `${path}/membros`)
    .send({ expectedVersion: 1, hubClientId: "bob", role: null })
    .expect(409);
  await api(alice, "post", `/api/admin/catalogos/${other.id}/publicacoes/${pub.id}/suspender`)
    .send({})
    .expect(403);
  await api(alice, "post", `${path}/publicacoes/${pub.id}/suspender`).send({}).expect(204);
  await api(bob, "get", `${path}/publicacoes/${pub.id}`).expect(403);
  expect((await api(bob, "get", `${path}/padroes`)).body.publications).toEqual([]);
  await api(alice, "post", `${path}/membros`)
    .send({ expectedVersion: 2, hubClientId: "alice", role: null })
    .expect(409);
});
it("consumes concurrent publications once and binds confirmation to its curator", async () => {
  const c = await catalog();
  const p = await pattern(c);
  const path = `/api/admin/catalogos/${c.id}`;
  await api(alice, "post", `${path}/membros`)
    .send({ expectedVersion: 1, hubClientId: "bob", role: "curator" })
    .expect(204);
  const first = await preview(c, p);
  const second = await preview(c, p);
  await api(bob, "post", `${path}/padroes/${p.id}/publicar`)
    .send({ confirmationHash: first.confirmationHash })
    .expect(409);
  const results = await Promise.all(
    [first, second].map((v) =>
      api(alice, "post", `${path}/padroes/${p.id}/publicar`).send({
        confirmationHash: v.confirmationHash,
      }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(
    (
      await db.query(
        "SELECT count(*)::integer AS n FROM structure_publication_v2 WHERE padrao_id=$1",
        [p.id],
      )
    ).rows[0].n,
  ).toBe(1);
});
it("paginates immutable history, compares exact versions and excludes suspended content for readers", async () => {
  const c = await catalog(),
    p = await pattern(c);
  const root = `/api/admin/catalogos/${c.id}`;
  const published: StructurePublication[] = [];
  let draft = p;
  for (let index = 0; index < 21; index++) {
    if (index > 0) {
      const r = await api(alice, "post", `${root}/padroes/${p.id}/editar`)
        .send({
          name: p.name,
          expectedRevision: draft.revision,
          content: { ...p.content, label: String(index) },
        })
        .expect(200);
      draft = r.body.pattern as StructureDraft;
    }
    published.push(await publish(c, draft));
  }
  await api(alice, "post", `${root}/membros`)
    .send({ expectedVersion: 1, hubClientId: "bob", role: "reader" })
    .expect(204);
  const history = `${root}/padroes/${p.id}/versoes`;
  const first = await api(bob, "get", history).expect(200);
  expect(first.body.publications).toHaveLength(20);
  const last = await api(bob, "get", `${history}?beforeId=${first.body.nextCursor}`).expect(200);
  expect(last.body.publications).toHaveLength(1);
  expect(last.body.nextCursor).toBeNull();
  expect(
    new Set(
      [...first.body.publications, ...last.body.publications].map(
        (v: StructurePublication) => v.id,
      ),
    ).size,
  ).toBe(21);
  const comparison = { beforeId: published[0]!.id, afterId: published.at(-1)!.id };
  const diff = await api(bob, "post", `${root}/comparar`).send(comparison).expect(200);
  expect(diff.body.changes).toEqual([{ kind: "changed", path: "label" }]);
  expect(diff.body.beforeHash).toBe(published[0]!.hash);
  const otherPattern = await api(alice, "post", `${root}/padroes`)
    .send({ slug: "other", name: "Outro", content: structureContent() })
    .expect(201);
  const other = await publish(c, otherPattern.body.pattern as StructureDraft);
  await api(bob, "get", `${history}?beforeId=${other.id}`).expect(403);
  await api(bob, "post", `${root}/comparar`)
    .send({ ...comparison, afterId: other.id })
    .expect(403);
  await api(alice, "post", `${root}/publicacoes/${comparison.beforeId}/suspender`)
    .send({})
    .expect(204);
  await api(bob, "post", `${root}/comparar`).send(comparison).expect(403);
  await api(bob, "get", `${history}?beforeId=${comparison.beforeId}`).expect(403);
  await api(alice, "post", `${root}/comparar`).send(comparison).expect(200);
  const visible = await api(bob, "get", history).expect(200);
  expect(visible.body.publications).toHaveLength(20);
  expect(visible.body.nextCursor).toBeNull();
  await api(alice, "post", `${root}/membros`)
    .send({ expectedVersion: 2, hubClientId: "bob", role: null })
    .expect(204);
  await api(bob, "get", history).expect(403);
  await api(bob, "post", `${root}/comparar`).send(comparison).expect(403);
});
it("upgrades existing v2 privately and expires previews created before predecessor fencing", async () => {
  const upgradeName = `knowledge_upgrade_${randomUUID().replaceAll("-", "")}_test`;
  const upgradeUrl = new URL(url);
  upgradeUrl.pathname = `/${upgradeName}`;
  await admin.query(`CREATE DATABASE "${upgradeName}"`);
  const upgrade = new pg.Client({ connectionString: upgradeUrl.toString() });
  try {
    await upgrade.connect();
    await upgrade.query(
      "CREATE TABLE _persona_v2_migrations(filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = new URL("../../migrations/persona-v2/", import.meta.url);
    for (const filename of readdirSync(directory)
      .filter((f) => /^000[1-6]_.*\.sql$/.test(f))
      .sort()) {
      const sql = readFileSync(new URL(filename, directory), "utf8");
      await upgrade.query(sql);
      await upgrade.query("INSERT INTO _persona_v2_migrations(filename,checksum) VALUES($1,$2)", [
        filename,
        createHash("sha256").update(sql).digest("hex"),
      ]);
    }
    const ownerId = randomUUID(),
      personaId = randomUUID(),
      skillId = randomUUID(),
      publicationId = randomUUID(),
      catalogId = randomUUID(),
      patternId = randomUUID();
    await upgrade.query(
      "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,'http://fixture.test','owner')",
      [ownerId],
    );
    await upgrade.query(
      "INSERT INTO persona(id,responsavel_id,nome,especialidade) VALUES($1,$2,'Privada','Fixture')",
      [personaId, ownerId],
    );
    const privateTraining = { purpose: "Aprendizado privado anterior" };
    await upgrade.query(
      "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,'private','consulta','Privada',$3)",
      [skillId, personaId, privateTraining],
    );
    await upgrade.query(
      "INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash) VALUES($1,$2,$3,1,$4,$5)",
      [publicationId, personaId, skillId, privateTraining, "a".repeat(64)],
    );
    await upgrade.query("UPDATE skill_v2 SET publicacao_ativa_id=$1 WHERE id=$2", [
      publicationId,
      skillId,
    ]);
    await upgrade.query(
      "INSERT INTO knowledge_catalog_v2(id,responsavel_id,nome) VALUES($1,$2,'Catálogo privado')",
      [catalogId, ownerId],
    );
    await upgrade.query(
      "INSERT INTO knowledge_member_v2(catalogo_id,responsavel_id,papel) VALUES($1,$2,'administrator')",
      [catalogId, ownerId],
    );
    await upgrade.query(
      "INSERT INTO structure_pattern_v2(id,catalogo_id,slug,nome,revisao,rascunho) VALUES($1,$2,'fixture','Fixture',1,$3)",
      [patternId, catalogId, structureContent()],
    );
    await upgrade.query(
      "INSERT INTO structure_preview_v2(hash,catalogo_id,padrao_id,responsavel_id,revisao,catalog_version,pacote_hash,expires_at) VALUES($1,$2,$3,$4,1,1,$1,now()+interval '15 minutes')",
      ["b".repeat(64), catalogId, patternId, ownerId],
    );
    await applyPersonaMigrations(upgradeUrl.toString());
    await applyPersonaMigrations(upgradeUrl.toString());
    expect(
      (
        await upgrade.query("SELECT rascunho,publicacao_ativa_id FROM skill_v2 WHERE id=$1", [
          skillId,
        ])
      ).rows[0],
    ).toEqual({ rascunho: privateTraining, publicacao_ativa_id: publicationId });
    expect(
      (await upgrade.query("SELECT pacote FROM publicacao WHERE id=$1", [publicationId])).rows[0]
        .pacote,
    ).toEqual(privateTraining);
    expect(
      (await upgrade.query("SELECT count(*)::integer AS n FROM structure_pattern_v2")).rows[0].n,
    ).toBe(1);
    expect(
      (
        await upgrade.query(
          "SELECT expires_at<=now() AS expired, publicacao_anterior_id FROM structure_preview_v2",
        )
      ).rows[0],
    ).toEqual({ expired: true, publicacao_anterior_id: null });
    expect(
      (await upgrade.query("SELECT count(*)::integer AS n FROM structure_publication_v2")).rows[0]
        .n,
    ).toBe(0);
  } finally {
    await upgrade.end();
    await admin.query(`DROP DATABASE IF EXISTS "${upgradeName}" WITH (FORCE)`);
  }
});
it("revalidates the hub and keeps metadata-only audit separate from structure payloads", async () => {
  const c = await catalog();
  await pattern(c);
  inactive = true;
  await api(alice, "get", `/api/admin/catalogos/${c.id}/padroes`).expect(401);
  inactive = false;
  unavailable = true;
  await api(bob, "get", "/api/admin/catalogos").expect(503);
  const rows = await db.query("SELECT * FROM knowledge_audit_v2 WHERE catalogo_id=$1", [c.id]);
  expect(rows.rows.length).toBe(2);
  expect(JSON.stringify(rows.rows)).not.toContain("SELECT");
  expect(JSON.stringify(rows.rows)).not.toContain("Valor sintético");
  unavailable = false;
  alice = await login("alice");
});

it("curadoria exige papel, revisão exata e publicação separada; SQL proposto nunca herda aprovação", async () => {
  const c = await catalog(),
    p = await pattern(c),
    pub = await publish(c, p),
    root = `/api/admin/catalogos/${c.id}`;
  await api(alice, "post", `${root}/membros`)
    .send({ expectedVersion: 1, hubClientId: "bob", role: "contributor" })
    .expect(204);
  const proposed = await api(bob, "post", `${root}/propostas`)
    .send({
      basePublicationId: pub.id,
      summary: "Exemplo explícito",
      change: {
        kind: "exemplo_sql",
        value: { ...structureContent().examples[0]!, id: "explicit-example" },
      },
    })
    .expect(201);
  const id = proposed.body.proposal.id as string;
  expect(proposed.body.proposal.change.value.state).toBe("candidate");
  expect(proposed.body.proposal.origin).toBe("console");
  await api(bob, "post", `${root}/propostas/${id}/preview`).send({}).expect(403);
  const review = await api(alice, "post", `${root}/propostas/${id}/preview`).send({}).expect(200);
  expect(review.body.semanticApproval).toBe(false);
  await api(alice, "post", `${root}/propostas/${id}/incorporar`)
    .send({
      confirmationHash: review.body.confirmationHash,
      reason: "Revisado para edição; exemplo ainda candidato",
    })
    .expect(200);
  const versions = await api(alice, "get", `${root}/padroes`);
  const draft = versions.body.patterns[0] as StructureDraft;
  expect(draft.revision).toBe(2);
  expect(draft.activePublicationId).toBe(pub.id);
  expect(draft.content.examples.find((e) => e.id === "explicit-example")?.state).toBe("candidate");
  const original = await api(alice, "get", `${root}/publicacoes/${pub.id}`);
  expect(original.body.publication.content).toEqual(pub.content);
  const publicationPreview = await preview(c, draft);
  await api(alice, "post", `${root}/padroes/${p.id}/publicar`)
    .send({ confirmationHash: publicationPreview.confirmationHash })
    .expect(409);
  await api(alice, "post", `${root}/padroes/${p.id}/editar`)
    .send({
      name: draft.name,
      expectedRevision: 2,
      content: {
        ...draft.content,
        examples: draft.content.examples.map((e) => ({ ...e, state: "approved" })),
      },
    })
    .expect(200);
  const current = (await api(alice, "get", `${root}/padroes`)).body.patterns[0] as StructureDraft;
  expect((await publish(c, current)).revision).toBe(3);
  await api(alice, "post", `${root}/propostas/${id}/incorporar`)
    .send({ confirmationHash: review.body.confirmationHash, reason: "Replay" })
    .expect(409);
  const metadata = await db.query("SELECT * FROM knowledge_audit_v2 WHERE catalogo_id=$1", [c.id]);
  expect(JSON.stringify(metadata.rows)).not.toContain("SELECT p.id");
  expect(JSON.stringify(metadata.rows)).not.toContain("exemplo ainda candidato");
});
it("revisões vencidas, alteradas e concorrentes não incorporam conteúdo diferente", async () => {
  const c = await catalog(),
    p = await pattern(c),
    pub = await publish(c, p),
    root = `/api/admin/catalogos/${c.id}`;
  const submit = async (value: string) =>
    (
      await api(alice, "post", `${root}/propostas`)
        .send({ basePublicationId: pub.id, summary: value, change: { kind: "regra", value } })
        .expect(201)
    ).body.proposal as { id: string };
  const stale = await submit("Regra com revisão vencida");
  const expired = await api(alice, "post", `${root}/propostas/${stale.id}/preview`)
    .send({})
    .expect(200);
  await db.query(
    "UPDATE knowledge_curation_preview_v2 SET expires_at=now()-interval '1 second' WHERE hash=$1",
    [expired.body.confirmationHash],
  );
  await api(alice, "post", `${root}/propostas/${stale.id}/incorporar`)
    .send({ confirmationHash: expired.body.confirmationHash, reason: "Vencida" })
    .expect(409);
  const concurrent = await submit("Regra incorporada uma vez");
  const review = await api(alice, "post", `${root}/propostas/${concurrent.id}/preview`)
    .send({})
    .expect(200);
  const attempts = await Promise.all(
    [1, 2].map(() =>
      api(alice, "post", `${root}/propostas/${concurrent.id}/incorporar`).send({
        confirmationHash: review.body.confirmationHash,
        reason: "Revisão concorrente",
      }),
    ),
  );
  expect(attempts.map((r) => r.status).sort()).toEqual([200, 409]);
  const changed = await api(alice, "post", `${root}/propostas/${stale.id}/preview`)
    .send({})
    .expect(200);
  await api(alice, "post", `${root}/padroes/${p.id}/editar`)
    .send({
      name: p.name,
      expectedRevision: 2,
      content: { ...pub.content, rules: [...pub.content.rules, "Alteração independente"] },
    })
    .expect(200);
  await api(alice, "post", `${root}/propostas/${stale.id}/incorporar`)
    .send({ confirmationHash: changed.body.confirmationHash, reason: "Conteúdo mudou" })
    .expect(409);
});
it("revogação, conflito de definição e imutabilidade preservam a proveniência das propostas", async () => {
  const c = await catalog(),
    p = await pattern(c),
    pub = await publish(c, p),
    root = `/api/admin/catalogos/${c.id}`;
  await api(alice, "post", `${root}/membros`)
    .send({ expectedVersion: 1, hubClientId: "bob", role: "contributor" })
    .expect(204);
  const proposed = await api(bob, "post", `${root}/propostas`)
    .send({
      basePublicationId: pub.id,
      summary: "Significado revisável",
      change: {
        kind: "tabela",
        value: { ...pub.content.tables[0]!, meaning: "Proposta de significado" },
      },
    })
    .expect(201);
  const id = proposed.body.proposal.id as string;
  await expect(
    db.query("UPDATE knowledge_proposal_v2 SET summary='Outra origem' WHERE id=$1", [id]),
  ).rejects.toThrow(/immutable/);
  await expect(db.query("DELETE FROM knowledge_proposal_v2 WHERE id=$1", [id])).rejects.toThrow(
    /immutable/,
  );
  await api(alice, "post", `${root}/padroes/${p.id}/editar`)
    .send({
      name: p.name,
      expectedRevision: 1,
      content: {
        ...pub.content,
        tables: [{ ...pub.content.tables[0]!, meaning: "Significado já alterado" }],
      },
    })
    .expect(200);
  await api(alice, "post", `${root}/propostas/${id}/preview`).send({}).expect(409);
  await api(alice, "post", `${root}/membros`)
    .send({ expectedVersion: 2, hubClientId: "bob", role: null })
    .expect(204);
  await api(bob, "get", `${root}/propostas/${id}`).expect(403);
  await api(alice, "post", `${root}/propostas/${id}/rejeitar`)
    .send({ expectedVersion: 1, reason: "Conflito exige nova proposta" })
    .expect(200);
  await api(alice, "post", `${root}/propostas/${id}/rejeitar`)
    .send({ expectedVersion: 1, reason: "Repetição" })
    .expect(409);
});
it("fila isola autoria e catálogo; mudança de papel invalida a revisão exata", async () => {
  const c = await catalog(),
    p = await pattern(c),
    pub = await publish(c, p),
    root = `/api/admin/catalogos/${c.id}`;
  await api(alice, "post", `${root}/membros`)
    .send({ expectedVersion: 1, hubClientId: "bob", role: "contributor" })
    .expect(204);
  const submit = async (session: Session, value: string) =>
    (
      await api(session, "post", `${root}/propostas`)
        .send({ basePublicationId: pub.id, summary: value, change: { kind: "regra", value } })
        .expect(201)
    ).body.proposal as { id: string };
  const hidden = await submit(alice, "Autoria Alice"),
    own = await submit(bob, "Autoria Bob");
  const visible = (await api(bob, "get", `${root}/propostas`).expect(200)).body as {
    proposals: { id: string }[];
  };
  expect(visible.proposals.map((v) => v.id)).toEqual([own.id]);
  await api(bob, "get", `${root}/propostas/${hidden.id}`).expect(403);
  await api(bob, "get", `${root}/propostas?beforeId=${hidden.id}`).expect(403);
  const other = await catalog();
  await api(alice, "get", `/api/admin/catalogos/${other.id}/propostas?beforeId=${own.id}`).expect(
    403,
  );
  await api(alice, "post", `${root}/membros`)
    .send({ expectedVersion: 2, hubClientId: "bob", role: "curator" })
    .expect(204);
  const prepared = await api(bob, "post", `${root}/propostas/${own.id}/preview`)
    .send({})
    .expect(200);
  await api(alice, "post", `${root}/membros`)
    .send({ expectedVersion: 3, hubClientId: "bob", role: "contributor" })
    .expect(204);
  await api(bob, "post", `${root}/propostas/${own.id}/incorporar`)
    .send({ confirmationHash: prepared.body.confirmationHash, reason: "Papel reduzido" })
    .expect(403);
  await api(alice, "post", `${root}/membros`)
    .send({ expectedVersion: 4, hubClientId: "bob", role: "curator" })
    .expect(204);
  await api(bob, "post", `${root}/propostas/${own.id}/incorporar`)
    .send({
      confirmationHash: prepared.body.confirmationHash,
      reason: "Revisão anterior não ressuscita",
    })
    .expect(409);
  const fresh = await api(bob, "post", `${root}/propostas/${own.id}/preview`).send({}).expect(200);
  await api(alice, "post", `${root}/publicacoes/${pub.id}/suspender`).send({}).expect(204);
  await api(bob, "post", `${root}/propostas/${own.id}/incorporar`)
    .send({ confirmationHash: fresh.body.confirmationHash, reason: "Base suspensa" })
    .expect(403);
  await api(alice, "post", `${root}/membros`)
    .send({ expectedVersion: 5, hubClientId: "bob", role: "reader" })
    .expect(204);
  await api(bob, "post", `${root}/propostas`)
    .send({
      basePublicationId: pub.id,
      summary: "Leitor",
      change: { kind: "regra", value: "Recusada" },
    })
    .expect(403);
});
