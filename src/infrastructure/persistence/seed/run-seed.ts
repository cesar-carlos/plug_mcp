import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { loadConfig } from "../../../config/env.js";
import * as schema from "../schema.js";
import { DrizzleCatalogoRepository } from "../drizzle/drizzle-repos.js";

const run = async (): Promise<void> => {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed");
  }
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const result = await new DrizzleCatalogoRepository(db).aplicarSeed();
  console.log("catalog seed ok", result);
  await pool.end();
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
