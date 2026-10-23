import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { expect, it } from "vitest";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import {
  applyPersonaMigrations,
  verifyPersonaMigrations,
} from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { resetDevelopmentPersonaData } from "../../src/infrastructure/persistence/persona-v2/reset-development.js";

it("resets only the marked isolated v2 database and preserves migrations", async () => {
  const base = new URL(personaV2TestDatabaseUrl());
  const name = `persona_v2_${randomUUID().replaceAll("-", "")}_test`;
  const adminUrl = new URL(base);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  const url = new URL(base);
  url.pathname = `/${name}`;
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  const query = async (sql: string) => {
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    try {
      return await client.query(sql);
    } finally {
      await client.end();
    }
  };
  const options = {
    databaseUrl: url.toString(),
    environment: "test",
    generation: "persona-v2",
    confirmDatabase: name,
    apply: true,
  };
  try {
    await admin.query(`COMMENT ON DATABASE "${name}" IS 'se7e:persona-v2:disposable-development'`);
    await query("CREATE TABLE acesso(id integer); INSERT INTO acesso VALUES(1)");
    await expect(resetDevelopmentPersonaData(options)).rejects.toThrow();
    expect((await query("SELECT * FROM acesso")).rowCount).toBe(1);
    await query("DROP TABLE acesso");
    await applyPersonaMigrations(url.toString());
    await query(
      "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES('00000000-0000-4000-8000-000000000001','https://fixture.invalid','client')",
    );
    await admin.query(`COMMENT ON DATABASE "${name}" IS NULL`);
    await expect(resetDevelopmentPersonaData(options)).rejects.toThrow();
    await admin.query(`COMMENT ON DATABASE "${name}" IS 'se7e:persona-v2:disposable-development'`);
    await query("CREATE TABLE foreign_data(id integer)");
    await expect(resetDevelopmentPersonaData(options)).rejects.toThrow();
    await query("DROP TABLE foreign_data");
    await query("CREATE SCHEMA unrelated; CREATE TABLE unrelated.protected(id integer)");
    await expect(resetDevelopmentPersonaData(options)).rejects.toThrow();
    await query("DROP TABLE unrelated.protected; DROP SCHEMA unrelated");
    // SQL LIKE '_' is a wildcard: pgx is a user schema, not a system namespace.
    await query(
      "CREATE SCHEMA pgx; CREATE TABLE pgx.protected(id integer); INSERT INTO pgx.protected VALUES(1)",
    );
    await expect(resetDevelopmentPersonaData(options)).rejects.toThrow();
    expect((await query("SELECT * FROM pgx.protected")).rowCount).toBe(1);
    await query("DROP TABLE pgx.protected; DROP SCHEMA pgx");
    const checksum = await query(
      "SELECT filename,checksum FROM _persona_v2_migrations ORDER BY filename LIMIT 1",
    );
    const migration = checksum.rows[0] as { filename: string; checksum: string };
    await query(
      `UPDATE _persona_v2_migrations SET checksum='invalid' WHERE filename='${migration.filename}'`,
    );
    await expect(resetDevelopmentPersonaData(options)).rejects.toThrow();
    await query(
      `UPDATE _persona_v2_migrations SET checksum='${migration.checksum}' WHERE filename='${migration.filename}'`,
    );
    const other = new pg.Client({ connectionString: url.toString() });
    await other.connect();
    try {
      await expect(resetDevelopmentPersonaData(options)).rejects.toThrow();
    } finally {
      await other.end();
    }
    const simulated = await resetDevelopmentPersonaData({ ...options, apply: false });
    expect(simulated.mode).toBe("simulated");
    const cli = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/reset-persona-development.ts",
        "--generation=persona-v2",
        `--confirm-database=${name}`,
      ],
      {
        env: { ...process.env, NODE_ENV: "test", PERSONA_V2_RESET_DATABASE_URL: url.toString() },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    expect(cli.status, cli.stderr).toBe(0);
    expect(cli.stdout).toContain('"mode":"simulated"');
    expect(cli.stdout).not.toContain(base.password);
    expect((await query("SELECT * FROM responsavel")).rowCount).toBe(1);
    await query(`CREATE FUNCTION reset_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'isolated rollback probe'; END $$;
      CREATE TRIGGER reset_fixture_fail AFTER TRUNCATE ON responsavel
      FOR EACH STATEMENT EXECUTE FUNCTION reset_fixture_fail()`);
    await expect(resetDevelopmentPersonaData(options)).rejects.toThrow();
    expect((await query("SELECT * FROM responsavel")).rowCount).toBe(1);
    await query(
      "DROP TRIGGER reset_fixture_fail ON responsavel; DROP FUNCTION reset_fixture_fail()",
    );
    const applied = await resetDevelopmentPersonaData(options);
    expect(applied.mode).toBe("applied");
    expect((await query("SELECT * FROM responsavel")).rowCount).toBe(0);
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    try {
      await verifyPersonaMigrations(client);
    } finally {
      await client.end();
    }
    await applyPersonaMigrations(url.toString());
    expect((await resetDevelopmentPersonaData(options)).mode).toBe("applied");
  } finally {
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
});
