import pg from "pg";
import { loadConfig } from "../src/config/env.js";
import { PostgresOAuthStore } from "../src/infrastructure/persistence/oauth-store.js";

if (!process.argv.includes("--all") || !process.argv.includes("--confirm"))
  throw new Error(
    "Uso: oauth:revoke -- --all --confirm. Execute após desligar CHATGPT_OAUTH_ENABLED.",
  );
const config = loadConfig();
if (config.CHATGPT_OAUTH_ENABLED)
  throw new Error(
    "Desligue CHATGPT_OAUTH_ENABLED e reinicie a instância antes de invalidar o piloto.",
  );
if (!config.DATABASE_URL) throw new Error("PostgreSQL obrigatório.");
const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
try {
  await new PostgresOAuthStore(pool).revokeAll(Date.now());
  process.stdout.write("Concessões, códigos e transações OAuth invalidados.\n");
} finally {
  await pool.end();
}
