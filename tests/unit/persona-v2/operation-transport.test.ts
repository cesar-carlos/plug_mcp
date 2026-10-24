import { randomUUID } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { PersonaSqlOperationGateway } from "../../../src/infrastructure/plug-server/persona-sql-operation.js";
import { PersonaSourceQuery } from "../../../src/infrastructure/plug-server/persona-source-query.js";
import { PlugServerRestAdapter } from "../../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SilentTestLogger } from "../../helpers/silent-logger.js";
import { trainingSource, sourceProof } from "../../helpers/persona-v2-training.js";
import { operationTraining, operationInput } from "../../helpers/persona-v2-operation.js";
import { OPERATION_FAILURE_CODES } from "../../../src/domain/persona-v2/operation.js";
import {
  compileOperationCommand,
  compileOperationTraining,
} from "../../../src/application/persona-v2/operation-training.js";
import type {
  ClientTokenPolicy,
  PlugServerGatewayPort,
} from "../../../src/domain/ports/plug-server-gateway.port.js";
const crypto = new NodeCryptoAdapter("a".repeat(64));
const command = () =>
  compileOperationCommand(
    compileOperationTraining(operationTraining(), trainingSource, crypto, "Fixture"),
    trainingSource,
    randomUUID(),
    operationInput,
    crypto,
  );
const guardedCommand = () => ({
  ...command(),
  expectedStructure: {
    version: 1 as const,
    resources: [
      {
        resource: { schema: "public", name: "orders", type: "table" as const },
        columns: [{ name: "id", nativeType: "int4", nullable: false, size: 32, scale: 0 }],
        constraints: { primaryKeys: [], uniqueKeys: [], foreignKeys: [] },
      },
    ],
  },
});
const fixture = () => {
  let capability = true;
  const policy: ClientTokenPolicy = {
    allTables: true,
    tables: [],
    fullPolicy: {
      allViews: false,
      allPermissions: false,
      revoked: false,
      database: trainingSource.database,
      globalPermissions: { read: true, update: true, delete: false, ddl: false },
      rules: [],
    },
  };
  const hub = {
    login: vi.fn(async () => ({ accessToken: "source-jwt", refreshToken: "" })),
    getAgentAccessStatus: vi.fn(async () => ({
      state: "approved",
      sourceIdentity: 1,
      sourceSchema: 1,
      sourceConstraints: 1,
      sqlOperations: capability
        ? {
            version: 1,
            structureGuard: 1,
            maxSteps: 32,
            maxAffectedRows: 100000,
            timeoutMs: 300000,
          }
        : null,
    })),
    getClientTokenPolicy: vi.fn(async () => policy),
    describeSource: vi.fn(async () => sourceProof()),
  } as unknown as PlugServerGatewayPort;
  const credentials = {
    find: vi.fn(async () => ({
      id: trainingSource.credentialId,
      personaId: trainingSource.personaId,
      version: 1,
      emailEnc: crypto.encrypt("source-b@fixture.test"),
      passwordEnc: crypto.encrypt("source-password"),
      clientTokenEnc: crypto.encrypt("source-client-token"),
    })),
  };
  const operationRpc = vi.fn(
    async (input: { reference: { operationId: string; fingerprint: string } }) => ({
      ...input.reference,
      executionId: randomUUID(),
      state: "resultado_desconhecido",
      directlyAffectedRows: null,
      updatedAt: "2026-10-10T12:00:00.000Z",
      completedAt: "2026-10-10T12:00:00.000Z",
    }),
  );
  const gateway = new PersonaSqlOperationGateway(
    credentials,
    hub,
    { operationRpc },
    crypto,
    "https://hub.fixture.test/path",
  );
  return {
    gateway,
    operationRpc,
    hub,
    policy,
    credentials,
    disable: () => {
      capability = false;
    },
  };
};
describe("lançamento pela credencial da fonte e transporte real REST", () => {
  it("homônimos de outro schema e concessão simples não autorizam alvo qualificado", async () => {
    const f = fixture(),
      t = operationTraining();
    t.tables[0]!.name = "public.orders";
    t.steps[0]!.table = "public.orders";
    const cmd = compileOperationCommand(
      compileOperationTraining(t, trainingSource, crypto, "Fixture"),
      trainingSource,
      randomUUID(),
      operationInput,
      crypto,
    );
    Object.assign(f.policy, { allTables: false });
    for (const resource of ["orders", "other.orders"]) {
      Object.assign(f.policy.fullPolicy!, {
        rules: [
          {
            resourceType: "table",
            resource,
            effect: "allow",
            read: true,
            update: true,
            delete: false,
            ddl: false,
          },
        ],
      });
      await expect(f.gateway.execute(trainingSource, cmd)).rejects.toThrow(/concedido/);
    }
    expect(f.operationRpc).not.toHaveBeenCalled();
    Object.assign(f.policy.fullPolicy!, {
      rules: [
        {
          resourceType: "table",
          resource: "public.orders",
          effect: "allow",
          read: true,
          update: true,
          delete: false,
          ddl: false,
        },
      ],
    });
    await expect(f.gateway.execute(trainingSource, cmd)).resolves.toBeDefined();
  });
  it.each(OPERATION_FAILURE_CODES)(
    "preserva o motivo seguro %s no comprovante",
    async (failureCode) => {
      const f = fixture(),
        cmd = command();
      const response = await f.operationRpc({ reference: cmd });
      f.operationRpc.mockResolvedValue(
        Object.assign(response, { state: "cancelada", failureCode }),
      );
      expect(await f.gateway.execute(trainingSource, cmd)).toMatchObject({
        state: "cancelada",
        failureCode,
      });
      expect(await f.gateway.get(trainingSource, cmd.operationId, cmd.fingerprint)).toMatchObject({
        failureCode,
      });
    },
  );
  it.each(["concluida", "executando", "cancelamento_solicitado"])(
    "recusa motivo de falha associado ao estado %s",
    async (state) => {
      const f = fixture(),
        cmd = command();
      const response = await f.operationRpc({ reference: cmd });
      f.operationRpc.mockResolvedValue(
        Object.assign(response, {
          state,
          failureCode: "SOURCE_STRUCTURE_MISMATCH",
          directlyAffectedRows: state === "concluida" ? 1 : null,
        }),
      );
      await expect(f.gateway.execute(trainingSource, cmd)).rejects.toThrow();
    },
  );
  it("recusa diagnóstico arbitrário e preserva ausência em receipts antigos", async () => {
    const f = fixture(),
      cmd = command();
    expect(await f.gateway.execute(trainingSource, cmd)).not.toHaveProperty("failureCode");
    const response = await f.operationRpc({ reference: cmd });
    f.operationRpc.mockResolvedValue(
      Object.assign(response, { failureCode: "PRIVATE_NATIVE_MESSAGE" }),
    );
    await expect(f.gateway.execute(trainingSource, cmd)).rejects.toThrow();
  });
  it("encaminha a expectativa imutável e exige leitura exata de suas dependências", async () => {
    const f = fixture(),
      cmd = guardedCommand();
    await f.gateway.execute(trainingSource, cmd);
    expect(f.operationRpc).toHaveBeenCalledWith(expect.objectContaining({ command: cmd }));
    f.operationRpc.mockClear();
    Object.assign(f.policy, { allTables: false });
    Object.assign(f.policy.fullPolicy!, {
      rules: [
        {
          resourceType: "table",
          resource: "orders",
          effect: "allow",
          read: true,
          update: true,
          delete: false,
          ddl: false,
        },
      ],
    });
    await expect(f.gateway.execute(trainingSource, cmd)).rejects.toThrow(/estrutural/);
    expect(f.operationRpc).not.toHaveBeenCalled();
    Object.assign(f.policy.fullPolicy!, {
      rules: [
        ...f.policy.fullPolicy!.rules,
        {
          resourceType: "table",
          resource: "public.orders",
          effect: "allow",
          read: true,
          update: false,
          delete: false,
          ddl: false,
        },
      ],
    });
    await expect(f.gateway.execute(trainingSource, cmd)).resolves.toBeDefined();
  });
  it.each(["structureGuard", "sourceSchema", "sourceConstraints"])(
    "recusa %s ausente antes do transporte",
    async (missing) => {
      const f = fixture();
      const access = await f.hub.getAgentAccessStatus("source-jwt", trainingSource.agentId);
      vi.mocked(f.hub.getAgentAccessStatus).mockResolvedValue(
        missing === "structureGuard"
          ? { ...access, sqlOperations: { ...access.sqlOperations!, structureGuard: undefined } }
          : { ...access, [missing]: undefined },
      );
      await expect(f.gateway.execute(trainingSource, guardedCommand())).rejects.toMatchObject({
        code: "CAPABILITY_UNAVAILABLE",
      });
      expect(f.operationRpc).not.toHaveBeenCalled();
    },
  );
  it("contabiliza metadados antes de enviar um plano acima do teto nativo", async () => {
    const f = fixture(),
      cmd = guardedCommand();
    cmd.expectedStructure.resources = Array.from({ length: 16 }, (_, i) => ({
      ...cmd.expectedStructure.resources[0]!,
      resource: { schema: "public", name: `table_${i}`, type: "table" },
    }));
    await expect(f.gateway.execute(trainingSource, cmd)).rejects.toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
    });
    expect(f.operationRpc).not.toHaveBeenCalled();
  });
  it("SQL Anywhere exige read vigente na policy para recuperar saídas da escrita", async () => {
    const f = fixture();
    const source = { ...trainingSource, dialect: "sybase" as const };
    vi.mocked(f.hub.describeSource!).mockResolvedValue(sourceProof(source));
    const t = operationTraining();
    t.dialect = "sybase";
    t.steps[0]!.outputs = [{ column: "id", type: "integer" }];
    const cmd = compileOperationCommand(
      compileOperationTraining(t, source, crypto, "Fixture"),
      source,
      randomUUID(),
      operationInput,
      crypto,
    );
    Object.assign(f.policy.fullPolicy!.globalPermissions, { read: false });
    await expect(f.gateway.execute(source, cmd)).rejects.toThrow(/policy/);
    expect(f.operationRpc).not.toHaveBeenCalled();
    Object.assign(f.policy.fullPolicy!.globalPermissions, { read: true });
    await expect(f.gateway.execute(source, cmd)).resolves.toBeDefined();
    expect(f.operationRpc).toHaveBeenCalledTimes(1);
  });
  it("leitura de conciliação exige banco explícito e recurso exato na policy", async () => {
    const f = fixture();
    const read = new PersonaSourceQuery(f.credentials, f.hub, crypto);
    const resources = [{ name: "operation_ledger", type: "table" as const }];
    const fences = { exactResources: true, requireDatabase: true } as const;
    Object.assign(f.policy.fullPolicy!, { database: null });
    await expect(read.authorize(trainingSource, resources, fences)).rejects.toThrow();
    Object.assign(f.policy, { allTables: false });
    Object.assign(f.policy.fullPolicy!, {
      database: trainingSource.database,
      rules: [
        {
          resourceType: "table",
          resource: "other_schema.operation_ledger",
          effect: "allow",
          read: true,
          update: true,
          delete: false,
          ddl: false,
        },
      ],
    });
    await expect(read.authorize(trainingSource, resources, fences)).rejects.toThrow();
    Object.assign(f.policy.fullPolicy!.rules[0]!, { resource: "operation_ledger" });
    await expect(read.authorize(trainingSource, resources, fences)).resolves.toBeDefined();
  });
  it("preserva resultado desconhecido, identidade física e credencial própria", async () => {
    const f = fixture(),
      cmd = command();
    await f.gateway.verifyCapabilitiesAndPolicy(trainingSource, cmd);
    expect(await f.gateway.execute(trainingSource, cmd)).toMatchObject({
      state: "resultado_desconhecido",
      directlyAffectedRows: null,
      fingerprint: cmd.fingerprint,
    });
    expect(f.hub.login).toHaveBeenCalledWith("source-b@fixture.test", "source-password");
    expect(f.operationRpc).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: "sql.operation.execute",
        accessToken: "source-jwt",
        clientToken: "source-client-token",
        expectedSource: {
          version: 1,
          dialect: trainingSource.dialect,
          identityHash: trainingSource.identityHash!,
        },
        sourcePhysicalId: crypto.sha256Hex(
          JSON.stringify(["https://hub.fixture.test", trainingSource.identityHash]),
        ),
      }),
    );
  });
  it.each(["capability", "sourceIdentity", "database", "permission", "revocation"])(
    "bloqueia %s antes do envio",
    async (condition) => {
      const f = fixture();
      if (condition === "capability") f.disable();
      if (condition === "sourceIdentity")
        vi.mocked(f.hub.getAgentAccessStatus).mockResolvedValue({
          agentId: trainingSource.agentId,
          state: "approved",
          hasClientToken: true,
          isHubConnected: true,
          sourceIdentity: null,
        });
      const full = f.policy.fullPolicy! as {
        database: string | null;
        revoked: boolean;
        globalPermissions: { update: boolean };
      };
      if (condition === "database") full.database = null;
      if (condition === "permission") full.globalPermissions.update = false;
      if (condition === "revocation") full.revoked = true;
      await expect(f.gateway.execute(trainingSource, command())).rejects.toThrow();
      expect(f.operationRpc).not.toHaveBeenCalled();
    },
  );
  it("não repete erro de transporte e não recomenda reenvio", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("network lost");
    });
    const hub = new PlugServerRestAdapter(
      "https://hub.fixture.test",
      new SilentTestLogger(),
      fetcher,
    );
    const cmd = command();
    await expect(
      hub.operationRpc({
        accessToken: "jwt",
        agentId: trainingSource.agentId,
        clientToken: "technical",
        sourcePhysicalId: "a".repeat(64),
        method: "sql.operation.execute",
        reference: cmd,
        command: cmd,
      }),
    ).rejects.toMatchObject({
      retryable: false,
      details: { outcome_unknown: true },
      stage: "sql.operation.execute",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("envia v1 sem paginação e preserva campos nulos no retorno", async () => {
    let sent: Record<string, unknown> = {};
    const cmd = guardedCommand();
    const fetcher: typeof fetch = async (_url, options) => {
      sent = JSON.parse(String(options?.body));
      return new Response(
        JSON.stringify({
          response: {
            item: {
              result: {
                operationId: cmd.operationId,
                directlyAffectedRows: null,
                state: "resultado_desconhecido",
              },
            },
          },
        }),
        { status: 200 },
      );
    };
    const hub = new PlugServerRestAdapter(
      "https://hub.fixture.test",
      new SilentTestLogger(),
      fetcher,
    );
    expect(
      await hub.operationRpc({
        accessToken: "jwt",
        agentId: trainingSource.agentId,
        clientToken: "technical",
        sourcePhysicalId: "a".repeat(64),
        expectedSource: {
          version: 1,
          dialect: trainingSource.dialect,
          identityHash: trainingSource.identityHash!,
        },
        method: "sql.operation.execute",
        reference: cmd,
        command: cmd,
      }),
    ).toMatchObject({ directlyAffectedRows: null });
    expect(sent.command).toMatchObject({
      method: "sql.operation.execute",
      params: {
        contractVersion: 1,
        sourcePhysicalId: "a".repeat(64),
        client_token: "technical",
        database: trainingSource.database,
        expectedStructure: cmd.expectedStructure,
      },
    });
    expect(JSON.stringify(sent)).not.toContain("execution_mode");
    expect(JSON.stringify(sent)).not.toContain("page_size");
  });
});
