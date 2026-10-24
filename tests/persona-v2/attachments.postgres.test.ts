import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { PostgresPersonaAttachments } from "../../src/infrastructure/persistence/persona-v2/attachments.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { PersonaEphemeralWorker } from "../../src/application/persona-v2/ephemeral-worker.js";
import { PostgresPersonaEphemeralWorker } from "../../src/infrastructure/persistence/persona-v2/ephemeral-worker.js";
import { PersonaVaultRotation } from "../../src/application/persona-v2/vault-rotation.js";
import { PostgresPersonaVaultRotationStore } from "../../src/infrastructure/persistence/persona-v2/vault-rotation.js";

const url = new URL(personaV2TestDatabaseUrl());
const name = `persona_attachments_${randomUUID().replaceAll("-", "")}_test`;
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
url.pathname = `/${name}`;
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const db = new pg.Pool({ connectionString: url.toString() });
const second = new pg.Pool({ connectionString: url.toString() });
const crypto = new NodeCryptoAdapter("a".repeat(64), "initial");
const origin = "https://attachments.fixture.test";
const store = (pool = db, base = origin, cipher = crypto) =>
  new PostgresPersonaAttachments(pool, cipher, base);
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  await applyPersonaMigrations(url.toString());
  await applyPersonaMigrations(url.toString());
});
beforeEach(async () => {
  await db.query("DELETE FROM persona_attachment_v2");
});
afterAll(async () => {
  await db.end();
  await second.end();
  await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
});

it("outra instância recupera cifra e prazo originais após fechar o armazenamento criador", async () => {
  const a = store(),
    b = store(second),
    until = Date.now() + 60000;
  const handle = await a.put("consumer", "private binary base64 or JSON", until);
  a.close();
  expect(await a.get(handle, "consumer")).toBeNull();
  expect(await b.get(handle, "consumer")).toBe("private binary base64 or JSON");
  b.close();
  const restarted = store();
  expect(await restarted.get(handle, "consumer")).toBe("private binary base64 or JSON");
  const row = (
    await db.query<{ expires_at: Date; payload_enc: string }>("SELECT * FROM persona_attachment_v2")
  ).rows[0]!;
  expect(row.expires_at.getTime()).toBe(until);
  expect(JSON.stringify(row)).not.toContain(handle);
  expect(JSON.stringify(row)).not.toContain("private binary");
  expect(row.payload_enc).toMatch(/^v2\.initial\./);
});

it("vínculo e origem isolam leitura e exclusão, inclusive após recuperação", async () => {
  const a = store(),
    b = store(second),
    foreign = store(second, "https://other.fixture.test");
  const handle = await a.put("consumer", "private", Date.now() + 60000);
  for (const binding of ["other token", "other persona", "new version", "other OAuth grant"]) {
    expect(await b.get(handle, binding)).toBeNull();
    await b.remove(handle, binding);
  }
  expect(await foreign.get(handle, "consumer")).toBeNull();
  await foreign.remove(handle, "consumer");
  expect(await b.get(handle, "consumer")).toBe("private");
  await b.remove(handle, "consumer");
  expect(await store().get(handle, "consumer")).toBeNull();
});

it("quota por consumidor é atômica entre conexões; não expulsa anexos válidos", async () => {
  const a = store(),
    b = store(second),
    until = Date.now() + 60000;
  const attempts = await Promise.allSettled(
    Array.from({ length: 16 }, (_, i) => (i % 2 ? a : b).put("consumer", `file-${i}`, until)),
  );
  const handles = attempts.filter((r) => r.status === "fulfilled").map((r) => r.value);
  expect(handles).toHaveLength(8);
  expect(attempts.filter((r) => r.status === "rejected")).toHaveLength(8);
  for (const handle of handles) expect(await b.get(handle, "consumer")).toMatch(/^file-/);
  await b.remove(handles[0]!, "consumer");
  expect(await a.put("consumer", "replacement", until)).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

it("quota global é compartilhada entre consumidores, não multiplicada por instância", async () => {
  const a = store(),
    b = store(second),
    until = Date.now() + 60000;
  const attempts = await Promise.allSettled(
    Array.from({ length: 70 }, (_, i) => (i % 2 ? a : b).put(`consumer-${i}`, "file", until)),
  );
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(64);
  expect(attempts.filter((r) => r.status === "rejected")).toHaveLength(6);
});

it("orçamento de bytes cifrados recusa excesso sem apagar o primeiro arquivo", async () => {
  const a = store(),
    until = Date.now() + 60000;
  const payload = "x".repeat(16 * 1024 * 1024);
  const first = await a.put("consumer", payload, until);
  await expect(store(second).put("consumer", payload, until)).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  expect(await store(second).get(first, "consumer")).toBe(payload);
  expect(
    (await db.query("SELECT count(*)::int AS count FROM persona_attachment_v2")).rows[0]!.count,
  ).toBe(1);
});

it("prazo expirado não renova na recuperação; dois workers limpam só expirados", async () => {
  const a = store(),
    until = Date.now() + 400;
  const expired = await a.put("consumer", "expired", until);
  const live = await a.put("consumer", "live", Date.now() + 60000);
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(await store(second).get(expired, "consumer")).toBeNull();
  const port = new PostgresPersonaEphemeralWorker(db);
  const results = await Promise.all(
    [1, 2].map(() => new PersonaEphemeralWorker(port, randomUUID(), () => new Date()).runOnce()),
  );
  expect(results.reduce((n, r) => n + (r.deleted?.attachments ?? 0), 0)).toBe(1);
  expect(await store(second).get(live, "consumer")).toBe("live");
  expect(await store().get(expired, "consumer")).toBeNull();
});

it("worker indisponível não permite acumular payloads expirados além da quota", async () => {
  const a = store(),
    until = Date.now() + 400;
  await Promise.all(Array.from({ length: 8 }, () => a.put("consumer", "expired", until)));
  await new Promise((resolve) => setTimeout(resolve, 500));
  await expect(store(second).put("consumer", "new", Date.now() + 60000)).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  expect(
    (await db.query("SELECT count(*)::int AS count FROM persona_attachment_v2")).rows[0]!.count,
  ).toBe(8);
  await new PersonaEphemeralWorker(
    new PostgresPersonaEphemeralWorker(db),
    randomUUID(),
    () => new Date(),
  ).runOnce();
  expect(await store(second).put("consumer", "new", Date.now() + 60000)).toMatch(
    /^[A-Za-z0-9_-]{43}$/,
  );
});

it("DB impede extensão do prazo/conteúdo; cópia da cifra não transfere o handle", async () => {
  const a = store(),
    handle = await a.put("consumer", "private", Date.now() + 60000);
  await expect(
    db.query("UPDATE persona_attachment_v2 SET expires_at=expires_at+interval '1 minute'"),
  ).rejects.toThrow(/immutable/);
  await expect(
    db.query("UPDATE persona_attachment_v2 SET scope_hash=$1", [crypto.sha256Hex("other")]),
  ).rejects.toThrow(/immutable/);
  const copied = crypto.randomToken(32);
  await db.query(
    "INSERT INTO persona_attachment_v2(handle_hash,namespace,scope_hash,expires_at,payload_enc) SELECT $1,namespace,scope_hash,expires_at,payload_enc FROM persona_attachment_v2 WHERE handle_hash=$2",
    [crypto.sha256Hex(copied), crypto.sha256Hex(handle)],
  );
  expect(await store(second).get(copied, "consumer")).toBeNull();
  expect(await a.get(handle, "consumer")).toBe("private");
  const wrongKey = new NodeCryptoAdapter("b".repeat(64), "initial");
  expect(await store(second, origin, wrongKey).get(handle, "consumer")).toBeNull();
  expect(await a.get(handle, "consumer")).toBe("private");
});

it("falha de persistência recusa sem fallback local e sem recuperação automática", async () => {
  const pool = new pg.Pool({ connectionString: url.toString() });
  const a = store(pool);
  await pool.end();
  await expect(a.put("consumer", "file", Date.now() + 60000)).rejects.toThrow(/indisponível/);
  await expect(a.get(crypto.randomToken(32), "consumer")).rejects.toThrow(/indisponível/);
  expect((await db.query("SELECT * FROM persona_attachment_v2")).rowCount).toBe(0);
});

it("fechar durante a espera pelo lock não publica nem conserva handle tardio", async () => {
  const blocker = await second.connect(),
    a = store();
  await blocker.query("BEGIN");
  await blocker.query("SELECT pg_advisory_xact_lock(19370009)");
  const pending = a.put("consumer", "late", Date.now() + 60000);
  const refused = expect(pending).rejects.toThrow(/indisponível/);
  try {
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=19370009 AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",
            )
          ).rows[0]!.waiting,
      )
      .toBe(1);
    a.close();
    await blocker.query("COMMIT");
    await refused;
    expect((await db.query("SELECT * FROM persona_attachment_v2")).rowCount).toBe(0);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
});

it("isolation incompatível não contorna o guard de quota", async () => {
  const client = await db.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await expect(
      client.query(
        "INSERT INTO persona_attachment_v2(handle_hash,namespace,scope_hash,expires_at,payload_enc) VALUES($1,$2,$2,clock_timestamp()+interval '1 minute',$3)",
        [crypto.sha256Hex(randomUUID()), crypto.sha256Hex("consumer"), crypto.encrypt("fixture")],
      ),
    ).rejects.toThrow(/read committed/);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

it("rotação com simulação/retomada preserva handle, prazo e isolamento", async () => {
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='persona_v2_vault_operator') THEN CREATE ROLE persona_v2_vault_operator NOLOGIN; END IF; END $$",
  );
  const a = store(),
    until = Date.now() + 60000;
  const handle = await a.put("consumer", "private", until);
  const rotated = new NodeCryptoAdapter("b".repeat(64), "rotated", { initial: "a".repeat(64) });
  const rotation = new PersonaVaultRotation(
    new PostgresPersonaVaultRotationStore(url.toString()),
    rotated,
  );
  expect(await rotation.run({ apply: false, keyId: "rotated" })).toMatchObject({ changed: 1 });
  const paused = await rotation.run({
    apply: true,
    keyId: "rotated",
    confirmDatabase: name,
    maxBatches: 1,
  });
  expect(paused.status).toBe("running");
  expect(
    await rotation.run({
      apply: true,
      keyId: "rotated",
      confirmDatabase: name,
      resumeId: paused.runId,
    }),
  ).toMatchObject({ status: "completed", changed: 1 });
  const recovered = store(second, origin, new NodeCryptoAdapter("b".repeat(64), "rotated"));
  expect(await recovered.get(handle, "consumer")).toBe("private");
  expect(await recovered.get(handle, "other OAuth grant")).toBeNull();
  expect(
    (
      await db.query<{ expires_at: Date }>("SELECT expires_at FROM persona_attachment_v2")
    ).rows[0]!.expires_at.getTime(),
  ).toBe(until);
  await expect(a.put("consumer", "old writer", until)).rejects.toThrow(/indisponível/);
});
