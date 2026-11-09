import { randomUUID, randomBytes } from "node:crypto";
import { dirname, basename, join } from "node:path";
import { realpath, access, writeFile } from "node:fs/promises";
import { z } from "zod";
import { readStablePluginFile } from "../../src/infrastructure/plugins/package-read.js";
import { readChainManifest } from "./chain-manifest.js";
import { assertManualFixtureAccess } from "./manual-fixture-access.js";
import { fixtureSessionDeadline } from "./manual-session-contract.js";
import { LocalPublicationFixtureControl } from "../../src/infrastructure/persistence/persona-v2/publication-fixture-control.js";
import { LocalOperatorFixture } from "../../src/infrastructure/persistence/persona-v2/operator-fixture-bridge.js";
import { operatorFixtureSchema } from "../../src/infrastructure/persistence/persona-v2/operator-contract.js";
import { PersonaSourceVerifier } from "../../src/infrastructure/plug-server/persona-source-verifier.js";
import { PersonaSourceQuery } from "../../src/infrastructure/plug-server/persona-source-query.js";
import { PlugServerRestAdapter } from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import {
  PinoLoggerAdapter,
  createPino,
} from "../../src/infrastructure/logging/pino-logger.adapter.js";
import type { SourceCredentialPort } from "../../src/domain/ports/source-credential.port.js";

const json = async (path: string): Promise<unknown> =>
  JSON.parse((await readStablePluginFile(path, 512 * 1024)).toString("utf8"));
export async function openOperatorFixture(
  sessionPath: string,
): Promise<{ descriptor: z.infer<typeof operatorFixtureSchema>; handler: LocalOperatorFixture }> {
  const session = await realpath(sessionPath);
  const root = dirname(session);
  const manifest = readChainManifest(join(root, "manifest.json"));
  if (!/^chain-[a-f0-9]{32}$/.test(basename(session)) || manifest.root !== root)
    throw Error("Invalid fixture session.");
  assertManualFixtureAccess(root);
  const sessionManifest = z
    .object({
      runId: z.string(),
      sessionRoot: z.string(),
      engines: z.object({ mssql: z.object({ publicationTables: z.unknown() }) }),
    })
    .passthrough()
    .parse(await json(join(session, "manifest.json")));
  if (sessionManifest.runId !== manifest.runId || sessionManifest.sessionRoot !== session)
    throw Error("Fixture session mismatch.");
  const deadline = fixtureSessionDeadline(sessionManifest, 0);
  if (deadline <= Date.now()) throw Error("Expired fixture.");
  const ready = z
    .object({ sessionRoot: z.string(), runId: z.string(), expiresAt: z.string() })
    .parse(await json(join(root, "manual-ready.json")));
  if (
    ready.sessionRoot !== session ||
    ready.runId !== manifest.runId ||
    Date.parse(ready.expiresAt) !== deadline
  )
    throw Error("Fixture readiness mismatch.");
  for (const path of [join(root, "manual-stopped.json"), join(session, "manual-stop")]) {
    const exists = await access(path).then(
      () => true,
      (error: unknown) => {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
        throw error;
      },
    );
    if (exists) throw Error("Stopped fixture.");
  }
  const hub = z
    .object({
      hubUrl: z.string().url(),
      engines: z.object({ mssql: z.object({ agentId: z.uuid() }) }),
    })
    .parse(await json(join(session, "hub-ready.json")));
  const url = new URL(hub.hubUrl);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error("Local fixture hub required.");
  const credentials = z
    .object({
      sources: z.array(
        z.object({
          environment: z.literal("test"),
          dialect: z.string(),
          agentId: z.uuid(),
          email: z.string(),
          password: z.string(),
          clientToken: z.string(),
        }),
      ),
    })
    .parse(await json(join(session, "manual-access.json")));
  const selected = credentials.sources.filter(
    (s) => s.dialect === "mssql" && s.agentId === hub.engines.mssql.agentId,
  );
  if (selected.length !== 1) throw Error("Explicit MSSQL fixture required.");
  const credential = selected[0]!;
  // A crashed/uncertain job must not be resumed by constructing another handler.
  await writeFile(
    join(session, "operator-run.claim.json"),
    JSON.stringify({ version: 1, runId: manifest.runId }),
    { flag: "wx", mode: 0o600 },
  );
  const gateway = new PlugServerRestAdapter(
    url.origin,
    new PinoLoggerAdapter(createPino("silent", false)),
  );
  const proof = await new PersonaSourceVerifier(gateway).verify({
    ...credential,
    dialect: "mssql",
    database: manifest.runId,
  });
  const source = {
    id: randomUUID(),
    personaId: randomUUID(),
    physicalSourceId: randomUUID(),
    name: "Operator fixture" as const,
    purpose: "Synthetic publication cases" as const,
    environment: "test" as const,
    agentId: credential.agentId,
    database: manifest.runId,
    dialect: "mssql" as const,
    credentialId: randomUUID(),
    credentialVersion: 1 as const,
    authorizationVersion: 1 as const,
    active: true as const,
    identityHash: proof.identityHash,
    identityVerifiedAt: proof.verifiedAt,
    rowRestrictions: [] as [],
  };
  const crypto = new NodeCryptoAdapter(randomBytes(32).toString("hex"));
  let invalidated = false;
  const store: SourceCredentialPort = {
    find: (personaId, credentialId) =>
      Promise.resolve(
        !invalidated && personaId === source.personaId && credentialId === source.credentialId
          ? {
              id: source.credentialId,
              personaId: source.personaId,
              version: 1,
              emailEnc: crypto.encrypt(credential.email),
              passwordEnc: crypto.encrypt(credential.password),
              clientTokenEnc: crypto.encrypt(credential.clientToken),
            }
          : null,
      ),
    invalidateIdentity: () => {
      invalidated = true;
      return Promise.resolve();
    },
  };
  const descriptor = operatorFixtureSchema.parse({
    runId: manifest.runId,
    expiresAt: ready.expiresAt,
    tables: sessionManifest.engines.mssql.publicationTables,
    source,
  });
  return {
    descriptor,
    handler: new LocalOperatorFixture(
      descriptor,
      new PersonaSourceQuery(store, gateway, crypto),
      new LocalPublicationFixtureControl(session),
    ),
  };
}
