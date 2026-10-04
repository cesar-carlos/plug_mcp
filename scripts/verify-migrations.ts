import pg from "pg";
import { applyMigrations } from "../src/infrastructure/persistence/migrate.js";

const source = process.env.DATABASE_URL;
if (!source || process.env.CI !== "true") {
  throw new Error("test:migrations only runs with DATABASE_URL in CI");
}
const admin = new URL(source);
admin.pathname = "/postgres";
const names = [
  "se7e_mcp_migration_fresh_ci",
  "se7e_mcp_migration_upgrade_ci",
  "se7e_mcp_migration_current_ci",
];

const databaseUrl = (name: string): string => {
  const url = new URL(source);
  url.pathname = `/${name}`;
  return url.toString();
};

const recreate = async (name: string): Promise<void> => {
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${name}`);
    await client.query(`CREATE DATABASE ${name}`);
  } finally {
    await client.end();
  }
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const seedPreGovernanca = async (url: string): Promise<void> => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const user = await client.query<{ id: string }>(
      "INSERT INTO usuario_mcp (email_enc,email_hash,senha_enc) VALUES ('enc','legacy-user','enc') RETURNING id",
    );
    const acesso = await client.query<{ id: string }>(
      "INSERT INTO acesso (usuario_id,agent_id,dialeto,nome_amigavel,client_token_enc,client_token_hash,token_hash,status_acesso) VALUES ($1,gen_random_uuid(),'postgres','upgrade','enc','legacy-client','legacy-token','approved') RETURNING id",
      [user.rows[0]!.id],
    );
    const skill = await client.query<{ id: string }>(
      "INSERT INTO skill (acesso_id,slug,nome,descricao,sql_modelo,params,escopo,status,autor_usuario_id) VALUES ($1,'legada','Legada','skill legada','SELECT SUM(1) total', '[]','{}','publicada',$2) RETURNING id",
      [acesso.rows[0]!.id, user.rows[0]!.id],
    );
    await client.query(
      "INSERT INTO anotacao_grafo (acesso_id,tipo,titulo,texto,autor_usuario_id) VALUES ($1,'regra','Nota legada','texto legado',$2)",
      [acesso.rows[0]!.id, user.rows[0]!.id],
    );
    await client.query(
      "INSERT INTO audit_log (usuario_id,acesso_id,tool,sucesso) VALUES ($1,$2,'consultar_dados',1)",
      [user.rows[0]!.id, acesso.rows[0]!.id],
    );
    assert(Boolean(skill.rows[0]), "failed to seed published skill");
    await client.query(
      "INSERT INTO skill(acesso_id,slug,nome,descricao,sql_modelo,params,escopo,status,autor_usuario_id) VALUES($1,'insegura','Unsafe','synthetic','SELECT pg_sleep(1)','[]','{}','publicada',$2)",
      [acesso.rows[0]!.id, user.rows[0]!.id],
    );
    await client.query(
      "INSERT INTO mcp_setup(code,token,acesso_id,expires_at) VALUES('legacy-pending','legacy-plaintext',$1,now()+interval '1 day')",
      [acesso.rows[0]!.id],
    );
  } finally {
    await client.end();
  }
};

const verify = async (url: string, upgrade: boolean): Promise<void> => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const migrations = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM _mcp_migrations",
    );
    assert(Number(migrations.rows[0]?.count) >= 20, "all migrations were not applied");
    const columns = await client.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'metadata'",
    );
    assert(columns.rowCount === 1, "audit_log.metadata missing");
    const operations = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('alerta_operacional','webhook_operacional','webhook_operacional_outbox')",
    );
    assert(operations.rowCount === 3, "operational tables missing");
    const indexes = await client.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('audit_log_acesso_created_idx','anotacao_grafo_vigencia_idx','webhook_operacional_outbox_pendente_idx')",
    );
    assert(indexes.rowCount === 3, "required operational indexes missing");
    const constraints = await client.query<{ conname: string }>(
      "SELECT conname FROM pg_constraint WHERE conname IN ('anotacao_grafo_vigencia_check','alerta_operacional_status_check')",
    );
    assert(constraints.rowCount === 2, "required constraints missing");
    const unsafe = await client.query(
      "SELECT publicacao_ativa_id,status FROM skill WHERE slug='insegura'",
    );
    if (upgrade) {
      const bearer = await client.query(
        "SELECT token_hash FROM acesso WHERE client_token_hash='legacy-client'",
      );
      assert(
        bearer.rows[0]?.token_hash === "legacy-token",
        "existing Bearer changed during migration",
      );
    }
    if (unsafe.rowCount)
      assert(
        unsafe.rows[0].publicacao_ativa_id === null &&
          unsafe.rows[0].status === "rascunho_revalidacao",
        "unsafe baseline must be suspended",
      );
    const pending = await client.query("SELECT count(*)::int n FROM mcp_setup");
    assert(pending.rows[0].n === 0, "legacy pending setups must be invalidated");
    if (upgrade) {
      const legacy = await client.query<{ fonte_tipo: string; status: string }>(
        "SELECT fonte_tipo,status FROM anotacao_grafo WHERE titulo='Nota legada'",
      );
      assert(
        legacy.rows[0]?.fonte_tipo === "legado" && legacy.rows[0]?.status === "vigente",
        "legacy governance backfill failed",
      );
      const snapshots = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM skill_publicacao p JOIN skill s ON s.id=p.skill_id WHERE s.slug='legada'",
      );
      assert(
        Number(snapshots.rows[0]?.count) === 2,
        "historical snapshot and technical baseline must both survive",
      );
      const active = await client.query<{ origem: string; conhecimento: boolean }>(
        "SELECT p.origem,(p.pacote ? 'conhecimentoPublicado') AS conhecimento FROM skill s JOIN skill_publicacao p ON p.id=s.publicacao_ativa_id WHERE s.slug='legada'",
      );
      assert(
        active.rows[0]?.origem === "migracao" && active.rows[0].conhecimento,
        "technical baseline must be the active authority",
      );
      let immutable = false;
      try {
        await client.query("UPDATE skill_publicacao SET pacote='{}'");
      } catch {
        immutable = true;
      }
      assert(immutable, "publication snapshots must reject updates");
    }
  } finally {
    await client.end();
  }
};

for (const name of names) await recreate(name);
try {
  const fresh = databaseUrl(names[0]!);
  await applyMigrations({ databaseUrl: fresh });
  await applyMigrations({ databaseUrl: fresh });
  await verify(fresh, false);
  const upgrade = databaseUrl(names[1]!);
  await applyMigrations({ databaseUrl: upgrade, through: "0023_token_por_acesso.sql" });
  await seedPreGovernanca(upgrade);
  await applyMigrations({ databaseUrl: upgrade });
  await applyMigrations({ databaseUrl: upgrade });
  await verify(upgrade, true);
  const current = databaseUrl(names[2]!);
  await applyMigrations({ databaseUrl: current, through: "0027_operacoes_notificacoes.sql" });
  await seedPreGovernanca(current);
  await applyMigrations({ databaseUrl: current, through: "0031_publicacao_imutavel.sql" });
  const prior = new pg.Client({ connectionString: current });
  await prior.connect();
  await prior.query(
    "INSERT INTO consulta_aprendida(acesso_id,pergunta,sql,execucoes,status) SELECT id,'exemplo legado sintético','SELECT SUM(1) total',7,'candidata' FROM acesso LIMIT 1",
  );
  await prior.end();
  await applyMigrations({ databaseUrl: current });
  const upgraded = new pg.Client({ connectionString: current });
  await upgraded.connect();
  const preserved = await upgraded.query(
    "SELECT status,versao,fingerprint,execucoes,confirmada_em FROM consulta_aprendida WHERE pergunta='exemplo legado sintético'",
  );
  assert(
    preserved.rows[0]?.status === "candidata" &&
      preserved.rows[0]?.versao === 1 &&
      preserved.rows[0]?.fingerprint === null &&
      preserved.rows[0]?.execucoes === 7 &&
      preserved.rows[0]?.confirmada_em === null,
    "0031 upgrade must not invent confirmation/executions",
  );
  assert(
    (await upgraded.query("SELECT count(*)::int n FROM treinamento_revisao")).rows[0].n === 0,
    "migration must not invent reports",
  );
  await upgraded.end();
  await verify(current, false);
} finally {
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    for (const name of names) await client.query(`DROP DATABASE IF EXISTS ${name}`);
  } finally {
    await client.end();
  }
}
