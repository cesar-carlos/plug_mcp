import { pathToFileURL } from "node:url";
import pg from "pg";
import { loadConfig } from "../../../config/env.js";
import { NodeCryptoAdapter } from "../../crypto/node-crypto.adapter.js";
import { runSqlPublicationCases } from "../../../application/persona-v2/publication-cases.js";
import { BridgePublicationCaseExecutor } from "../../plug-server/bridge-publication-cases.js";
import { OperatorChannel } from "./operator-channel.js";
import { operatorStartSchema } from "./operator-contract.js";
import { RemoteOperatorFixture } from "./operator-fixture-bridge.js";
import { PostgresPersonaRepository } from "./repository.js";
import { verifyPersonaMigrations } from "./migrate.js";
import { publicationCliFailure } from "./publication-cli-error.js";

const forbidden = (): Promise<never> =>
  Promise.reject(new Error("Operator only supports query cases."));

/** Invoked only by the operator over SSH, never composed in HTTP/MCP or the worker. */
export async function runSshPublication(
  channel: OperatorChannel,
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const request = operatorStartSchema.parse(await channel.read());
  if (
    config.PERSONA_V2_DEPLOYMENT !== "test-server" ||
    config.NODE_ENV !== "production" ||
    config.GIT_SHA !== request.revision ||
    !config.DATABASE_URL
  )
    throw Error("Dedicated test-server revision required.");
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 2 });
  try {
    await verifyPersonaMigrations(pool);
    const crypto = new NodeCryptoAdapter(
      config.MCP_ENCRYPTION_KEY,
      config.MCP_ENCRYPTION_KEY_ID,
      config.MCP_ENCRYPTION_PREVIOUS_KEYS,
      config.MCP_ENCRYPTION_LEGACY_KEY,
    );
    const repository = new PostgresPersonaRepository(pool);
    const target = await repository.transaction(
      { personaIds: [request.personaId], tokenIds: [] },
      async (tx) => {
        const draft = await tx.catalog.find(request.personaId, request.skillId);
        if (draft?.kind !== "consulta" || !draft.training || typeof draft.training !== "object")
          throw Error("Query draft required.");
        const source = (await tx.listSources(request.personaId)).find(
          (s) => s.id === Reflect.get(draft.training as object, "sourceId"),
        );
        if (!source?.active || source.dialect !== "mssql")
          throw Error("Active MSSQL source required.");
        return source;
      },
    );
    if (request.mode === "inspect") {
      const report = await runSqlPublicationCases(
        repository,
        request.personaId,
        request.skillId,
        crypto,
        { supportsStructureGuard: true, evaluate: forbidden, evaluateQuery: forbidden },
        undefined,
        { inspectOnly: true },
      );
      await channel.send({ kind: "result", mode: "inspect", revision: config.GIT_SHA, report });
      return;
    }
    const deadline = Date.parse(request.fixture.expiresAt);
    if (
      deadline <= Date.now() ||
      deadline > Date.now() + 120 * 60000 ||
      request.expected.sourceId !== target.id
    )
      throw Error("Fixture lifetime or source binding refused.");
    const transport = new RemoteOperatorFixture(channel, request.fixture);
    const executor = new BridgePublicationCaseExecutor(
      request.fixture.source,
      request.fixture.tables,
      transport,
      transport,
      {
        verifyCapabilitiesAndPolicy: forbidden,
        execute: forbidden,
        get: forbidden,
        cancel: forbidden,
      },
      {
        runId: request.fixture.runId,
        agentId: request.fixture.source.agentId,
        identityHash: request.fixture.source.identityHash,
      },
      target,
    );
    const report = await runSqlPublicationCases(
      repository,
      request.personaId,
      request.skillId,
      crypto,
      executor,
      undefined,
      { expected: request.expected },
    );
    await channel.send({ kind: "result", mode: "run", revision: config.GIT_SHA, report });
  } finally {
    await pool.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const channel = new OperatorChannel(process.stdin, process.stdout);
  try {
    if (process.stdin.isTTY || process.stdout.isTTY || process.argv.length !== 2)
      throw Error("Private operator pipe required.");
    await runSshPublication(channel, loadConfig());
  } catch (error) {
    await channel.send({ kind: "failure", ...publicationCliFailure(error) }).catch(() => undefined);
    process.exitCode = 1;
  } finally {
    channel.close();
  }
}
