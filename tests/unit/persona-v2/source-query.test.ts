import { expect, it, vi } from "vitest";
import {
  PersonaQueryReuse,
  PersonaMemoryQueryStore,
} from "../../../src/infrastructure/persona-v2/query-reuse.js";
import { structureContent } from "../../helpers/persona-v2-structure.js";
import { queryLimits } from "../../../src/domain/persona-v2/execution-limits.js";
import { DomainError } from "../../../src/domain/errors/domain-error.js";
import {
  PersonaSourceQueries,
  type SourceQueryInput,
} from "../../../src/application/persona-v2/source-query.js";
import type { SourceQueryLease } from "../../../src/domain/ports/source-query.port.js";
import {
  compileQueryTraining,
  sourceFingerprint,
} from "../../../src/application/persona-v2/query-training.js";
import { PersonaSourceQuery } from "../../../src/infrastructure/plug-server/persona-source-query.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";
import { canonicalJson } from "../../../src/domain/persona-v2/catalog.js";
import type {
  PlugServerGatewayPort,
  ClientTokenPolicy,
} from "../../../src/domain/ports/plug-server-gateway.port.js";

const crypto = new NodeCryptoAdapter("a".repeat(64));
const identity = {
  personaId: trainingSource.personaId,
  tokenId: "token",
  tokenVersion: 1,
  personaVersion: 1,
};
const fixture = (dialect: typeof trainingSource.dialect = "postgres") => {
  const source = { ...trainingSource, dialect };
  const pkg = compileQueryTraining({ ...queryTraining(), dialect }, source, crypto);
  const evidence = {
    cacheFence: { revision: "1", writePending: false },
    executionLimits: queryLimits(),
    source,
    publications: [
      {
        id: "publication",
        personaId: identity.personaId,
        skillId: "skill",
        revision: 1,
        package: pkg,
        hash: crypto.sha256Hex(canonicalJson(pkg)),
        sourceVersion: 1,
        sourceFingerprint: sourceFingerprint(source, crypto),
        suspendedAt: null,
      },
    ],
  };
  const catalog = {
    query: vi.fn(async () => evidence),
    revalidateQuery: vi.fn(async () => undefined),
    sourceForVerification: vi.fn(async () => evidence.source),
    suspendStructuralQuery: vi.fn(async () => undefined),
  };
  const execute = vi.fn<SourceQueryLease["execute"]>(async () => ({
    columns: ["id", "amount"],
    rows: [{ id: 1, amount: "10.25" }],
  }));
  const revalidate = vi.fn(async () => undefined);
  const gateway = {
    authorize: vi.fn(async (): Promise<SourceQueryLease> => ({
      execute,
      revalidate,
      policyFingerprint: "a".repeat(64),
    })),
  };
  return {
    evidence,
    catalog,
    gateway,
    execute,
    revalidate,
    service: new PersonaSourceQueries(catalog, gateway),
  };
};

const reusableFixture = () => {
  const f = fixture();
  const reuse = new PersonaQueryReuse(
    new PersonaMemoryQueryStore(),
    crypto,
    "fixture-key",
    "https://fixture.test",
    1000,
  );
  return { ...f, service: new PersonaSourceQueries(f.catalog, f.gateway, reuse), reuse };
};
it("prova estrutural compartilhada continua na conexão executora, sem cache ou singleflight", async () => {
  const f = reusableFixture();
  f.evidence.publications[0]!.package = {
    ...f.evidence.publications[0]!.package,
    sharedKnowledge: {
      catalogId: "catalog",
      publicationId: "pattern",
      publicationHash: "a".repeat(64),
      evidenceId: "evidence",
      evidenceHash: "b".repeat(64),
      content: structureContent(),
      expectedStructure: {
        version: 1,
        resources: [
          {
            resource: { schema: null, name: "orders", type: "table" },
            columns: [
              { name: "id", nativeType: "integer", nullable: false, size: null, scale: null },
            ],
          },
        ],
      },
    },
  };
  const reuse = vi.spyOn(f.reuse, "run");
  const input = { params: { minimum: 0 } };
  await f.service.run(identity, input);
  await f.service.run(identity, input);
  expect(reuse).not.toHaveBeenCalled();
  expect(f.execute).toHaveBeenCalledTimes(2);
  expect(f.execute.mock.calls[0]![3]?.resources[0]!.resource.name).toBe("orders");
});
it("cache v2 preserva leitura original e revalida hub/publicação por consumidor", async () => {
  const f = reusableFixture(),
    input = { params: { minimum: 0 } };
  const first = await f.service.run(identity, input);
  const next = await f.service.run(identity, input);
  expect(first.reuse?.kind).toBe("fresh");
  expect(next.reuse?.kind).toBe("cache");
  expect(next.provenance.readAt).toBe(first.provenance.readAt);
  expect(f.execute).toHaveBeenCalledTimes(1);
  expect(f.gateway.authorize).toHaveBeenCalledTimes(2);
  f.revalidate.mockRejectedValueOnce(new Error("remote revoked"));
  await expect(f.service.run(identity, input)).rejects.toThrow("remote revoked");
  expect(f.execute).toHaveBeenCalledTimes(1);
  f.catalog.query.mockRejectedValueOnce(new Error("token revoked"));
  await expect(f.service.run(identity, input)).rejects.toThrow("token revoked");
});
it("cache/singleflight isolam token, concessão, parâmetros, policy e revisão física", async () => {
  const f = reusableFixture(),
    input = { params: { minimum: 0 } };
  await f.service.run(identity, input);
  await f.service.run({ ...identity, tokenId: "another" }, input);
  await f.service.run(
    { ...identity, grant: { id: "grant-a", expiresAt: Date.now() + 10000 } },
    input,
  );
  await f.service.run(
    { ...identity, grant: { id: "grant-b", expiresAt: Date.now() + 10000 } },
    input,
  );
  await f.service.run(identity, { params: { minimum: 1 } });
  f.evidence.cacheFence.revision = "2";
  await f.service.run(identity, input);
  f.gateway.authorize.mockResolvedValue({
    execute: f.execute,
    revalidate: f.revalidate,
    policyFingerprint: "b".repeat(64),
  });
  await f.service.run(identity, input);
  expect(f.execute).toHaveBeenCalledTimes(7);
});
it("cada seguidor revalida concessões e não entrega linhas após recusa local", async () => {
  const f = reusableFixture(),
    input = { params: { minimum: 0 } };
  f.execute.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
    return { columns: ["id", "amount"], rows: [{ id: 1, amount: "10.25" }] };
  });
  const results = await Promise.all(
    Array.from({ length: 6 }, () => f.service.run(identity, input)),
  );
  expect(f.execute).toHaveBeenCalledTimes(1);
  expect(results.filter((r) => r.reuse?.kind === "singleflight")).toHaveLength(5);
  f.catalog.revalidateQuery.mockImplementation(async (...args: unknown[]) => {
    if (args[2]) throw new Error("grant revoked before delivery");
  });
  await expect(f.service.run(identity, input)).rejects.toThrow("grant revoked before delivery");
  expect(f.execute).toHaveBeenCalledTimes(1);
});
it("escrita pendente desativa reuso e validação nunca aproveita linhas", async () => {
  const f = reusableFixture(),
    input = { params: { minimum: 0 } };
  f.evidence.cacheFence.writePending = true;
  expect((await f.service.run(identity, input)).reuse).toBeUndefined();
  await f.service.run(identity, input);
  expect(f.execute).toHaveBeenCalledTimes(2);
  f.evidence.cacheFence.writePending = false;
  f.execute.mockResolvedValue({ columns: ["id", "amount"], rows: [] });
  expect((await f.service.run(identity, input, true)).valid).toBe(true);
  expect((await f.service.run(identity, input, true)).reuse).toBeUndefined();
  expect(f.execute).toHaveBeenCalledTimes(4);
});

it("executa modelo com binding tipado, fonte e publicações exatas; revalida antes de entregar", async () => {
  const f = fixture();
  const result = await f.service.run(identity, { params: { minimum: "0" } });
  expect(f.execute).toHaveBeenCalledWith(
    expect.stringContaining(":minimum"),
    { minimum: 0 },
    expect.objectContaining({ maxRows: 5000 }),
    undefined,
  );
  expect("rows" in result && result.rows).toEqual([{ id: 1, amount: "10.25" }]);
  expect(result.provenance.publications[0]!.hash).toBe(f.evidence.publications[0]!.hash);
  expect(f.catalog.revalidateQuery).toHaveBeenCalledTimes(2);
  expect(f.revalidate).toHaveBeenCalledTimes(1);
});
it("aplica os tetos menores ao transporte e não apresenta página limitada como total", async () => {
  const f = fixture();
  f.evidence.executionLimits = { maxRows: 2, pageSize: 1, maxBytes: 4000, timeoutMs: 10000 };
  f.execute.mockResolvedValue({
    columns: ["id", "amount"],
    rows: [{ id: 1, amount: "10.25" }],
    pagination: { page: 1, pageSize: 1, hasNextPage: true, hasPreviousPage: false },
    truncated: false,
  });
  const result = await f.service.run(identity, {
    params: { minimum: 0 },
    options: { maxRows: 100, page: 1, pageSize: 20, timeoutMs: 20000, maxBytes: 10000 },
  });
  expect(f.execute.mock.calls[0]![2]).toMatchObject({ maxRows: 2, pageSize: 1 });
  expect(result.limits).toEqual(f.evidence.executionLimits);
  expect(result.completeness.complete).toBe(false);
});
it("recusa bytes excedidos sem entregar linhas ou registrar consulta entregue", async () => {
  const f = fixture();
  f.evidence.executionLimits.maxBytes = 32;
  await expect(f.service.run(identity, { params: { minimum: 0 } })).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  expect(f.catalog.revalidateQuery.mock.calls).toHaveLength(1);
});
it("timeout reduzido vence durante autorização remota e impede SQL tardio", async () => {
  const f = fixture();
  f.evidence.executionLimits.timeoutMs = 10;
  f.gateway.authorize.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    return { execute: f.execute, revalidate: f.revalidate };
  });
  await expect(f.service.run(identity, { params: { minimum: 0 } })).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(f.execute).not.toHaveBeenCalled();
});
it("validar_consulta só executa envelope vazio e não aprova semântica", async () => {
  const f = fixture();
  f.execute.mockResolvedValue({ columns: ["id", "amount"], rows: [] });
  const result = await f.service.run(identity, { params: { minimum: 0 } }, true);
  expect(f.execute.mock.calls[0]![0]).toMatch(/WHERE FALSE$/);
  expect(result).toMatchObject({ valid: true, semanticApproval: false });
  expect(result).not.toHaveProperty("rows");
});
it.each([
  "DELETE FROM orders WHERE id = :minimum",
  "SELECT p.id, p.secret FROM orders p WHERE p.id > :minimum",
  "SELECT * FROM orders p WHERE p.id > :minimum",
  "SELECT p.id, p.id FROM orders p WHERE p.id > :minimum",
  "SELECT p.id FROM orders p",
  "SELECT p.id FROM other p WHERE p.id > :minimum",
])("recusa SQL antes de chamar hub: %s", async (sql) => {
  const f = fixture();
  await expect(f.service.run(identity, { sql, params: { minimum: 0 } })).rejects.toBeDefined();
  expect(f.gateway.authorize).not.toHaveBeenCalled();
});
it("recusa parâmetros não treinados, extras e coerção inválida", async () => {
  const f = fixture();
  const inputs: SourceQueryInput[] = [
    { params: { minimum: 0, extra: 1 } },
    { params: { minimum: "invalid" } },
    { sql: "SELECT id FROM orders WHERE id > :other", params: { other: 1 } },
  ];
  for (const input of inputs) {
    await expect(f.service.run(identity, input)).rejects.toBeDefined();
  }
  expect(f.gateway.authorize).not.toHaveBeenCalled();
});
it("não ignora recortes físicos com formato desconhecido", async () => {
  const f = fixture();
  f.evidence.source.rowRestrictions = [{ empresa: 1 }];
  await expect(f.service.run(identity, { params: { minimum: 0 } })).rejects.toMatchObject({
    code: "INVALID_PLAN",
  });
  expect(f.execute).not.toHaveBeenCalled();
});
it("revogação após SQL impede entrega e não repete consulta", async () => {
  const f = fixture();
  f.catalog.revalidateQuery
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("revoked"));
  await expect(f.service.run(identity, { params: { minimum: 0 } })).rejects.toThrow("revoked");
  expect(f.execute).toHaveBeenCalledTimes(1);
});
it.each([
  { columns: ["id", "amount", "password"], rows: [] },
  { columns: ["id", "amount"], rows: [{ id: 1, amount: { bytes: "secret" } }] },
  { columns: ["id", "amount"], rows: [{ id: 1, amount: 2, extra: "secret" }] },
])("recusa resposta fora da projeção ou não escalar", async (result) => {
  const f = fixture();
  f.execute.mockResolvedValue(result);
  await expect(f.service.run(identity, { params: { minimum: 0 } })).rejects.toMatchObject({
    code: "INCOMPLETE_INPUT",
  });
});
it("truncamento não é anunciado como resultado completo", async () => {
  const f = fixture();
  expect(
    (await f.service.run(identity, { params: { minimum: 0 }, options: { maxRows: 1 } }))
      .completeness,
  ).toEqual({ complete: false, truncated: true });
});
it("ausência de informação de truncamento não comprova completude para cruzamentos", async () => {
  const f = fixture();
  expect((await f.service.run(identity, { params: { minimum: 0 } })).completeness.complete).toBe(
    false,
  );
  f.execute.mockResolvedValue({
    columns: ["id", "amount"],
    rows: [{ id: 1, amount: "10.25" }],
    truncated: false,
  });
  expect((await f.service.run(identity, { params: { minimum: 0 } })).completeness.complete).toBe(
    true,
  );
});
it("PostgreSQL sem LIMIT permite paginação e LIMIT explícito continua incompatível", async () => {
  const f = fixture();
  await expect(
    f.service.run(identity, { params: { minimum: 0 }, options: { page: 1, pageSize: 10 } }),
  ).resolves.toBeDefined();
  await expect(
    f.service.run(identity, {
      sql: `${queryTraining().sqlModel} LIMIT 10`,
      params: { minimum: 0 },
      options: { page: 1, pageSize: 10 },
    }),
  ).rejects.toBeDefined();
  expect(f.execute).toHaveBeenCalledTimes(1);
});
it("prazo inclui autorização e não dispara SQL após timeout", async () => {
  const f = fixture();
  f.gateway.authorize.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    return { execute: f.execute, revalidate: f.revalidate };
  });
  await expect(
    f.service.run(identity, { params: { minimum: 0 }, options: { timeoutMs: 5 } }),
  ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(f.execute).not.toHaveBeenCalled();
});

const hubFixture = () => {
  let policy: ClientTokenPolicy = {
    allTables: true,
    tables: [],
    fullPolicy: {
      allViews: false,
      allPermissions: false,
      revoked: false,
      database: trainingSource.database,
      globalPermissions: { read: true, update: false, delete: false, ddl: false },
      rules: [],
    },
  };
  let version = 1;
  const credentials = {
    invalidateIdentity: vi.fn(async () => undefined),
    find: async () => ({
      id: trainingSource.credentialId,
      personaId: identity.personaId,
      version,
      emailEnc: crypto.encrypt("client-b@fixture.test"),
      passwordEnc: crypto.encrypt("password-b"),
      clientTokenEnc: crypto.encrypt("source-secret"),
    }),
  };
  const hub: PlugServerGatewayPort = {
    login: vi.fn(async () => ({ accessToken: "jwt-b", refreshToken: "refresh-b" })),
    refresh: vi.fn(),
    requestAgentAccess: vi.fn(),
    putClientToken: vi.fn(),
    getAgentAccessStatus: vi.fn(async () => ({
      agentId: trainingSource.agentId,
      state: "approved" as const,
      sourceIdentity: 1 as const,
      hasClientToken: true,
      isHubConnected: true,
    })),
    getClientTokenPolicy: vi.fn(async () => policy),
    describeSource: vi.fn(async () => ({
      contractVersion: 1,
      database: trainingSource.database,
      dialect: trainingSource.dialect,
      identityHash: trainingSource.identityHash,
      identityKind: "native",
      engineVersion: "fixture",
      verifiedAt: "2026-10-11T00:00:00.000Z",
    })),
    executeSql: vi.fn(async () => ({ columns: ["id"], rows: [] })),
  };
  return {
    hub,
    credentials,
    gateway: new PersonaSourceQuery(credentials, hub, crypto),
    setPolicy: (p: ClientTokenPolicy) => {
      policy = p;
    },
    policy: () => policy,
    rotate: () => {
      version++;
    },
  };
};
it("usa Client da fonte, credenciais técnicas e database explícito; não usa identidade responsável", async () => {
  const f = hubFixture();
  const lease = await f.gateway.authorize(trainingSource, [{ name: "orders", type: "table" }]);
  await lease.execute("SELECT id FROM orders WHERE id > :minimum", { minimum: 0 }, { maxRows: 5 });
  expect(f.hub.login).toHaveBeenCalledWith("client-b@fixture.test", "password-b");
  expect(f.hub.executeSql).toHaveBeenCalledWith(
    expect.objectContaining({
      database: trainingSource.database,
      accessToken: "jwt-b",
      clientToken: "source-secret",
      expectedSource: {
        version: 1,
        dialect: trainingSource.dialect,
        identityHash: trainingSource.identityHash,
      },
    }),
  );
  f.rotate();
  await expect(lease.revalidate()).rejects.toMatchObject({ code: "STALE_AUTHORIZATION" });
});
it("composição exige sourceSchema v1 vigente e recusa perda de capability sem SQL", async () => {
  const f = hubFixture();
  const resources = [{ name: "orders", type: "table" as const }];
  const fences = {
    exactResources: true as const,
    requireDatabase: true as const,
    requireSchema: true as const,
  };
  await expect(f.gateway.authorize(trainingSource, resources, fences)).rejects.toMatchObject({
    code: "CAPABILITY_UNAVAILABLE",
  });
  const allowed = {
    agentId: trainingSource.agentId,
    state: "approved" as const,
    sourceIdentity: 1 as const,
    sourceSchema: 1 as const,
    hasClientToken: true,
    isHubConnected: true,
  };
  vi.mocked(f.hub.getAgentAccessStatus).mockResolvedValue(allowed);
  const lease = await f.gateway.authorize(trainingSource, resources, fences);
  vi.mocked(f.hub.getAgentAccessStatus).mockResolvedValue({ ...allowed, sourceSchema: null });
  await expect(lease.revalidate()).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
  expect(f.hub.executeSql).not.toHaveBeenCalled();
});
it("identidade divergente no RPC de inspeção suspende a fonte sem consultar dados de negócio", async () => {
  const f = hubFixture();
  f.hub.describeSchema = vi.fn(async () => {
    throw new DomainError({
      code: "CREDENTIAL_STALE",
      message: "Fixture identity changed",
      hint: "Review the isolated fixture.",
      source: "client_token_rpc",
      retryable: false,
      details: { failureCode: "SOURCE_IDENTITY_MISMATCH" },
    });
  });
  const lease = await f.gateway.authorize(
    trainingSource,
    [{ name: "public.orders", type: "table" }],
    { exactResources: true, requireDatabase: true },
  );
  await expect(
    lease.inspectSchema!({
      resources: [{ schema: "public", name: "orders", type: "table" }],
      offset: 0,
      pageSize: 1,
    }),
  ).rejects.toMatchObject({ code: "STALE_AUTHORIZATION" });
  expect(f.credentials.invalidateIdentity).toHaveBeenCalledWith(trainingSource);
  expect(f.hub.executeSql).not.toHaveBeenCalled();
});
it("policy incompleta, revogada ou de outra base não autoriza dispatch", async () => {
  const f = hubFixture();
  for (const p of [
    { allTables: true, tables: [] },
    { ...f.policy(), fullPolicy: { ...f.policy().fullPolicy!, revoked: true } },
    { ...f.policy(), fullPolicy: { ...f.policy().fullPolicy!, database: "other" } },
  ]) {
    f.setPolicy(p);
    await expect(
      f.gateway.authorize(trainingSource, [{ name: "orders", type: "table" }]),
    ).rejects.toBeDefined();
  }
  expect(f.hub.executeSql).not.toHaveBeenCalled();
});
it("regras read deny prevalecem e mudança de policy antes do dispatch bloqueia", async () => {
  const f = hubFixture();
  const allow = {
    resourceType: "table" as const,
    resource: "orders",
    effect: "allow" as const,
    read: true,
    update: false,
    delete: false,
    ddl: false,
  };
  f.setPolicy({
    ...f.policy(),
    allTables: false,
    fullPolicy: { ...f.policy().fullPolicy!, rules: [allow] },
  });
  const lease = await f.gateway.authorize(trainingSource, [{ name: "orders", type: "table" }]);
  f.setPolicy({
    ...f.policy(),
    fullPolicy: { ...f.policy().fullPolicy!, rules: [allow, { ...allow, effect: "deny" }] },
  });
  await expect(lease.execute("SELECT id FROM orders", {}, {})).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  expect(f.hub.executeSql).not.toHaveBeenCalled();
});
it("escopo global mantém a semântica do agente e diferencia tabelas de views", async () => {
  const f = hubFixture();
  const deny = {
    resourceType: "table" as const,
    resource: "orders",
    effect: "deny" as const,
    read: true,
    update: false,
    delete: false,
    ddl: false,
  };
  f.setPolicy({ ...f.policy(), fullPolicy: { ...f.policy().fullPolicy!, rules: [deny] } });
  await expect(
    f.gateway.authorize(trainingSource, [{ name: "orders", type: "table" }]),
  ).resolves.toBeDefined();
  await expect(
    f.gateway.authorize(trainingSource, [{ name: "orders", type: "view" }]),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  f.setPolicy({
    ...f.policy(),
    fullPolicy: {
      ...f.policy().fullPolicy!,
      globalPermissions: { read: false, update: true, delete: true, ddl: false },
    },
  });
  await expect(
    f.gateway.authorize(trainingSource, [{ name: "orders", type: "table" }]),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
});

it("perda da capability de identidade entre autorização e dispatch recusa a consulta", async () => {
  const f = hubFixture();
  const lease = await f.gateway.authorize(trainingSource, [{ name: "orders", type: "table" }]);
  vi.mocked(f.hub.getAgentAccessStatus).mockResolvedValue({
    agentId: trainingSource.agentId,
    state: "approved",
    hasClientToken: true,
    isHubConnected: true,
    sourceIdentity: null,
  });
  await expect(lease.execute("SELECT id FROM orders", {}, {})).rejects.toMatchObject({
    code: "CAPABILITY_UNAVAILABLE",
  });
  expect(f.hub.executeSql).not.toHaveBeenCalled();
});

it("divergência na conexão executora suspende a fonte e preserva a origem sem retry", async () => {
  const f = hubFixture();
  const lease = await f.gateway.authorize(trainingSource, [{ name: "orders", type: "table" }]);
  vi.mocked(f.hub.executeSql).mockRejectedValue(
    new DomainError({
      code: "CREDENTIAL_STALE",
      message: "Source identity mismatch",
      hint: "Review source",
      source: "client_token_rpc",
      details: { failureCode: "SOURCE_IDENTITY_MISMATCH" },
    }),
  );
  await expect(lease.execute("SELECT id FROM orders", {}, {})).rejects.toMatchObject({
    code: "STALE_AUTHORIZATION",
    source: "client_token_rpc",
  });
  expect(f.credentials.invalidateIdentity).toHaveBeenCalledExactlyOnceWith(trainingSource);
  expect(f.hub.executeSql).toHaveBeenCalledTimes(1);
});

it("falha de transporte não suspende a identidade nem repete SQL", async () => {
  const f = hubFixture();
  const lease = await f.gateway.authorize(trainingSource, [{ name: "orders", type: "table" }]);
  const failure = new DomainError({
    code: "PLUG_SERVER_ERROR",
    message: "Transport unavailable",
    hint: "Check transport",
    source: "plug_server_http",
  });
  vi.mocked(f.hub.executeSql).mockRejectedValue(failure);
  await expect(lease.execute("SELECT id FROM orders", {}, {})).rejects.toBe(failure);
  expect(f.credentials.invalidateIdentity).not.toHaveBeenCalled();
  expect(f.hub.executeSql).toHaveBeenCalledTimes(1);
});

it.each(["postgres", "mssql", "sybase"] as const)(
  "paginação %s recusa expressões antes de autorizar ou enviar SQL",
  async (dialect) => {
    for (const order of ["p.id + 1", "1", "COALESCE(p.id, 0)"]) {
      const f = fixture(dialect);
      await expect(
        f.service.run(identity, {
          sql: queryTraining().sqlModel.replace("ORDER BY p.id", `ORDER BY ${order}`),
          params: { minimum: 0 },
          options: { page: 1, pageSize: 10 },
        }),
      ).rejects.toMatchObject({ code: "INVALID_PLAN" });
      expect(f.gateway.authorize).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
    }
  },
);
it.each(["postgres", "mssql", "sybase"] as const)(
  "paginação %s aceita alias projetado sem reescrever SQL",
  async (dialect) => {
    const f = fixture(dialect);
    const sql = queryTraining().sqlModel.replace("ORDER BY p.id", "ORDER BY id DESC");
    await f.service.run(identity, {
      sql,
      params: { minimum: 0 },
      options: { page: 1, pageSize: 10 },
    });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0]![0]).toBe(sql);
  },
);

it.each(["postgres", "mssql", "sybase"] as const)(
  "paginação %s usa alias em projeção agregada",
  async (dialect) => {
    const f = fixture(dialect);
    const sql =
      "SELECT p.id, SUM(p.amount) AS amount FROM orders p WHERE p.id > :minimum GROUP BY p.id ORDER BY p.id";
    await expect(
      f.service.run(identity, { sql, params: { minimum: 0 }, options: { page: 1, pageSize: 10 } }),
    ).rejects.toMatchObject({ code: "INVALID_PLAN" });
    expect(f.execute).not.toHaveBeenCalled();
    const revised = sql.replace("ORDER BY p.id", "ORDER BY id");
    await f.service.run(identity, {
      sql: revised,
      params: { minimum: 0 },
      options: { page: 1, pageSize: 10 },
    });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0]![0]).toBe(revised);
  },
);
it("sem paginação preserva ORDER BY por expressão; NULLS LAST paginado é recusado", async () => {
  const f = fixture();
  await f.service.run(identity, {
    sql: queryTraining().sqlModel.replace("ORDER BY p.id", "ORDER BY p.id + 1"),
    params: { minimum: 0 },
  });
  await expect(
    f.service.run(identity, {
      sql: `${queryTraining().sqlModel} NULLS LAST`,
      params: { minimum: 0 },
      options: { page: 1, pageSize: 10 },
    }),
  ).rejects.toMatchObject({ code: "INVALID_PLAN" });
  expect(f.execute).toHaveBeenCalledTimes(1);
});
