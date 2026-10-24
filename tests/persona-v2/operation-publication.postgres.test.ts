import { withReviewDeadline } from "../helpers/review-deadline.js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import pg from "pg";
import request from "supertest";
import { beforeAll, afterAll, it, expect } from "vitest";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { testConfig } from "../../src/config/env.js";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { PostgresPersonaRepository } from "../../src/infrastructure/persistence/persona-v2/repository.js";
import { PostgresOperationCaseExecutor } from "../../src/infrastructure/persistence/persona-v2/operation-case-postgres.js";
import { runOperationCases } from "../../src/application/persona-v2/operation-cases.js";
import {
  operationTraining,
  operationInput,
  reconciledOperationTraining,
} from "../helpers/persona-v2-operation.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { parseMcpPayload } from "../helpers/mcp-rpc.js";
import {
  compileOperationTraining,
  compileOperationCommand,
} from "../../src/application/persona-v2/operation-training.js";
import { trainingSource, sourceProof } from "../helpers/persona-v2-training.js";
import type { OperationCase } from "../../src/application/persona-v2/operation-cases.js";
import {
  operationCaseSchema,
  assertOperationCaseCoverage,
} from "../../src/application/persona-v2/operation-cases.js";

const base = new URL(personaV2TestDatabaseUrl());
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const database = `persona_publication_${randomUUID().replaceAll("-", "")}_test`;
const fixtureDatabase = `persona_dml_${randomUUID().replaceAll("-", "")}_test`;
let metadata: pg.Pool,
  fixture: pg.Pool,
  runtime: Awaited<ReturnType<typeof composePersonaV2>>,
  server: Server;
let cookie: string,
  csrf: string,
  personaId: string,
  sourceId: string,
  skillId: string,
  publicationId: string,
  bearer: string,
  capabilities: string[];
let executes = 0,
  lookups = 0,
  unknown = false;
const receipts = new Map<string, Record<string, unknown>>();
const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
const row = (amount: string) => ({
  id: { type: "integer", value: "1" },
  version: { type: "integer", value: "2" },
  amount: { type: "decimal", value: amount },
});
const caseContent = (stale = false) => ({
  name: stale ? "Concorrência" : "Altera pedido",
  input: {
    parameters: {
      ...operationInput,
      ...(stale ? { version: { type: "integer", value: "3" } } : {}),
    },
    fixtures: [{ table: "orders", generated: [], rows: [row("10.00")] }],
  },
  expected: stale
    ? { error: "ROW_CONDITION_FAILED" }
    : { affectedRows: 1, tables: [{ table: "orders", rows: [row("42.50")] }] },
});
const post = (path: string, body: object) =>
  request(runtime.app)
    .post(path)
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .set("Cookie", cookie)
    .set("X-CSRF-Token", csrf)
    .send(withReviewDeadline(path, body));
const tool = async (name: string, args: unknown, token = bearer) => {
  const response = await request(runtime.app)
    .post("/mcp")
    .set("Host", "127.0.0.1:3333")
    .set("Accept", "application/json, text/event-stream")
    .set("Authorization", `Bearer ${token}`)
    .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  expect(response.status).toBe(200);
  const result = parseMcpPayload(response).result as {
    isError?: boolean;
    content: { text: string }[];
  };
  return { isError: result.isError === true, value: JSON.parse(result.content[0]!.text) };
};
const issue = async (caps = capabilities) => {
  const response = await post(`/api/admin/personas/${personaId}/tokens`, {
    name: "Writer",
    expiresAt: null,
    delegation: empty,
    permissions: {
      ...empty,
      sourceIds: [sourceId],
      skills: [{ skillId, capabilities: caps, effects: ["update"], requireHumanApproval: false }],
    },
  });
  expect(response.status).toBe(201);
  return response.body.bearer as string;
};
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.query(`CREATE DATABASE "${fixtureDatabase}"`);
  const url = new URL(base);
  url.pathname = `/${database}`;
  const fixtureUrl = new URL(base);
  fixtureUrl.pathname = `/${fixtureDatabase}`;
  await applyPersonaMigrations(url.toString());
  metadata = new pg.Pool({ connectionString: url.toString() });
  fixture = new pg.Pool({ connectionString: fixtureUrl.toString() });
  // Real HTTP client + synthetic hub responses. The separate Dart/Socket.IO suite covers the hub/agent transport.
  server = createServer((req, res) => {
    void (async () => {
      let body = "";
      for await (const chunk of req) body += String(chunk);
      res.setHeader("content-type", "application/json");
      if (req.url?.endsWith("/client-auth/login")) {
        res.end(JSON.stringify({ accessToken: "source-jwt", refreshToken: "fixture-refresh" }));
        return;
      }
      if (req.method === "GET") {
        res.end(
          JSON.stringify({
            agent: {
              isHubConnected: true,
              hasClientToken: true,
              sourceIdentity: 1,
              sqlOperations: {
                version: 1,
                maxSteps: 32,
                maxAffectedRows: 100000,
                timeoutMs: 300000,
              },
            },
          }),
        );
        return;
      }
      const input = JSON.parse(body) as {
        command: { id: string; method: string; params: Record<string, unknown> };
      };
      expect(req.headers.authorization).toBe("Bearer source-jwt");
      expect(input.command.params.client_token).toBe("source-technical");
      let result: unknown;
      if (input.command.method === "client_token.getPolicy")
        result = {
          all_tables: true,
          all_views: false,
          all_permissions: false,
          is_revoked: false,
          payload: { database: "synthetic" },
          global_permissions: { read: true, update: true, delete: false, ddl: false },
          rules: [],
        };
      else if (input.command.method === "sql.describeSource") result = sourceProof();
      else if (input.command.method === "sql.execute") {
        const values: unknown[] = [];
        const params = input.command.params.params as Record<string, unknown>;
        const sql = String(input.command.params.sql).replace(
          /:([a-z_][a-z0-9_]*)/g,
          (_m, k: string) => {
            values.push(params[k]);
            return `$${values.length}`;
          },
        );
        const read = await fixture.query(sql, values);
        result = {
          columns: read.fields.map((f) => f.name),
          rows: read.rows,
          truncated: false,
          effectiveMaxRows: 2,
        };
      } else {
        const params = input.command.params;
        expect(params.contractVersion).toBe(1);
        expect(params.sourcePhysicalId).toMatch(/^[a-f0-9]{64}$/);
        if (input.command.method === "sql.operation.execute") {
          executes++;
          expect(params.database).toBe("synthetic");
          const now = new Date().toISOString();
          result = {
            operationId: params.operationId,
            fingerprint: params.fingerprint,
            executionId: randomUUID(),
            state: unknown ? "resultado_desconhecido" : "concluida",
            directlyAffectedRows: unknown ? null : 1,
            updatedAt: now,
            completedAt: now,
          };
          receipts.set(String(params.operationId), result as Record<string, unknown>);
        } else {
          lookups++;
          const previous = receipts.get(String(params.operationId))!;
          result = unknown
            ? previous
            : { ...previous, state: "concluida", directlyAffectedRows: 1 };
        }
      }
      res.end(
        JSON.stringify({ response: { item: { jsonrpc: "2.0", id: input.command.id, result } } }),
      );
    })().catch(() => {
      res.statusCode = 500;
      res.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture HTTP indisponível.");
  runtime = await composePersonaV2(
    testConfig({
      DATABASE_URL: url.toString(),
      PLUG_SERVER_BASE_URL: `http://127.0.0.1:${address.port}`,
    }),
    {
      ownerAuth: {
        hubOrigin: `http://127.0.0.1:${address.port}`,
        login: async () => ({ accessToken: "owner-jwt" }),
        profile: async () => ({ clientId: "owner-client", active: true }),
      },
    },
  );
  const login = await request(runtime.app)
    .post("/api/admin/login")
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .send({ email: "owner@fixture.test", password: "fixture-password" });
  expect(login.status).toBe(200);
  cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  csrf = login.body.csrfToken;
  personaId = (
    await post("/api/admin/personas", { name: "Operações", specialty: "Pedidos", instructions: "" })
  ).body.persona.id;
  const source = await post(`/api/admin/personas/${personaId}/fontes`, {
    name: "Synthetic",
    purpose: "Fixture",
    environment: "test",
    agentId: randomUUID(),
    database: "synthetic",
    dialect: "postgres",
    email: "source@fixture.test",
    password: "source-password",
    clientToken: "source-technical",
  });
  expect(source.status).toBe(201);
  sourceId = source.body.fonte.id;
  const draft = await post(`/api/admin/personas/${personaId}/skills`, {
    slug: "alterar-pedido",
    kind: "operacao_sql",
    name: "Pedidos",
    training: operationTraining(sourceId),
  });
  expect(draft.status).toBe(201);
  skillId = draft.body.skill.id;
});
afterAll(async () => {
  await runtime?.close();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await metadata?.end();
  await fixture?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`DROP DATABASE IF EXISTS "${fixtureDatabase}"`);
  await admin.end();
});

it("edita casos por CAS, lê relatórios atuais e preserva publicação e isolamento", async () => {
  const created = await post(`/api/admin/personas/${personaId}/skills`, {
    slug: "editor-isolado",
    kind: "operacao_sql",
    name: "Editor isolado",
    training: operationTraining(sourceId),
  });
  expect(created.status).toBe(201);
  const id = created.body.skill.id as string;
  const path = `/api/admin/personas/${personaId}/skills/${id}`;
  const get = (url: string) =>
    request(runtime.app)
      .get(url)
      .set("Host", "127.0.0.1:3333")
      .set("Origin", "http://127.0.0.1:3333")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf);
  expect((await get(`${path}/testes-operacao?after=invalid`)).status).toBe(400);
  expect(
    (
      await post(`${path}/casos-operacao`, {
        expectedRevision: 1,
        required: true,
        content: { ...caseContent(), input: {} },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await post(`${path}/casos-operacao`, {
        expectedRevision: 1,
        required: true,
        approved: true,
        content: caseContent(),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await post(`${path}/casos-operacao`, {
        expectedRevision: 1,
        required: true,
        content: caseContent(),
      })
    ).status,
  ).toBe(200);
  const before = await get(`${path}/testes-operacao`);
  expect(before.status).toBe(200);
  expect(before.body).toMatchObject({ revision: 2, requiredApproved: false, reports: [] });
  const caseId = before.body.cases[0].id as string;
  expect((await post(`${path}/preview`, {})).status).toBe(409);
  const repository = new PostgresPersonaRepository(metadata);
  const report = await repository.transaction({ personaIds: [personaId], tokenIds: [] }, (tx) =>
    runOperationCases(
      tx,
      personaId,
      id,
      new NodeCryptoAdapter("a".repeat(64)),
      new PostgresOperationCaseExecutor(fixture),
    ),
  );
  expect(report.approved).toBe(true);
  const tested = await get(`${path}/testes-operacao`);
  expect(tested.body.requiredApproved).toBe(true);
  expect(tested.body.reports[0]).toMatchObject({ current: true, approved: true, revision: 2 });
  expect(tested.body.reports[0]).not.toHaveProperty("evidence");
  const preview = await post(`${path}/preview`, {});
  expect(preview.status).toBe(200);
  expect(
    (await post(`${path}/publicar`, { confirmationHash: preview.body.confirmationHash })).status,
  ).toBe(201);
  const changes = {
    expectedRevision: 2,
    id: caseId,
    required: true,
    content: { ...caseContent(), name: "Revisado" },
  };
  const replies = await Promise.all([
    post(`${path}/casos-operacao`, changes),
    post(`${path}/casos-operacao`, changes),
  ]);
  expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
  const changed = await get(`${path}/testes-operacao`);
  expect(changed.body).toMatchObject({ revision: 3, requiredApproved: false });
  expect(changed.body.reports[0].current).toBe(false);
  const audit = await metadata.query<{ resource_version: number }>(
    "SELECT resource_version FROM audit_v2 WHERE persona_id=$1 AND skill_id=$2 AND evento='skill_caso_atualizado'",
    [personaId, id],
  );
  expect(audit.rows).toEqual([{ resource_version: 3 }]);
  expect((await get(`${path}/publicacao`)).body.publication.revision).toBe(2);
  expect(
    (await post(`${path}/publicar`, { confirmationHash: preview.body.confirmationHash })).status,
  ).toBe(409);
  const another = (
    await post("/api/admin/personas", { name: "Outra", specialty: "Teste", instructions: "" })
  ).body.persona.id as string;
  expect((await get(`/api/admin/personas/${another}/skills/${id}/testes-operacao`)).status).toBe(
    403,
  );
  expect(
    (
      await post(`/api/admin/personas/${another}/skills/${id}/casos-operacao`, {
        ...changes,
        expectedRevision: 3,
      })
    ).status,
  ).toBe(403);
  expect(
    (await post(`${path}/casos-operacao`, { ...changes, expectedRevision: 3, remove: true }))
      .status,
  ).toBe(200);
  expect((await get(`${path}/testes-operacao`)).body).toMatchObject({
    revision: 4,
    cases: [],
    requiredApproved: false,
  });
  // Rejected historical reports exercise stable pagination without executing more SQL.
  await repository.transaction({ personaIds: [personaId], tokenIds: [] }, async (tx) => {
    for (let i = 0; i < 21; i++)
      await tx.catalog.saveReport(
        personaId,
        id,
        4,
        report.packageHash,
        before.body.casesHash as string,
        false,
        [],
      );
  });
  const first = await get(`${path}/testes-operacao`);
  expect(first.body.reports).toHaveLength(20);
  expect(first.body.nextCursor).toBeTruthy();
  const second = await get(`${path}/testes-operacao?after=${String(first.body.nextCursor)}`);
  expect(second.body.reports).toHaveLength(2);
  expect(second.body.nextCursor).toBeNull();
  expect(
    new Set([...first.body.reports, ...second.body.reports].map((r: { id: string }) => r.id)).size,
  ).toBe(22);
  const otherDraft = await post(`/api/admin/personas/${personaId}/skills`, {
    slug: "outro-editor",
    kind: "operacao_sql",
    name: "Outro editor",
    training: operationTraining(sourceId),
  });
  expect(
    (
      await get(
        `/api/admin/personas/${personaId}/skills/${String(otherDraft.body.skill.id)}/testes-operacao?after=${String(first.body.nextCursor)}`,
      )
    ).body.reports,
  ).toEqual([]);
});

it("exige casos obrigatórios executados em banco isolado antes de preview/publicação", async () => {
  const path = `/api/admin/personas/${personaId}/skills/${skillId}`;
  expect((await post(`${path}/preview`, {})).status).toBe(409);
  for (const stale of [false, true])
    expect(
      (await post(`${path}/casos`, { required: true, content: caseContent(stale) })).status,
    ).toBe(201);
  expect((await post(`${path}/preview`, {})).status).toBe(409);
  const report = await new PostgresPersonaRepository(metadata).transaction(
    { personaIds: [personaId], tokenIds: [] },
    (tx) =>
      runOperationCases(
        tx,
        personaId,
        skillId,
        new NodeCryptoAdapter("a".repeat(64)),
        new PostgresOperationCaseExecutor(fixture),
      ),
  );
  expect(report.approved).toBe(true);
  expect(report.results).toHaveLength(2);
  expect(
    (await fixture.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows,
  ).toEqual([]);
  const preview = await post(`${path}/preview`, {});
  expect(preview.status).toBe(200);
  capabilities = preview.body.package.requiredCapabilities;
  const published = await post(`${path}/publicar`, {
    confirmationHash: preview.body.confirmationHash,
  });
  expect(published.status).toBe(201);
  publicationId = published.body.publication.id;
  expect(
    (await post(`${path}/publicar`, { confirmationHash: preview.body.confirmationHash })).status,
  ).toBe(409);
  bearer = await issue();
});
it("aplica concessão idêntica em descoberta, leitura e preparação direta", async () => {
  const restricted = await issue([]);
  expect(
    (await tool("preparar_operacao", { publicationId, input: operationInput }, restricted)).isError,
  ).toBe(true);
  const list = await tool("listar_skills", {}, restricted);
  expect(JSON.stringify(list.value)).not.toContain(publicationId);
  const read = await tool("obter_skill", { slug: "alterar-pedido" });
  expect(read.isError).toBe(false);
  expect(read.value.format).toBe("persona-sql-operation-v2");
});
it("prepara, exige aprovação Client e envia uma vez pelo adaptador HTTP real", async () => {
  const prepared = await tool("preparar_operacao", { publicationId, input: operationInput });
  expect(prepared.isError).toBe(false);
  expect(prepared.value.requireHumanApproval).toBe(true);
  const ref = { operationId: prepared.value.operationId, fingerprint: prepared.value.fingerprint };
  expect((await tool("executar_operacao", ref)).isError).toBe(true);
  expect(executes).toBe(0);
  const review = await request(runtime.app)
    .get(`/api/admin/personas/${personaId}/operations/${ref.operationId}`)
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .set("Cookie", cookie)
    .set("X-CSRF-Token", csrf);
  expect(review.status).toBe(200);
  expect(review.body.command.steps[0].sql).toContain("UPDATE");
  expect((await post(`/api/admin/personas/${personaId}/operations/approve`, ref)).status).toBe(200);
  const done = await tool("executar_operacao", ref);
  expect(done.isError).toBe(false);
  expect(done.value.receipt.state).toBe("concluida");
  expect(executes).toBe(1);
  expect((await tool("executar_operacao", ref)).isError).toBe(true);
  expect(executes).toBe(1);
  expect(JSON.stringify((await metadata.query("SELECT * FROM audit_v2")).rows)).not.toContain(
    'UPDATE "orders"',
  );
  const caps = await tool("obter_capacidades", {});
  expect(caps.value.sqlOperations.automaticReplay).toBe(false);
});
it("consulta journal após perda de confirmação sem executar novamente", async () => {
  unknown = true;
  const prepared = await tool("preparar_operacao", { publicationId, input: operationInput });
  const ref = { operationId: prepared.value.operationId, fingerprint: prepared.value.fingerprint };
  expect((await post(`/api/admin/personas/${personaId}/operations/approve`, ref)).status).toBe(200);
  const result = await tool("executar_operacao", ref);
  expect(result.value.state).toBe("resultado_desconhecido");
  const before = executes,
    readBefore = lookups;
  unknown = false;
  const resolved = await tool("obter_operacao", ref);
  expect(resolved.isError).toBe(false);
  expect(resolved.value.state).toBe("concluida");
  expect(executes).toBe(before);
  expect(lookups).toBeGreaterThan(readBefore);
});
it("executa INSERT/SELECT/UPDATE/DELETE com chave gerada e rollback real da fixture", async () => {
  const t = operationTraining();
  t.parameters = t.parameters.filter((p) => p.name !== "id");
  t.tables[0]!.concurrency = [];
  t.tables[0]!.columns.find((c) => c.name === "version")!.writable = true;
  const id = {
    column: "id",
    binding: { kind: "step_output" as const, stepId: "create", output: "id" },
  };
  t.steps = [
    {
      id: "create",
      effect: "insert",
      table: "orders",
      values: [
        { column: "amount", binding: { kind: "input", name: "amount" } },
        { column: "version", binding: { kind: "input", name: "version" } },
      ],
      where: [],
      outputs: [{ column: "id", type: "integer" }],
      rows: { min: 1, max: 1 },
    },
    {
      id: "check",
      effect: "select",
      table: "orders",
      values: [],
      where: [id],
      outputs: [{ column: "amount", type: "decimal" }],
      rows: { min: 1, max: 1 },
    },
    {
      id: "change",
      effect: "update",
      table: "orders",
      values: [{ column: "amount", binding: { kind: "input", name: "amount" } }],
      where: [id],
      outputs: [],
      rows: { min: 1, max: 1 },
    },
    {
      id: "remove",
      effect: "delete",
      table: "orders",
      values: [],
      where: [id],
      outputs: [],
      rows: { min: 1, max: 1 },
    },
  ];
  t.maxAffectedRows = 3;
  const crypto = new NodeCryptoAdapter("a".repeat(64));
  const pkg = compileOperationTraining(t, trainingSource, crypto, "Multi-etapa");
  const parameters = { amount: operationInput.amount, version: operationInput.version };
  const command = compileOperationCommand(pkg, trainingSource, randomUUID(), parameters, crypto);
  const content: OperationCase = {
    name: "Identificador gerado sem MAX(id)",
    input: { parameters, fixtures: [{ table: "orders", generated: ["id"], rows: [] }] },
    expected: { affectedRows: 3, tables: [{ table: "orders", rows: [] }] },
  };
  expect(await new PostgresOperationCaseExecutor(fixture).evaluate(pkg, command, content)).toBe(
    true,
  );
  expect(
    (await fixture.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows,
  ).toEqual([]);
});
it("republicação alterada exige relatório atual e não amplia o token existente", async () => {
  const path = `/api/admin/personas/${personaId}/skills/${skillId}`;
  const changed = operationTraining(sourceId);
  changed.timeoutMs += 1;
  const revision = (await metadata.query("SELECT revisao FROM skill_v2 WHERE id=$1", [skillId]))
    .rows[0].revisao;
  expect(
    (
      await post(`${path}/rascunho`, {
        name: "Pedidos",
        training: changed,
        expectedRevision: revision,
      })
    ).status,
  ).toBe(200);
  expect((await post(`${path}/preview`, {})).body.error.code).toBe("INCOMPLETE_INPUT");
  await new PostgresPersonaRepository(metadata).transaction(
    { personaIds: [personaId], tokenIds: [] },
    (tx) =>
      runOperationCases(
        tx,
        personaId,
        skillId,
        new NodeCryptoAdapter("a".repeat(64)),
        new PostgresOperationCaseExecutor(fixture),
      ),
  );
  const preview = await post(`${path}/preview`, {});
  expect(preview.status).toBe(200);
  const published = await post(`${path}/publicar`, {
    confirmationHash: preview.body.confirmationHash,
  });
  expect(published.status).toBe(201);
  expect(
    (
      await tool("preparar_operacao", {
        publicationId: published.body.publication.id,
        input: operationInput,
      })
    ).isError,
  ).toBe(true);
  expect((await tool("obter_skill", { slug: "alterar-pedido" })).isError).toBe(true);
});

it("publica SQL adaptável testado e concilia marcador real por leitura sem reenvio", async () => {
  const t = reconciledOperationTraining(sourceId);
  t.mode = "sql_adaptavel";
  t.parameters.push({
    name: "ceiling",
    type: "decimal",
    nullable: false,
    meaning: "Valor atual máximo",
  });
  t.steps[0]!.adaptiveFilters = [{ column: "amount", operator: "<=", parameter: "ceiling" }];
  const sql =
    'UPDATE "orders" SET "amount" = :v_amount WHERE "version" = :w_version AND "id" = :w_id AND "amount" <= :a_0';
  const draft = await post(`/api/admin/personas/${personaId}/skills`, {
    slug: "adaptar-conciliar",
    kind: "operacao_sql",
    name: "Conciliação",
    training: t,
  });
  expect(draft.status).toBe(201);
  const path = `/api/admin/personas/${personaId}/skills/${draft.body.skill.id}`;
  const id = randomUUID();
  const parameters = { ...operationInput, ceiling: { type: "decimal", value: "100.00" } };
  const content = {
    name: "Adaptação e marcador",
    input: {
      operationId: id,
      parameters,
      sqlByStep: { change: sql },
      fixtures: [
        { table: "orders", generated: [], rows: [row("10.00")] },
        { table: "operation_ledger", generated: [], rows: [] },
      ],
    },
    expected: {
      affectedRows: 2,
      tables: [
        { table: "orders", rows: [row("42.50")] },
        { table: "operation_ledger", rows: [{ operation_id: { type: "uuid", value: id } }] },
      ],
    },
  };
  expect((await post(`${path}/casos`, { required: true, content })).status).toBe(201);
  expect((await post(`${path}/preview`, {})).status).toBe(409);
  expect(
    (
      await post(`${path}/casos`, {
        required: true,
        content: {
          ...content,
          name: "Retirar concorrência é recusado",
          input: {
            ...content.input,
            sqlByStep: { change: sql.replace('"version" = :w_version AND ', "") },
          },
          expected: { error: "INVALID_PLAN" },
        },
      })
    ).status,
  ).toBe(201);
  const report = await new PostgresPersonaRepository(metadata).transaction(
    { personaIds: [personaId], tokenIds: [] },
    (tx) =>
      runOperationCases(
        tx,
        personaId,
        draft.body.skill.id,
        new NodeCryptoAdapter("a".repeat(64)),
        new PostgresOperationCaseExecutor(fixture),
      ),
  );
  expect(report.approved).toBe(true);
  const preview = await post(`${path}/preview`, {});
  expect(preview.status).toBe(200);
  const published = await post(`${path}/publicar`, {
    confirmationHash: preview.body.confirmationHash,
  });
  expect(published.status).toBe(201);
  const token = await post(`/api/admin/personas/${personaId}/tokens`, {
    name: "Adaptive writer",
    expiresAt: null,
    delegation: empty,
    permissions: {
      ...empty,
      sourceIds: [sourceId],
      skills: [
        {
          skillId: draft.body.skill.id,
          capabilities: preview.body.package.requiredCapabilities,
          effects: ["update", "insert", "select"],
          requireHumanApproval: false,
        },
      ],
    },
  });
  expect(token.status).toBe(201);
  const newBearer = token.body.bearer as string;
  const prepared = await tool(
    "preparar_operacao",
    {
      publicationId: published.body.publication.id,
      input: { parameters, sqlByStep: { change: sql } },
    },
    newBearer,
  );
  expect(prepared.isError).toBe(false);
  const ref = { operationId: prepared.value.operationId, fingerprint: prepared.value.fingerprint };
  expect((await post(`/api/admin/personas/${personaId}/operations/approve`, ref)).status).toBe(200);
  unknown = true;
  expect((await tool("executar_operacao", ref, newBearer)).value.state).toBe(
    "resultado_desconhecido",
  );
  const before = executes;
  // Dedicated business fixture: emulate a committed marker after lost confirmation.
  // The synthetic hub still does not certify native ODBC transactions/journal atomicity.
  await fixture.query("CREATE TABLE operation_ledger(operation_id uuid PRIMARY KEY)");
  try {
    const absent = await tool("conciliar_operacao", ref, newBearer);
    expect(absent.isError).toBe(false);
    expect(absent.value.reconciliation.classification).toBe("inconclusiva");
    await fixture.query("INSERT INTO operation_ledger VALUES($1)", [ref.operationId]);
    const present = await tool("conciliar_operacao", ref, newBearer);
    expect(present.isError).toBe(false);
    expect(present.value.reconciliation.classification).toBe("aplicacao_verificada");
    expect(present.value.state).toBe("resultado_desconhecido");
    expect(present.value.receipt.directlyAffectedRows).toBeNull();
    expect(executes).toBe(before);
    expect((await tool("executar_operacao", ref, newBearer)).isError).toBe(true);
    expect((await tool("conciliar_operacao", ref, bearer)).isError).toBe(true);
    const evidence = await metadata.query(
      "SELECT * FROM operacao_conciliacao_v2 WHERE operacao_id=$1",
      [ref.operationId],
    );
    expect(evidence.rows).toHaveLength(2);
    expect(JSON.stringify(evidence.rows)).not.toContain("SELECT");
    await expect(
      metadata.query("DELETE FROM operacao_conciliacao_v2 WHERE operacao_id=$1", [ref.operationId]),
    ).rejects.toThrow();
  } finally {
    await fixture.query("DROP TABLE operation_ledger");
  }
});

it("exemplo documentado adaptável executa seus casos reais em fixture isolada", async () => {
  const example = JSON.parse(
    readFileSync(
      new URL("../../docs/persona-v2/examples/sql-operation-adaptive.json", import.meta.url),
      "utf8",
    ),
  );
  const crypto = new NodeCryptoAdapter("a".repeat(64));
  const pkg = compileOperationTraining(
    { ...example.draft.training, sourceId: trainingSource.id },
    trainingSource,
    crypto,
    "Exemplo documentado",
  );
  assertOperationCaseCoverage(pkg, example.cases);
  for (const test of example.cases) {
    const content = operationCaseSchema.parse(test.content);
    const compile = () =>
      compileOperationCommand(
        pkg,
        trainingSource,
        content.input.operationId!,
        { parameters: content.input.parameters, sqlByStep: content.input.sqlByStep },
        crypto,
      );
    if ("error" in content.expected && content.expected.error === "INVALID_PLAN")
      expect(compile).toThrow();
    else
      expect(
        await new PostgresOperationCaseExecutor(fixture).evaluate(pkg, compile(), content),
      ).toBe(true);
  }
});
