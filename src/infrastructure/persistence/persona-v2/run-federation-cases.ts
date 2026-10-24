import { pathToFileURL } from "node:url";
import pg from "pg";
import { z } from "zod";
import { PostgresPersonaRepository } from "./repository.js";
import { verifyPersonaMigrations } from "./migrate.js";
import { NodeCryptoAdapter } from "../../crypto/node-crypto.adapter.js";
import { loadConfig } from "../../../config/env.js";
import { runFederationCases } from "../../../application/persona-v2/federation-cases.js";

async function main() {
  const [personaId, skillId] = z.tuple([z.uuid(), z.uuid()]).parse(process.argv.slice(2));
  const config = loadConfig();
  if (config.NODE_ENV === "production" || !config.DATABASE_URL)
    throw new Error("Runner persona-v2 exige banco MCP de desenvolvimento explícito.");
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  try {
    await verifyPersonaMigrations(pool);
    const crypto = new NodeCryptoAdapter(
      config.MCP_ENCRYPTION_KEY,
      config.MCP_ENCRYPTION_KEY_ID,
      config.MCP_ENCRYPTION_PREVIOUS_KEYS,
      config.MCP_ENCRYPTION_LEGACY_KEY,
    );
    const report = await new PostgresPersonaRepository(pool).transaction(
      { personaIds: [personaId], tokenIds: [] },
      (tx) => runFederationCases(tx, personaId, skillId, crypto),
    );
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!report.approved) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write(
      "Runner recusado ou indisponível. Confira configuração, geração do banco e IDs.\n",
    );
    process.exitCode = 1;
  });
}
