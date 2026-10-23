import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PERSONA_SCHEMA_GENERATION } from "../../../domain/persona-v2/model.js";
import { loadConfig } from "../../../config/env.js";

const directory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../migrations/persona-v2",
);

/** Read-only classification precedes all DDL, including the migration ledger. */
export const assertPersonaDatabase = async (
  client: Pick<pg.Client, "query">,
): Promise<"empty" | "persona-v2"> => {
  const tables = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  if (tables.rows.length === 0) {
    return "empty";
  }
  if (
    !tables.rows.some((t) => t.tablename === "mcp_schema_generation") ||
    tables.rows.some((t) => ["acesso", "usuario_mcp", "_mcp_migrations"].includes(t.tablename))
  ) {
    throw new Error("Banco legado ou desconhecido recusado sem alteração; use um banco MCP vazio.");
  }
  const generation = await client.query<{ generation: string }>(
    "SELECT generation FROM mcp_schema_generation WHERE singleton=true",
  );
  if (
    generation.rows.length !== 1 ||
    generation.rows[0]?.generation !== PERSONA_SCHEMA_GENERATION
  ) {
    throw new Error("Geração do banco incompatível; nenhuma migração aplicada.");
  }
  return "persona-v2";
};

export const applyPersonaMigrations = async (databaseUrl: string): Promise<void> => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock(19370001)");
      await assertPersonaDatabase(client);
      await client.query(`CREATE TABLE IF NOT EXISTS _persona_v2_migrations (
        filename text PRIMARY KEY, checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      const applied = await client.query<{ filename: string; checksum: string }>(
        "SELECT filename,checksum FROM _persona_v2_migrations",
      );
      const files = readdirSync(directory)
        .filter((file) => /^\d{4}_.+\.sql$/.test(file))
        .sort();
      for (const previous of applied.rows) {
        if (!files.includes(previous.filename)) {
          throw new Error("Migração aplicada ausente no pacote; execução recusada.");
        }
      }
      for (const filename of files) {
        const sql = readFileSync(path.join(directory, filename), "utf8");
        const checksum = createHash("sha256").update(sql).digest("hex");
        const previous = applied.rows.find((row) => row.filename === filename);
        if (previous && previous.checksum !== checksum) {
          throw new Error("Migração aplicada foi alterada; execução recusada.");
        }
        if (!previous) {
          await client.query(sql);
          await client.query(
            "INSERT INTO _persona_v2_migrations(filename,checksum) VALUES($1,$2)",
            [filename, checksum],
          );
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
};

/** Startup/readiness only verify the packaged generation; they never perform DDL. */
export const verifyPersonaMigrations = async (client: Pick<pg.Client, "query">): Promise<void> => {
  if ((await assertPersonaDatabase(client)) !== "persona-v2") {
    throw new Error("Aplique as migrações persona-v2 antes de iniciar.");
  }
  const applied = await client.query<{ filename: string; checksum: string }>(
    "SELECT filename,checksum FROM _persona_v2_migrations",
  );
  const files = readdirSync(directory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  if (
    applied.rows.length !== files.length ||
    applied.rows.some((row) => !files.includes(row.filename))
  ) {
    throw new Error(
      "Migrações persona-v2 incompletas ou incompatíveis; inicialização recusada sem alteração.",
    );
  }
  for (const filename of files) {
    const checksum = createHash("sha256")
      .update(readFileSync(path.join(directory, filename), "utf8"))
      .digest("hex");
    if (applied.rows.find((r) => r.filename === filename)?.checksum !== checksum) {
      throw new Error(
        "Checksum de migração persona-v2 incompatível; inicialização recusada sem alteração.",
      );
    }
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL obrigatório para migração persona-v2.");
  }
  await applyPersonaMigrations(config.DATABASE_URL);
}
