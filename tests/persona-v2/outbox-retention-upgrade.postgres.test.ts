import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { PostgresPersonaEphemeralWorker } from "../../src/infrastructure/persistence/persona-v2/ephemeral-worker.js";
import { PersonaEphemeralWorker } from "../../src/application/persona-v2/ephemeral-worker.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";

const url = new URL(personaV2TestDatabaseUrl());
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const name = `persona_outbox_upgrade_${randomUUID().replaceAll("-", "")}_test`;
url.pathname = `/${name}`;
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const db = new pg.Pool({ connectionString: url.toString() });
const directory = fileURLToPath(new URL("../../migrations/persona-v2/", import.meta.url));
let created = false;
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
});
afterAll(async () => {
  await db.end();
  if (created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
});

it("upgrade conserva histórico, inicia prazo conservador e limpa cifras sem rearmar", async () => {
  await db.query(
    "CREATE TABLE _persona_v2_migrations(filename text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz DEFAULT now())",
  );
  for (const file of readdirSync(directory)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && f < "0041")
    .sort()) {
    const sql = readFileSync(`${directory}/${file}`, "utf8");
    await db.query(sql);
    await db.query("INSERT INTO _persona_v2_migrations(filename,checksum) VALUES($1,$2)", [
      file,
      createHash("sha256").update(sql).digest("hex"),
    ]);
  }
  const owner = randomUUID(),
    persona = randomUUID();
  await db.query(
    "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,'https://fixture.test','fixture')",
    [owner],
  );
  await db.query(
    "INSERT INTO persona(id,responsavel_id,nome,especialidade) VALUES($1,$2,'Fixture','Fixture')",
    [persona, owner],
  );
  const crypto = new NodeCryptoAdapter("01".repeat(32));
  const terminal = randomUUID(),
    pending = randomUUID(),
    historical = randomUUID();
  for (const [id, state] of [
    [terminal, "dead_letter"],
    [pending, "pendente"],
  ] as const) {
    await db.query(
      `INSERT INTO outbox_v2(id,persona_id,evento,aggregate_ids,estado,notification_version,event_key,metadata,destino_enc,segredo_enc,created_at)
       VALUES($1,$2,'sql.operation_state',ARRAY[$1::uuid],$3,1,$1::text,
        jsonb_build_object('operationId',$1::text,'state','resultado_desconhecido','version',1),$4,$5,now()-interval '200 days')`,
      [
        id,
        persona,
        state,
        crypto.encrypt("https://fixture.test"),
        crypto.encrypt("fixture-secret"),
      ],
    );
  }
  await db.query(
    `INSERT INTO outbox_v2(id,persona_id,evento,aggregate_ids,estado,destino_enc,segredo_enc)
     VALUES($1,$2,'historic',ARRAY[$1::uuid],'pendente','historic-destination','historic-secret')`,
    [historical, persona],
  );
  const before = (await db.query<{ time: Date }>("SELECT clock_timestamp() AS time")).rows[0]!.time;
  await applyPersonaMigrations(url.toString());
  await applyPersonaMigrations(url.toString());
  const row = (
    await db.query<{ terminal_recorded_at: Date; metadata: { state: string } }>(
      "SELECT terminal_recorded_at,metadata FROM outbox_v2 WHERE id=$1",
      [terminal],
    )
  ).rows[0]!;
  expect(row.terminal_recorded_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
  expect(row.metadata.state).toBe("resultado_desconhecido");
  const worker = new PersonaEphemeralWorker(
    new PostgresPersonaEphemeralWorker(db),
    randomUUID(),
    () => new Date(),
  );
  expect((await worker.runOnce()).deleted?.outboxMetadata).toBe(0);
  await db.query("UPDATE outbox_v2 SET estado=estado WHERE id=$1", [terminal]);
  expect(
    (await db.query("SELECT terminal_recorded_at FROM outbox_v2 WHERE id=$1", [terminal])).rows[0]
      .terminal_recorded_at,
  ).toEqual(row.terminal_recorded_at);
  await expect(
    db.query("UPDATE outbox_v2 SET notification_version=1 WHERE id=$1", [historical]),
  ).rejects.toThrow("Historic outbox");
  // Age only the disposable fixture, restoring the runtime guard immediately.
  await db.query("ALTER TABLE outbox_v2 DISABLE TRIGGER notification_outbox_integrity");
  try {
    await db.query(
      "UPDATE outbox_v2 SET terminal_recorded_at=now()-interval '91 days' WHERE id=$1",
      [terminal],
    );
  } finally {
    await db.query("ALTER TABLE outbox_v2 ENABLE TRIGGER notification_outbox_integrity");
  }
  expect((await worker.runOnce()).deleted?.outboxMetadata).toBe(1);
  expect(
    (
      await db.query("SELECT estado,metadata,destino_enc,segredo_enc FROM outbox_v2 WHERE id=$1", [
        terminal,
      ])
    ).rows[0],
  ).toEqual({
    estado: "dead_letter",
    metadata: {},
    destino_enc: null,
    segredo_enc: null,
  });
  expect(
    (
      await db.query("SELECT terminal_recorded_at,metadata_removed_at FROM outbox_v2 WHERE id=$1", [
        pending,
      ])
    ).rows[0],
  ).toEqual({
    terminal_recorded_at: null,
    metadata_removed_at: null,
  });
});
