import { lstat, realpath, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { loadConfig, type AppConfig } from "../../../config/env.js";
import { NodeCryptoAdapter } from "../../crypto/node-crypto.adapter.js";
import { PostgresPersonaRepository } from "./repository.js";
import { verifyPersonaMigrations } from "./migrate.js";
import { externalRunManifestSchema } from "../../../domain/persona-v2/external-run.js";
import type { ExternalRunResult } from "../../../domain/persona-v2/external-run.js";
import { PersonaExternalIntegrations } from "../../../application/persona-v2/external-integrations.js";
import { PersonaExternalAdapters } from "../../persona-v2/external-adapters.js";
import { ExternalHttpsFixtureControl } from "../../persona-v2/external-fixture-control.js";
import type {
  ExternalTransport,
  ExternalActionTransport,
} from "../../../domain/persona-v2/external-contract.js";

export async function executeExternalManifest(
  path: string,
  config: AppConfig,
  adapter: ExternalTransport & ExternalActionTransport = new PersonaExternalAdapters(),
): Promise<ExternalRunResult> {
  if (config.NODE_ENV === "production" || !config.DATABASE_URL)
    throw new Error("Development persona-v2 database required");
  const full = resolve(path),
    file = await lstat(full);
  if (
    !full.endsWith(".json") ||
    !file.isFile() ||
    file.isSymbolicLink() ||
    file.size > 65536 ||
    (await realpath(full)).toLowerCase() !== full.toLowerCase()
  )
    throw new Error("Explicit regular JSON manifest required");
  const manifest = externalRunManifestSchema.parse(JSON.parse(await readFile(full, "utf8")));
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  try {
    await verifyPersonaMigrations(pool);
    const crypto = new NodeCryptoAdapter(
      config.MCP_ENCRYPTION_KEY,
      config.MCP_ENCRYPTION_KEY_ID,
      config.MCP_ENCRYPTION_PREVIOUS_KEYS,
      config.MCP_ENCRYPTION_LEGACY_KEY,
    );
    const service = new PersonaExternalIntegrations(
      { repository: new PostgresPersonaRepository(pool, crypto), crypto, now: () => new Date() },
      {
        run: () =>
          Promise.reject(
            new Error("Administrative sessions are not available in the operator CLI"),
          ),
      },
      adapter,
    );
    return await service.runOperatorFixtureCases(
      manifest,
      adapter,
      new ExternalHttpsFixtureControl(adapter),
    );
  } finally {
    await pool.end();
  }
}
async function main(): Promise<void> {
  const [path, ...extra] = process.argv.slice(2);
  if (!path || extra.length) throw new Error("Explicit operator manifest required");
  const report = await executeExternalManifest(path, loadConfig());
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.approved) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    process.stderr.write(
      "Rodada externa não aprovada. Confira manifesto, fixture e relatório; não repita efeitos incertos.\n",
    );
    process.exitCode = 1;
  });
