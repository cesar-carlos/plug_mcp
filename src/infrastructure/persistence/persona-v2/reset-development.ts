import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { verifyPersonaMigrations } from "./migrate.js";

export interface DevelopmentReset {
  databaseUrl: string;
  environment: string;
  generation: string;
  confirmDatabase: string;
  apply: boolean;
}

export const validateDevelopmentReset = (input: DevelopmentReset): string => {
  const url = new URL(input.databaseUrl);
  const name = url.pathname.slice(1);
  if (
    !["development", "test"].includes(input.environment) ||
    input.generation !== "persona-v2" ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.search !== "" ||
    url.hash !== "" ||
    !/^persona_v2_[a-z0-9_]+_(dev|test)$/.test(name) ||
    name.length > 63 ||
    input.confirmDatabase !== name
  )
    throw new Error("Reset recusado: confirme ambiente, geração e banco local descartável.");
  return name;
};

/** Separate operator command; never called by startup, worker, HTTP or MCP. */
export const resetDevelopmentPersonaData = async (
  input: DevelopmentReset,
): Promise<{ database: string; mode: "simulated" | "applied"; tables: number }> => {
  const name = validateDevelopmentReset(input);
  const directory = new URL("../../../../migrations/persona-v2/", import.meta.url);
  const expected = ["_persona_v2_migrations"];
  for (const file of readdirSync(fileURLToPath(directory)).filter((f) =>
    /^\d{4}_.+\.sql$/.test(f),
  )) {
    const sql = readFileSync(new URL(file, directory), "utf8");
    for (const match of sql.matchAll(/^CREATE TABLE ([a-z][a-z0-9_]*)\s*\(/gm))
      expected.push(match[1]!);
  }
  expected.sort();
  const client = new pg.Client({
    connectionString: input.databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='1s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_xact_lock(19370001) AS acquired",
    );
    if (!lock.rows[0]?.acquired) throw new Error("Manutenção concorrente; reset recusado.");
    const target = await client.query<{ name: string; marker: string | null; active: string }>(`
      SELECT current_database() AS name, shobj_description(d.oid,'pg_database') AS marker,
        (SELECT count(*) FROM pg_stat_activity WHERE datid=d.oid AND pid<>pg_backend_pid()) AS active
      FROM pg_database d WHERE datname=current_database()`);
    const current = target.rows[0];
    if (
      current?.name !== name ||
      current.marker !== "se7e:persona-v2:disposable-development" ||
      current.active !== "0"
    )
      throw new Error("Banco não marcado como descartável ou com conexões abertas.");
    const tables = await client.query<{ schema: string; name: string }>(`
      SELECT n.nspname AS schema,c.relname AS name FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname !~ '^pg_'
        AND n.nspname<>'information_schema' ORDER BY n.nspname,c.relname COLLATE "C"`);
    if (
      tables.rows.some((t) => t.schema !== "public") ||
      JSON.stringify(tables.rows.map((t) => t.name)) !== JSON.stringify(expected)
    )
      throw new Error("Schema desconhecido ou compartilhado; reset recusado.");
    await client.query(
      `LOCK TABLE ${expected.map((t) => `public."${t}"`).join(",")} IN ACCESS EXCLUSIVE MODE NOWAIT`,
    );
    await verifyPersonaMigrations(client);
    const dataTables = expected.filter(
      (t) => !["_persona_v2_migrations", "mcp_schema_generation"].includes(t),
    );
    if (input.apply) {
      // RESTRICT prevents erasing data in an unexpected referencing resource.
      await client.query(
        `TRUNCATE TABLE ${dataTables.map((t) => `public."${t}"`).join(",")} RESTART IDENTITY RESTRICT`,
      );
    }
    await client.query(input.apply ? "COMMIT" : "ROLLBACK");
    return {
      database: name,
      mode: input.apply ? "applied" : "simulated",
      tables: dataTables.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
};
