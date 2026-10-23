import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { PostgresPersonaEphemeralWorker } from "../../src/infrastructure/persistence/persona-v2/ephemeral-worker.js";
import { PersonaEphemeralWorker } from "../../src/application/persona-v2/ephemeral-worker.js";
import { PersonaVaultRotation } from "../../src/application/persona-v2/vault-rotation.js";
import { PostgresPersonaVaultRotationStore } from "../../src/infrastructure/persistence/persona-v2/vault-rotation.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { PERSONA_VAULT_TARGETS } from "../../src/domain/persona-v2/vault-rotation.js";

const url = new URL(personaV2TestDatabaseUrl()),
  adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const name = `persona_outbox_rotation_${randomUUID().replaceAll("-", "")}_test`;
url.pathname = `/${name}`;
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const db = new pg.Pool({ connectionString: url.toString() });
let created = false;
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  await applyPersonaMigrations(url.toString());
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='persona_v2_vault_operator') THEN CREATE ROLE persona_v2_vault_operator NOLOGIN; END IF; END $$",
  );
});
afterAll(async () => {
  await db.end();
  if (created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
});

it("limpeza pula linha em rotação, remove depois e impede restauração por CAS obsoleto", async () => {
  const owner = randomUUID(),
    persona = randomUUID(),
    terminal = randomUUID(),
    pending = randomUUID();
  await db.query(
    "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,'https://fixture.test','fixture')",
    [owner],
  );
  await db.query(
    "INSERT INTO persona(id,responsavel_id,nome,especialidade) VALUES($1,$2,'Fixture','Fixture')",
    [persona, owner],
  );
  const old = new NodeCryptoAdapter("01".repeat(32));
  const next = new NodeCryptoAdapter("02".repeat(32), "next", { primary: "01".repeat(32) });
  for (const [id, state] of [
    [terminal, "entregue"],
    [pending, "pendente"],
  ] as const) {
    await db.query(
      `INSERT INTO outbox_v2(id,persona_id,evento,aggregate_ids,estado,notification_version,event_key,metadata,destino_enc,segredo_enc)
       VALUES($1,$2,'sql.operation_state',ARRAY[$1::uuid],$3,1,$1::text,
       jsonb_build_object('operationId',$1::text,'state','concluida','version',1),$4,$5)`,
      [id, persona, state, old.encrypt("https://fixture.test"), old.encrypt("fixture-secret")],
    );
  }
  await db.query("ALTER TABLE outbox_v2 DISABLE TRIGGER notification_outbox_integrity");
  try {
    await db.query(
      "UPDATE outbox_v2 SET terminal_recorded_at=now()-interval '91 days' WHERE id=$1",
      [terminal],
    );
  } finally {
    await db.query("ALTER TABLE outbox_v2 ENABLE TRIGGER notification_outbox_integrity");
  }
  const worker = new PersonaEphemeralWorker(
    new PostgresPersonaEphemeralWorker(db),
    randomUUID(),
    () => new Date(),
  );
  const store = new PostgresPersonaVaultRotationStore(url.toString());
  const target = PERSONA_VAULT_TARGETS.find((t) => t.table === "outbox_v2")!;
  const runId = await store.exclusive(async (session) => {
    const job = await session.transaction(false, (unit) =>
      unit.start("next", next.keyFingerprints()),
    );
    const captured = await session.transaction(false, async (unit) => {
      const rows = await unit.scan(target, null, 100, true);
      expect(rows).toHaveLength(2);
      // A different DB connection must skip the locked eligible record, not wait or clear it.
      expect((await worker.runOnce()).deleted?.outboxMetadata).toBe(0);
      for (const row of rows) {
        await unit.rewrap(job, target, row, {
          destino_enc: next.encrypt(next.decrypt(String(row.content.destino_enc))),
          segredo_enc: next.encrypt(next.decrypt(String(row.content.segredo_enc))),
        });
      }
      return (await unit.scan(target, null, 100, true)).find((r) => r.key.id === terminal)!;
    });
    expect((await worker.runOnce()).deleted?.outboxMetadata).toBe(1);
    await expect(
      session.transaction(false, (unit) =>
        unit.rewrap(job, target, captured, {
          destino_enc: next.encrypt("https://fixture.test"),
          segredo_enc: next.encrypt("fixture-secret"),
        }),
      ),
    ).rejects.toThrow("changed concurrently");
    return job.id;
  });
  const resumed = await new PersonaVaultRotation(store, next).run({
    apply: true,
    keyId: "next",
    confirmDatabase: name,
    resumeId: runId,
  });
  expect(resumed.status).toBe("completed");
  expect(
    (
      await db.query("SELECT metadata,destino_enc,segredo_enc,estado FROM outbox_v2 WHERE id=$1", [
        terminal,
      ])
    ).rows[0],
  ).toEqual({
    metadata: {},
    destino_enc: null,
    segredo_enc: null,
    estado: "entregue",
  });
  const remaining = (
    await db.query<{ segredo_enc: string; estado: string }>(
      "SELECT segredo_enc,estado FROM outbox_v2 WHERE id=$1",
      [pending],
    )
  ).rows[0]!;
  expect(next.decrypt(remaining.segredo_enc)).toBe("fixture-secret");
  expect(remaining.estado).toBe("pendente");
});
