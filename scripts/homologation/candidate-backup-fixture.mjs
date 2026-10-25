// Runs only inside the isolated candidate container, never against a user database.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire("/app/package.json");
const { Client } = require("pg");
const { NodeCryptoAdapter } =
  await import("/app/dist/infrastructure/crypto/node-crypto.adapter.js");
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, "database");
assert.equal(url.pathname, "/persona_v2_candidate");
assert.ok(
  process.env.NODE_ENV === "development" ||
    (process.env.NODE_ENV === "production" && process.env.PERSONA_V2_DEPLOYMENT === "test-server"),
);
assert.equal(process.env.PLUG_SERVER_BASE_URL, "https://hub-fixture.invalid");
const mode = process.argv[2];
assert.ok(["seed", "verify"].includes(mode));
const db = new Client({ connectionString: url.toString() });
const cipher = new NodeCryptoAdapter(
  process.env.MCP_ENCRYPTION_KEY,
  process.env.MCP_ENCRYPTION_KEY_ID,
);
const tables = [
  "responsavel",
  "persona",
  "persona_token",
  "integracao",
  "integracao_operacao",
  "skill_v2",
  "publicacao",
  "operacao_v2",
];
await db.connect();
try {
  if (mode === "seed") {
    for (const table of tables) {
      assert.equal((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n, 0);
    }
    const [owner, persona, token, integration, operation, skill, publication, journal] = tables.map(
      () => randomUUID(),
    );
    await db.query("BEGIN");
    await db.query(
      "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,'https://hub-fixture.invalid','backup-fixture')",
      [owner],
    );
    await db.query(
      "INSERT INTO persona(id,responsavel_id,nome,especialidade) VALUES($1,$2,'Backup fixture','Synthetic')",
      [persona, owner],
    );
    await db.query(
      "INSERT INTO persona_token(id,persona_id,nome,token_hash,revoked_at,permissoes,delegacao) VALUES($1,$2,'Revoked fixture',$3,now(),'{}','{}')",
      [token, persona, "a".repeat(64)],
    );
    await db.query(
      "INSERT INTO integracao(id,persona_id,tipo,nome,destino,credencial_enc,ativa) VALUES($1,$2,'rest','Inactive fixture','https://provider.invalid',$3,false)",
      [integration, persona, cipher.encrypt("synthetic-backup-credential")],
    );
    await db.query(
      "INSERT INTO integracao_operacao(id,persona_id,integracao_id,nome,contrato,contrato_hash,efeito) VALUES($1,$2,$3,'Fixture','{}',$4,'acao')",
      [operation, persona, integration, "b".repeat(64)],
    );
    await db.query(
      "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,'backup-fixture','acao_externa','Fixture','{}')",
      [skill, persona],
    );
    await db.query(
      "INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash) VALUES($1,$2,$3,1,'{}',$4)",
      [publication, persona, skill, "c".repeat(64)],
    );
    await db.query(
      "INSERT INTO operacao_v2(id,persona_id,token_id,publicacao_id,integracao_operacao_id,fingerprint,authorization_snapshot,estado,expires_at,payload_enc) VALUES($1,$2,$3,$4,$5,$6,'{}','resultado_desconhecido',now()+interval '15 minutes',$7)",
      [
        journal,
        persona,
        token,
        publication,
        operation,
        "d".repeat(64),
        cipher.encrypt("synthetic-unknown-payload"),
      ],
    );
    await db.query("COMMIT");
  }
  const digest = createHash("sha256");
  for (const table of tables) {
    const { rows } = await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`);
    assert.equal(rows.length, 1);
    digest.update(JSON.stringify({ table, rows }));
  }
  const credential = (await db.query("SELECT credencial_enc FROM integracao")).rows[0]
    .credencial_enc;
  assert.equal(cipher.decrypt(credential), "synthetic-backup-credential");
  const wrongKey = new NodeCryptoAdapter("0".repeat(64), process.env.MCP_ENCRYPTION_KEY_ID);
  assert.throws(() => wrongKey.decrypt(credential));
  const unknown = (await db.query("SELECT * FROM operacao_v2")).rows[0];
  assert.equal(unknown.estado, "resultado_desconhecido");
  assert.equal(unknown.terminal_at, null);
  assert.equal(cipher.decrypt(unknown.payload_enc), "synthetic-unknown-payload");
  assert.ok((await db.query("SELECT revoked_at FROM persona_token")).rows[0].revoked_at);
  if (mode === "verify") {
    await assert.rejects(db.query("UPDATE publicacao SET revisao=revisao+1"));
    await assert.rejects(db.query("UPDATE operacao_v2 SET estado='preparada',versao=versao+1"));
    await assert.rejects(db.query("DELETE FROM operacao_v2"));
  }
  console.log(digest.digest("hex"));
} finally {
  await db.end();
}
