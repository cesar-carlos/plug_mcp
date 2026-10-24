import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PersonaSqlOperations } from "../../../src/application/persona-v2/sql-operations.js";
import { PersonaAdministration } from "../../../src/application/persona-v2/administration.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { MemoryAdministrativeSessions } from "../../../src/infrastructure/persistence/persona-v2/admin-sessions.js";
import type {
  PersonaServices,
  SqlOperationGatewayPort,
} from "../../../src/domain/ports/persona-v2.port.js";
import type {
  SqlOperationStorePort,
  SqlOperationStoreTransaction,
  StoredSqlOperation,
} from "../../../src/domain/ports/sql-operation-store.port.js";
import type { OwnerApproval } from "../../../src/domain/persona-v2/operation.js";
import type { ExpectedStructure } from "../../../src/domain/persona-v2/source-schema.js";
import { PersonaV2Error } from "../../../src/domain/persona-v2/model.js";
import { trainingSource } from "../../helpers/persona-v2-training.js";

const fixture = (human = true) => {
  const crypto = new NodeCryptoAdapter("a".repeat(64));
  let now = new Date("2026-10-10T12:00:00Z");
  let authorized = true;
  let authorityHash = "a".repeat(64);
  let activeOwner = true;
  let ownerId = "client-owner";
  const identity = {
    personaId: trainingSource.personaId,
    tokenId: randomUUID(),
    personaVersion: 1,
    tokenVersion: 1,
  };
  const owner = { id: randomUUID(), hubOrigin: "https://hub.test", hubClientId: "client-owner" };
  const persona = {
    id: identity.personaId,
    ownerId: owner.id,
    active: true,
    authorizationVersion: 1,
  };
  const services = {
    crypto,
    now: () => now,
    sessions: new MemoryAdministrativeSessions(crypto),
    ownerAuth: {
      hubOrigin: owner.hubOrigin,
      profile: async () => ({ clientId: ownerId, active: activeOwner }),
    },
    repository: {
      transaction: async (_locks: unknown, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ findPersona: async () => persona }),
    },
  } as unknown as PersonaServices;
  const sessionId = services.sessions.create({
    owner,
    accessToken: "server-only",
    expiresAt: new Date(now.getTime() + 15 * 60_000),
  });
  let operations = new Map<string, StoredSqlOperation>();
  let approvals = new Map<string, OwnerApproval>();
  const invalidations = vi.fn(() => Promise.resolve());
  const structuralSuspensions = vi.fn(() => Promise.resolve());
  const assertAuthorized = async () => {
    if (!authorized) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Revogado.");
  };
  const tx: SqlOperationStoreTransaction = {
    assertOwner: async (_personaId, id) => {
      if (id !== persona.ownerId)
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Responsável divergente.");
    },
    assertAuthorized,
    list: async (personaId, afterId) =>
      [...operations.values()]
        .filter((o) => o.personaId === personaId && (!afterId || o.id > afterId))
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, 51),
    assertAuthority: async (o) => {
      if (o.authorizationHash !== authorityHash)
        throw new PersonaV2Error("STALE_AUTHORIZATION", "Mudou.");
    },
    find: async (personaId, id) => {
      const o = operations.get(id);
      return o?.personaId === personaId ? structuredClone(o) : null;
    },
    insert: async (o) => {
      operations.set(o.id, structuredClone(o));
    },
    approval: async (_p, id) => approvals.get(id) ?? null,
    approve: async (_p, a) => {
      if (approvals.has(a.operationId)) throw new Error("duplicate");
      approvals.set(a.operationId, a);
    },
    save: async (o, v) => {
      if (operations.get(o.id)?.version !== v)
        throw new PersonaV2Error("OPERATION_CONFLICT", "CAS");
      operations.set(o.id, structuredClone(o));
    },
    invalidatePhysicalSource: invalidations,
    suspendStructuralPublication: structuralSuspensions,
    recordReconciliation: async (o, evidence) => {
      if (operations.get(o.id)?.version !== o.version) throw new Error("CAS");
      operations.set(
        o.id,
        structuredClone({ ...o, version: o.version + 1, reconciliation: evidence }),
      );
    },
  };
  let tail = Promise.resolve();
  const store: SqlOperationStorePort = {
    transaction: async (_identity, fn) => {
      const predecessor = tail;
      let release!: () => void;
      tail = new Promise<void>((r) => {
        release = r;
      });
      await predecessor;
      const before = structuredClone(operations),
        beforeApprovals = structuredClone(approvals);
      try {
        return await fn(tx);
      } catch (error) {
        operations = before;
        approvals = beforeApprovals;
        throw error;
      } finally {
        release();
      }
    },
  };
  const gateway: SqlOperationGatewayPort = {
    verifyCapabilitiesAndPolicy: vi.fn(() => Promise.resolve()),
    execute: vi.fn(async (_source, command) => ({
      operationId: command.operationId,
      fingerprint: command.fingerprint,
      state: "concluida" as const,
      executionId: randomUUID(),
      directlyAffectedRows: 1,
      completedAt: now.toISOString(),
    })),
    get: vi.fn(async () => null),
    cancel: vi.fn(() => Promise.resolve()),
  };
  const read = vi.fn(async (_sql: string, params: Record<string, unknown>) => ({
    columns: ["operation_marker"],
    rows: [{ operation_marker: params.operation_id }],
    truncated: false,
  }));
  const revalidateRead = vi.fn(() => Promise.resolve());
  let reconciliationStructure: ExpectedStructure | undefined;
  const service = new PersonaSqlOperations(
    services,
    new PersonaAdministration(services),
    {
      authorize: async () => {
        await assertAuthorized();
        return {
          ownerId: owner.id,
          source: trainingSource,
          requireHumanApproval: human,
          authorizationHash: authorityHash,
          reconciliationQuery: (id) => ({
            ...(reconciliationStructure ? { expectedStructure: reconciliationStructure } : {}),
            table: "operation_ledger",
            column: "operation_id",
            sql: 'SELECT "operation_id" AS "operation_marker" FROM "operation_ledger" WHERE "operation_id" = :operation_id',
            params: { operation_id: { type: "uuid", value: id } },
          }),
          command: (id, input) => ({
            operationId: id,
            fingerprint: crypto.sha256Hex(JSON.stringify({ id, input })),
            database: trainingSource.database,
            maxAffectedRows: 1,
            timeoutMs: 1000,
            steps: [
              {
                id: "update",
                effect: "update",
                sql: "UPDATE synthetic SET amount=:amount WHERE id=:id",
                params: { amount: { kind: "value", scalar: { type: "decimal", value: "12.00" } } },
                affectedRows: { min: 1, max: 1 },
                outputs: {},
              },
            ],
          }),
        };
      },
    },
    store,
    gateway,
    { authorize: async () => ({ execute: read, revalidate: revalidateRead }) },
  );
  const prepare = () =>
    service.prepare(identity, { publicationId: randomUUID(), input: { amount: "12.00" } });
  const approve = async (r: Awaited<ReturnType<typeof prepare>>) =>
    service.approve(sessionId, identity.personaId, {
      operationId: r.operationId,
      fingerprint: r.fingerprint,
    });
  const reference = (r: Awaited<ReturnType<typeof prepare>>) => ({
    operationId: r.operationId,
    fingerprint: r.fingerprint,
  });
  return {
    service,
    identity,
    services,
    gateway,
    read,
    revalidateRead,
    setReconciliationStructure: (value: ExpectedStructure) => {
      reconciliationStructure = value;
    },
    prepare,
    approve,
    reference,
    invalidations,
    structuralSuspensions,
    sessionId,
    operations: () => operations,
    approvals: () => approvals,
    expire: () => {
      now = new Date(now.getTime() + 15 * 60_000);
    },
    revoke: () => {
      authorized = false;
    },
    changeAuthority: () => {
      authorityHash = "b".repeat(64);
    },
    deactivateOwner: () => {
      activeOwner = false;
    },
    switchOwner: () => {
      ownerId = "other-owner";
    },
  };
};

describe("preparação, aprovação e dispatch de lançamentos", () => {
  it("encaminha a expectativa estrutural do marcador à conexão de conciliação, sem reenviar DML", async () => {
    const f = fixture(false);
    vi.mocked(f.gateway.execute).mockImplementation(async (_source, command) => ({
      operationId: command.operationId,
      fingerprint: command.fingerprint,
      executionId: randomUUID(),
      state: "resultado_desconhecido",
      directlyAffectedRows: null,
      completedAt: f.services.now().toISOString(),
    }));
    const prepared = await f.prepare();
    await f.service.execute(f.identity, f.reference(prepared));
    const structure: ExpectedStructure = {
      version: 1,
      resources: [
        {
          resource: { schema: null, name: "operation_ledger", type: "table" },
          columns: [
            { name: "operation_id", nativeType: "uuid", nullable: false, size: null, scale: null },
          ],
          constraints: {
            primaryKeys: [{ name: "ledger_pk", columns: ["operation_id"], status: "enabled" }],
            uniqueKeys: [],
            foreignKeys: [],
          },
        },
      ],
    };
    f.setReconciliationStructure(structure);
    const result = await f.service.reconcile(f.identity, f.reference(prepared));
    expect(result.reconciliation?.classification).toBe("aplicacao_verificada");
    expect(f.read).toHaveBeenCalledWith(
      expect.any(String),
      { operation_id: prepared.operationId },
      { maxRows: 2, timeoutMs: 10000 },
      structure,
    );
    expect(f.gateway.execute).toHaveBeenCalledTimes(1);
  });
  it("persiste e entrega motivo seguro sem converter recusa em novo dispatch", async () => {
    const f = fixture(false);
    vi.mocked(f.gateway.execute).mockImplementation(async (_source, command) => ({
      operationId: command.operationId,
      fingerprint: command.fingerprint,
      executionId: randomUUID(),
      state: "cancelada",
      directlyAffectedRows: null,
      completedAt: f.services.now().toISOString(),
      failureCode: "SOURCE_STRUCTURE_MISMATCH",
    }));
    const prepared = await f.prepare();
    const result = await f.service.execute(f.identity, f.reference(prepared));
    expect(result.receipt?.failureCode).toBe("SOURCE_STRUCTURE_MISMATCH");
    expect((await f.service.get(f.identity, f.reference(prepared))).receipt).toEqual(
      result.receipt,
    );
    await expect(f.service.execute(f.identity, f.reference(prepared))).rejects.toThrow();
    expect(f.gateway.execute).toHaveBeenCalledTimes(1);
    expect(f.structuralSuspensions).toHaveBeenCalledOnce();
  });
  it("persiste a recusa estrutural antes de bloquear a publicação e sua entrega", async () => {
    const f = fixture(false);
    f.structuralSuspensions.mockImplementation(async () => {
      f.changeAuthority();
    });
    vi.mocked(f.gateway.execute).mockImplementation(async (_source, command) => ({
      operationId: command.operationId,
      fingerprint: command.fingerprint,
      executionId: randomUUID(),
      state: "cancelada",
      directlyAffectedRows: null,
      completedAt: f.services.now().toISOString(),
      failureCode: "SOURCE_STRUCTURE_MISMATCH",
    }));
    const prepared = await f.prepare();
    await expect(f.service.execute(f.identity, f.reference(prepared))).rejects.toThrow("Mudou");
    expect(f.operations().get(prepared.operationId)?.receipt?.failureCode).toBe(
      "SOURCE_STRUCTURE_MISMATCH",
    );
    expect(f.operations().get(prepared.operationId)?.state).toBe("cancelada");
    await expect(f.service.execute(f.identity, f.reference(prepared))).rejects.toThrow();
    expect(f.gateway.execute).toHaveBeenCalledTimes(1);
  });
  it("lista preparações para o responsável sem revelar payload e recusa sessão revogada", async () => {
    const f = fixture(true);
    const prepared = await f.prepare();
    const result = await f.service.list(f.sessionId, f.identity.personaId);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]?.operationId).toBe(prepared.operationId);
    expect(JSON.stringify(result)).not.toContain("UPDATE");
    expect(JSON.stringify(result)).not.toContain("payloadEnc");
    f.deactivateOwner();
    await expect(f.service.list(f.sessionId, f.identity.personaId)).rejects.toThrow();
  });

  it("concilia marcador treinado sem reenviar nem fabricar confirmação do agente", async () => {
    const f = fixture(false),
      p = await f.prepare();
    vi.mocked(f.gateway.execute).mockRejectedValueOnce(new Error("Lost confirmation"));
    const unknown = await f.service.execute(f.identity, f.reference(p));
    expect(unknown.state).toBe("resultado_desconhecido");
    const result = await f.service.reconcile(f.identity, f.reference(p));
    expect(result.state).toBe("resultado_desconhecido");
    expect(result.reconciliation?.classification).toBe("aplicacao_verificada");
    expect(result.receipt?.directlyAffectedRows).toBeNull();
    expect(f.gateway.execute).toHaveBeenCalledOnce();
    expect(f.read).toHaveBeenCalledOnce();
    await expect(f.service.execute(f.identity, f.reference(p))).rejects.toThrow();
    expect(JSON.stringify(result.reconciliation)).not.toContain("SELECT");
  });
  it.each(["absent", "duplicate", "truncated"])(
    "evidência %s mantém resultado inconclusivo e não infere rollback",
    async (kind) => {
      const f = fixture(false),
        p = await f.prepare();
      vi.mocked(f.gateway.execute).mockRejectedValueOnce(new Error("Lost confirmation"));
      await f.service.execute(f.identity, f.reference(p));
      f.read.mockResolvedValueOnce({
        columns: ["operation_marker"],
        rows:
          kind === "absent"
            ? []
            : Array.from({ length: kind === "duplicate" ? 2 : 1 }, () => ({
                operation_marker: p.operationId,
              })),
        truncated: kind === "truncated",
      });
      const result = await f.service.reconcile(f.identity, f.reference(p));
      expect(result.state).toBe("resultado_desconhecido");
      expect(result.reconciliation?.classification).toBe("inconclusiva");
      expect(f.gateway.execute).toHaveBeenCalledOnce();
    },
  );
  it("revogação durante conciliação bloqueia registro e entrega da evidência", async () => {
    const f = fixture(false),
      p = await f.prepare();
    vi.mocked(f.gateway.execute).mockRejectedValueOnce(new Error("Lost confirmation"));
    await f.service.execute(f.identity, f.reference(p));
    f.read.mockImplementationOnce(async () => {
      f.revoke();
      return {
        columns: ["operation_marker"],
        rows: [{ operation_marker: p.operationId }],
        truncated: false,
      };
    });
    await expect(f.service.reconcile(f.identity, f.reference(p))).rejects.toThrow();
    expect(f.operations().get(p.operationId)?.reconciliation).toBeUndefined();
  });
  it("recusa conciliação antes de dispatch e não aceita chave/SQL enviados pelo consumidor", async () => {
    const f = fixture(false),
      p = await f.prepare();
    await expect(f.service.reconcile(f.identity, f.reference(p))).rejects.toThrow();
    await expect(
      f.service.reconcile(f.identity, { ...f.reference(p), sql: "SELECT 1" }),
    ).rejects.toThrow();
    expect(f.read).not.toHaveBeenCalled();
  });
  it("confirmação concorrente pelo journal prevalece sobre conciliação ainda em leitura", async () => {
    const f = fixture(false),
      p = await f.prepare();
    vi.mocked(f.gateway.execute).mockRejectedValueOnce(new Error("Lost confirmation"));
    await f.service.execute(f.identity, f.reference(p));
    vi.mocked(f.gateway.get).mockResolvedValueOnce({
      operationId: p.operationId,
      fingerprint: p.fingerprint,
      executionId: "journal-proof",
      state: "concluida",
      directlyAffectedRows: 1,
      completedAt: f.services.now().toISOString(),
    });
    f.read.mockImplementationOnce(async () => {
      await f.service.get(f.identity, f.reference(p));
      return { columns: ["operation_marker"], rows: [], truncated: false };
    });
    const result = await f.service.reconcile(f.identity, f.reference(p));
    expect(result.state).toBe("concluida");
    expect(result.receipt?.executionId).toBe("journal-proof");
    expect(result.reconciliation).toBeNull();
    expect(f.gateway.execute).toHaveBeenCalledOnce();
  });
  it("cifra conteúdo, não envia SQL ao preparar e não retorna entradas", async () => {
    const f = fixture();
    const r = await f.prepare();
    expect(r.state).toBe("aprovacao_pendente");
    expect(f.gateway.execute).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain("12.00");
    expect(f.operations().get(r.operationId)!.payloadEnc).not.toContain("UPDATE");
    expect(f.services.crypto.decrypt(f.operations().get(r.operationId)!.payloadEnc!)).toContain(
      "UPDATE",
    );
  });
  it("responsável autenticado aprova o conteúdo exato; IA não fornece booleano", async () => {
    const f = fixture();
    const r = await f.prepare();
    await expect(f.service.execute(f.identity, f.reference(r))).rejects.toThrow();
    await expect(
      f.service.approve(f.sessionId, f.identity.personaId, { ...f.reference(r), approved: true }),
    ).rejects.toThrow();
    const approved = await f.approve(r);
    expect(approved.state).toBe("aprovada");
    expect(f.approvals().get(r.operationId)?.fingerprint).toBe(r.fingerprint);
    expect((await f.service.execute(f.identity, f.reference(r))).state).toBe("concluida");
    expect(f.invalidations).toHaveBeenCalledOnce();
  });
  it.each(["deactivateOwner", "switchOwner"] as const)(
    "bloqueia aprovação após %s",
    async (action) => {
      const f = fixture();
      const r = await f.prepare();
      f[action]();
      await expect(f.approve(r)).rejects.toThrow();
      expect(f.approvals().size).toBe(0);
    },
  );
  it("não reaproveita aprovação, fingerprint ou conteúdo alterado", async () => {
    const f = fixture();
    const r = await f.prepare();
    await f.approve(r);
    await expect(f.approve(r)).rejects.toThrow();
    await expect(
      f.service.execute(f.identity, { ...f.reference(r), fingerprint: "c".repeat(64) }),
    ).rejects.toThrow();
    await expect(
      f.service.execute(f.identity, { ...f.reference(r), input: { amount: 1 } }),
    ).rejects.toThrow();
    expect(f.gateway.execute).not.toHaveBeenCalled();
  });
  it("expiração exige nova preparação", async () => {
    const f = fixture(false);
    const r = await f.prepare();
    f.expire();
    await expect(f.service.execute(f.identity, f.reference(r))).rejects.toThrow("expirada");
    expect(f.gateway.execute).not.toHaveBeenCalled();
  });
  it("mudança de fonte/publicação/permissão invalida a preparação", async () => {
    const f = fixture(false);
    const r = await f.prepare();
    f.changeAuthority();
    await expect(f.service.execute(f.identity, f.reference(r))).rejects.toThrow("mudaram");
    expect(f.gateway.execute).not.toHaveBeenCalled();
  });
  it("recusa agente sem capability antes de reivindicar execução", async () => {
    const f = fixture(false);
    const r = await f.prepare();
    vi.mocked(f.gateway.verifyCapabilitiesAndPolicy).mockRejectedValue(
      new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Agente antigo"),
    );
    await expect(f.service.execute(f.identity, f.reference(r))).rejects.toThrow("Agente antigo");
    expect(f.operations().get(r.operationId)!.state).toBe("preparada");
    expect(f.gateway.execute).not.toHaveBeenCalled();
  });
  it("duas execuções concorrentes enviam exatamente um dispatch", async () => {
    const f = fixture(false);
    const r = await f.prepare();
    const results = await Promise.allSettled([
      f.service.execute(f.identity, f.reference(r)),
      f.service.execute(f.identity, f.reference(r)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(f.gateway.execute).toHaveBeenCalledOnce();
  });
  it("perda de confirmação conserva resultado desconhecido e impede reenvio", async () => {
    const f = fixture(false);
    const r = await f.prepare();
    vi.mocked(f.gateway.execute).mockRejectedValue(new Error("commit confirmation lost"));
    expect((await f.service.execute(f.identity, f.reference(r))).state).toBe(
      "resultado_desconhecido",
    );
    await expect(f.service.execute(f.identity, f.reference(r))).rejects.toThrow("reenviada");
    expect(f.gateway.execute).toHaveBeenCalledOnce();
    expect(f.invalidations).toHaveBeenCalledOnce();
  });
  it("recibo incompatível não é apresentado como sucesso", async () => {
    const f = fixture(false);
    const r = await f.prepare();
    vi.mocked(f.gateway.execute).mockImplementation(async (_s, c) => ({
      operationId: "other",
      fingerprint: c.fingerprint,
      state: "concluida",
      executionId: "x",
      directlyAffectedRows: 1,
      completedAt: new Date().toISOString(),
    }));
    expect((await f.service.execute(f.identity, f.reference(r))).state).toBe(
      "resultado_desconhecido",
    );
  });
  it.each([null, -1, 2])("não confirma escrita com contagem inválida %s", async (count) => {
    const f = fixture(false);
    const r = await f.prepare();
    const execute = vi.mocked(f.gateway.execute).getMockImplementation()!;
    vi.mocked(f.gateway.execute).mockImplementation(async (s, c) => ({
      ...(await execute(s, c)),
      directlyAffectedRows: count,
    }));
    expect((await f.service.execute(f.identity, f.reference(r))).state).toBe(
      "resultado_desconhecido",
    );
  });
  it.each(["rollback_confirmado", "cancelada"] as const)(
    "recusa comprovante %s com contagem de escrita confirmada",
    async (state) => {
      const f = fixture(false);
      const r = await f.prepare();
      const execute = vi.mocked(f.gateway.execute).getMockImplementation()!;
      vi.mocked(f.gateway.execute).mockImplementation(async (s, c) => ({
        ...(await execute(s, c)),
        state,
        directlyAffectedRows: 1,
      }));
      expect((await f.service.execute(f.identity, f.reference(r))).state).toBe(
        "resultado_desconhecido",
      );
    },
  );
  it("cancelamento durante envio não promete rollback e pode terminar em commit", async () => {
    const f = fixture(false);
    const r = await f.prepare();
    let started!: () => void;
    let complete!: () => void;
    const sending = new Promise<void>((resolve) => {
      started = resolve;
    });
    const finishing = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const execute = vi.mocked(f.gateway.execute).getMockImplementation()!;
    vi.mocked(f.gateway.execute).mockImplementation(async (s, c) => {
      started();
      await finishing;
      return execute(s, c);
    });
    const executing = f.service.execute(f.identity, f.reference(r));
    await sending;
    expect((await f.service.cancel(f.identity, f.reference(r))).state).toBe(
      "cancelamento_solicitado",
    );
    expect(f.gateway.cancel).toHaveBeenCalledOnce();
    complete();
    expect((await executing).state).toBe("concluida");
  });
  it("persiste comprovante após revogação durante execução, mas bloqueia entrega", async () => {
    const f = fixture(false);
    const r = await f.prepare();
    const execute = vi.mocked(f.gateway.execute).getMockImplementation()!;
    vi.mocked(f.gateway.execute).mockImplementation(async (s, c) => {
      const receipt = await execute(s, c);
      f.revoke();
      return receipt;
    });
    await expect(f.service.execute(f.identity, f.reference(r))).rejects.toThrow("Revogado");
    expect(f.operations().get(r.operationId)!.receipt?.state).toBe("concluida");
  });
  it("isola token e concessão OAuth mesmo dentro da persona", async () => {
    const f = fixture(false);
    const r = await f.prepare();
    await expect(
      f.service.get({ ...f.identity, tokenId: randomUUID() }, f.reference(r)),
    ).rejects.toThrow();
    await expect(
      f.service.get({ ...f.identity, grant: { id: randomUUID() } }, f.reference(r)),
    ).rejects.toThrow();
  });
  it("cancelamento antes do envio não chama agente nem permite execução posterior", async () => {
    const f = fixture();
    const r = await f.prepare();
    expect((await f.service.cancel(f.identity, f.reference(r))).state).toBe("cancelada");
    expect(f.gateway.cancel).not.toHaveBeenCalled();
    await expect(f.service.execute(f.identity, f.reference(r))).rejects.toThrow();
  });
  it("consulta de journal durante execução prevalece sobre confirmação perdida sem novo execute", async () => {
    const f = fixture(false);
    const r = await f.prepare();
    let sent!: () => void, release!: () => void;
    const dispatched = new Promise<void>((resolve) => {
      sent = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(f.gateway.execute).mockImplementation(async () => {
      sent();
      await waiting;
      throw new Error("lost confirmation");
    });
    const executing = f.service.execute(f.identity, f.reference(r));
    await dispatched;
    vi.mocked(f.gateway.get).mockResolvedValue({
      operationId: r.operationId,
      fingerprint: r.fingerprint,
      state: "concluida",
      executionId: randomUUID(),
      directlyAffectedRows: 1,
      completedAt: new Date().toISOString(),
    });
    try {
      expect((await f.service.get(f.identity, f.reference(r))).state).toBe("concluida");
    } finally {
      release();
    }
    expect((await executing).state).toBe("concluida");
    expect(f.gateway.execute).toHaveBeenCalledTimes(1);
  });
  it("revisão humana mostra conteúdo sem colocá-lo no resumo consumidor", async () => {
    const f = fixture();
    const r = await f.prepare();
    expect(
      (await f.service.review(f.sessionId, f.identity.personaId, r.operationId)).command,
    ).toMatchObject({ operationId: r.operationId });
    f.switchOwner();
    await expect(
      f.service.review(f.sessionId, f.identity.personaId, r.operationId),
    ).rejects.toThrow();
  });
});
