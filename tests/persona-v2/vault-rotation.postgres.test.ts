import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { PostgresPersonaVaultRotationStore } from "../../src/infrastructure/persistence/persona-v2/vault-rotation.js";
import { PersonaVaultRotation } from "../../src/application/persona-v2/vault-rotation.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { PERSONA_VAULT_TARGETS } from "../../src/domain/persona-v2/vault-rotation.js";
import { assertPersonaVaultKeyring } from "../../src/infrastructure/persistence/persona-v2/vault-keyring.js";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { testConfig } from "../../src/config/env.js";

const base = new URL(personaV2TestDatabaseUrl());
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const cleanup: (() => Promise<void>)[] = [];
const old = new NodeCryptoAdapter("a".repeat(64), "initial");
const current = new NodeCryptoAdapter("b".repeat(64), "rotated", { initial: "a".repeat(64) });
beforeAll(async () => {
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='persona_v2_vault_operator') THEN CREATE ROLE persona_v2_vault_operator NOLOGIN; END IF; END $$",
  );
});
afterAll(async () => {
  for (const action of cleanup.reverse()) await action();
  await admin.end();
});

async function fixture() {
  const name = `persona_vault_${randomUUID().replaceAll("-", "")}_test`;
  const url = new URL(base);
  url.pathname = `/${name}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const db = new pg.Pool({ connectionString: url.toString() });
  cleanup.push(async () => {
    await db.end();
    await admin.query(`DROP DATABASE "${name}"`);
  });
  await applyPersonaMigrations(url.toString());
  await applyPersonaMigrations(url.toString());
  const owner = randomUUID(),
    persona = randomUUID(),
    token = randomUUID(),
    source = randomUUID(),
    credential = randomUUID(),
    physical = randomUUID(),
    integration = randomUUID(),
    skill = randomUUID(),
    publication = randomUUID();
  const secret = old.encrypt("fixture private value"),
    hash = old.sha256Hex(randomUUID());
  await db.query(
    "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,'https://hub.fixture.test','vault-owner')",
    [owner],
  );
  await db.query(
    "INSERT INTO persona(id,responsavel_id,nome,especialidade) VALUES($1,$2,'Fixture','SQL')",
    [persona, owner],
  );
  await db.query(
    "INSERT INTO persona_token(id,persona_id,nome,token_hash,permissoes,delegacao) VALUES($1,$2,'Fixture',$3,'{}','{}')",
    [token, persona, hash],
  );
  await db.query("INSERT INTO fonte_fisica(id,identity_hash) VALUES($1,$2)", [physical, hash]);
  await db.query(
    "INSERT INTO fonte_credencial(id,persona_id,email_enc,senha_enc,client_token_enc) VALUES($1,$2,$3,$3,$3)",
    [credential, persona, secret],
  );
  await db.query(
    "INSERT INTO fonte(id,persona_id,fonte_fisica_id,credencial_id,agent_id,banco,dialeto,nome,finalidade,ambiente) VALUES($1,$2,$3,$4,$5,'fixture','postgres','Fixture','Teste','test')",
    [source, persona, physical, credential, randomUUID()],
  );
  await db.query(
    "INSERT INTO integracao(id,persona_id,nome,tipo,destino,credencial_enc) VALUES($1,$2,'Fixture','rest','https://fixture.example.com',$3)",
    [integration, persona, secret],
  );
  await db.query(
    "INSERT INTO responsavel_delegacao_v2(persona_id,responsavel_id,hub_id,credential_enc,expires_at,version) VALUES($1,$2,$3,$4,now()+interval '30 days',1)",
    [persona, owner, randomUUID(), secret],
  );
  await db.query(
    "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,'fixture','operacao_sql','Fixture','{}')",
    [skill, persona],
  );
  await db.query(
    "INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash) VALUES($1,$2,$3,1,'{}',$4)",
    [publication, persona, skill, hash],
  );
  for (const state of ["resultado_desconhecido", "concluida"])
    await db.query(
      `INSERT INTO operacao_v2(id,persona_id,token_id,publicacao_id,fonte_id,fingerprint,authorization_snapshot,estado,expires_at,payload_enc,comprovante)
    VALUES($1,$2,$3,$4,$5,$6,'{}',$7,now()+interval '15 minutes',$8,'{}')`,
      [randomUUID(), persona, token, publication, source, hash, state, secret],
    );
  await db.query(
    `INSERT INTO external_action_v2(id,persona_id,token_id,skill_id,publicacao_id,integracao_id,fingerprint,identity_snapshot,authorization_hash,estado,exige_aprovacao,expires_at,claimed_at,payload_enc,result_enc,comprovante)
    VALUES($1,$2,$3,$4,$5,$6,$7,'{}',$7,'resultado_desconhecido',true,now()+interval '15 minutes',now(),$8,$8,'{}')`,
    [randomUUID(), persona, token, skill, publication, integration, hash, secret],
  );
  await db.query(
    "INSERT INTO outbox_v2(id,persona_id,evento,aggregate_ids,destino_enc,segredo_enc,estado) VALUES($1,$2,'fixture','{}',$3,$3,'pendente')",
    [randomUUID(), persona, secret],
  );
  await db.query(
    "INSERT INTO persona_notification_endpoint_v2(persona_id,owner_id,version,active,events,destino_enc,segredo_enc) VALUES($1,$2,1,false,ARRAY['knowledge.review_due'],$3,$3)",
    [persona, owner, secret],
  );
  await db.query(
    "INSERT INTO setup_v2(code_hash,persona_id,token_id,finalidade,csrf_hash,expires_at,consumed_at,contexto_enc) VALUES($1,$2,$3,'fixture',$1,now()+interval '15 minutes',now(),$4)",
    [hash, persona, token, secret],
  );
  await db.query(
    "INSERT INTO oauth_registro_v2(id_hash,tipo,expires_at,consumed_at,conteudo_enc) VALUES($1,'transaction',now()+interval '15 minutes',now(),$2)",
    [hash, secret],
  );
  const catalog = randomUUID(),
    library = randomUUID();
  await db.query(
    "INSERT INTO knowledge_catalog_v2(id,responsavel_id,nome) VALUES($1,$2,'Fixture')",
    [catalog, owner],
  );
  await db.query(
    "INSERT INTO knowledge_library_v2(id,catalog_id,slug,kind,version) VALUES($1,$2,'fixture','dataset',1)",
    [library, catalog],
  );
  await db.query(
    "INSERT INTO knowledge_library_version_v2(catalog_id,library_id,version,name,hash,owner_id,created_at,payload_enc) VALUES($1,$2,1,'Fixture',$3,$4,now(),$5)",
    [catalog, library, hash, owner, secret],
  );
  const store = new PostgresPersonaVaultRotationStore(url.toString());
  const rotation = new PersonaVaultRotation(store, current);
  const snapshot = async () => {
    const values: Record<string, Record<string, unknown>[]> = {};
    for (const t of PERSONA_VAULT_TARGETS)
      values[t.table] = (
        await db.query<{ row: Record<string, unknown> }>(
          `SELECT to_jsonb(t) AS row FROM ${t.table} t ORDER BY to_jsonb(t)`,
        )
      ).rows.map((r) => r.row);
    return values;
  };
  return { db, name, url, rotation, snapshot, credential, library };
}

it("simulação não modifica cifras, jobs ou chave ativa; aplicação em lotes preserva toda metadata e 15 campos", async () => {
  const f = await fixture(),
    before = await f.snapshot();
  const simulated = await f.rotation.run({ apply: false, keyId: "rotated", batchSize: 1 });
  expect(simulated).toMatchObject({
    mode: "simulation",
    status: "simulated",
    changed: 16,
    checked: 16,
  });
  expect(await f.snapshot()).toEqual(before);
  expect((await f.db.query("SELECT * FROM persona_vault_rotation_v2")).rowCount).toBe(0);
  expect((await f.db.query("SELECT * FROM persona_vault_active_key_v2")).rowCount).toBe(0);
  await expect(
    f.rotation.run({ apply: true, keyId: "rotated", confirmDatabase: "other" }),
  ).rejects.toThrow();
  const paused = await f.rotation.run({
    apply: true,
    keyId: "rotated",
    confirmDatabase: f.name,
    batchSize: 1,
    maxBatches: 1,
  });
  expect(paused).toMatchObject({ status: "running", checked: 3, changed: 3 });
  for (const kind of ["field", "cas"]) {
    const attempt = () =>
      new PostgresPersonaVaultRotationStore(f.url.toString()).exclusive((s) =>
        s.transaction(false, async (unit) => {
          const job = await unit.start("rotated", current.keyFingerprints(), paused.runId);
          const target = PERSONA_VAULT_TARGETS[0];
          const row = (await unit.scan(target, null, 1, true))[0]!;
          await unit.rewrap(
            job,
            target,
            kind === "cas" ? { ...row, content: { ...row.content, versao: 999 } } : row,
            kind === "field"
              ? { versao: current.encrypt("tampered") }
              : { senha_enc: current.encrypt("fixture private value") },
          );
        }),
      );
    await expect(attempt()).rejects.toThrow();
  }
  await expect(
    f.rotation.run({ apply: true, keyId: "rotated", confirmDatabase: f.name }),
  ).rejects.toThrow("resume");
  await expect(
    f.db.query("UPDATE fonte_credencial SET senha_enc=$1 WHERE id=$2", [
      old.encrypt("stale writer"),
      f.credential,
    ]),
  ).rejects.toThrow("active persona vault key");
  await expect(assertPersonaVaultKeyring(f.db, old, "initial")).rejects.toThrow();
  await expect(
    assertPersonaVaultKeyring(f.db, new NodeCryptoAdapter("b".repeat(64), "rotated"), "rotated"),
  ).rejects.toThrow();
  await assertPersonaVaultKeyring(f.db, current, "rotated");
  const complete = await f.rotation.run({
    apply: true,
    keyId: "rotated",
    confirmDatabase: f.name,
    resumeId: paused.runId,
    batchSize: 1,
  });
  expect(complete).toMatchObject({ status: "completed", changed: 16, checked: 16 });
  const after = await f.snapshot();
  for (const target of PERSONA_VAULT_TARGETS) {
    const sort = (rows: Record<string, unknown>[]) =>
      rows.sort((a, b) =>
        JSON.stringify(target.keys.map((k) => a[k])).localeCompare(
          JSON.stringify(target.keys.map((k) => b[k])),
        ),
      );
    const oldRows = sort(before[target.table]!),
      newRows = sort(after[target.table]!);
    for (let i = 0; i < oldRows.length; i++) {
      for (const [key, value] of Object.entries(oldRows[i]!)) {
        if ((target.fields as readonly string[]).includes(key) && value !== null) {
          expect(typeof newRows[i]![key]).toBe("string");
          expect(newRows[i]![key]).toMatch(/^v2\.rotated\./);
          expect(current.decrypt(newRows[i]![key] as string)).toBe(old.decrypt(value as string));
        } else expect(newRows[i]![key]).toEqual(value);
      }
    }
  }
  await assertPersonaVaultKeyring(
    f.db,
    new NodeCryptoAdapter("b".repeat(64), "rotated"),
    "rotated",
  );
  await expect(
    composePersonaV2(
      testConfig({
        DATABASE_URL: f.url.toString(),
        MCP_ENCRYPTION_KEY: "a".repeat(64),
        MCP_ENCRYPTION_KEY_ID: "initial",
      }),
    ),
  ).rejects.toThrow("keyring");
  const runtime = await composePersonaV2(
    testConfig({
      DATABASE_URL: f.url.toString(),
      MCP_ENCRYPTION_KEY: "b".repeat(64),
      MCP_ENCRYPTION_KEY_ID: "rotated",
      MCP_ENCRYPTION_PREVIOUS_KEYS: { initial: "a".repeat(64) },
    }),
  );
  await runtime.close();
  expect((await f.db.query("SELECT * FROM persona_vault_rewrap_permit_v2")).rowCount).toBe(0);
  await expect(
    f.db.query("UPDATE persona_vault_key_binding_v2 SET fingerprint=$1 WHERE key_id='rotated'", [
      "f".repeat(64),
    ]),
  ).rejects.toThrow();
  await expect(
    f.db.query("UPDATE persona_vault_rotation_v2 SET status='running' WHERE id=$1", [paused.runId]),
  ).rejects.toThrow("immutable");
  await expect(
    f.db.query("DELETE FROM persona_vault_rotation_v2 WHERE id=$1", [paused.runId]),
  ).rejects.toThrow("permanent");
  await expect(
    f.db.query("UPDATE knowledge_library_version_v2 SET name='tampered' WHERE library_id=$1", [
      f.library,
    ]),
  ).rejects.toThrow("immutable");
  await expect(
    f.db.query("UPDATE setup_v2 SET contexto_enc=$1", [current.encrypt("changed")]),
  ).rejects.toThrow("immutable");
  expect(
    await f.rotation.run({
      apply: true,
      keyId: "rotated",
      confirmDatabase: f.name,
      resumeId: paused.runId,
    }),
  ).toMatchObject({ status: "completed", changed: 16 });
});

it("corrupção, chave ausente e inventário incompleto recusam antes de gravar", async () => {
  const f = await fixture();
  await expect(
    new PersonaVaultRotation(
      new PostgresPersonaVaultRotationStore(f.url.toString()),
      new NodeCryptoAdapter("a".repeat(64), "renamed", { initial: "a".repeat(64) }),
    ).run({ apply: false, keyId: "renamed" }),
  ).rejects.toThrow();
  await expect(
    new PersonaVaultRotation(
      new PostgresPersonaVaultRotationStore(f.url.toString()),
      new NodeCryptoAdapter("b".repeat(64), "rotated"),
    ).run({ apply: true, keyId: "rotated", confirmDatabase: f.name }),
  ).rejects.toThrow();
  expect((await f.db.query("SELECT * FROM persona_vault_rotation_v2")).rowCount).toBe(0);
  await f.db.query("UPDATE fonte_credencial SET senha_enc='v2.initial.invalid.invalid.invalid'");
  await expect(f.rotation.run({ apply: false, keyId: "rotated" })).rejects.toThrow();
  expect((await f.db.query("SELECT * FROM persona_vault_active_key_v2")).rowCount).toBe(0);
  await f.db.query("ALTER TABLE persona ADD COLUMN unexpected_enc text");
  await expect(f.rotation.run({ apply: false, keyId: "rotated" })).rejects.toThrow("inventory");
});

it("lock é exclusivo e interrupção real de conexão desfaz lote; retomada usa cursor commitado", async () => {
  const f = await fixture(),
    blocker = new pg.Client({ connectionString: f.url.toString() });
  await blocker.connect();
  await blocker.query("SELECT pg_advisory_lock(19370003)");
  await expect(f.rotation.run({ apply: false, keyId: "rotated" })).rejects.toThrow("locked");
  await blocker.end();
  const paused = await f.rotation.run({
    apply: true,
    keyId: "rotated",
    confirmDatabase: f.name,
    maxBatches: 1,
    batchSize: 1,
  });
  const before = (await f.db.query("SELECT payload_enc,versao FROM operacao_v2 ORDER BY id")).rows;
  await f.db.query(`CREATE FUNCTION fixture_break_rotation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN PERFORM pg_terminate_backend(pg_backend_pid()); RETURN NEW; END $$;
    CREATE TRIGGER fixture_break_rotation AFTER UPDATE ON operacao_v2 FOR EACH ROW EXECUTE FUNCTION fixture_break_rotation()`);
  try {
    await expect(
      f.rotation.run({
        apply: true,
        keyId: "rotated",
        confirmDatabase: f.name,
        resumeId: paused.runId,
        batchSize: 1,
      }),
    ).rejects.toThrow();
    expect(
      (await f.db.query("SELECT payload_enc,versao FROM operacao_v2 ORDER BY id")).rows,
    ).toEqual(before);
    expect((await f.db.query("SELECT * FROM persona_vault_rewrap_permit_v2")).rowCount).toBe(0);
  } finally {
    await f.db.query(
      "DROP TRIGGER fixture_break_rotation ON operacao_v2; DROP FUNCTION fixture_break_rotation()",
    );
  }
  expect(
    await f.rotation.run({
      apply: true,
      keyId: "rotated",
      confirmDatabase: f.name,
      resumeId: paused.runId,
    }),
  ).toMatchObject({ status: "completed", changed: 16 });
});

it("CLI pausa e retoma em novo processo, não registra segredos e não reutiliza ID de chave", async () => {
  const f = await fixture();
  const cli = (args: string[]) =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/rotate-persona-vault.ts", ...args],
      {
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
          NODE_ENV: "test",
          DATABASE_URL: f.url.toString(),
          MCP_ENCRYPTION_KEY: "b".repeat(64),
          MCP_ENCRYPTION_KEY_ID: "rotated",
          MCP_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify({ initial: "a".repeat(64) }),
          PLUG_SERVER_BASE_URL: "https://hub.fixture.test",
        },
        encoding: "utf8",
        timeout: 20000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  const out = cli(["--apply", `--confirm-database=${f.name}`, "--max-batches=1"]);
  expect(out).not.toContain("fixture private");
  expect(out).not.toContain("b".repeat(64));
  expect(out).not.toContain("v2.initial");
  const paused = JSON.parse(out) as { runId: string };
  expect(
    JSON.parse(cli(["--apply", `--confirm-database=${f.name}`, `--resume=${paused.runId}`])),
  ).toMatchObject({ status: "completed" });
  const wrong = new NodeCryptoAdapter("c".repeat(64), "next", {
    rotated: "b".repeat(64),
    initial: "d".repeat(64),
  });
  await expect(
    new PersonaVaultRotation(new PostgresPersonaVaultRotationStore(f.url.toString()), wrong).run({
      apply: false,
      keyId: "next",
    }),
  ).rejects.toThrow("reused");
  await expect(
    new PersonaVaultRotation(new PostgresPersonaVaultRotationStore(f.url.toString()), wrong).run({
      apply: true,
      keyId: "next",
      confirmDatabase: f.name,
    }),
  ).rejects.toThrow("reused");
  const metadata = JSON.stringify(
    (await f.db.query("SELECT * FROM persona_vault_rotation_v2")).rows,
  );
  expect(metadata).not.toContain("fixture private");
  expect(metadata).not.toContain("v2.initial");
});

it("login de runtime não vira operador por GUC nem altera cifra imutável fora da função", async () => {
  const f = await fixture(),
    role = `vault_runtime_${randomUUID().replaceAll("-", "")}`,
    password = randomUUID();
  await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
  await f.db.query(
    `GRANT USAGE ON SCHEMA public TO "${role}"; GRANT SELECT,UPDATE ON knowledge_library_version_v2 TO "${role}"`,
  );
  const url = new URL(f.url);
  url.username = role;
  url.password = password;
  const runtime = new pg.Client({ connectionString: url.toString() });
  await runtime.connect();
  try {
    await runtime.query("SELECT set_config('persona.vault.rotation','true',false)");
    await expect(
      runtime.query("UPDATE knowledge_library_version_v2 SET payload_enc=$1", [
        current.encrypt("tampered"),
      ]),
    ).rejects.toThrow("immutable");
    await expect(
      runtime.query(
        "SELECT persona_vault_rewrap_v2($1,'knowledge_library_version_v2','{}','{}','{}')",
        [randomUUID()],
      ),
    ).rejects.toThrow("operator");
    await expect(
      runtime.query(
        "INSERT INTO persona_vault_rewrap_permit_v2 VALUES(pg_backend_pid(),pg_current_xact_id(),1,'','')",
      ),
    ).rejects.toThrow("permission");
    await expect(
      new PersonaVaultRotation(new PostgresPersonaVaultRotationStore(url.toString()), current).run({
        apply: false,
        keyId: "rotated",
      }),
    ).rejects.toThrow();
  } finally {
    await runtime.end();
  }
  cleanup.push(async () => {
    await f.db.query(
      `REVOKE ALL ON knowledge_library_version_v2 FROM "${role}"; REVOKE USAGE ON SCHEMA public FROM "${role}"`,
    );
    await admin.query(`DROP ROLE "${role}"`);
  });
});

it("operador de login dedicado rotaciona com grants mínimos sem administrar tokens ou estados", async () => {
  const f = await fixture(),
    role = `vault_operator_${randomUUID().replaceAll("-", "")}`,
    password = randomUUID();
  await admin.query(
    `CREATE ROLE "${role}" LOGIN PASSWORD '${password}'; GRANT persona_v2_vault_operator TO "${role}"`,
  );
  await f.db.query(`GRANT USAGE ON SCHEMA public TO "${role}";
    GRANT SELECT ON mcp_schema_generation,_persona_v2_migrations TO "${role}";
    GRANT SELECT,INSERT ON persona_vault_key_binding_v2 TO "${role}";
    GRANT SELECT,INSERT,UPDATE ON persona_vault_active_key_v2,persona_vault_rotation_v2 TO "${role}"`);
  for (const target of PERSONA_VAULT_TARGETS)
    await f.db.query(
      `GRANT SELECT,UPDATE(${target.fields.join(",")}) ON ${target.table} TO "${role}"`,
    );
  cleanup.push(async () => {
    for (const target of PERSONA_VAULT_TARGETS)
      await f.db.query(
        `REVOKE SELECT,UPDATE(${target.fields.join(",")}) ON ${target.table} FROM "${role}"`,
      );
    await f.db.query(
      `REVOKE ALL ON mcp_schema_generation,_persona_v2_migrations,persona_vault_key_binding_v2,persona_vault_active_key_v2,persona_vault_rotation_v2 FROM "${role}"; REVOKE USAGE ON SCHEMA public FROM "${role}"`,
    );
    await admin.query(`REVOKE persona_v2_vault_operator FROM "${role}"; DROP ROLE "${role}"`);
  });
  const url = new URL(f.url);
  url.username = role;
  url.password = password;
  const operator = new pg.Client({ connectionString: url.toString() });
  await operator.connect();
  try {
    await expect(operator.query("UPDATE persona_token SET revoked_at=now()")).rejects.toThrow(
      "permission",
    );
    await expect(operator.query("UPDATE operacao_v2 SET estado='preparada'")).rejects.toThrow(
      "permission",
    );
  } finally {
    await operator.end();
  }
  expect(
    await new PersonaVaultRotation(
      new PostgresPersonaVaultRotationStore(url.toString()),
      current,
    ).run({ apply: true, keyId: "rotated", confirmDatabase: f.name, batchSize: 1 }),
  ).toMatchObject({ status: "completed", changed: 16 });
});
