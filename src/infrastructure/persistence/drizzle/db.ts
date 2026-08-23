import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../schema.js";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export const createDb = (databaseUrl: string): { db: Db; pool: pg.Pool } => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  return { db, pool };
};
