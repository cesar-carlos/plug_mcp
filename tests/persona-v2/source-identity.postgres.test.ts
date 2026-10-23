import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { PostgresSourceCredentials } from "../../src/infrastructure/persistence/persona-v2/source-credentials.js";
import { trainingSource } from "../helpers/persona-v2-training.js";

const base = new URL(personaV2TestDatabaseUrl());
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const name = `persona_identity_${randomUUID().replaceAll("-", "")}_test`;
const url = new URL(base);
url.pathname = `/${name}`;
let db: pg.Pool;
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  await applyPersonaMigrations(url.toString());
  db = new pg.Pool({ connectionString: url.toString() });
});
afterAll(async () => {
  await db?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
});

it("mudança física suspende vínculos em outras personas e dependências, sem atingir outra base nem alterar snapshots", async () => {
  const owner = randomUUID(),
    physical = randomUUID(),
    otherPhysical = randomUUID();
  await db.query(
    "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,'https://fixture.test','fixture')",
    [owner],
  );
  await db.query("INSERT INTO fonte_fisica(id,identity_hash) VALUES($1,$2),($3,$4)", [
    physical,
    "a".repeat(64),
    otherPhysical,
    "b".repeat(64),
  ]);
  const links = [];
  for (let i = 0; i < 3; i++) {
    const personaId = randomUUID(),
      id = randomUUID(),
      credentialId = randomUUID(),
      publicationId = randomUUID(),
      dependentId = randomUUID();
    const physicalSourceId = i === 2 ? otherPhysical : physical;
    await db.query(
      "INSERT INTO persona(id,responsavel_id,nome,especialidade) VALUES($1,$2,'Fixture','Test')",
      [personaId, owner],
    );
    await db.query(
      "INSERT INTO fonte_credencial(id,persona_id,email_enc,senha_enc,client_token_enc) VALUES($1,$2,'cipher','cipher','cipher')",
      [credentialId, personaId],
    );
    await db.query(
      "INSERT INTO fonte(id,persona_id,fonte_fisica_id,credencial_id,agent_id,banco,dialeto,nome,finalidade,ambiente,identity_hash,identity_verified_at) VALUES($1,$2,$3,$4,$5,'same_name','postgres','Fixture','Test','test',$6,now())",
      [
        id,
        personaId,
        physicalSourceId,
        credentialId,
        trainingSource.agentId,
        trainingSource.identityHash,
      ],
    );
    for (const [pub, slug] of [
      [publicationId, "local"],
      [dependentId, "cross"],
    ]) {
      const skill = randomUUID();
      await db.query(
        "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,$3,'consulta','Fixture','{}')",
        [skill, personaId, slug],
      );
      await db.query(
        "INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash) VALUES($1,$2,$3,1,'{}',$4)",
        [pub, personaId, skill, "c".repeat(64)],
      );
    }
    await db.query(
      "INSERT INTO publicacao_fonte(persona_id,publicacao_id,fonte_id,fonte_version,source_fingerprint) VALUES($1,$2,$3,1,$4)",
      [personaId, publicationId, id, "d".repeat(64)],
    );
    await db.query(
      "INSERT INTO publicacao_dependencia(persona_id,publicacao_id,dependencia_id) VALUES($1,$2,$3)",
      [personaId, dependentId, publicationId],
    );
    links.push({
      ...trainingSource,
      id,
      personaId,
      physicalSourceId,
      credentialId,
      publicationId,
      dependentId,
    });
  }
  const credentials = new PostgresSourceCredentials(db);
  await credentials.invalidateIdentity(links[0]!);
  for (const [i, source] of links.entries()) {
    expect(
      (await db.query("SELECT ativa,authorization_version FROM fonte WHERE id=$1", [source.id]))
        .rows[0],
    ).toEqual({ ativa: i === 2, authorization_version: i === 2 ? 1 : 2 });
    expect(
      (
        await db.query("SELECT publicacao_id FROM publicacao_suspensao WHERE persona_id=$1", [
          source.personaId,
        ])
      ).rowCount,
    ).toBe(i === 2 ? 0 : 2);
  }
  expect(
    (
      await db.query("SELECT cache_revision::int AS revision FROM fonte_fisica WHERE id=$1", [
        physical,
      ])
    ).rows[0].revision,
  ).toBe(2);
  await credentials.invalidateIdentity(links[0]!);
  expect(
    (
      await db.query("SELECT cache_revision::int AS revision FROM fonte_fisica WHERE id=$1", [
        physical,
      ])
    ).rows[0].revision,
  ).toBe(2);
  expect((await db.query("SELECT count(*)::int AS count FROM publicacao")).rows[0].count).toBe(6);
});
it("upgrade 0004→0005 põe fontes sem prova em quarentena e é idempotente, preservando publicações", async () => {
  // A genuine historical fixture: never remove columns from a current schema.
  const historicalName = `persona_upgrade_${randomUUID().replaceAll("-", "")}_test`;
  const historicalUrl = new URL(base);
  historicalUrl.pathname = `/${historicalName}`;
  await admin.query(`CREATE DATABASE "${historicalName}"`);
  const historical = new pg.Pool({ connectionString: historicalUrl.toString() });
  try {
    await historical.query(
      "CREATE TABLE _persona_v2_migrations(filename text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const filename of [
      "0001_baseline.sql",
      "0002_catalog.sql",
      "0003_operation_integrity.sql",
      "0004_operation_reconciliation.sql",
    ]) {
      const sql = readFileSync(
        new URL(`../../migrations/persona-v2/${filename}`, import.meta.url),
        "utf8",
      );
      await historical.query(sql);
      await historical.query(
        "INSERT INTO _persona_v2_migrations(filename,checksum) VALUES($1,$2)",
        [filename, createHash("sha256").update(sql).digest("hex")],
      );
    }
    const owner = randomUUID(),
      persona = randomUUID(),
      physical = randomUUID(),
      source = randomUUID(),
      credential = randomUUID(),
      skill = randomUUID(),
      publication = randomUUID();
    await historical.query(
      "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,'https://fixture.test','historical')",
      [owner],
    );
    await historical.query(
      "INSERT INTO persona(id,responsavel_id,nome,especialidade) VALUES($1,$2,'Fixture','Test')",
      [persona, owner],
    );
    await historical.query("INSERT INTO fonte_fisica(id,identity_hash) VALUES($1,$2)", [
      physical,
      "a".repeat(64),
    ]);
    await historical.query(
      "INSERT INTO fonte_credencial(id,persona_id,email_enc,senha_enc,client_token_enc) VALUES($1,$2,'cipher','cipher','cipher')",
      [credential, persona],
    );
    await historical.query(
      "INSERT INTO fonte(id,persona_id,fonte_fisica_id,credencial_id,agent_id,banco,dialeto,nome,finalidade,ambiente) VALUES($1,$2,$3,$4,$5,'fixture','postgres','Fixture','Test','test')",
      [source, persona, physical, credential, trainingSource.agentId],
    );
    await historical.query(
      "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,'historical','consulta','Fixture','{}')",
      [skill, persona],
    );
    await historical.query(
      "INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash) VALUES($1,$2,$3,1,'{}',$4)",
      [publication, persona, skill, "b".repeat(64)],
    );
    await historical.query(
      "INSERT INTO publicacao_fonte(persona_id,publicacao_id,fonte_id,fonte_version,source_fingerprint) VALUES($1,$2,$3,1,$4)",
      [persona, publication, source, "c".repeat(64)],
    );
    await applyPersonaMigrations(historicalUrl.toString());
    expect(
      (await historical.query("SELECT ativa,identity_hash FROM fonte WHERE id=$1", [source]))
        .rows[0],
    ).toEqual({ ativa: false, identity_hash: null });
    expect(
      (await historical.query("SELECT count(*)::int AS count FROM publicacao_suspensao")).rows[0]
        .count,
    ).toBe(1);
    const snapshot = (
      await historical.query("SELECT id,cache_revision FROM fonte_fisica ORDER BY id")
    ).rows;
    await applyPersonaMigrations(historicalUrl.toString());
    expect(
      (await historical.query("SELECT id,cache_revision FROM fonte_fisica ORDER BY id")).rows,
    ).toEqual(snapshot);
    expect(
      (await historical.query("SELECT count(*)::int AS count FROM publicacao")).rows[0].count,
    ).toBe(1);
  } finally {
    await historical.end();
    await admin.query(`DROP DATABASE "${historicalName}"`);
  }
});
