import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { PersonaEphemeralWorker } from "../../src/application/persona-v2/ephemeral-worker.js";
import { PostgresPersonaEphemeralWorker } from "../../src/infrastructure/persistence/persona-v2/ephemeral-worker.js";

const url = new URL(personaV2TestDatabaseUrl());
const name = `persona_ephemeral_${randomUUID().replaceAll("-", "")}_test`;
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
url.pathname = `/${name}`;
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const db = new pg.Pool({ connectionString: url.toString() });
const port = new PostgresPersonaEphemeralWorker(db);
const worker = () => new PersonaEphemeralWorker(port, randomUUID(), () => new Date());
const hash = () => createHash("sha256").update(randomUUID()).digest("hex");
const past = new Date(Date.now() - 60000);
const future = new Date(Date.now() + 86400000);
let owner: string, persona: string, token: string, skill: string;

beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  await applyPersonaMigrations(url.toString());
  await applyPersonaMigrations(url.toString());
  owner = randomUUID();
  persona = randomUUID();
  token = randomUUID();
  skill = randomUUID();
  await db.query(
    "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,'https://hub.fixture.test','ephemeral-owner')",
    [owner],
  );
  await db.query(
    "INSERT INTO persona(id,responsavel_id,nome,especialidade) VALUES($1,$2,'Fixture','Sintética')",
    [persona, owner],
  );
  await db.query(
    "INSERT INTO persona_token(id,persona_id,nome,token_hash,permissoes,delegacao) VALUES($1,$2,'Fixture',$3,'{}','{}')",
    [token, persona, hash()],
  );
  await db.query(
    "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,'fixture','consulta','Fixture','{}')",
    [skill, persona],
  );
});
beforeEach(async () => {
  await db.query("DELETE FROM persona_ephemeral_worker_lease_v2");
  await db.query("DELETE FROM setup_v2");
  await db.query("DELETE FROM oauth_registro_v2");
  await db.query("DELETE FROM knowledge_review_preview_v2");
  await db.query("DELETE FROM publicacao_preview_v2");
});
afterAll(async () => {
  await db.end();
  await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
});

const setup = async (expiresAt: Date, consumed = false) => {
  const id = hash();
  await db.query(
    "INSERT INTO setup_v2(code_hash,persona_id,token_id,finalidade,csrf_hash,expires_at,consumed_at,contexto_enc) VALUES($1,$2,$3,'fixture',$4,$5,$6,'fixture-ciphertext')",
    [id, persona, token, hash(), expiresAt, consumed ? past : null],
  );
  return id;
};
const preview = async (expiresAt: Date) => {
  const id = hash();
  await db.query(
    `INSERT INTO publicacao_preview_v2(hash,persona_id,skill_id,responsavel_id,revisao,
      persona_version,pacote_hash,source_fingerprint,expires_at)
     VALUES($1,$2,$3,$4,1,1,$5,$6,$7)`,
    [id, persona, skill, owner, hash(), hash(), expiresAt],
  );
  await db.query("INSERT INTO knowledge_review_preview_v2(hash,plan) VALUES($1,'{}')", [id]);
  return id;
};

it("limpa metadados terminais vencidos sem rearmar notificações ou apagar deduplicação", async () => {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  for (const [index, id] of ids.entries()) {
    await db.query(
      `INSERT INTO outbox_v2(id,persona_id,evento,aggregate_ids,estado,notification_version,event_key,metadata)
       VALUES($1,$2,'sql.operation_state',ARRAY[$1::uuid],$3,1,$1::text,
        jsonb_build_object('operationId',$1::text,'state','concluida','version',1))`,
      [id, persona, index === 2 ? "pendente" : "entregue"],
    );
  }
  await expect(
    db.query("UPDATE outbox_v2 SET metadata='{}',metadata_removed_at=now() WHERE id=$1", [ids[1]]),
  ).rejects.toThrow("immutable");
  // Only this disposable database ages a record; the runtime cannot change its clock.
  await db.query("ALTER TABLE outbox_v2 DISABLE TRIGGER notification_outbox_integrity");
  try {
    await db.query(
      "UPDATE outbox_v2 SET terminal_recorded_at=clock_timestamp()-interval '91 days' WHERE id=$1",
      [ids[0]],
    );
  } finally {
    await db.query("ALTER TABLE outbox_v2 ENABLE TRIGGER notification_outbox_integrity");
  }
  const result = await worker().runOnce();
  expect(result.deleted?.outboxMetadata).toBe(1);
  const rows = await db.query(
    "SELECT id,metadata,metadata_removed_at,estado,event_key FROM outbox_v2 WHERE id=ANY($1)",
    [ids],
  );
  const expired = rows.rows.find((row) => row.id === ids[0]);
  expect(expired).toMatchObject({
    metadata: {},
    estado: "entregue",
    event_key: `sql.operation_state:${ids[0]}`,
  });
  expect(expired.metadata_removed_at).toBeInstanceOf(Date);
  expect(rows.rows.filter((row) => row.metadata_removed_at === null)).toHaveLength(2);
  expect((await worker().runOnce()).deleted?.outboxMetadata).toBe(0);
  await expect(
    db.query("UPDATE outbox_v2 SET estado='pendente' WHERE id=$1", [ids[0]]),
  ).rejects.toThrow("immutable");
  await expect(db.query("DELETE FROM outbox_v2 WHERE id=$1", [ids[0]])).rejects.toThrow(
    "permanent",
  );
  await expect(
    db.query(
      `INSERT INTO outbox_v2(id,persona_id,evento,aggregate_ids,estado,notification_version,event_key,metadata)
       VALUES($1,$2,'sql.operation_state',ARRAY[$3::uuid],'pendente',1,$3::text,
        jsonb_build_object('operationId',$3::text,'state','concluida','version',1))`,
      [randomUUID(), persona, ids[0]],
    ),
  ).rejects.toThrow("outbox_notification_event");
});

it("limpa só expirados, conserva prévia vigente e vínculos; próxima rodada é idempotente", async () => {
  await setup(past);
  await setup(past, true);
  const activeSetup = await setup(future, true);
  await preview(past);
  const activePreview = await preview(future);
  const orphan = hash();
  await db.query("INSERT INTO knowledge_review_preview_v2(hash,plan) VALUES($1,'{}')", [orphan]);
  const result = await worker().runOnce();
  expect(result.deleted).toMatchObject({ setups: 2, publicationPreviews: 1, reviewBindings: 2 });
  expect((await db.query("SELECT code_hash FROM setup_v2")).rows).toEqual([
    { code_hash: activeSetup },
  ]);
  expect((await db.query("SELECT hash FROM knowledge_review_preview_v2")).rows).toEqual([
    { hash: activePreview },
  ]);
  const again = await worker().runOnce();
  expect(Object.values(again.deleted!).every((n) => n === 0)).toBe(true);
  expect(
    (await db.query("SELECT revoked_at FROM persona_token WHERE id=$1", [token])).rows[0],
  ).toEqual({ revoked_at: null });
});

it("OAuth conserva código consumido e refresh da família vigente, mesmo após prazo do código", async () => {
  const liveGrant = randomUUID(),
    deadGrant = randomUUID();
  for (const [id, expiresAt] of [
    [liveGrant, future],
    [deadGrant, past],
  ] as const) {
    await db.query(
      "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,'{}','https://client.fixture.test',$4)",
      [id, persona, token, expiresAt],
    );
  }
  const liveCode = hash(),
    liveRefresh = hash();
  for (const [id, kind, grant, expiresAt, consumedAt] of [
    [liveCode, "code", liveGrant, past, past],
    [liveRefresh, "refresh_token", liveGrant, future, past],
    [hash(), "access_token", deadGrant, past, null],
    [hash(), "code", deadGrant, past, past],
    [hash(), "transaction", null, past, null],
  ] as const) {
    await db.query(
      "INSERT INTO oauth_registro_v2(id_hash,persona_id,concessao_id,tipo,expires_at,consumed_at,conteudo_enc) VALUES($1,$2,$3,$4,$5,$6,'fixture-ciphertext')",
      [id, grant ? persona : null, grant, kind, expiresAt, consumedAt],
    );
  }
  expect((await worker().runOnce()).deleted?.oauthRecords).toBe(3);
  expect((await db.query("SELECT id_hash FROM oauth_registro_v2 ORDER BY id_hash")).rows).toEqual(
    [liveCode, liveRefresh].sort().map((id_hash) => ({ id_hash })),
  );
  expect(
    (await db.query("SELECT id FROM oauth_concessao_v2 WHERE id=ANY($1)", [[liveGrant, deadGrant]]))
      .rowCount,
  ).toBe(2);
});

it("limita cada lote, ignora linhas bloqueadas e retoma após liberação", async () => {
  for (let i = 0; i < 102; i++) {
    await setup(past);
  }
  const locked = await db.connect();
  try {
    await locked.query("BEGIN");
    await locked.query("SELECT code_hash FROM setup_v2 ORDER BY code_hash LIMIT 1 FOR UPDATE");
    expect((await worker().runOnce()).deleted?.setups).toBe(100);
    expect((await db.query("SELECT count(*)::int n FROM setup_v2")).rows[0].n).toBe(2);
    await locked.query("ROLLBACK");
  } finally {
    locked.release();
  }
  expect((await worker().runOnce()).deleted?.setups).toBe(2);
});

it("duas instâncias respeitam o lease; proprietário antigo não libera lease retomado", async () => {
  await setup(past);
  const first = randomUUID(),
    second = randomUUID();
  expect(await port.claim(first, new Date(), future)).toBe(true);
  expect((await worker().runOnce()).claimed).toBe(false);
  await db.query("UPDATE persona_ephemeral_worker_lease_v2 SET expires_at=$1", [past]);
  expect(await port.claim(second, new Date(), future)).toBe(true);
  await port.release(first);
  expect(
    (await db.query("SELECT owner FROM persona_ephemeral_worker_lease_v2")).rows[0].owner,
  ).toBe(second);
  expect((await port.process(second, new Date())).setups).toBe(1);
  await port.release(second);
});

it("perda de validade antes do commit desfaz o lote inteiro", async () => {
  await setup(past);
  await db.query(`CREATE FUNCTION fixture_expire_lease() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN UPDATE persona_ephemeral_worker_lease_v2 SET expires_at=clock_timestamp()-interval '1 second'; RETURN OLD; END $$;
    CREATE TRIGGER fixture_expire_lease AFTER DELETE ON setup_v2 FOR EACH ROW EXECUTE FUNCTION fixture_expire_lease()`);
  try {
    await expect(worker().runOnce()).rejects.toThrow("expired before commit");
    expect((await db.query("SELECT count(*)::int n FROM setup_v2")).rows[0].n).toBe(1);
  } finally {
    await db.query(
      "DROP TRIGGER fixture_expire_lease ON setup_v2; DROP FUNCTION fixture_expire_lease()",
    );
  }
});
