import pg from "pg";
import { loadConfig } from "../../config/env.js";
import { parseEscopoSkill } from "../../domain/entities/escopo.js";
import { escopoFromSqlModelo } from "../../application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../application/use-cases/shared/sql-modelo.js";

const run = async (): Promise<void> => {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to backfill skill.escopo");
  }
  const client = new pg.Client({ connectionString: config.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{ id: string; sql_modelo: string; escopo: unknown }>(
      "SELECT id, sql_modelo, escopo FROM skill",
    );
    let updated = 0;
    let skipped = 0;
    for (const row of result.rows) {
      const atual = parseEscopoSkill(row.escopo);
      if (atual.tabelas.length > 0) {
        skipped += 1;
        continue;
      }
      try {
        const escopo = escopoFromSqlModelo(parseSqlModelo(row.sql_modelo));
        if (escopo.tabelas.length === 0) {
          skipped += 1;
          continue;
        }
        await client.query(
          "UPDATE skill SET escopo = $2::jsonb, updated_at = now() WHERE id = $1",
          [row.id, JSON.stringify(escopo)],
        );
        updated += 1;
        console.log("escopo", row.id);
      } catch (error) {
        skipped += 1;
        const message = error instanceof Error ? error.message : "sql inválido";
        console.log("skip", row.id, message);
      }
    }
    console.log(`backfill escopo ok: ${String(updated)} updated, ${String(skipped)} skipped`);
  } finally {
    await client.end();
  }
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
