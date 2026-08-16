import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadConfig } from "../../config/env.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const drizzleDir = path.resolve(here, "../../../drizzle");

const run = async (): Promise<void> => {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to migrate");
  }
  const client = new pg.Client({ connectionString: config.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _mcp_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const files = readdirSync(drizzleDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const applied = await client.query<{ filename: string }>(
      "SELECT filename FROM _mcp_migrations",
    );
    const done = new Set(applied.rows.map((row) => row.filename));
    for (const filename of files) {
      if (done.has(filename)) {
        console.log("skip", filename);
        continue;
      }
      const sql = readFileSync(path.join(drizzleDir, filename), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _mcp_migrations (filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");
        console.log("applied", filename);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    console.log("migration ok");
  } finally {
    await client.end();
  }
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
