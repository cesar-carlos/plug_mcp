import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import {
  applyPersonaMigrations,
  verifyPersonaMigrations,
} from "../../src/infrastructure/persistence/persona-v2/migrate.js";

const url = new URL(personaV2TestDatabaseUrl());
const name = `persona_lifecycle_upgrade_${randomUUID().replaceAll("-", "")}_test`;
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
url.pathname = `/${name}`;
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

it("upgrade 0010 → atual preserva fontes, credenciais, tokens, rascunhos e snapshots privados", async () => {
  // Reproduce a previously installed generation without changing any applied migration file.
  await db.query(
    "CREATE TABLE _persona_v2_migrations(filename text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz DEFAULT now())",
  );
  for (const file of readdirSync(directory)
    .filter((f) => /^00(0[1-9]|10)_.*\.sql$/.test(f))
    .sort()) {
    const sql = readFileSync(`${directory}/${file}`, "utf8");
    await db.query(sql);
    await db.query("INSERT INTO _persona_v2_migrations(filename,checksum) VALUES($1,$2)", [
      file,
      createHash("sha256").update(sql).digest("hex"),
    ]);
  }
  const ledger = (
    await db.query("SELECT filename,checksum FROM _persona_v2_migrations ORDER BY filename")
  ).rows;
  expect(ledger).toHaveLength(10);
  const owner = randomUUID(),
    persona = randomUUID(),
    physical = randomUUID(),
    credential = randomUUID(),
    source = randomUUID(),
    skill = randomUUID(),
    publication = randomUUID(),
    token = randomUUID();
  await db.query(
    "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,'http://hub.fixture.test','fixture-client')",
    [owner],
  );
  await db.query(
    "INSERT INTO persona(id,responsavel_id,nome,especialidade) VALUES($1,$2,'Privada','Fixture')",
    [persona, owner],
  );
  await db.query("INSERT INTO fonte_fisica(id,identity_hash) VALUES($1,$2)", [
    physical,
    "f".repeat(64),
  ]);
  await db.query(
    "INSERT INTO fonte_credencial(id,persona_id,email_enc,senha_enc,client_token_enc) VALUES($1,$2,'fixture-cipher-email','fixture-cipher-password','fixture-cipher-token')",
    [credential, persona],
  );
  await db.query(
    "INSERT INTO fonte(id,persona_id,fonte_fisica_id,credencial_id,agent_id,banco,dialeto,nome,finalidade,ambiente,identity_hash,identity_verified_at) VALUES($1,$2,$3,$4,$5,'fixture','postgres','Fonte anterior','Privada','test',$6,now())",
    [source, persona, physical, credential, randomUUID(), "f".repeat(64)],
  );
  const content = {
    sourceId: source,
    sqlModel: "SELECT id FROM orders",
    purpose: "Treinamento privado",
  };
  await db.query(
    "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,'fixture-query','consulta','Consulta privada',$3)",
    [skill, persona, JSON.stringify(content)],
  );
  await db.query(
    "INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash) VALUES($1,$2,$3,1,$4,$5)",
    [publication, persona, skill, JSON.stringify(content), "a".repeat(64)],
  );
  await db.query(
    "INSERT INTO publicacao_fonte(persona_id,publicacao_id,fonte_id,fonte_version) VALUES($1,$2,$3,1)",
    [persona, publication, source],
  );
  await db.query("UPDATE skill_v2 SET publicacao_ativa_id=$2 WHERE id=$1", [skill, publication]);
  const permissions = {
    sourceIds: [source],
    skills: [],
    externalOperationIds: [],
    administrative: [],
  };
  await db.query(
    "INSERT INTO persona_token(id,persona_id,nome,token_hash,permissoes,delegacao) VALUES($1,$2,'Token anterior',$3,$4,$4)",
    [token, persona, "b".repeat(64), JSON.stringify(permissions)],
  );
  const tables = [
    "fonte",
    "fonte_credencial",
    "skill_v2",
    "publicacao",
    "publicacao_fonte",
    "persona_token",
  ] as const;
  const previous = await Promise.all(tables.map((table) => db.query(`SELECT * FROM ${table}`)));
  await db.query(
    "INSERT INTO responsavel_delegacao_v2(persona_id,responsavel_id,hub_id,credential_enc,expires_at,version) VALUES($1,$2,$3,'fixture-cipher',now()+interval '1 day',1)",
    [persona, owner, randomUUID()],
  );
  await applyPersonaMigrations(url.toString());
  await applyPersonaMigrations(url.toString());
  await verifyPersonaMigrations(db);
  for (const [index, table] of tables.entries()) {
    const after = (await db.query(`SELECT * FROM ${table}`)).rows;
    const expected = previous[index]!.rows;
    expect(after).toEqual(
      table === "fonte" ? expected.map((row) => ({ ...row, substituida_por_id: null })) : expected,
    );
  }
  expect(
    (
      await db.query(
        "SELECT filename,checksum FROM _persona_v2_migrations WHERE filename<'0011' ORDER BY filename",
      )
    ).rows,
  ).toEqual(ledger);
  expect(
    (await db.query("SELECT administrative,version FROM responsavel_delegacao_v2")).rows,
  ).toEqual([{ administrative: ["gerenciar_fontes"], version: 1 }]);
  expect((await db.query("SELECT count(*)::int n FROM knowledge_catalog_v2")).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int n FROM audit_v2")).rows[0].n).toBe(0);
});
