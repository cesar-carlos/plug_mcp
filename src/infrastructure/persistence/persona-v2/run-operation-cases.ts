import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { z } from "zod";
import { loadConfig } from "../../../config/env.js";
import { personaV2TestDatabaseUrl } from "../../../config/persona-v2-test.js";
import { PostgresPersonaRepository } from "./repository.js";
import { verifyPersonaMigrations } from "./migrate.js";
import { PostgresOperationCaseExecutor } from "./operation-case-postgres.js";
import { NodeCryptoAdapter } from "../../crypto/node-crypto.adapter.js";
import { runOperationCases } from "../../../application/persona-v2/operation-cases.js";

async function main() {
  const [personaId, skillId] = z.tuple([z.uuid(), z.uuid()]).parse(process.argv.slice(2));
  const config = loadConfig();
  if (config.NODE_ENV === "production" || !config.DATABASE_URL)
    throw new Error("Runner exige banco MCP de desenvolvimento explícito.");
  const fixtureUrl = new URL(personaV2TestDatabaseUrl());
  const adminUrl = new URL(fixtureUrl);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Pool({ connectionString: adminUrl.toString() });
  const name = `persona_operation_runner_${randomUUID().replaceAll("-", "")}_test`;
  const metadata = new pg.Pool({ connectionString: config.DATABASE_URL });
  let fixture: pg.Pool | undefined,
    created = false;
  try {
    await verifyPersonaMigrations(metadata);
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    fixtureUrl.pathname = `/${name}`;
    fixture = new pg.Pool({ connectionString: fixtureUrl.toString() });
    const crypto = new NodeCryptoAdapter(
      config.MCP_ENCRYPTION_KEY,
      config.MCP_ENCRYPTION_KEY_ID,
      config.MCP_ENCRYPTION_PREVIOUS_KEYS,
      config.MCP_ENCRYPTION_LEGACY_KEY,
    );
    const executor = new PostgresOperationCaseExecutor(fixture);
    const report = await new PostgresPersonaRepository(metadata).transaction(
      { personaIds: [personaId], tokenIds: [] },
      (tx) => runOperationCases(tx, personaId, skillId, crypto, executor),
    );
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!report.approved) process.exitCode = 1;
  } finally {
    await fixture?.end();
    await metadata.end();
    try {
      if (created) await admin.query(`DROP DATABASE "${name}"`);
    } finally {
      await admin.end();
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    process.stderr.write(
      "Runner recusado: verifique banco dedicado, casos e configuração. Nenhuma fonte cadastrada recebe DML de teste.\n",
    );
    process.exitCode = 1;
  });
