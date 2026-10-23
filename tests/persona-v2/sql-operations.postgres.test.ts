import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { PostgresPersonaRepository } from "../../src/infrastructure/persistence/persona-v2/repository.js";
import { PostgresSqlOperationStore } from "../../src/infrastructure/persistence/persona-v2/sql-operations.js";
import { canonicalJson } from "../../src/domain/persona-v2/catalog.js";
import { sourceFingerprint } from "../../src/application/persona-v2/query-training.js";
import { operationAuthorizationHash } from "../../src/domain/persona-v2/operation-authorization.js";
import type { StoredSqlOperation } from "../../src/domain/ports/sql-operation-store.port.js";
import { transitionOperation } from "../../src/domain/persona-v2/operation.js";
import { compileOperationTraining } from "../../src/application/persona-v2/operation-training.js";
import { operationTraining } from "../helpers/persona-v2-operation.js";
import { PersonaEphemeralWorker } from "../../src/application/persona-v2/ephemeral-worker.js";
import { PostgresPersonaEphemeralWorker } from "../../src/infrastructure/persistence/persona-v2/ephemeral-worker.js";

const base = new URL(personaV2TestDatabaseUrl());
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const databaseName = `persona_operations_${randomUUID().replaceAll("-", "")}_test`;
const crypto = new NodeCryptoAdapter("a".repeat(64));
let db: pg.Pool;
let repository: PostgresPersonaRepository;
let store: PostgresSqlOperationStore;
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  await applyPersonaMigrations(url.toString());
  db = new pg.Pool({ connectionString: url.toString() });
  repository = new PostgresPersonaRepository(db);
  store = new PostgresSqlOperationStore(db, crypto, () => new Date());
});
afterAll(async () => {
  await db?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
});

/** Seed only a synthetic immutable contract to test storage; not a publication runner or DML homologation. */
const fixture = async () => {
  const ownerId = randomUUID(),
    personaId = randomUUID(),
    tokenId = randomUUID(),
    sourceId = randomUUID(),
    physicalId = randomUUID(),
    credentialId = randomUUID(),
    skillId = randomUUID(),
    publicationId = randomUUID();
  const identity = { personaId, tokenId, tokenVersion: 1, personaVersion: 1 };
  const permissions = {
    sourceIds: [sourceId],
    skills: [
      {
        skillId,
        capabilities: ["write:synthetic.amount"],
        effects: ["update"],
        requireHumanApproval: true,
      },
    ],
    externalOperationIds: [],
    administrative: [],
  };
  await db.query(
    "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,'https://fixture.test',$2)",
    [ownerId, randomUUID()],
  );
  await db.query(
    "INSERT INTO persona(id,responsavel_id,nome,especialidade) VALUES($1,$2,'Fixture','SQL')",
    [personaId, ownerId],
  );
  await db.query("INSERT INTO fonte_fisica(id,identity_hash) VALUES($1,$2)", [
    physicalId,
    crypto.sha256Hex(randomUUID()),
  ]);
  await db.query(
    "INSERT INTO fonte_credencial(id,persona_id,email_enc,senha_enc,client_token_enc) VALUES($1,$2,$3,$3,$3)",
    [credentialId, personaId, crypto.encrypt("fixture-only")],
  );
  await db.query(
    "INSERT INTO fonte(id,persona_id,fonte_fisica_id,credencial_id,agent_id,banco,dialeto,nome,finalidade,ambiente) VALUES($1,$2,$3,$4,$5,'synthetic','postgres','Fixture','Test','test')",
    [sourceId, personaId, physicalId, credentialId, randomUUID()],
  );
  await db.query(
    "INSERT INTO persona_token(id,persona_id,nome,token_hash,permissoes,delegacao) VALUES($1,$2,'Fixture',$3,$4,$4)",
    [tokenId, personaId, crypto.sha256Hex(randomUUID()), JSON.stringify(permissions)],
  );
  await db.query(
    "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,'synthetic','operacao_sql','Fixture','{}')",
    [skillId, personaId],
  );
  const initialState = (await repository.authorization(identity))!;
  const source = initialState.sources[0]!;
  const pkg = compileOperationTraining(operationTraining(sourceId), source, crypto, "Fixture");
  permissions.skills[0]!.capabilities = [...pkg.requiredCapabilities];
  await db.query("UPDATE persona_token SET permissoes=$2,delegacao=$2 WHERE id=$1", [
    tokenId,
    JSON.stringify(permissions),
  ]);
  const hash = crypto.sha256Hex(canonicalJson(pkg));
  await db.query(
    "INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash) VALUES($1,$2,$3,1,$4,$5)",
    [publicationId, personaId, skillId, JSON.stringify(pkg), hash],
  );
  const state = (await repository.authorization(identity))!;
  await db.query(
    "INSERT INTO publicacao_fonte(persona_id,publicacao_id,fonte_id,fonte_version,source_fingerprint) VALUES($1,$2,$3,1,$4)",
    [personaId, publicationId, sourceId, sourceFingerprint(source, crypto)],
  );
  await db.query("UPDATE skill_v2 SET publicacao_ativa_id=$2 WHERE id=$1", [
    skillId,
    publicationId,
  ]);
  const operation: StoredSqlOperation = {
    id: randomUUID(),
    personaId,
    tokenId,
    sourceId,
    publicationId,
    identity,
    authorizationHash: operationAuthorizationHash(identity, state, hash, source, crypto),
    fingerprint: crypto.sha256Hex(randomUUID()),
    state: "aprovacao_pendente",
    requireHumanApproval: true,
    expiresAt: new Date(Date.now() + 900000),
    version: 1,
    payloadEnc: crypto.encrypt("synthetic operational content"),
    receipt: null,
  };
  await store.transaction(identity, async (tx) => {
    await tx.assertAuthorized(identity);
    await tx.assertAuthority(operation);
    await tx.insert(operation);
  });
  return {
    identity,
    operation,
    ownerId,
    sourceId,
    physicalId,
    personaId,
    tokenId,
    publicationId,
    source,
  };
};

it("persiste preparação cifrada e auditoria somente de metadados", async () => {
  const f = await fixture();
  expect(
    (await store.transaction(f.identity, (tx) => tx.find(f.personaId, f.operation.id)))?.payloadEnc,
  ).toBe(f.operation.payloadEnc);
  const audit = (await db.query("SELECT * FROM audit_v2 WHERE operacao_id=$1", [f.operation.id]))
    .rows;
  expect(audit).toHaveLength(1);
  expect(JSON.stringify(audit)).not.toContain("synthetic operational content");
  expect(JSON.stringify(audit)).not.toContain(f.operation.payloadEnc);
  expect(
    await store.transaction({ ...f.identity, personaId: randomUUID() }, (tx) =>
      tx.find(randomUUID(), f.operation.id),
    ),
  ).toBeNull();
});
it("aprovação e conteúdo são imutáveis no banco", async () => {
  const f = await fixture();
  await store.transaction(f.identity, async (tx) => {
    await tx.approve(f.personaId, {
      operationId: f.operation.id,
      ownerId: f.ownerId,
      fingerprint: f.operation.fingerprint,
      expiresAt: f.operation.expiresAt,
    });
    await tx.save({ ...f.operation, ...transitionOperation(f.operation, "aprovada") }, 1);
  });
  await expect(
    db.query("UPDATE operacao_v2 SET fingerprint=$2 WHERE id=$1", [f.operation.id, "c".repeat(64)]),
  ).rejects.toThrow("Immutable");
  await expect(
    db.query("UPDATE operacao_v2 SET payload_enc='replacement' WHERE id=$1", [f.operation.id]),
  ).rejects.toThrow("Immutable");
  await expect(
    db.query("UPDATE aprovacao_v2 SET fingerprint=$2 WHERE operacao_id=$1", [
      f.operation.id,
      "c".repeat(64),
    ]),
  ).rejects.toThrow();
  await expect(
    db.query("DELETE FROM aprovacao_v2 WHERE operacao_id=$1", [f.operation.id]),
  ).rejects.toThrow("immutable");
});
it("recusa aprovação de outra conta Client e prazo ampliado", async () => {
  const f = await fixture();
  const other = randomUUID();
  await db.query(
    "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,'https://fixture.test',$2)",
    [other, randomUUID()],
  );
  await expect(
    store.transaction(f.identity, (tx) =>
      tx.approve(f.personaId, {
        operationId: f.operation.id,
        ownerId: other,
        fingerprint: f.operation.fingerprint,
        expiresAt: f.operation.expiresAt,
      }),
    ),
  ).rejects.toThrow("mismatch");
  await expect(
    store.transaction(f.identity, (tx) =>
      tx.approve(f.personaId, {
        operationId: f.operation.id,
        ownerId: f.ownerId,
        fingerprint: f.operation.fingerprint,
        expiresAt: new Date(f.operation.expiresAt.getTime() + 1),
      }),
    ),
  ).rejects.toThrow("mismatch");
});
it("claim concorrente por CAS preserva um único executor e estado desconhecido irreversível", async () => {
  const f = await fixture();
  const approved = { ...f.operation, ...transitionOperation(f.operation, "aprovada") };
  await store.transaction(f.identity, (tx) => tx.save(approved, 1));
  const executing = { ...approved, ...transitionOperation(approved, "executando") };
  const results = await Promise.allSettled([
    store.transaction(f.identity, (tx) => tx.save(executing, 2)),
    store.transaction(f.identity, (tx) => tx.save(executing, 2)),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const unknown = {
    ...executing,
    ...transitionOperation(executing, "resultado_desconhecido"),
    receipt: {
      operationId: executing.id,
      fingerprint: executing.fingerprint,
      executionId: randomUUID(),
      state: "resultado_desconhecido" as const,
      directlyAffectedRows: null,
      completedAt: new Date().toISOString(),
      failureCode: "SQL_OPERATION_INTERRUPTED" as const,
    },
  };
  await store.transaction(f.identity, (tx) => tx.save(unknown, 3));
  const stored = await db.query("SELECT * FROM operacao_v2 WHERE id=$1", [unknown.id]);
  await new PersonaEphemeralWorker(
    new PostgresPersonaEphemeralWorker(db),
    randomUUID(),
    () => new Date(),
  ).runOnce();
  expect((await db.query("SELECT * FROM operacao_v2 WHERE id=$1", [unknown.id])).rows).toEqual(
    stored.rows,
  );
  expect(
    (await store.transaction(f.identity, (tx) => tx.find(f.personaId, unknown.id)))?.receipt,
  ).toEqual(unknown.receipt);
  expect(
    (
      await db.query(
        "SELECT sucesso FROM audit_v2 WHERE operacao_id=$1 AND evento='operacao_resultado_desconhecido'",
        [f.operation.id],
      )
    ).rows[0].sucesso,
  ).toBe(false);
  await expect(
    db.query("UPDATE operacao_v2 SET estado='preparada',versao=versao+1 WHERE id=$1", [
      f.operation.id,
    ]),
  ).rejects.toThrow("Invalid operation transition");
});
it("alteração de credencial, publicação ou permissão bloqueia autoridade", async () => {
  const f = await fixture();
  await db.query("UPDATE fonte_credencial SET versao=2 WHERE id=$1", [f.source.credentialId]);
  await expect(
    store.transaction(f.identity, (tx) => tx.assertAuthority(f.operation)),
  ).rejects.toThrow("alterada");
});
it("revogação e operação usam a mesma ordem de locks, sem ressuscitar o token", async () => {
  const f = await fixture();
  await repository.transaction({ personaIds: [f.personaId], tokenIds: [f.tokenId] }, (tx) =>
    tx.revokeToken(f.personaId, f.tokenId, new Date()),
  );
  await expect(
    store.transaction(f.identity, (tx) => tx.assertAuthorized(f.identity)),
  ).rejects.toThrow();
});
it("invalidação atinge identidade física compartilhada sem compartilhar payload", async () => {
  const f = await fixture();
  await store.transaction(f.identity, (tx) => tx.invalidatePhysicalSource(f.personaId, f.sourceId));
  expect(
    (
      await db.query("SELECT cache_revision::integer AS revision FROM fonte_fisica WHERE id=$1", [
        f.physicalId,
      ])
    ).rows[0].revision,
  ).toBe(2);
});

it("upgrade 0003→0004 preserva operações existentes e reaplica sem alteração", async () => {
  const f = await fixture();
  // This isolated metadata database has no reconciliation evidence yet.
  await db.query("DROP TABLE operacao_conciliacao_v2");
  await db.query("DROP FUNCTION check_operation_reconciliation()");
  await db.query(
    "DELETE FROM _persona_v2_migrations WHERE filename='0004_operation_reconciliation.sql'",
  );
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  await applyPersonaMigrations(url.toString());
  await applyPersonaMigrations(url.toString());
  expect(
    (await store.transaction(f.identity, (tx) => tx.find(f.personaId, f.operation.id)))
      ?.fingerprint,
  ).toBe(f.operation.fingerprint);
});

it("evidências são imutáveis e ordenadas pela versão, mesmo com relógio empatado", async () => {
  const f = await fixture();
  let current = { ...f.operation, ...transitionOperation(f.operation, "aprovada") };
  await store.transaction(f.identity, (tx) => tx.save(current, 1));
  current = { ...current, ...transitionOperation(current, "executando") };
  await store.transaction(f.identity, (tx) => tx.save(current, 2));
  current = { ...current, ...transitionOperation(current, "resultado_desconhecido") };
  await store.transaction(f.identity, (tx) => tx.save(current, 3));
  const evidence = {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    operationId: current.id,
    fingerprint: current.fingerprint,
    sourceId: current.sourceId,
    publicationId: current.publicationId,
    queryHash: "a".repeat(64),
    observedAt: new Date().toISOString(),
    complete: true,
    rows: 0,
    classification: "inconclusiva" as const,
  };
  await store.transaction(f.identity, (tx) => tx.recordReconciliation(current, evidence));
  current = (await store.transaction(f.identity, (tx) => tx.find(f.personaId, current.id)))!;
  const verified = {
    ...evidence,
    id: "00000000-0000-4000-8000-000000000001",
    classification: "aplicacao_verificada" as const,
    rows: 1,
  };
  await store.transaction(f.identity, (tx) => tx.recordReconciliation(current, verified));
  const found = await store.transaction(f.identity, (tx) => tx.find(f.personaId, current.id));
  expect(found?.reconciliation?.id).toBe(verified.id);
  expect(found?.state).toBe("resultado_desconhecido");
  await expect(
    db.query("UPDATE operacao_conciliacao_v2 SET evidencia='{}' WHERE id=$1", [verified.id]),
  ).rejects.toThrow();
  await expect(
    db.query("DELETE FROM operacao_conciliacao_v2 WHERE id=$1", [verified.id]),
  ).rejects.toThrow();
  await expect(
    store.transaction(f.identity, (tx) =>
      tx.recordReconciliation(found!, { ...verified, id: randomUUID(), sourceId: randomUUID() }),
    ),
  ).rejects.toThrow();
});

it("lista operações isoladas com cursor estável por identidade e confere o responsável", async () => {
  const f = await fixture(),
    other = await fixture();
  const rows = await store.transaction(f.identity, async (tx) => {
    await tx.assertOwner(f.personaId, f.ownerId);
    return tx.list(f.personaId);
  });
  expect(rows.map((row) => row.id)).toEqual([f.operation.id]);
  expect(await store.transaction(f.identity, (tx) => tx.list(f.personaId, f.operation.id))).toEqual(
    [],
  );
  await expect(
    store.transaction(f.identity, (tx) => tx.assertOwner(f.personaId, other.ownerId)),
  ).rejects.toThrow();
});
