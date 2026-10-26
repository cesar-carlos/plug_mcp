import { withReviewDeadline } from "../helpers/review-deadline.js";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { testConfig } from "../../src/config/env.js";
import type { Permissions } from "../../src/domain/persona-v2/model.js";
import type {
  PlugServerGatewayPort,
  ClientTokenPolicy,
} from "../../src/domain/ports/plug-server-gateway.port.js";
import {
  queryTraining,
  attachmentTraining,
  binaryTraining,
} from "../helpers/persona-v2-training.js";
import { parseMcpPayload } from "../helpers/mcp-rpc.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import {
  federationTraining,
  federationPlan,
  federationCase,
} from "../helpers/persona-v2-federation.js";
import { runFederationCases } from "../../src/application/persona-v2/federation-cases.js";
import { PostgresPersonaRepository } from "../../src/infrastructure/persistence/persona-v2/repository.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { PersonaOAuth } from "../../src/application/persona-v2/oauth.js";
import { PostgresPersonaOAuthStore } from "../../src/infrastructure/persistence/persona-v2/oauth.js";
import { PostgresSqlOperationStore } from "../../src/infrastructure/persistence/persona-v2/sql-operations.js";
import { PersonaQueryReuse } from "../../src/infrastructure/persona-v2/query-reuse.js";

const base = new URL(personaV2TestDatabaseUrl());
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const name = `persona_queries_${randomUUID().replaceAll("-", "")}_test`;
const url = new URL(base);
url.pathname = `/${name}`;
let db: pg.Pool, runtime: Awaited<ReturnType<typeof composePersonaV2>>;
let cookie: string, csrf: string, personaId: string, bearer: string;
let cross: { skillId: string; publicationId: string; capabilities: string[]; bearer: string };
const revokedAccounts = new Set<string>();
const identityOverrides = new Map<string, string>();
const sources: { id: string; skillId: string; publicationId: string; capabilities: string[] }[] =
  [];
const empty: Permissions = {
  sourceIds: [],
  skills: [],
  externalOperationIds: [],
  administrative: [],
};
let afterSql: (() => Promise<void>) | undefined;
let policyRevoked = false,
  transportFailure = false;
const policy = (clientToken: string): ClientTokenPolicy => ({
  allTables: true,
  tables: [],
  fullPolicy: {
    allViews: false,
    allPermissions: false,
    revoked: policyRevoked || revokedAccounts.has(clientToken),
    database: `base-${clientToken}`,
    globalPermissions: { read: true, update: false, delete: false, ddl: false },
    rules: [],
  },
});
const execute = vi.fn<PlugServerGatewayPort["executeSql"]>(async (input) => {
  if (transportFailure)
    throw new DomainError({
      code: ERROR_CODES.PLUG_SERVER_ERROR,
      message: "unsafe upstream payload password=do-not-echo",
      hint: "retry unsafe upstream payload",
      source: "plug_server_http",
    });
  expect(input.database).toBe(`base-${input.clientToken}`);
  expect(input.accessToken).toBe(`jwt-${input.clientToken}`);
  const schema =
    input.clientToken === "a" ? "fixture_a" : input.clientToken === "c" ? "fixture_c" : "fixture_b";
  const params: unknown[] = [];
  const sql = input.sql.replace(/:([a-z_][a-z0-9_]*)/g, (_match, param: string) => {
    params.push(input.params?.[param]);
    return `$${params.length}`;
  });
  const client = await db.connect();
  try {
    await client.query(`SET search_path TO ${schema}`);
    const result = await client.query(sql, params);
    const limit = input.options?.pageSize ?? input.options?.maxRows ?? 5000;
    const offset = input.options?.page ? (input.options.page - 1) * limit : 0;
    const rows = result.rows
      .slice(offset, offset + limit)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            Buffer.isBuffer(value) ? value.toString("base64") : value,
          ]),
        ),
      );
    await afterSql?.();
    return {
      columns: result.fields.map((f) => f.name),
      ...(result.fields.some((f) => f.dataTypeID === 17)
        ? {
            columnsMetadata: result.fields
              .filter((f) => f.dataTypeID === 17)
              .map((f) => ({ name: f.name, odbcType: -4 })),
          }
        : {}),
      rows,
      truncated: result.rows.length > offset + limit,
      ...(input.options?.page
        ? {
            pagination: {
              page: input.options.page,
              pageSize: limit,
              hasNextPage: result.rows.length > offset + limit,
              hasPreviousPage: offset > 0,
            },
          }
        : {}),
    };
  } finally {
    await client.query("RESET search_path");
    client.release();
  }
});
const hub: PlugServerGatewayPort = {
  login: vi.fn(async (email, password) => {
    const account =
      email === "a@fixture.test"
        ? "a"
        : email === "b@fixture.test"
          ? "b"
          : email === "c@fixture.test"
            ? "c"
            : undefined;
    if (!account || password !== "source-password") throw new Error("bad source credentials");
    return { accessToken: `jwt-${account}`, refreshToken: `refresh-${account}` };
  }),
  refresh: vi.fn(),
  requestAgentAccess: vi.fn(),
  putClientToken: vi.fn(),
  getAgentAccessStatus: vi.fn<PlugServerGatewayPort["getAgentAccessStatus"]>(
    async (_jwt, agentId) => ({
      agentId,
      state: "approved",
      sourceIdentity: 1,
      hasClientToken: true,
      isHubConnected: true,
    }),
  ),
  getClientTokenPolicy: vi.fn(async ({ clientToken }) => policy(clientToken)),
  describeSource: vi.fn<NonNullable<PlugServerGatewayPort["describeSource"]>>(
    async ({ database }) => ({
      contractVersion: 1,
      database,
      dialect: "postgres",
      identityHash:
        identityOverrides.get(database) ??
        (database.endsWith("a") ? "a" : database.endsWith("c") ? "c" : "b").repeat(64),
      identityKind: "native",
      engineVersion: "fixture",
      verifiedAt: "2026-10-11T00:00:00.000Z",
    }),
  ),
  executeSql: execute,
};
const post = (path: string, body: object) =>
  request(runtime.app)
    .post(path)
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .set("Cookie", cookie)
    .set("X-CSRF-Token", csrf)
    .send(withReviewDeadline(path, body));
const tool = async (
  args: unknown,
  token = bearer,
  toolName = "consultar_dados",
  target = runtime,
) => {
  const response = await request(target.app)
    .post("/mcp")
    .set("Host", "127.0.0.1:3333")
    .set("Accept", "application/json, text/event-stream")
    .set("Authorization", `Bearer ${token}`)
    .send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    });
  expect(response.status).toBe(200);
  const result = parseMcpPayload(response).result as {
    isError?: boolean;
    content: { text: string }[];
  };
  return { isError: result.isError, value: JSON.parse(result.content[0]!.text) };
};
const issue = async (selected = sources) => {
  const response = await post(`/api/admin/personas/${personaId}/tokens`, {
    name: "Queries",
    delegation: empty,
    expiresAt: null,
    permissions: {
      ...empty,
      sourceIds: selected.map((s) => s.id),
      skills: selected.map((s) => ({
        skillId: s.skillId,
        capabilities: s.capabilities,
        effects: ["select"],
        requireHumanApproval: false,
      })),
    },
  });
  expect(response.status).toBe(201);
  return response.body as { bearer: string; tokenId: string };
};
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  await applyPersonaMigrations(url.toString());
  db = new pg.Pool({ connectionString: url.toString() });
  await db.query(`CREATE SCHEMA fixture_a; CREATE SCHEMA fixture_b; CREATE SCHEMA fixture_c;
    CREATE TABLE fixture_a.orders(id integer PRIMARY KEY, amount numeric(12,2), secret text, company integer);
    CREATE TABLE fixture_b.orders(id integer PRIMARY KEY, amount numeric(12,2), secret text, company integer);
    CREATE TABLE fixture_c.orders(id integer PRIMARY KEY, amount numeric(12,2));
    CREATE TABLE fixture_a.documents(id integer PRIMARY KEY, document bytea);
    INSERT INTO fixture_c.orders VALUES(1,10.25);
    INSERT INTO fixture_a.orders VALUES(1,10.25,'private-a',1),(2,20.50,'private-a',2);
    INSERT INTO fixture_b.orders VALUES(1,100.75,'private-b',1),(2,200.25,'private-b',2);`);
  await db.query("INSERT INTO fixture_a.documents VALUES(1,$1),(2,$2)", [
    Buffer.from("%PDF-1.4\n% First fixture\n%%EOF\n"),
    Buffer.from("%PDF-1.4\n% Second fixture\n%%EOF\n"),
  ]);
  runtime = await composePersonaV2(testConfig({ DATABASE_URL: url.toString() }), {
    hub,
    ownerAuth: {
      hubOrigin: "http://hub.fixture.test",
      login: async () => ({ accessToken: "owner-jwt" }),
      profile: async () => ({ clientId: "owner-client-a", active: true }),
    },
  });
  const login = await request(runtime.app)
    .post("/api/admin/login")
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .send({ email: "owner@fixture.test", password: "owner-password" });
  expect(login.status).toBe(200);
  cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  csrf = login.body.csrfToken;
  personaId = (
    await post("/api/admin/personas", {
      name: "Queries",
      specialty: "Financeiro",
      instructions: "",
    })
  ).body.persona.id;
  const agentId = randomUUID();
  for (const account of ["a", "b"]) {
    const source = await post(`/api/admin/personas/${personaId}/fontes`, {
      name: `Base ${account}`,
      purpose: "Dados sintéticos",
      environment: "test",
      agentId,
      dialect: "postgres",
      email: `${account}@fixture.test`,
      password: "source-password",
      clientToken: account,
    });
    expect(source.status).toBe(201);
    expect(source.body.fonte.database).toBe(`base-${account}`);
    const id = source.body.fonte.id as string;
    const draft = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: `orders-${account}`,
      kind: "consulta",
      name: `Pedidos ${account}`,
      training: {
        ...queryTraining(id),
        columns: [
          ...queryTraining(id).columns,
          { table: "orders", name: "secret", meaning: "Não expor", classification: "segredo" },
        ],
      },
    });
    expect(draft.status).toBe(201);
    const skillId = draft.body.skill.id as string;
    const path = `/api/admin/personas/${personaId}/skills/${skillId}`;
    const preview = await post(`${path}/preview`, {});
    expect(preview.status).toBe(200);
    const publish = await post(`${path}/publicar`, {
      confirmationHash: preview.body.confirmationHash,
    });
    expect(publish.status).toBe(201);
    sources.push({
      id,
      skillId,
      publicationId: publish.body.publication.id,
      capabilities: preview.body.package.requiredCapabilities,
    });
  }
  const restricted = await post(`/api/admin/personas/${personaId}/fontes`, {
    name: "Base restrita",
    purpose: "Empresa 1",
    environment: "test",
    agentId,
    database: "base-a",
    dialect: "postgres",
    email: "a@fixture.test",
    password: "source-password",
    clientToken: "a",
    rowRestrictions: [
      { table: "orders", column: "company", parameter: "__scope_company", value: 1 },
    ],
  });
  expect(restricted.status).toBe(201);
  const id = restricted.body.fonte.id as string;
  const training = {
    ...queryTraining(id),
    sqlModel:
      "SELECT p.id, p.amount FROM orders p WHERE p.company = :__scope_company AND p.id > :minimum ORDER BY p.id",
    columns: [
      ...queryTraining(id).columns,
      { table: "orders", name: "company", meaning: "Empresa", classification: "livre" },
    ],
  };
  const draft = await post(`/api/admin/personas/${personaId}/skills`, {
    slug: "orders-scoped",
    kind: "consulta",
    name: "Pedidos restritos",
    training,
  });
  expect(draft.status).toBe(201);
  const skillId = draft.body.skill.id as string;
  const path = `/api/admin/personas/${personaId}/skills/${skillId}`;
  const preview = await post(`${path}/preview`, {});
  expect(preview.status).toBe(200);
  const published = await post(`${path}/publicar`, {
    confirmationHash: preview.body.confirmationHash,
  });
  expect(published.status).toBe(201);
  sources.push({
    id,
    skillId,
    publicationId: published.body.publication.id,
    capabilities: preview.body.package.requiredCapabilities,
  });
  bearer = (await issue()).bearer;
  const created = await post(`/api/admin/personas/${personaId}/skills`, {
    slug: "cross-orders",
    kind: "cruzamento",
    name: "Comparar pedidos",
    training: federationTraining(sources),
  });
  expect(created.status).toBe(201);
  const crossId = created.body.skill.id as string;
  const crossPath = `/api/admin/personas/${personaId}/skills/${crossId}`;
  expect((await post(`${crossPath}/preview`, {})).body.error.code).toBe("INCOMPLETE_INPUT");
  expect(
    (await post(`${crossPath}/casos`, { required: true, content: federationCase(sources) })).status,
  ).toBe(201);
  expect((await post(`${crossPath}/preview`, {})).body.error.code).toBe("INCOMPLETE_INPUT");
  const config = testConfig({ DATABASE_URL: url.toString() });
  const crypto = new NodeCryptoAdapter(
    config.MCP_ENCRYPTION_KEY,
    config.MCP_ENCRYPTION_KEY_ID,
    config.MCP_ENCRYPTION_PREVIOUS_KEYS,
    config.MCP_ENCRYPTION_LEGACY_KEY,
  );
  const report = await new PostgresPersonaRepository(db).transaction(
    { personaIds: [personaId], tokenIds: [] },
    (tx) => runFederationCases(tx, personaId, crossId, crypto),
  );
  expect(report.approved).toBe(true);
  const crossPreview = await post(`${crossPath}/preview`, {});
  expect(crossPreview.status).toBe(200);
  const publishedCross = await post(`${crossPath}/publicar`, {
    confirmationHash: crossPreview.body.confirmationHash,
  });
  expect(publishedCross.status).toBe(201);
  cross = {
    skillId: crossId,
    publicationId: publishedCross.body.publication.id,
    capabilities: crossPreview.body.package.requiredCapabilities,
    bearer: "",
  };
  cross.bearer = await issueCross();
});

it("editor de cruzamento usa casos CAS, relatórios atuais e isolamento sem aprovar pelo HTTP", async () => {
  const created = await post(`/api/admin/personas/${personaId}/skills`, {
    slug: "cross-editor",
    kind: "cruzamento",
    name: "Editor de cruzamento",
    training: federationTraining(sources),
  });
  expect(created.status).toBe(201);
  const id = created.body.skill.id as string;
  const path = `/api/admin/personas/${personaId}/skills/${id}`;
  const get = (path: string) =>
    request(runtime.app)
      .get(path)
      .set("Host", "127.0.0.1:3333")
      .set("Origin", "http://127.0.0.1:3333")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf);
  expect((await get(`${path}/testes-cruzamento?after=invalid`)).status).toBe(400);
  const content = federationCase(sources);
  expect(
    (
      await post(`${path}/casos-cruzamento`, {
        expectedRevision: 1,
        required: true,
        content: { ...content, input: {} },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await post(`${path}/casos-cruzamento`, {
        expectedRevision: 1,
        required: true,
        approved: true,
        content,
      })
    ).status,
  ).toBe(400);
  expect(
    (await post(`${path}/casos-cruzamento`, { expectedRevision: 1, required: true, content }))
      .status,
  ).toBe(200);
  const before = await get(`${path}/testes-cruzamento`);
  expect(before.body).toMatchObject({ revision: 2, requiredApproved: false, reports: [] });
  expect((await post(`${path}/preview`, {})).status).toBe(409);
  const crypto = new NodeCryptoAdapter(testConfig().MCP_ENCRYPTION_KEY);
  const repository = new PostgresPersonaRepository(db);
  const report = await repository.transaction({ personaIds: [personaId], tokenIds: [] }, (tx) =>
    runFederationCases(tx, personaId, id, crypto),
  );
  expect(report.approved).toBe(true);
  const tested = await get(`${path}/testes-cruzamento`);
  expect(tested.body.requiredApproved).toBe(true);
  expect(tested.body.reports[0]).toMatchObject({ current: true, approved: true, revision: 2 });
  expect(tested.body.reports[0]).not.toHaveProperty("evidence");
  const preview = await post(`${path}/preview`, {});
  expect(preview.status).toBe(200);
  expect(
    (await post(`${path}/publicar`, { confirmationHash: preview.body.confirmationHash })).status,
  ).toBe(201);
  const caseId = before.body.cases[0].id as string;
  const change = {
    id: caseId,
    expectedRevision: 2,
    required: true,
    content: { ...content, name: "Revisado" },
  };
  const concurrent = await Promise.all([
    post(`${path}/casos-cruzamento`, change),
    post(`${path}/casos-cruzamento`, change),
  ]);
  expect(concurrent.map((r) => r.status).sort()).toEqual([200, 409]);
  const changed = await get(`${path}/testes-cruzamento`);
  expect(changed.body).toMatchObject({ revision: 3, requiredApproved: false });
  expect(changed.body.reports[0].current).toBe(false);
  expect((await get(`${path}/publicacao`)).body.publication.revision).toBe(2);
  expect(
    (await post(`${path}/publicar`, { confirmationHash: preview.body.confirmationHash })).status,
  ).toBe(409);
  expect(
    (await get(`/api/admin/personas/${randomUUID()}/skills/${id}/testes-cruzamento`)).status,
  ).toBe(403);
  expect((await get(`${path}/testes-operacao`)).status).toBe(409);
  // Generic transport case is preserved exactly, never converted to synthetic rows.
  const native = {
    name: "Transporte privado",
    input: {
      plan: content.input.plan,
      sources: sources
        .slice(0, 2)
        .map((s) => ({ sourceId: s.id, fixtures: [{ table: "orders", generated: [], rows: [] }] })),
    },
    expected: { columns: [{ name: "id", type: "integer" }], rows: [], ordered: true, totalRows: 0 },
  };
  expect(
    (
      await post(`${path}/casos-cruzamento`, {
        expectedRevision: 3,
        required: true,
        content: native,
      })
    ).status,
  ).toBe(200);
  const nativeDetails = await get(`${path}/testes-cruzamento`);
  expect(
    (nativeDetails.body.cases as { content: { name: string } }[]).find(
      (c: { content: { name: string } }) => c.content.name === native.name,
    )!.content,
  ).toEqual(native);
  expect(
    (await post(`${path}/casos-cruzamento`, { ...change, expectedRevision: 4, remove: true }))
      .status,
  ).toBe(200);
  await repository.transaction({ personaIds: [personaId], tokenIds: [] }, async (tx) => {
    for (let i = 0; i < 21; i++) {
      await tx.catalog.saveReport(
        personaId,
        id,
        5,
        report.packageHash,
        before.body.casesHash as string,
        false,
        [],
      );
    }
  });
  const first = await get(`${path}/testes-cruzamento`);
  const second = await get(`${path}/testes-cruzamento?after=${String(first.body.nextCursor)}`);
  expect(first.body.reports).toHaveLength(20);
  expect(second.body.reports).toHaveLength(2);
  expect(
    new Set([...first.body.reports, ...second.body.reports].map((r: { id: string }) => r.id)).size,
  ).toBe(22);
  expect(
    (
      await get(
        `/api/admin/personas/${personaId}/skills/${cross.skillId}/testes-cruzamento?after=${String(first.body.nextCursor)}`,
      )
    ).body.reports,
  ).toEqual([]);
});

describe("anexos binários v2 com bytea real e autoridade sintética", () => {
  let skill: (typeof sources)[number], token: { bearer: string; tokenId: string };
  const create = (args: object = {}, bearer = token.bearer) =>
    tool(
      { format: "binary", query: { skillIds: [skill.skillId], params: { minimum: 1 }, ...args } },
      bearer,
      "criar_anexo_consulta",
    );
  const download = (handle: string, bearer = token.bearer) =>
    request(runtime.app)
      .get(`/api/consumer/bearer/attachments/${handle}`)
      .set("Host", "127.0.0.1:3333")
      .set("Authorization", `Bearer ${bearer}`);
  beforeAll(async () => {
    const training = binaryTraining(sources[0]!.id);
    const draft = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: "document-binary",
      kind: "consulta",
      name: "Documento binário",
      training: {
        ...training,
        sqlModel: training.sqlModel.replace("orders", "documents"),
        tables: [{ name: "documents", meaning: "Documento sintético por ID", grain: ["id"] }],
        columns: training.columns
          .filter((c) => c.name !== "amount")
          .map((c) => ({ ...c, table: "documents" })),
        binaryAttachments: { ...training.binaryAttachments, table: "documents" },
      },
    });
    expect(draft.status).toBe(201);
    const path = `/api/admin/personas/${personaId}/skills/${draft.body.skill.id}`,
      preview = await post(`${path}/preview`, {});
    expect(preview.status).toBe(200);
    const published = await post(`${path}/publicar`, {
      confirmationHash: preview.body.confirmationHash,
    });
    expect(published.status).toBe(201);
    skill = {
      ...sources[0]!,
      skillId: draft.body.skill.id,
      publicationId: published.body.publication.id,
      capabilities: preview.body.package.requiredCapabilities,
    };
    token = await issue([skill]);
  });
  it("HTTP/MCP/resource preservam bytes, tipo e origem sem nova consulta", async () => {
    const created = await create();
    expect(created.isError).not.toBe(true);
    const file = created.value,
      before = execute.mock.calls.length;
    expect(file).toMatchObject({
      format: "binary",
      mimeType: "application/pdf",
      rows: 1,
      complete: true,
      classifications: ["pessoal"],
      provenance: { publications: [{ id: skill.publicationId }], sourceId: skill.id },
    });
    const reply = await download(file.handle);
    expect(reply.status).toBe(200);
    expect(reply.headers["content-type"]).toBe("application/pdf");
    expect(reply.headers["content-disposition"]).toMatch(
      /^attachment; filename="consulta-[a-f0-9-]+\.pdf"$/,
    );
    expect(reply.headers["content-security-policy"]).toContain("sandbox");
    expect(Buffer.from(reply.body)).toEqual(Buffer.from("%PDF-1.4\n% First fixture\n%%EOF\n"));
    const resource = await request(runtime.app)
      .post("/mcp")
      .set("Host", "127.0.0.1:3333")
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${token.bearer}`)
      .send({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: file.uri } });
    const contents = (
      parseMcpPayload(resource).result as { contents: { mimeType: string; blob: string }[] }
    ).contents;
    expect(contents[0]!.mimeType).toBe("application/pdf");
    expect(Buffer.from(contents[0]!.blob, "base64")).toEqual(reply.body);
    expect((await tool({ handle: file.handle }, token.bearer, "obter_anexo")).isError).not.toBe(
      true,
    );
    expect(execute.mock.calls.length).toBe(before);
  });
  it("outro token e concessão sem contrato binário não acessam o arquivo", async () => {
    const file = (await create()).value,
      other = await issue([skill]);
    expect((await download(file.handle, other.bearer)).status).toBe(404);
    const limited = await issue([
      {
        ...skill,
        capabilities: skill.capabilities.filter(
          (c) => !c.startsWith("binary-attachment-contract:"),
        ),
      },
    ]);
    const before = execute.mock.calls.length;
    expect((await create({}, limited.bearer)).isError).toBe(true);
    expect(execute.mock.calls.length).toBe(before);
    expect((await download(file.handle)).status).toBe(200);
  });
  it("SELECT comum não expõe base64; vazio, duplicado e página não geram handles", async () => {
    const response = await tool(
      { skillIds: [skill.skillId], params: { minimum: 1 } },
      token.bearer,
    );
    expect(response.isError).toBe(true);
    expect(response.value).not.toHaveProperty("rows");
    expect((await create({ params: { minimum: 100 } })).isError).toBe(true);
    expect(
      (
        await create({
          sql: "SELECT p.document AS attachment FROM documents p WHERE p.id > :minimum",
          params: { minimum: 0 },
        })
      ).isError,
    ).toBe(true);
    const before = execute.mock.calls.length;
    expect((await create({ options: { page: 1, pageSize: 1 } })).isError).toBe(true);
    expect(execute.mock.calls.length).toBe(before);
  });
  it("revogação e revisão física impedem entrega sem repetir SELECT", async () => {
    const local = await issue([skill]),
      file = (await create({}, local.bearer)).value;
    const before = execute.mock.calls.length;
    await post(`/api/admin/personas/${personaId}/tokens/${local.tokenId}/revogar`, {});
    expect((await download(file.handle, local.bearer)).status).toBe(401);
    const another = (await create()).value;
    await db.query(
      "UPDATE fonte_fisica SET cache_revision=cache_revision+1 WHERE id=(SELECT fonte_fisica_id FROM fonte WHERE id=$1)",
      [skill.id],
    );
    expect((await download(another.handle)).status).toBe(403);
    expect(execute.mock.calls.length).toBe(before + 1);
    expect(
      (
        await db.query("SELECT evento,attachment_id FROM audit_v2 WHERE attachment_id=$1", [
          another.id,
        ])
      ).rows,
    ).toHaveLength(1);
  });
});

describe("anexos JSON v2 com controle PostgreSQL e autoridade sintética", () => {
  let skill: (typeof sources)[number], token: { bearer: string; tokenId: string };
  const create = (bearer = token.bearer) =>
    tool(
      {
        format: "json",
        query: { fonteId: skill.id, skillIds: [skill.skillId], params: { minimum: 0 } },
      },
      bearer,
      "criar_anexo_consulta",
    );
  const download = (handle: string, bearer = token.bearer) =>
    request(runtime.app)
      .get(`/api/consumer/bearer/attachments/${handle}`)
      .set("Host", "127.0.0.1:3333")
      .set("Authorization", `Bearer ${bearer}`);
  beforeAll(async () => {
    const draft = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: "orders-json",
      kind: "consulta",
      name: "Pedidos JSON",
      training: attachmentTraining(sources[0]!.id),
    });
    expect(draft.status).toBe(201);
    const path = `/api/admin/personas/${personaId}/skills/${draft.body.skill.id}`;
    const preview = await post(`${path}/preview`, {});
    expect(preview.status).toBe(200);
    const published = await post(`${path}/publicar`, {
      confirmationHash: preview.body.confirmationHash,
    });
    expect(published.status).toBe(201);
    skill = {
      ...sources[0]!,
      skillId: draft.body.skill.id,
      publicationId: published.body.publication.id,
      capabilities: preview.body.package.requiredCapabilities,
    };
    token = await issue([skill]);
  });
  it("cria anexo de SELECT real e entrega HTTP/MCP/resource sem repetir SQL", async () => {
    const before = execute.mock.calls.length;
    const created = await create();
    expect(created.isError).not.toBe(true);
    const file = created.value;
    expect(file.handle).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const reply = await download(file.handle);
    expect(reply.status).toBe(200);
    expect(reply.headers["cache-control"]).toBe("no-store, private");
    expect(reply.headers["content-disposition"]).toBe(`attachment; filename="${file.filename}"`);
    expect(reply.headers["x-content-type-options"]).toBe("nosniff");
    expect(reply.body.rows).toEqual([
      { id: 1, amount: "10.25" },
      { id: 2, amount: "20.50" },
    ]);
    expect(JSON.stringify(reply.body)).not.toMatch(/SELECT|minimum|source-password|private-a|jwt-/);
    const mcp = await tool({ handle: file.handle }, token.bearer, "obter_anexo");
    expect(mcp.isError).not.toBe(true);
    expect(mcp.value.readAt).toBe(file.readAt);
    const resource = await request(runtime.app)
      .post("/mcp")
      .set("Host", "127.0.0.1:3333")
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${token.bearer}`)
      .send({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: file.uri } });
    const contents = (parseMcpPayload(resource).result as { contents: { blob: string }[] })
      .contents;
    expect(JSON.parse(Buffer.from(contents[0]!.blob, "base64").toString()).rows).toEqual(
      reply.body.rows,
    );
    expect(execute.mock.calls.length - before).toBe(1);
    const audit = await db.query(
      "SELECT * FROM audit_v2 WHERE attachment_id=$1 ORDER BY created_at,id",
      [file.id],
    );
    expect(audit.rows.map((row) => row.evento)).toContain("attachment.created");
    expect(audit.rows.filter((row) => row.evento === "attachment.downloaded")).toHaveLength(3);
    expect(JSON.stringify(audit.rows)).not.toMatch(
      new RegExp(`${file.handle}|SELECT|minimum|10\\.25|source-password`),
    );
  });
  it("outro token, cookie Client e origem externa não autorizam o download", async () => {
    const file = (await create()).value;
    const other = await issue([skill]);
    const before = execute.mock.calls.length;
    expect((await download(file.handle, other.bearer)).status).toBe(404);
    expect((await download("a".repeat(43))).status).toBe(404);
    expect(
      (
        await request(runtime.app)
          .get(file.downloadPath)
          .set("Host", "127.0.0.1:3333")
          .set("Cookie", cookie)
      ).status,
    ).toBe(401);
    expect((await download(file.handle).set("Origin", "https://other.fixture.test")).status).toBe(
      403,
    );
    expect((await download(file.handle).set("Range", "bytes=0-1")).status).toBe(416);
    expect((await download(file.handle)).status).toBe(200);
    expect(execute.mock.calls.length).toBe(before);
  });
  it("concessão antiga sem capability atômica não habilita exportação", async () => {
    const limited = await issue([
      {
        ...skill,
        capabilities: skill.capabilities.filter((c) => !c.startsWith("attachment-contract:")),
      },
    ]);
    const before = execute.mock.calls.length;
    expect((await create(limited.bearer)).isError).toBe(true);
    expect(execute.mock.calls.length).toBe(before);
  });
  it("revogação em trânsito descarta bytes e não repete SQL", async () => {
    const local = await issue([skill]);
    const file = (await create(local.bearer)).value;
    const before = execute.mock.calls.length;
    const getPolicy = vi
      .spyOn(hub, "getClientTokenPolicy")
      .mockImplementation(async ({ clientToken }) => {
        await db.query(
          "UPDATE persona_token SET revoked_at=now(),authorization_version=authorization_version+1 WHERE id=$1",
          [local.tokenId],
        );
        return policy(clientToken);
      });
    try {
      const reply = await download(file.handle, local.bearer);
      expect([401, 403]).toContain(reply.status);
      expect(reply.body).not.toHaveProperty("rows");
      expect(execute.mock.calls.length).toBe(before);
    } finally {
      getPolicy.mockRestore();
    }
  });
  it("invalidação física em outro vínculo bloqueia anexo existente", async () => {
    const file = (await create()).value;
    await db.query(
      "UPDATE fonte_fisica SET cache_revision=cache_revision+1 WHERE id=(SELECT fonte_fisica_id FROM fonte WHERE id=$1)",
      [skill.id],
    );
    const before = execute.mock.calls.length;
    const reply = await download(file.handle);
    expect(reply.status).toBe(403);
    expect(reply.body).not.toHaveProperty("rows");
    expect((await download(file.handle)).status).toBe(404);
    expect(execute.mock.calls.length).toBe(before);
  });
  it("outra composição recupera anexo sem reconsulta; revogação continua imediata após reinício", async () => {
    const local = await issue([skill]);
    const created = await create(local.bearer);
    expect(created.isError).not.toBe(true);
    const file = created.value,
      before = execute.mock.calls.length;
    const second = await composePersonaV2(testConfig({ DATABASE_URL: url.toString() }), { hub });
    const read = (app: typeof runtime.app) =>
      request(app)
        .get(file.downloadPath)
        .set("Host", "127.0.0.1:3333")
        .set("Authorization", `Bearer ${local.bearer}`);
    try {
      expect((await read(second.app)).status).toBe(200);
      expect((await download(file.handle, local.bearer)).status).toBe(200);
    } finally {
      await second.close();
    }
    const recovered = await composePersonaV2(testConfig({ DATABASE_URL: url.toString() }), { hub });
    try {
      const reply = await read(recovered.app);
      expect(reply.status).toBe(200);
      expect(reply.body.rows).toHaveLength(2);
      expect(reply.body.provenance.readAt).toBe(file.readAt);
      await db.query(
        "UPDATE persona_token SET revoked_at=now(),authorization_version=authorization_version+1 WHERE id=$1",
        [local.tokenId],
      );
      expect((await read(recovered.app)).status).toBe(401);
      expect(execute.mock.calls.length).toBe(before);
    } finally {
      await recovered.close();
    }
  });
  it("operação incerta impede download; reinício não ressuscita handle invalidado nem reconsulta", async () => {
    const source = await post(`/api/admin/personas/${personaId}/fontes`, {
      name: "Base incerta isolada",
      purpose: "Journal sintético",
      environment: "test",
      agentId: randomUUID(),
      dialect: "postgres",
      email: "c@fixture.test",
      password: "source-password",
      clientToken: "c",
    });
    expect(source.status).toBe(201);
    const draft = await post(`/api/admin/personas/${personaId}/skills`, {
      slug: "orders-json-unknown",
      kind: "consulta",
      name: "Pedidos incertos",
      training: attachmentTraining(source.body.fonte.id),
    });
    const path = `/api/admin/personas/${personaId}/skills/${draft.body.skill.id}`;
    const preview = await post(`${path}/preview`, {});
    expect(preview.status).toBe(200);
    const published = await post(`${path}/publicar`, {
      confirmationHash: preview.body.confirmationHash,
    });
    expect(published.status).toBe(201);
    const local = await issue([
      {
        id: source.body.fonte.id,
        skillId: draft.body.skill.id,
        publicationId: published.body.publication.id,
        capabilities: preview.body.package.requiredCapabilities,
      },
    ]);
    const createLocal = () =>
      tool(
        { format: "json", query: { skillIds: [draft.body.skill.id], params: { minimum: 0 } } },
        local.bearer,
        "criar_anexo_consulta",
      );
    const created = await createLocal();
    expect(created.isError).not.toBe(true);
    const file = created.value,
      operation = randomUUID();
    const before = execute.mock.calls.length;
    await db.query(
      "INSERT INTO operacao_v2(id,persona_id,token_id,publicacao_id,fonte_id,fingerprint,authorization_snapshot,estado,exige_aprovacao,expires_at) VALUES($1,$2,$3,$4,$5,$6,'{}','resultado_desconhecido',false,now())",
      [
        operation,
        personaId,
        local.tokenId,
        published.body.publication.id,
        source.body.fonte.id,
        "a".repeat(64),
      ],
    );
    const reply = await download(file.handle, local.bearer);
    expect(reply.status).toBe(403);
    expect(reply.body).not.toHaveProperty("rows");
    expect((await createLocal()).isError).toBe(true);
    // The synthetic unknown journal stays immutable until this entire private DB is dropped.
    const restarted = await composePersonaV2(testConfig({ DATABASE_URL: url.toString() }), { hub });
    try {
      const reply = await request(restarted.app)
        .get(file.downloadPath)
        .set("Host", "127.0.0.1:3333")
        .set("Authorization", `Bearer ${local.bearer}`);
      expect(reply.status).toBe(404);
      expect(execute.mock.calls.length).toBe(before);
    } finally {
      await restarted.close();
    }
  });
  it("falha transacional da auditoria não emite handle ou evento parcial", async () => {
    const before = (
      await db.query(
        "SELECT count(*)::int AS count FROM audit_v2 WHERE evento='attachment.created' AND token_id=$1",
        [token.tokenId],
      )
    ).rows[0]!.count;
    await db.query(`CREATE FUNCTION reject_fixture_attachment_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.evento='attachment.created' THEN RAISE EXCEPTION 'fixture audit unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_fixture_attachment BEFORE INSERT ON audit_v2 FOR EACH ROW EXECUTE FUNCTION reject_fixture_attachment_audit();`);
    try {
      const reply = await create();
      expect(reply.isError).toBe(true);
      expect(reply.value).not.toHaveProperty("handle");
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM audit_v2 WHERE evento='attachment.created' AND token_id=$1",
            [token.tokenId],
          )
        ).rows[0]!.count,
      ).toBe(before);
    } finally {
      await db.query(
        "DROP TRIGGER reject_fixture_attachment ON audit_v2; DROP FUNCTION reject_fixture_attachment_audit()",
      );
    }
    expect((await create()).isError).not.toBe(true);
  });
  it("OAuth recupera a mesma concessão sem renovar prazo; outra conexão/manual e revogação recusam", async () => {
    const origin = "https://attachment.fixture.test",
      clientId = "https://client.fixture.test/client.json",
      redirectUri = "https://client.fixture.test/callback",
      clients = { [clientId]: [redirectUri] };
    const config = testConfig({
      DATABASE_URL: url.toString(),
      PUBLIC_BASE_URL: origin,
      PERSONA_V2_OAUTH_ENABLED: true,
      PERSONA_V2_OAUTH_CLIENTS: clients,
    });
    const client = { validate: async () => undefined },
      crypto = new NodeCryptoAdapter(config.MCP_ENCRYPTION_KEY);
    const oauthRuntime = await composePersonaV2(config, { hub, oauthClient: client });
    const oauth = new PersonaOAuth(
      new PostgresPersonaOAuthStore(db, crypto),
      new PostgresPersonaRepository(db),
      crypto,
      client,
      { issuer: origin, resource: `${origin}/mcp/chatgpt`, clients },
      (value) => createHash("sha256").update(value).digest("base64url"),
    );
    const grant = async () => {
      const verifier = "v".repeat(43);
      const begin = await oauth.begin({
        client_id: clientId,
        redirect_uri: redirectUri,
        resource: `${origin}/mcp/chatgpt`,
        scope: "se7e:persona",
        response_type: "code",
        code_challenge_method: "S256",
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      });
      const review = await oauth.authenticate(begin.id, begin.nonce, begin.csrf, token.bearer);
      const location = await oauth.consent(begin.id, begin.nonce, review.csrf, {
        sources: [skill.id],
        skills: [skill.skillId],
        external: [],
      });
      return oauth.token({
        grant_type: "authorization_code",
        code: new URL(location).searchParams.get("code")!,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        client_id: clientId,
        resource: `${origin}/mcp/chatgpt`,
      });
    };
    let recoveredRuntime: typeof oauthRuntime | undefined;
    try {
      const a = await grant(),
        b = await grant();
      const created = await request(oauthRuntime.app)
        .post("/mcp/chatgpt")
        .set("Host", "attachment.fixture.test")
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", `Bearer ${a.access_token}`)
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "criar_anexo_consulta",
            arguments: {
              format: "json",
              query: { skillIds: [skill.skillId], params: { minimum: 0 } },
            },
          },
        });
      const result = parseMcpPayload(created).result as {
        isError?: boolean;
        content: { text: string }[];
      };
      expect(result.isError).not.toBe(true);
      const file = JSON.parse(result.content[0]!.text);
      const get = (bearer: string, app = oauthRuntime.app) =>
        request(app)
          .get(file.downloadPath)
          .set("Host", "attachment.fixture.test")
          .set("Authorization", `Bearer ${bearer}`);
      expect((await get(a.access_token)).status).toBe(200);
      expect((await get(b.access_token)).status).toBe(404);
      expect((await get(token.bearer)).status).toBe(401);
      const before = execute.mock.calls.length;
      await oauthRuntime.close();
      recoveredRuntime = await composePersonaV2(config, { hub, oauthClient: client });
      expect((await get(a.access_token, recoveredRuntime.app)).status).toBe(200);
      const refreshed = await oauth.token({
        grant_type: "refresh_token",
        refresh_token: a.refresh_token,
        client_id: clientId,
        resource: `${origin}/mcp/chatgpt`,
      });
      expect((await get(refreshed.access_token, recoveredRuntime.app)).status).toBe(200);
      expect((await get(b.access_token, recoveredRuntime.app)).status).toBe(404);
      const stored = await db.query<{ expires_at: Date }>(
        "SELECT expires_at FROM persona_attachment_v2 WHERE handle_hash=$1",
        [crypto.sha256Hex(file.handle)],
      );
      expect(stored.rows[0]!.expires_at.toISOString()).toBe(file.expiresAt);
      await oauth.revoke(await oauth.resolve(refreshed.access_token));
      expect((await get(refreshed.access_token, recoveredRuntime.app)).status).toBe(401);
      expect(execute.mock.calls.length).toBe(before);
      expect((await oauth.resolve(b.access_token)).personaId).toBe(personaId);
    } finally {
      if (recoveredRuntime) await recoveredRuntime.close();
      else await oauthRuntime.close();
    }
  });
});

it("cache privado v2 coalesce SELECT real, preserva origem e revalida token após hit", async () => {
  const cached = await composePersonaV2(
    testConfig({
      DATABASE_URL: url.toString(),
      PERSONA_V2_QUERY_CACHE_TTL_MS: 30000,
      PERSONA_V2_REDIS_URL: process.env.PERSONA_V2_TEST_REDIS_URL ?? "",
    }),
    { hub },
  );
  const token = await issue([sources[0]!]);
  const input = {
    fonteId: sources[0]!.id,
    skillIds: [sources[0]!.skillId],
    params: { minimum: 0 },
  };
  const before = execute.mock.calls.length;
  const policyFn = vi.mocked(hub.getClientTokenPolicy).getMockImplementation()!;
  const actualExecute = execute.getMockImplementation()!;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reuseCalls = vi.spyOn(PersonaQueryReuse.prototype, "run");
  execute.mockImplementationOnce(async (input) => {
    await waiting;
    return actualExecute(input);
  });
  try {
    const pending = Promise.all(
      Array.from({ length: 5 }, () => tool(input, token.bearer, "consultar_dados", cached)),
    );
    await vi.waitFor(() => expect(reuseCalls.mock.calls).toHaveLength(5), { timeout: 5000 });
    release();
    const results = await pending;
    expect(results.every((r) => !r.isError)).toBe(true);
    expect(execute.mock.calls.length - before).toBe(1);
    expect(results.filter((r) => r.value.reuse.kind === "singleflight").length).toBeGreaterThan(0);
    const hit = await tool(input, token.bearer, "consultar_dados", cached);
    expect(hit.value.reuse.kind).toBe("cache");
    expect(hit.value.provenance.readAt).toBe(results[0]!.value.provenance.readAt);
    let checks = 0;
    vi.mocked(hub.getClientTokenPolicy).mockImplementation(async (args) => {
      const p = await policyFn(args);
      if (++checks === 2)
        await db.query(
          "UPDATE persona_token SET revoked_at=now(),authorization_version=authorization_version+1 WHERE id=$1",
          [token.tokenId],
        );
      return p;
    });
    const refused = await tool(input, token.bearer, "consultar_dados", cached);
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.value)).not.toContain("10.25");
    expect(execute.mock.calls.length - before).toBe(1);
    const audit = await db.query(
      "SELECT query_reuse_kind FROM audit_v2 WHERE token_id=$1 AND evento='query.completed'",
      [token.tokenId],
    );
    expect(audit.rows.some((r) => r.query_reuse_kind === "cache")).toBe(true);
    expect(audit.rows).toHaveLength(6);
  } finally {
    release();
    reuseCalls.mockRestore();
    execute.mockImplementation(actualExecute);
    vi.mocked(hub.getClientTokenPolicy).mockImplementation(policyFn);
    await cached.close();
  }
});

it("revisão física invalida cache em duas personas sem compartilhar resultados e unknown desativa reuso", async () => {
  const config = testConfig({
    DATABASE_URL: url.toString(),
    PERSONA_V2_QUERY_CACHE_TTL_MS: 30000,
    PERSONA_V2_REDIS_URL: process.env.PERSONA_V2_TEST_REDIS_URL ?? "",
  });
  const cached = await composePersonaV2(config, { hub });
  const replica = await composePersonaV2(config, { hub });
  const selected = sources[0]!;
  const tokenA = await issue([selected]);
  const other = (
    await post("/api/admin/personas", {
      name: "Outra persona cache",
      specialty: "Fixture",
      instructions: "",
    })
  ).body.persona.id as string;
  const agent = (await db.query("SELECT agent_id FROM fonte WHERE id=$1", [selected.id])).rows[0]
    .agent_id as string;
  const otherSource = (
    await post(`/api/admin/personas/${other}/fontes`, {
      name: "Mesmo banco, vínculo independente",
      purpose: "Fixture privada",
      environment: "test",
      agentId: agent,
      dialect: "postgres",
      email: "a@fixture.test",
      password: "source-password",
      clientToken: "a",
    })
  ).body.fonte.id as string;
  const draft = (
    await post(`/api/admin/personas/${other}/skills`, {
      slug: "cache-orders",
      kind: "consulta",
      name: "Fixture",
      training: queryTraining(otherSource),
    })
  ).body.skill;
  const preview = await post(`/api/admin/personas/${other}/skills/${draft.id}/preview`, {});
  const published = await post(`/api/admin/personas/${other}/skills/${draft.id}/publicar`, {
    confirmationHash: preview.body.confirmationHash,
  });
  expect(published.status).toBe(201);
  const tokenB = (
    await post(`/api/admin/personas/${other}/tokens`, {
      name: "Consumer B",
      expiresAt: null,
      delegation: empty,
      permissions: {
        ...empty,
        sourceIds: [otherSource],
        skills: [
          {
            skillId: draft.id,
            capabilities: preview.body.package.requiredCapabilities,
            effects: ["select"],
            requireHumanApproval: false,
          },
        ],
      },
    })
  ).body as { bearer: string; tokenId: string };
  const inputA = { fonteId: selected.id, skillIds: [selected.skillId], params: { minimum: 0 } };
  const inputB = { fonteId: otherSource, skillIds: [draft.id], params: { minimum: 0 } };
  try {
    const before = execute.mock.calls.length;
    expect((await tool(inputA, tokenA.bearer, "consultar_dados", cached)).value.reuse.kind).toBe(
      "fresh",
    );
    expect((await tool(inputB, tokenB.bearer, "consultar_dados", replica)).value.reuse.kind).toBe(
      "fresh",
    );
    expect(execute.mock.calls.length - before).toBe(2);
    expect((await tool(inputA, tokenA.bearer, "consultar_dados", cached)).value.reuse.kind).toBe(
      "cache",
    );
    if (config.PERSONA_V2_REDIS_URL) {
      expect((await tool(inputA, tokenA.bearer, "consultar_dados", replica)).value.reuse.kind).toBe(
        "cache",
      );
      expect(execute.mock.calls.length - before).toBe(2);
    }
    const crypto = new NodeCryptoAdapter(testConfig().MCP_ENCRYPTION_KEY);
    const store = new PostgresSqlOperationStore(db, crypto, () => new Date());
    await store.transaction(
      { personaId, tokenId: tokenA.tokenId, tokenVersion: 1, personaVersion: 1 },
      (tx) => tx.invalidatePhysicalSource(personaId, selected.id),
    );
    expect((await tool(inputA, tokenA.bearer, "consultar_dados", cached)).value.reuse.kind).toBe(
      "fresh",
    );
    expect((await tool(inputB, tokenB.bearer, "consultar_dados", replica)).value.reuse.kind).toBe(
      "fresh",
    );
    expect(execute.mock.calls.length - before).toBe(4);
    // Synthetic journal metadata only: no SQL operation or business effect is dispatched.
    await db.query(
      "INSERT INTO operacao_v2(id,persona_id,token_id,publicacao_id,fonte_id,fingerprint,authorization_snapshot,estado,exige_aprovacao,expires_at) VALUES($1,$2,$3,$4,$5,$6,'{}','resultado_desconhecido',false,now())",
      [
        randomUUID(),
        other,
        tokenB.tokenId,
        published.body.publication.id,
        otherSource,
        "a".repeat(64),
      ],
    );
    expect(
      (await tool(inputA, tokenA.bearer, "consultar_dados", replica)).value.reuse,
    ).toBeUndefined();
    expect(
      (await tool(inputA, tokenA.bearer, "consultar_dados", cached)).value.reuse,
    ).toBeUndefined();
    expect(execute.mock.calls.length - before).toBe(6);
  } finally {
    await cached.close();
    await replica.close();
  }
});

it("OAuth consulta snapshot publicado, limita fonte e bloqueia entrega após revogação", async () => {
  const origin = "https://oauth-query.fixture.test";
  const clientId = "https://client.fixture.test/client.json";
  const redirectUri = "https://client.fixture.test/callback";
  const clients = { [clientId]: [redirectUri] };
  const config = testConfig({
    DATABASE_URL: url.toString(),
    PUBLIC_BASE_URL: origin,
    PERSONA_V2_OAUTH_ENABLED: true,
    PERSONA_V2_OAUTH_CLIENTS: clients,
  });
  const client = { validate: async () => undefined };
  const oauthRuntime = await composePersonaV2(config, { hub, oauthClient: client });
  const crypto = new NodeCryptoAdapter(config.MCP_ENCRYPTION_KEY);
  const oauth = new PersonaOAuth(
    new PostgresPersonaOAuthStore(db, crypto),
    new PostgresPersonaRepository(db),
    crypto,
    client,
    { issuer: origin, resource: `${origin}/mcp/chatgpt`, clients },
    (value) => createHash("sha256").update(value).digest("base64url"),
  );
  const verifier = "v".repeat(43);
  try {
    const begin = await oauth.begin({
      client_id: clientId,
      redirect_uri: redirectUri,
      resource: `${origin}/mcp/chatgpt`,
      scope: "se7e:persona",
      response_type: "code",
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    });
    const review = await oauth.authenticate(begin.id, begin.nonce, begin.csrf, bearer);
    const location = await oauth.consent(begin.id, begin.nonce, review.csrf, {
      sources: [sources[0]!.id],
      skills: [sources[0]!.skillId],
      external: [],
    });
    const tokens = await oauth.token({
      grant_type: "authorization_code",
      code: new URL(location).searchParams.get("code")!,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: clientId,
      resource: `${origin}/mcp/chatgpt`,
    });
    const call = async (fonteId: string) => {
      const response = await request(oauthRuntime.app)
        .post("/mcp/chatgpt")
        .set("Host", "oauth-query.fixture.test")
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", `Bearer ${tokens.access_token}`)
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "consultar_dados", arguments: { fonteId, params: { minimum: 0 } } },
        });
      expect(response.status).toBe(200);
      return parseMcpPayload(response).result as { isError?: boolean; content: { text: string }[] };
    };
    const allowed = await call(sources[0]!.id);
    expect(allowed.isError).not.toBe(true);
    expect(JSON.parse(allowed.content[0]!.text)).toMatchObject({
      provenance: { sourceId: sources[0]!.id },
    });
    const before = execute.mock.calls.length;
    expect((await call(sources[1]!.id)).isError).toBe(true);
    expect(execute.mock.calls.length).toBe(before);
    const identity = await oauth.resolve(tokens.access_token);
    afterSql = async () => {
      await oauth.revoke(identity);
    };
    const discarded = await call(sources[0]!.id);
    expect(discarded.isError).toBe(true);
    expect(JSON.parse(discarded.content[0]!.text)).not.toHaveProperty("rows");
  } finally {
    afterSql = undefined;
    await oauthRuntime.close();
  }
});

async function issueCross(
  selected = sources.slice(0, 2),
  includeDependencies = true,
  federationLimits?: { rowsPerSource: number },
) {
  const response = await post(`/api/admin/personas/${personaId}/tokens`, {
    name: "Cruzamento",
    delegation: empty,
    expiresAt: null,
    permissions: {
      ...empty,
      federationLimits,
      sourceIds: selected.map((s) => s.id),
      skills: [
        ...(includeDependencies
          ? selected.map((s) => ({
              skillId: s.skillId,
              capabilities: s.capabilities,
              effects: ["select"],
              requireHumanApproval: false,
            }))
          : []),
        {
          skillId: cross.skillId,
          capabilities: cross.capabilities,
          effects: ["select"],
          requireHumanApproval: false,
        },
      ],
    },
  });
  expect(response.status).toBe(201);
  return response.body.bearer as string;
}
afterAll(async () => {
  await runtime?.close();
  await db?.end();
  // This generated database alone contains all synthetic business data and MCP metadata.
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
});

it("executa SELECT real em fontes com tabelas homônimas usando credenciais independentes", async () => {
  for (const [index, amount] of [
    [0, "10.25"],
    [1, "100.75"],
  ] as const) {
    const response = await tool({ fonteId: sources[index]!.id, params: { minimum: 0 } });
    expect(response.isError).not.toBe(true);
    expect(response.value.rows[0]).toEqual({ id: 1, amount });
    expect(response.value.provenance.publications[0].id).toBe(sources[index]!.publicationId);
    expect(response.value.completeness.complete).toBe(true);
    expect(JSON.stringify(response.value)).not.toMatch(/private-|jwt-|source-password|clientToken/);
  }
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({ accessToken: "jwt-a", clientToken: "a" }),
  );
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({ accessToken: "jwt-b", clientToken: "b" }),
  );
});
it("origem ambígua exige fonte; skill de fonte inequívoca permite omissão", async () => {
  const before = execute.mock.calls.length;
  expect((await tool({ params: { minimum: 0 } })).value.error.code).toBe("SOURCE_AMBIGUOUS");
  expect(execute.mock.calls.length).toBe(before);
  const inferred = await tool({ skillIds: [sources[1]!.skillId], params: { minimum: 0 } });
  expect(inferred.value.fonteId).toBe(sources[1]!.id);
});
it("descoberta lexical e resources de fontes respeitam as concessões", async () => {
  const token = (await issue([sources[0]!])).bearer;
  const context = await tool({ pergunta: "pedidos" }, token, "buscar_contexto");
  expect(context.value.method).toBe("lexical");
  expect(context.value.semanticApproval).toBe(false);
  const matches = context.value.matches as { skillId: string }[];
  expect(matches.map((m) => m.skillId)).toEqual([sources[0]!.skillId]);
  expect(JSON.stringify(context.value)).not.toMatch(/sqlModel|private-|source-password/);
  for (const [id, allowed] of [
    [sources[0]!.id, true],
    [sources[1]!.id, false],
  ] as const) {
    const response = await request(runtime.app)
      .post("/mcp")
      .set("Host", "127.0.0.1:3333")
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "resources/read",
        params: { uri: `fonte://${personaId}/${id}` },
      });
    const payload = parseMcpPayload(response);
    expect(JSON.stringify(payload).includes("Base a")).toBe(allowed);
    expect(JSON.stringify(payload)).not.toMatch(/credentialId|clientToken|source-password|base-a/);
  }
});
it("grafo de cruzamento mantém publicações dependentes distintas e exige todas as concessões", async () => {
  const graph = await tool({ skillId: cross.skillId }, cross.bearer, "obter_grafo_conhecimento");
  expect(graph.isError).not.toBe(true);
  const nodes = graph.value.nodes as { id: string; sourceId: string }[];
  expect(new Set(nodes.map((n) => n.sourceId))).toEqual(
    new Set(sources.slice(0, 2).map((s) => s.id)),
  );
  expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
  expect(graph.value.edges).toEqual([]);
  const limited = (await issue([sources[0]!])).bearer;
  expect(
    (await tool({ skillId: cross.skillId }, limited, "obter_grafo_conhecimento")).isError,
  ).toBe(true);
});
it("publica contexto de negócio e consulta schema exato sem acessar tabela homônima de outro schema", async () => {
  const source = sources[0]!;
  const training = queryTraining(source.id);
  const created = await post(`/api/admin/personas/${personaId}/skills`, {
    slug: "schema-orders",
    name: "Pedidos qualificados",
    kind: "consulta",
    training: {
      ...training,
      sqlModel: training.sqlModel.replace("FROM orders", "FROM fixture_a.orders"),
      tables: training.tables.map((t) => ({ ...t, name: "fixture_a.orders" })),
      columns: training.columns.map((c) => ({ ...c, table: "fixture_a.orders" })),
      relationships: [
        {
          from: "fixture_a.orders",
          to: "fixture_a.orders",
          keys: [{ from: "id", to: "id" }],
          join: "left",
          cardinality: "1:1",
          meaning: "Correspondência pela identidade do pedido na mesma fonte",
        },
      ],
    },
  });
  expect(created.status).toBe(201);
  const skillId = created.body.skill.id as string;
  const path = `/api/admin/personas/${personaId}/skills/${skillId}`;
  const preview = await post(`${path}/preview`, {});
  expect(preview.status).toBe(200);
  const published = await post(`${path}/publicar`, {
    confirmationHash: preview.body.confirmationHash,
  });
  expect(published.status).toBe(201);
  const token = (
    await issue([{ ...source, skillId, capabilities: preview.body.package.requiredCapabilities }])
  ).bearer;
  const context = await tool({ slug: "schema-orders" }, token, "obter_skill");
  expect(context.value.tables[0].meaning).toBe(training.tables[0]!.meaning);
  expect(context.value.relationships[0].meaning).toContain("identidade do pedido");
  const response = await tool(
    { fonteId: source.id, skillIds: [skillId], params: { minimum: 0 } },
    token,
  );
  expect(response.value.rows[0].amount).toBe("10.25");
  expect(
    (
      await tool(
        { fonteId: source.id, skillIds: [skillId], params: { minimum: 0 } },
        token,
        "validar_consulta",
      )
    ).value.valid,
  ).toBe(true);
  const before = execute.mock.calls.length;
  const denied = await tool(
    {
      fonteId: source.id,
      skillIds: [skillId],
      params: { minimum: 0 },
      sql: training.sqlModel.replace("FROM orders", "FROM fixture_b.orders"),
    },
    token,
  );
  expect(denied.isError).toBe(true);
  expect(execute.mock.calls.length).toBe(before);
});
it("capabilities são versionadas e verificar_fonte não executa SQL nem concede autoridade", async () => {
  const before = execute.mock.calls.length;
  const capabilities = await tool({}, bearer, "obter_capacidades");
  expect(capabilities.value).toMatchObject({
    generation: "persona-v2",
    complete: false,
    authentication: "bearer",
    pluginCompatibility: {
      format: "persona-plugin-compatibility-v1",
      runtime: "persona-v2",
      variant: "portable",
      guidanceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      instructionsHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    },
    serverBuild: {
      version: expect.any(String),
      revision: expect.stringMatching(/^(?:[a-f0-9]{40}|unknown)$/),
    },
    oauth: false,
    externalQueries: {
      implemented: true,
      transports: ["rest", "mcp_http"],
      explicitOperationGrantRequired: true,
      realProviderAcceptance: false,
    },
    externalActions: {
      implemented: true,
      preparationRequired: true,
      automaticReplay: false,
      realProviderAcceptance: false,
    },
    federation: { implemented: true, exactPublishedDependencies: true },
    sqlOperations: {
      implemented: true,
      contractVersion: 1,
      automaticReplay: false,
      realEngineAcceptance: false,
    },
    localQuery: { implemented: true, sourceRestrictions: true, realEngineAcceptance: false },
  });
  const result = await tool({ fonteId: sources[0]!.id }, bearer, "verificar_fonte");
  expect(result.value).toMatchObject({
    fonteId: sources[0]!.id,
    gatesVerified: true,
    sqlExecuted: false,
  });
  const restricted = await issue([sources[0]!]);
  expect(
    (await tool({ fonteId: sources[1]!.id }, restricted.bearer, "verificar_fonte")).isError,
  ).toBe(true);
  expect(execute.mock.calls.length).toBe(before);
});
it("consulta adaptada agrega no banco e mantém decimal exato", async () => {
  const result = await tool({
    fonteId: sources[0]!.id,
    sql: "SELECT SUM(p.amount) AS total FROM orders p WHERE p.id > :minimum",
    params: { minimum: "0" },
  });
  expect(result.value.rows).toEqual([{ total: "30.75" }]);
});
it("validação real executa envelope vazio sem devolver dados nem aprovar significado", async () => {
  const result = await tool(
    { fonteId: sources[0]!.id, params: { minimum: 0 } },
    bearer,
    "validar_consulta",
  );
  expect(result.value).toMatchObject({ valid: true, semanticApproval: false });
  expect(result.value).not.toHaveProperty("rows");
  expect(execute.mock.calls.at(-1)![0].sql).toMatch(/WHERE FALSE$/);
});
it("chamada direta à fonte não concedida e união entre fontes recusam antes do SQL", async () => {
  const restricted = await issue([sources[0]!]);
  const before = execute.mock.calls.length;
  expect(
    (await tool({ fonteId: sources[1]!.id, params: { minimum: 0 } }, restricted.bearer)).value.error
      .code,
  ).toBe("AUTHORIZATION_DENIED");
  expect(
    (
      await tool({
        fonteId: sources[0]!.id,
        skillIds: sources.map((s) => s.skillId),
        params: { minimum: 0 },
      })
    ).isError,
  ).toBe(true);
  expect(execute.mock.calls.length).toBe(before);
});
it.each([
  "UPDATE orders SET amount=0 WHERE id=1",
  "SELECT secret FROM orders WHERE id > :minimum",
  "SELECT * FROM orders WHERE id > :minimum",
])("AST inteira recusa escrita e projeção não concedida: %s", async (sql) => {
  const before = execute.mock.calls.length;
  const result = await tool({ fonteId: sources[0]!.id, sql, params: { minimum: 0 } });
  expect(result.isError).toBe(true);
  expect(execute.mock.calls.length).toBe(before);
});
it("paginação informa incompletude e truncamento; não estima total", async () => {
  const result = await tool({
    fonteId: sources[0]!.id,
    params: { minimum: 0 },
    options: { page: 1, pageSize: 1 },
  });
  expect(result.value.rows).toHaveLength(1);
  expect(result.value.completeness.complete).toBe(false);
  expect(result.value.pagination.hasNextPage).toBe(true);
  expect(result.value).not.toHaveProperty("total");
});
it("policy revogada durante leitura impede entrega sem retry", async () => {
  const before = execute.mock.calls.length;
  afterSql = async () => {
    policyRevoked = true;
  };
  try {
    expect(
      (await tool({ fonteId: sources[0]!.id, params: { minimum: 0 } })).value.error,
    ).toMatchObject({ code: "AUTHORIZATION_DENIED", source: "client_token_rpc", retryable: false });
  } finally {
    policyRevoked = false;
    afterSql = undefined;
  }
  expect(execute.mock.calls.length).toBe(before + 1);
});
it("revogação MCP durante leitura impede entrega após execução, com locks reais", async () => {
  const isolated = await issue();
  afterSql = async () => {
    expect(
      (await post(`/api/admin/personas/${personaId}/tokens/${isolated.tokenId}/revogar`, {}))
        .status,
    ).toBe(204);
  };
  try {
    expect(
      (await tool({ fonteId: sources[0]!.id, params: { minimum: 0 } }, isolated.bearer)).isError,
    ).toBe(true);
  } finally {
    afterSql = undefined;
  }
});
it("erro de transporte conserva origem/código sem vazar mensagem upstream ou tentar novamente", async () => {
  const before = execute.mock.calls.length;
  transportFailure = true;
  try {
    const result = await tool({ fonteId: sources[0]!.id, params: { minimum: 0 } });
    expect(result.value.error).toMatchObject({
      source: "plug_server_http",
      code: "PLUG_SERVER_ERROR",
      retryable: false,
    });
    expect(JSON.stringify(result.value)).not.toContain("unsafe upstream payload");
  } finally {
    transportFailure = false;
  }
  expect(execute.mock.calls.length).toBe(before + 1);
});
it("auditoria de consultas registra IDs/contagens e nenhum SQL, pergunta, parâmetro ou resultado", async () => {
  const rows = (
    await db.query("SELECT * FROM audit_v2 WHERE persona_id=$1 AND evento LIKE 'query.%'", [
      personaId,
    ])
  ).rows;
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((r) => r.token_id && r.fonte_id && r.publicacao_id && r.skill_id)).toBe(true);
  expect(JSON.stringify(rows)).not.toMatch(/SELECT|minimum|private-|source-password|jwt-/);
  // An exact result value must never appear; timestamps may legitimately contain 10.25.
  expect(JSON.stringify(rows)).not.toMatch(/"10\.25"|:10\.25(?:,|})/);
});
it("recorte persistido é obrigatório e binding reservado não pode ser sobrescrito pelo consumidor", async () => {
  const result = await tool({ fonteId: sources[2]!.id, params: { minimum: 0 } });
  expect(result.value.rows).toEqual([{ id: 1, amount: "10.25" }]);
  expect(execute.mock.calls.at(-1)![0].params).toEqual({ minimum: 0, __scope_company: 1 });
  const before = execute.mock.calls.length;
  for (const args of [
    { fonteId: sources[2]!.id, params: { minimum: 0, __scope_company: 2 } },
    { fonteId: sources[2]!.id, sql: queryTraining().sqlModel, params: { minimum: 0 } },
    {
      fonteId: sources[2]!.id,
      sql: "SELECT p.id,p.amount FROM orders p WHERE p.company = :__scope_company OR p.id > :minimum",
      params: { minimum: 0 },
    },
  ]) {
    expect((await tool(args)).isError).toBe(true);
  }
  expect(execute.mock.calls.length).toBe(before);
  const context = await tool({ slug: "orders-scoped" }, bearer, "obter_skill");
  expect(context.value.requiredFilters).toEqual([
    { table: "orders", column: "company", parameter: "__scope_company" },
  ]);
});
it("cruzamento publicado usa consultas reais e pagina somente após combinar", async () => {
  const plan = { ...federationPlan(sources, cross.publicationId), page: 2, pageSize: 1 };
  const result = await tool({ plan }, cross.bearer, "executar_cruzamento");
  expect(result.isError).not.toBe(true);
  expect(result.value).toMatchObject({
    rows: [{ id: 2, amount_a: "20.50", amount_b: "200.25" }],
    totalRows: 2,
    complete: true,
    publicationId: cross.publicationId,
  });
  expect(
    (result.value.provenance as { publicationId: string }[]).map((p) => p.publicationId),
  ).toEqual(sources.slice(0, 2).map((s) => s.publicationId));
  const links = await db.query("SELECT * FROM publicacao_dependencia WHERE publicacao_id=$1", [
    cross.publicationId,
  ]);
  expect(links.rows).toHaveLength(2);
  expect(
    (await db.query("SELECT * FROM publicacao_fonte WHERE publicacao_id=$1", [cross.publicationId]))
      .rows,
  ).toHaveLength(2);
});
it("contexto/resources filtram cruzamento e novas skills não ampliam tokens existentes", async () => {
  expect(
    ((await tool({}, bearer, "listar_skills")).value as { kind: string }[]).some(
      (s: { kind: string }) => s.kind === "cruzamento",
    ),
  ).toBe(false);
  expect((await tool({ slug: "cross-orders" }, bearer, "obter_skill")).isError).toBe(true);
  const context = await tool({ slug: "cross-orders" }, cross.bearer, "obter_skill");
  expect(context.value.format).toBe("persona-federation-v2");
  expect(JSON.stringify(context.value)).not.toMatch(/sourceFingerprint|source-password|jwt-/);
  for (const [token, allowed] of [
    [cross.bearer, true],
    [bearer, false],
  ] as const) {
    const response = await request(runtime.app)
      .post("/mcp")
      .set("Host", "127.0.0.1:3333")
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "resources/read",
        params: { uri: `skill://${personaId}/cross-orders` },
      });
    const rpc = parseMcpPayload(response);
    expect(Boolean(rpc.error)).toBe(!allowed);
    if (allowed) expect(JSON.stringify(rpc.result)).toContain("persona-federation-v2");
    else expect(JSON.stringify(rpc)).not.toContain("Comparar valores");
  }
});
it("chamada direta exige concessões do cruzamento, das fontes e das dependências", async () => {
  const plan = federationPlan(sources, cross.publicationId);
  const before = execute.mock.calls.length;
  for (const token of [
    bearer,
    await issueCross([sources[0]!]),
    await issueCross(undefined, false),
  ]) {
    expect((await tool({ plan }, token, "executar_cruzamento")).value.error.code).toBe(
      "AUTHORIZATION_DENIED",
    );
  }
  expect(execute.mock.calls.length).toBe(before);
});
it("SQL local pode adaptar filtros, mas não pode mudar combinação ou projeção treinada", async () => {
  const plan = federationPlan(sources, cross.publicationId);
  const changed = structuredClone(plan);
  const local = changed.steps[0]!;
  if (local.kind === "local") Object.assign(local, { params: { minimum: 1 } });
  expect((await tool({ plan: changed }, cross.bearer, "executar_cruzamento")).value.rows).toEqual([
    { id: 2, amount_a: "20.50", amount_b: "200.25" },
  ]);
  const invalid = structuredClone(plan);
  Object.assign(invalid.steps[2]!, { join: "inner" });
  const before = execute.mock.calls.length;
  expect(
    (await tool({ plan: invalid }, cross.bearer, "executar_cruzamento")).value.error.code,
  ).toBe("INVALID_PLAN");
  expect(execute.mock.calls.length).toBe(before);
  Object.assign(invalid.steps[2]!, { join: "left" });
  Object.assign(invalid.steps[0]!, {
    sql: "SELECT p.id,p.amount AS renamed FROM orders p WHERE p.id > :minimum",
  });
  expect(
    (await tool({ plan: invalid }, cross.bearer, "executar_cruzamento")).value.error.code,
  ).toBe("INVALID_PLAN");
});
it("validação de cruzamento só executa envelopes vazios, sem aprovação semântica", async () => {
  const before = execute.mock.calls.length;
  const result = await tool(
    { plan: federationPlan(sources, cross.publicationId) },
    cross.bearer,
    "validar_cruzamento",
  );
  expect(result.value).toMatchObject({ valid: true, semanticApproval: false });
  expect(result.value).not.toHaveProperty("rows");
  expect(
    execute.mock.calls.slice(before).every(([input]) => input.sql.endsWith("WHERE FALSE")),
  ).toBe(true);
});
it("entrada limitada e limite por fonte impedem entregar cruzamento completo", async () => {
  const plan = federationPlan(sources, cross.publicationId);
  expect(
    (await tool({ plan, budget: { rowsPerSource: 1 } }, cross.bearer, "executar_cruzamento")).value
      .error.code,
  ).toBe("INCOMPLETE_INPUT");
  const limited = structuredClone(plan);
  Object.assign(limited.steps[0]!, {
    sql: "SELECT p.id,p.amount FROM orders p WHERE p.id > :minimum LIMIT 1",
  });
  expect(
    (await tool({ plan: limited }, cross.bearer, "executar_cruzamento")).value.error.code,
  ).toBe("INCOMPLETE_INPUT");
});
it("limites do token não podem ser ampliados pelo consumidor", async () => {
  const restricted = await issueCross(undefined, true, { rowsPerSource: 1 });
  const before = execute.mock.calls.length;
  expect(
    (
      await tool(
        { plan: federationPlan(sources, cross.publicationId), budget: { rowsPerSource: 5000 } },
        restricted,
        "executar_cruzamento",
      )
    ).value.error.code,
  ).toBe("INCOMPLETE_INPUT");
  expect(execute.mock.calls.at(-1)![0].options?.maxRows).toBe(1);
  expect(execute.mock.calls.length).toBe(before + 1);
});
it("revogação de policy da primeira fonte durante segunda leitura impede entrega final", async () => {
  let reads = 0;
  afterSql = async () => {
    if (++reads === 2) revokedAccounts.add("a");
  };
  const before = execute.mock.calls.length;
  try {
    expect(
      (
        await tool(
          { plan: federationPlan(sources, cross.publicationId) },
          cross.bearer,
          "executar_cruzamento",
        )
      ).value.error,
    ).toMatchObject({ code: "AUTHORIZATION_DENIED", source: "client_token_rpc" });
  } finally {
    afterSql = undefined;
    revokedAccounts.clear();
  }
  expect(execute.mock.calls.length).toBe(before + 2);
});
it("suspensão do próprio cruzamento durante leitura impede entrega", async () => {
  const path = `/api/admin/personas/${personaId}/skills/${cross.skillId}`;
  let reads = 0;
  afterSql = async () => {
    if (++reads === 2) expect((await post(`${path}/suspender`, {})).status).toBe(204);
  };
  try {
    expect(
      (
        await tool(
          { plan: federationPlan(sources, cross.publicationId) },
          cross.bearer,
          "executar_cruzamento",
        )
      ).value.error.code,
    ).toBe("AUTHORIZATION_DENIED");
  } finally {
    afterSql = undefined;
  }
  const preview = await post(`${path}/preview`, {});
  const published = await post(`${path}/publicar`, {
    confirmationHash: preview.body.confirmationHash,
  });
  expect(published.status).toBe(201);
  cross.publicationId = published.body.publication.id;
});
it("relatórios obsoletos bloqueiam republicação; contrato ampliado exige liberação explícita", async () => {
  const path = `/api/admin/personas/${personaId}/skills/${cross.skillId}`;
  const training = federationTraining(sources);
  training.semantics.currency = "BRL confirmado pelo responsável; sem conversão";
  const revision = (await db.query("SELECT revisao FROM skill_v2 WHERE id=$1", [cross.skillId]))
    .rows[0].revisao as number;
  expect(
    (
      await post(`${path}/rascunho`, {
        name: "Comparar pedidos",
        training,
        expectedRevision: revision,
      })
    ).status,
  ).toBe(200);
  expect((await post(`${path}/preview`, {})).body.error.code).toBe("INCOMPLETE_INPUT");
  expect(
    (
      await tool(
        { plan: federationPlan(sources, cross.publicationId) },
        cross.bearer,
        "executar_cruzamento",
      )
    ).isError,
  ).not.toBe(true);
  const config = testConfig({ DATABASE_URL: url.toString() });
  const crypto = new NodeCryptoAdapter(
    config.MCP_ENCRYPTION_KEY,
    config.MCP_ENCRYPTION_KEY_ID,
    config.MCP_ENCRYPTION_PREVIOUS_KEYS,
    config.MCP_ENCRYPTION_LEGACY_KEY,
  );
  expect(
    (
      await new PostgresPersonaRepository(db).transaction(
        { personaIds: [personaId], tokenIds: [] },
        (tx) => runFederationCases(tx, personaId, cross.skillId, crypto),
      )
    ).approved,
  ).toBe(true);
  const preview = await post(`${path}/preview`, {});
  const published = await post(`${path}/publicar`, {
    confirmationHash: preview.body.confirmationHash,
  });
  expect(published.status).toBe(201);
  cross.publicationId = published.body.publication.id;
  expect(
    (
      await tool(
        { plan: federationPlan(sources, cross.publicationId) },
        cross.bearer,
        "executar_cruzamento",
      )
    ).value.error.code,
  ).toBe("AUTHORIZATION_DENIED");
  cross.capabilities = preview.body.package.requiredCapabilities;
  cross.bearer = await issueCross();
  expect(
    (
      await tool(
        { plan: federationPlan(sources, cross.publicationId) },
        cross.bearer,
        "executar_cruzamento",
      )
    ).isError,
  ).not.toBe(true);
});
it("auditoria de cruzamento contém somente IDs, duração, contagens e número de etapas", async () => {
  const rows = (
    await db.query("SELECT * FROM audit_v2 WHERE persona_id=$1 AND evento LIKE 'federation.%'", [
      personaId,
    ])
  ).rows;
  expect(rows.length).toBeGreaterThan(0);
  expect(
    rows.every(
      (r) => r.token_id && r.skill_id && r.publicacao_id && r.etapa === 3 && r.fonte_id === null,
    ),
  ).toBe(true);
  expect(JSON.stringify(rows)).not.toMatch(/SELECT|minimum|amount_a|source-password|jwt-|10\.25/);
});
it("republicação de dependência suspende somente o cruzamento dependente até revalidação", async () => {
  const path = `/api/admin/personas/${personaId}/skills/${sources[1]!.skillId}`;
  const preview = await post(`${path}/preview`, {});
  expect(
    (await post(`${path}/publicar`, { confirmationHash: preview.body.confirmationHash })).status,
  ).toBe(201);
  const before = execute.mock.calls.length;
  expect(
    (
      await tool(
        { plan: federationPlan(sources, cross.publicationId) },
        cross.bearer,
        "executar_cruzamento",
      )
    ).isError,
  ).toBe(true);
  expect(execute.mock.calls.length).toBe(before);
  expect((await tool({ slug: "cross-orders" }, cross.bearer, "obter_skill")).isError).toBe(true);
  expect((await tool({ fonteId: sources[1]!.id, params: { minimum: 0 } })).isError).not.toBe(true);
});
it("troca de base homônima durante leitura impede entrega e não reativa treino quando a prova antiga reaparece", async () => {
  afterSql = async () => {
    identityOverrides.set("base-b", "c".repeat(64));
  };
  try {
    const response = await tool({ fonteId: sources[1]!.id, params: { minimum: 0 } });
    expect(response.isError).toBe(true);
    expect(JSON.stringify(response.value)).not.toContain("100.75");
    expect(
      (await db.query("SELECT ativa FROM fonte WHERE id=$1", [sources[1]!.id])).rows[0].ativa,
    ).toBe(false);
    expect(
      (
        await db.query("SELECT motivo FROM publicacao_suspensao WHERE publicacao_id=$1", [
          sources[1]!.publicationId,
        ])
      ).rows[0].motivo,
    ).toBe("source_identity_changed");
  } finally {
    afterSql = undefined;
    identityOverrides.clear();
  }
  const before = execute.mock.calls.length;
  expect((await tool({ fonteId: sources[1]!.id, params: { minimum: 0 } })).isError).toBe(true);
  expect(execute.mock.calls.length).toBe(before);
});
it("suspensão de publicação durante leitura impede entrega; rascunho não substitui autoridade", async () => {
  afterSql = async () => {
    const result = await post(
      `/api/admin/personas/${personaId}/skills/${sources[0]!.skillId}/suspender`,
      { reason: "Suspensão no teste" },
    );
    expect(result.status).toBe(204);
  };
  try {
    expect((await tool({ fonteId: sources[0]!.id, params: { minimum: 0 } })).isError).toBe(true);
  } finally {
    afterSql = undefined;
  }
});
