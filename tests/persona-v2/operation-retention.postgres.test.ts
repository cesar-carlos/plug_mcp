import { randomUUID, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { PersonaRetentionWorker } from "../../src/application/persona-v2/retention-worker.js";
import { PostgresPersonaRetentionWorker } from "../../src/infrastructure/persistence/persona-v2/retention-worker.js";
import { PostgresExternalActions } from "../../src/infrastructure/persistence/persona-v2/external-actions.js";
import { PostgresSqlOperationStore } from "../../src/infrastructure/persistence/persona-v2/sql-operations.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";

const url = new URL(personaV2TestDatabaseUrl());
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const name = `persona_retention_${randomUUID().replaceAll("-", "")}_test`;
url.pathname = `/${name}`;
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const db = new pg.Pool({ connectionString: url.toString() });
const port = new PostgresPersonaRetentionWorker(db);
const worker = () => new PersonaRetentionWorker(port, randomUUID(), () => new Date());
const hash = () => createHash("sha256").update(randomUUID()).digest("hex");
const persona = randomUUID(),
  token = randomUUID(),
  source = randomUUID(),
  integration = randomUUID();
const sqlSkill = randomUUID(),
  extSkill = randomUUID(),
  sqlPublication = randomUUID(),
  extPublication = randomUUID();
const identity = { personaId: persona, tokenId: token, personaVersion: 1, tokenVersion: 1 };
type Table = "operacao_v2" | "external_action_v2";
interface RetentionRow extends Record<string, unknown> {
  terminal_at: Date | null;
  payload_purge_at: Date | null;
}
const upgradeRows: { table: Table; id: string; before: Record<string, unknown> }[] = [];
let migrationStarted: number;

beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  const directory = fileURLToPath(new URL("../../migrations/persona-v2/", import.meta.url));
  const c = await db.connect();
  try {
    await c.query(
      "CREATE TABLE _persona_v2_migrations(filename text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const filename of readdirSync(directory)
      .filter((f) => /^\d{4}_.*\.sql$/.test(f) && f < "0029_")
      .sort()) {
      const sql = readFileSync(`${directory}/${filename}`, "utf8");
      await c.query("BEGIN");
      await c.query(sql);
      await c.query("INSERT INTO _persona_v2_migrations(filename,checksum) VALUES($1,$2)", [
        filename,
        createHash("sha256").update(sql).digest("hex"),
      ]);
      await c.query("COMMIT");
    }
  } finally {
    c.release();
  }
  const owner = randomUUID(),
    physical = randomUUID(),
    credential = randomUUID();
  await db.query(
    "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,'https://hub.fixture.test','retention-owner')",
    [owner],
  );
  await db.query(
    "INSERT INTO persona(id,responsavel_id,nome,especialidade) VALUES($1,$2,'Fixture','SQL')",
    [persona, owner],
  );
  await db.query(
    "INSERT INTO persona_token(id,persona_id,nome,token_hash,permissoes,delegacao) VALUES($1,$2,'Fixture',$3,'{}','{}')",
    [token, persona, hash()],
  );
  await db.query("INSERT INTO fonte_fisica(id,identity_hash) VALUES($1,$2)", [physical, hash()]);
  await db.query(
    "INSERT INTO fonte_credencial(id,persona_id,email_enc,senha_enc,client_token_enc) VALUES($1,$2,'fixture-cipher','fixture-cipher','fixture-cipher')",
    [credential, persona],
  );
  await db.query(
    "INSERT INTO fonte(id,persona_id,fonte_fisica_id,credencial_id,agent_id,banco,dialeto,nome,finalidade,ambiente) VALUES($1,$2,$3,$4,$5,'fixture','postgres','Fixture','Teste','test')",
    [source, persona, physical, credential, randomUUID()],
  );
  await db.query(
    "INSERT INTO integracao(id,persona_id,nome,tipo,destino,credencial_enc) VALUES($1,$2,'Fixture','rest','https://fixture.example.com','fixture-cipher')",
    [integration, persona],
  );
  for (const [id, pub, kind] of [
    [sqlSkill, sqlPublication, "operacao_sql"],
    [extSkill, extPublication, "acao_externa"],
  ] as const) {
    await db.query(
      "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,$3,$4,'Fixture','{}')",
      [id, persona, kind.replaceAll("_", "-"), kind],
    );
    await db.query(
      "INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash) VALUES($1,$2,$3,1,'{}',$4)",
      [pub, persona, id, hash()],
    );
  }
  for (const table of ["operacao_v2", "external_action_v2"] as const) {
    for (const state of ["concluida", "resultado_desconhecido"]) {
      const id = await seed(table, state);
      upgradeRows.push({ table, id, before: await row(table, id) });
    }
  }
  migrationStarted = Date.now();
  await applyPersonaMigrations(url.toString());
  await applyPersonaMigrations(url.toString());
});
afterAll(async () => {
  await db.end();
  await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
});

/** Storage-only synthetic contracts: never executes SQL or calls an external service. */
async function seed(table: Table, state = "concluida") {
  const id = randomUUID(),
    fingerprint = hash();
  const receipt = {
    operationId: id,
    fingerprint,
    state,
    executionId: randomUUID(),
    directlyAffectedRows: 1,
    completedAt: new Date().toISOString(),
  };
  if (table === "operacao_v2") {
    await db.query(
      `INSERT INTO operacao_v2(id,persona_id,token_id,publicacao_id,fonte_id,fingerprint,
      authorization_snapshot,estado,expires_at,payload_enc,comprovante)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '15 minutes','fixture-payload',$9)`,
      [
        id,
        persona,
        token,
        sqlPublication,
        source,
        fingerprint,
        JSON.stringify({ identity, hash: hash() }),
        state,
        JSON.stringify(receipt),
      ],
    );
  } else {
    await db.query(
      `INSERT INTO external_action_v2(id,persona_id,token_id,skill_id,publicacao_id,integracao_id,
      fingerprint,identity_snapshot,authorization_hash,estado,exige_aprovacao,expires_at,claimed_at,payload_enc,result_enc,comprovante)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,now()+interval '15 minutes',now(),'fixture-payload','fixture-result',$11)`,
      [
        id,
        persona,
        token,
        extSkill,
        extPublication,
        integration,
        fingerprint,
        JSON.stringify(identity),
        hash(),
        state,
        JSON.stringify(receipt),
      ],
    );
  }
  return id;
}
async function row(table: Table, id: string) {
  return (await db.query<RetentionRow>(`SELECT * FROM ${table} WHERE id=$1`, [id])).rows[0]!;
}
/** Fixture operator ages metadata under a table lock; runtime has no clock override or aging API. */
async function age(table: Table, id: string, days: number) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query(`ALTER TABLE ${table} DISABLE TRIGGER a_operation_retention`);
    await c.query(
      `UPDATE ${table} SET terminal_at=CASE WHEN estado IN ('resultado_desconhecido','executando','aprovada') THEN NULL ELSE clock_timestamp()-$2*interval '1 day' END,
      payload_purge_at=clock_timestamp()-$2*interval '1 day'+interval '24 hours',versao=versao+1 WHERE id=$1`,
      [id, days],
    );
    await c.query(`ALTER TABLE ${table} ENABLE TRIGGER a_operation_retention`);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

it("upgrade aditivo preserva unknown byte a byte e inicia relógio conservador para terminais antigos", async () => {
  for (const { table, id, before } of upgradeRows) {
    const after = await row(table, id);
    for (const key of ["id", "fingerprint", "payload_enc", "comprovante", "estado"])
      expect(after[key]).toEqual(before[key]);
    if (before.estado === "resultado_desconhecido") {
      for (const [key, value] of Object.entries(before)) expect(after[key]).toEqual(value);
      expect(after.terminal_at).toBeNull();
      expect(after.versao).toBe(before.versao);
    } else {
      expect(after.terminal_at?.getTime() ?? 0).toBeGreaterThanOrEqual(migrationStarted - 1000);
      expect((after.payload_purge_at?.getTime() ?? 0) - (after.terminal_at?.getTime() ?? 0)).toBe(
        86400000,
      );
    }
  }
});

it("24h remove payload/result em conjunto, 90 dias remove comprovante e conserva tombstone/metadata", async () => {
  for (const table of ["operacao_v2", "external_action_v2"] as const) {
    const id = await seed(table);
    await age(table, id, 2);
    const before = await row(table, id);
    await worker().runOnce();
    const contentExpired = await row(table, id);
    expect(contentExpired.payload_enc).toBeNull();
    if (table === "external_action_v2") expect(contentExpired.result_enc).toBeNull();
    expect(contentExpired.payload_purged_at).toBeInstanceOf(Date);
    expect(contentExpired.comprovante).toEqual(before.comprovante);
    expect(contentExpired.receipt_purged_at).toBeNull();
    await expect(
      db.query(`UPDATE ${table} SET comprovante=NULL,versao=versao+1 WHERE id=$1`, [id]),
    ).rejects.toThrow("not elapsed");
    await age(table, id, 91);
    await worker().runOnce();
    const expired = await row(table, id);
    expect(expired.comprovante).toBeNull();
    expect(expired.receipt_purged_at).toBeInstanceOf(Date);
    for (const key of ["id", "fingerprint", "persona_id", "token_id", "publicacao_id", "estado"])
      expect(expired[key]).toEqual(before[key]);
    await expect(db.query(`DELETE FROM ${table} WHERE id=$1`, [id])).rejects.toThrow("permanent");
    await expect(
      db.query(`INSERT INTO ${table} SELECT * FROM ${table} WHERE id=$1`, [id]),
    ).rejects.toThrow();
    await expect(
      db.query(`UPDATE ${table} SET payload_enc='restored',versao=versao+1 WHERE id=$1`, [id]),
    ).rejects.toThrow("cannot be restored");
    await expect(
      db.query(`UPDATE ${table} SET comprovante='{}',versao=versao+1 WHERE id=$1`, [id]),
    ).rejects.toThrow("cannot be restored");
    await expect(
      db.query(`UPDATE ${table} SET estado='preparada',versao=versao+1 WHERE id=$1`, [id]),
    ).rejects.toThrow("Invalid");
    if (table === "operacao_v2") {
      const store = new PostgresSqlOperationStore(
        db,
        new NodeCryptoAdapter("a".repeat(64)),
        () => new Date(),
      );
      expect(
        (await store.transaction(identity, (tx) => tx.find(persona, id)))?.retention
          ?.receiptPurgedAt,
      ).toBeTruthy();
    } else {
      const c = await db.connect();
      try {
        expect(
          (await new PostgresExternalActions(c).find(persona, id))?.retention?.receiptPurgedAt,
        ).toBeTruthy();
      } finally {
        c.release();
      }
    }
  }
  const again = await worker().runOnce();
  expect(again.purged).toEqual({
    sqlPayloads: 0,
    externalPayloads: 0,
    sqlReceipts: 0,
    externalReceipts: 0,
  });
});

it("desconhecido/em execução preservam conteúdo mesmo com timer antigo; resolver inicia novo prazo", async () => {
  for (const table of ["operacao_v2", "external_action_v2"] as const) {
    for (const state of ["resultado_desconhecido", "executando"]) {
      const id = await seed(table, state);
      await age(table, id, 100);
      const before = await row(table, id);
      await worker().runOnce();
      expect(await row(table, id)).toEqual(before);
      await expect(
        db.query(`UPDATE ${table} SET payload_enc=NULL,versao=versao+1 WHERE id=$1`, [id]),
      ).rejects.toThrow();
      if (table === "operacao_v2" && state === "resultado_desconhecido") {
        await db.query("UPDATE operacao_v2 SET estado='concluida',versao=versao+1 WHERE id=$1", [
          id,
        ]);
        const resolved = await row(table, id);
        expect(resolved.terminal_at?.getTime() ?? 0).toBeGreaterThan(Date.now() - 10000);
        await worker().runOnce();
        expect((await row(table, id)).payload_enc).toBe(before.payload_enc);
      }
    }
  }
});

it("prazo/markers não podem ser antecipados e relógio futuro do worker não remove conteúdo recente", async () => {
  for (const table of ["operacao_v2", "external_action_v2"] as const) {
    const id = await seed(table);
    await expect(
      db.query(
        `UPDATE ${table} SET terminal_at=now()-interval '100 days',versao=versao+1 WHERE id=$1`,
        [id],
      ),
    ).rejects.toThrow("immutable");
    await expect(
      db.query(
        `UPDATE ${table} SET payload_purge_at=now()-interval '1 second',versao=versao+1 WHERE id=$1`,
        [id],
      ),
    ).rejects.toThrow("immutable");
    await expect(
      db.query(
        `UPDATE ${table} SET payload_enc=NULL,${table === "external_action_v2" ? "result_enc=NULL," : ""}versao=versao+1 WHERE id=$1`,
        [id],
      ),
    ).rejects.toThrow("not elapsed");
    const before = await row(table, id);
    await new PersonaRetentionWorker(
      port,
      randomUUID(),
      () => new Date(Date.now() + 100 * 86400000),
    ).runOnce();
    expect(await row(table, id)).toEqual(before);
  }
});

it("lotes, locks, lease abandonado e rollback antes do commit não duplicam remoções", async () => {
  const ids: string[] = [];
  for (let i = 0; i < 102; i++) {
    const id = await seed("operacao_v2");
    await age("operacao_v2", id, 2);
    ids.push(id);
  }
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT id FROM operacao_v2 WHERE id=$1 FOR UPDATE", [ids[0]]);
    expect((await worker().runOnce()).purged?.sqlPayloads).toBe(100);
    await c.query("ROLLBACK");
  } finally {
    c.release();
  }
  expect((await worker().runOnce()).purged?.sqlPayloads).toBe(2);
  const dead = randomUUID(),
    next = randomUUID();
  await port.claim(dead, new Date(), new Date(Date.now() + 60000));
  expect((await worker().runOnce()).claimed).toBe(false);
  await db.query(
    "UPDATE persona_retention_worker_lease_v2 SET expires_at=now()-interval '1 second'",
  );
  expect(await port.claim(next, new Date(), new Date(Date.now() + 60000))).toBe(true);
  await port.release(dead);
  expect(
    (await db.query("SELECT owner FROM persona_retention_worker_lease_v2")).rows[0].owner,
  ).toBe(next);
  await port.release(next);
  const id = await seed("operacao_v2");
  await age("operacao_v2", id, 91);
  await db.query(`CREATE FUNCTION fixture_expire_retention() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN UPDATE persona_retention_worker_lease_v2 SET expires_at=clock_timestamp()-interval '1 second'; RETURN NEW; END $$;
    CREATE TRIGGER fixture_expire_retention AFTER UPDATE ON operacao_v2 FOR EACH ROW EXECUTE FUNCTION fixture_expire_retention()`);
  try {
    const before = await row("operacao_v2", id);
    await expect(worker().runOnce()).rejects.toThrow("expired before commit");
    expect(await row("operacao_v2", id)).toEqual(before);
  } finally {
    await db.query(
      "DROP TRIGGER fixture_expire_retention ON operacao_v2; DROP FUNCTION fixture_expire_retention()",
    );
  }
});

it("processo real do worker e instância concorrente removem uma vez; reinício conserva tombstone", async () => {
  const id = await seed("operacao_v2");
  await age("operacao_v2", id, 2);
  const cycle = async () => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/worker-persona-v2.ts"], {
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        NODE_ENV: "test",
        DATABASE_URL: url.toString(),
        MCP_ENCRYPTION_KEY: "a".repeat(64),
        PLUG_SERVER_BASE_URL: "https://hub.fixture.test",
        LOG_LEVEL: "info",
        PERSONA_V2_REVIEW_WORKER_INTERVAL_MS: "1000",
      },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const completed = new Promise<void>((resolve, reject) => {
        let output = "";
        timer = setTimeout(() => reject(new Error("Fixture worker cycle timed out")), 10000);
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          output = (output + chunk).slice(-10000);
          if (output.includes("persona retention worker completed")) resolve();
        });
        child.once("error", reject);
        child.once("exit", () => reject(new Error("Fixture worker exited before completion")));
      });
      await Promise.all([completed, worker().runOnce()]);
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill();
        await exited;
      }
    }
  };
  await cycle();
  const after = await row("operacao_v2", id);
  expect(after.payload_enc).toBeNull();
  expect(after.payload_purged_at).toBeInstanceOf(Date);
  await cycle();
  expect(await row("operacao_v2", id)).toEqual(after);
});
