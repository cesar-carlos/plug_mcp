import { pathToFileURL } from "node:url";
import pg from "pg";
import { loadConfig } from "../../../config/env.js";
import { verifyPersonaMigrations } from "./migrate.js";
import { PostgresPersonaRepository } from "./repository.js";
import { PostgresSourceCredentials } from "./source-credentials.js";
import { NodeCryptoAdapter } from "../../crypto/node-crypto.adapter.js";
import { PersonaSourceQuery } from "../../plug-server/persona-source-query.js";
import { PersonaSqlOperationGateway } from "../../plug-server/persona-sql-operation.js";
import { BridgePublicationCaseExecutor } from "../../plug-server/bridge-publication-cases.js";
import { PlugServerRestAdapter } from "../../plug-server/plug-server-rest.adapter.js";
import { runSqlPublicationCases } from "../../../application/persona-v2/publication-cases.js";
import { runFederationPublicationCases } from "../../../application/persona-v2/federation-publication-cases.js";
import {
  LocalPublicationFixtureControl,
  readPublicationRunManifest,
} from "./publication-fixture-control.js";
import { PinoLoggerAdapter, createPino } from "../../logging/pino-logger.adapter.js";
import type { SourceQueryGatewayPort } from "../../../domain/ports/source-query.port.js";
import type { SqlOperationGatewayPort } from "../../../domain/ports/persona-v2.port.js";
import { publicationCliFailure } from "./publication-cli-error.js";

export async function executePublicationManifest(
  path: string,
  config: ReturnType<typeof loadConfig>,
  transports?: { reads: SourceQueryGatewayPort; operations: SqlOperationGatewayPort },
): Promise<{
  approved: boolean;
  revision: number;
  packageHash: string;
  results: readonly { id: string; passed: boolean }[];
}> {
  const manifest = await readPublicationRunManifest(path);
  if (config.NODE_ENV === "production" || !config.DATABASE_URL)
    throw new Error("Development MCP persona-v2 database required.");
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  try {
    await verifyPersonaMigrations(pool);
    const crypto = new NodeCryptoAdapter(
      config.MCP_ENCRYPTION_KEY,
      config.MCP_ENCRYPTION_KEY_ID,
      config.MCP_ENCRYPTION_PREVIOUS_KEYS,
      config.MCP_ENCRYPTION_LEGACY_KEY,
    );
    const repository = new PostgresPersonaRepository(pool);
    const context = await repository.transaction(
      { personaIds: [manifest.personaId], tokenIds: [] },
      async (tx) => ({
        draft: await tx.catalog.find(manifest.personaId, manifest.skillId),
        sources: await tx.listSources(manifest.personaId),
      }),
    );
    const hub = new PlugServerRestAdapter(
      manifest.hubUrl,
      new PinoLoggerAdapter(createPino(config.LOG_LEVEL, false)),
    );
    const credentials = new PostgresSourceCredentials(pool);
    const reads = transports?.reads ?? new PersonaSourceQuery(credentials, hub, crypto);
    const operations =
      transports?.operations ??
      new PersonaSqlOperationGateway(credentials, hub, hub, crypto, manifest.hubUrl);
    const fixtures = new Map<string, BridgePublicationCaseExecutor>();
    for (const binding of manifest.bindings) {
      const source = context.sources.find((s) => s.id === binding.sourceId);
      const fixture = context.sources.find((s) => s.id === binding.fixtureSourceId);
      if (!source || !fixture) throw new Error("Explicit source binding missing.");
      fixtures.set(
        source.id,
        new BridgePublicationCaseExecutor(
          fixture,
          binding.tables,
          new LocalPublicationFixtureControl(manifest.sessionRoot),
          reads,
          operations,
          { runId: manifest.runId, agentId: fixture.agentId, identityHash: fixture.identityHash! },
          source,
        ),
      );
    }
    const report =
      context.draft?.kind === "cruzamento"
        ? await runFederationPublicationCases(
            repository,
            manifest.personaId,
            manifest.skillId,
            crypto,
            fixtures,
          )
        : await runSqlPublicationCases(repository, manifest.personaId, manifest.skillId, crypto, {
            supportsStructureGuard: true,
            evidence: (source) => {
              const f = fixtures.get(source.id);
              if (!f) throw new Error("Fixture absent.");
              return f.evidence(source);
            },
            evaluateQuery: (pkg, source, test) =>
              fixtures.get(source.id)!.evaluateQuery(pkg, source, test),
            evaluate: (pkg, command, test) =>
              fixtures.get(pkg.sourceId)!.evaluate(pkg, command, test),
          });
    return report;
  } finally {
    await pool.end();
  }
}
async function main(): Promise<void> {
  const [path, ...extra] = process.argv.slice(2);
  if (!path || extra.length) throw new Error("Explicit operator fixture manifest required.");
  const report = await executePublicationManifest(path, loadConfig());
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.approved) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify(publicationCliFailure(error))}\n`);
    process.exitCode = 1;
  });
