import type pg from "pg";
import { randomUUID } from "node:crypto";
import type { CryptoPort } from "../../src/domain/ports/crypto.port.js";
import { PostgresPersonaRepository } from "../../src/infrastructure/persistence/persona-v2/repository.js";
import { MemoryAdministrativeSessions } from "../../src/infrastructure/persistence/persona-v2/admin-sessions.js";
import { PersonaAdministration } from "../../src/application/persona-v2/administration.js";
import { PersonaOwnerDelegation } from "../../src/application/persona-v2/owner-delegation.js";
import { PersonaAdministrativeAuthorization } from "../../src/application/persona-v2/administrative-authorization.js";
import { PersonaCatalog } from "../../src/application/persona-v2/catalog.js";
import { PersonaExternalIntegrations } from "../../src/application/persona-v2/external-integrations.js";
import { PersonaExternalActions } from "../../src/application/persona-v2/external-actions.js";
import { reviewDateFixture } from "./review-deadline.js";
import type {
  ExternalTransport,
  ExternalActionTransport,
} from "../../src/domain/persona-v2/external-contract.js";

async function externalBrowserContext(pool: pg.Pool, crypto: CryptoPort) {
  const repository = new PostgresPersonaRepository(pool, crypto);
  const services = {
    repository,
    crypto,
    sessions: new MemoryAdministrativeSessions(crypto),
    now: () => new Date(),
    ownerAuth: {
      hubOrigin: "http://hub.fixture.test",
      login: () => Promise.resolve({ accessToken: "owner-fixture" }),
      profile: () => Promise.resolve({ clientId: "owner-fixture", active: true }),
    },
    sourceVerifier: {
      verify: () => Promise.reject(new Error("Source not used by external fixture")),
    },
  };
  const admin = new PersonaAdministration(services),
    session = (await admin.login("owner@fixture.test", "fixture-password")).sessionId;
  const delegation = new PersonaOwnerDelegation(
    services,
    admin,
    {
      create: () => Promise.reject(new Error("Not used")),
      verify: () => Promise.reject(new Error("Not used")),
      revoke: () => Promise.reject(new Error("Not used")),
    },
    "http://127.0.0.1:5188",
  );
  const authorization = new PersonaAdministrativeAuthorization(services, admin, delegation);
  const transport: ExternalTransport & ExternalActionTransport = {
    invoke: async (_connection, contract, input, _signal, beforeDispatch) => {
      await beforeDispatch();
      if (
        (contract.transport.kind === "rest" && contract.transport.path === "/status") ||
        (contract.transport.kind === "mcp_http" && contract.transport.tool === "get_status")
      ) {
        return { count: 1, complete: true, reference: input.id, status: "applied" };
      }
      return { name: "fixture" };
    },
    executeAction: async (
      _connection,
      _contract,
      _input,
      _signal,
      beforeDispatch,
      beforeEffect,
    ) => {
      await beforeDispatch();
      await beforeEffect();
      return { name: "fixture" };
    },
  };
  const external = new PersonaExternalIntegrations(services, authorization, transport),
    actions = new PersonaExternalActions(services, admin, external, transport);
  return { repository, services, admin, session, authorization, external, actions, transport };
}

/** Synthetic browser fixture only. Does not contact an external provider or certify its effect. */
export async function seedExternalAction(
  pool: pg.Pool,
  crypto: CryptoPort,
  personaId: string,
): Promise<{
  operationId: string;
  fingerprint: string;
  unknownId: string;
  bearer: string;
  skillId: string;
  publicationId: string;
}> {
  const { repository, services, admin, session, authorization, external, actions, transport } =
    await externalBrowserContext(pool, crypto);
  const integrationId = await seedExternalConnection(pool, crypto, personaId, "rest");
  const draft = await external.create(session, personaId, {
    slug: "browser-action",
    name: "Registrar fixture",
    contract: {
      integrationId,
      operationId: randomUUID(),
      purpose: "Registrar referência de teste",
      effect: "acao",
      effectDescription: "Criar registro isolado",
      reconciliation: "Conferir referência no serviço; nunca reenviar sem prova",
      transport: { kind: "rest", method: "POST", path: "/write" },
      input: {
        id: { type: "string", required: true, purpose: "Referência", classification: "livre" },
      },
      output: {
        name: { type: "string", required: true, purpose: "Confirmação", classification: "livre" },
      },
      timeoutMs: 1000,
      maxResponseBytes: 4096,
    },
  });
  const catalog = new PersonaCatalog(services, admin, authorization);
  await catalog.addCase(session, personaId, draft.skillId, {
    required: true,
    content: { name: "Fixture", input: { id: "1" }, expected: { name: "fixture" } },
  });
  await external.runFixtureCases(
    session,
    personaId,
    draft.skillId,
    {
      destination: "https://runner.example.com",
      credential: { credentialType: "bearer", token: "runner-only" },
    },
    transport,
  );
  const preview = await external.preview(session, personaId, draft.skillId, reviewDateFixture());
  const publication = await external.publish(
    session,
    personaId,
    draft.skillId,
    preview.confirmationHash,
  );
  const empty = { sourceIds: [], externalOperationIds: [], skills: [], administrative: [] };
  const issued = await admin.issueToken(session, {
    personaId,
    name: "Consumidor fixture",
    permissions: {
      ...empty,
      externalOperationIds: [draft.operationId],
      skills: [
        {
          skillId: draft.skillId,
          capabilities: publication.package.requiredCapabilities,
          effects: [],
          requireHumanApproval: false,
        },
      ],
    },
    delegation: empty,
    expiresAt: null,
  });
  const persona = await repository.transaction({ personaIds: [personaId], tokenIds: [] }, (tx) =>
    tx.findPersona(personaId),
  );
  const identity = {
    personaId,
    personaVersion: persona!.authorizationVersion,
    tokenId: issued.tokenId,
    tokenVersion: 1,
  };
  const pending = await actions.prepare(identity, {
    skillId: draft.skillId,
    input: { id: "reference-fixture" },
  });
  const uncertain = await actions.prepare(identity, {
    skillId: draft.skillId,
    input: { id: "uncertain-fixture" },
  });
  await actions.approve(session, personaId, {
    operationId: uncertain.operationId,
    fingerprint: uncertain.fingerprint,
  });
  await repository.transaction(
    { personaIds: [personaId], tokenIds: [issued.tokenId] },
    async (tx) => {
      const a = await tx.external!.actions.find(personaId, uncertain.operationId);
      await tx.external!.actions.save(
        {
          ...a!,
          state: "executando",
          version: a!.version + 1,
          claimedAt: new Date(Date.now() - 60000),
        },
        a!.version,
      );
    },
  );
  return {
    operationId: pending.operationId,
    bearer: issued.bearer,
    skillId: draft.skillId,
    publicationId: publication.id,
    fingerprint: pending.fingerprint,
    unknownId: uncertain.operationId,
  };
}

/** Trusted test process only. Not exposed through the browser/server routes. */
export async function runExternalBrowserCases(
  pool: pg.Pool,
  crypto: CryptoPort,
  personaId: string,
  skillId: string,
) {
  const { external, session, transport } = await externalBrowserContext(pool, crypto);
  return external.runFixtureCases(
    session,
    personaId,
    skillId,
    {
      destination: "https://isolated-runner.example.com",
      credential: { credentialType: "bearer", token: "synthetic-runner-only" },
    },
    transport,
  );
}
export async function seedExternalConnection(
  pool: pg.Pool,
  crypto: CryptoPort,
  personaId: string,
  kind: "rest" | "mcp_http",
) {
  const integrationId = randomUUID(),
    registration = {
      name: kind === "rest" ? "Integração fixture" : "MCP fixture",
      kind,
      destination: "https://browser-fixture.example.com",
    };
  await pool.query(
    "INSERT INTO integracao(id,persona_id,nome,tipo,destino,credencial_enc,credencial_versao,ativa) VALUES($1,$2,$3,$4,$5,$6,1,false)",
    [
      integrationId,
      personaId,
      registration.name,
      registration.kind,
      registration.destination,
      crypto.encrypt(
        JSON.stringify({
          personaId,
          id: integrationId,
          version: 1,
          registration,
          credential: { credentialType: "bearer", token: "fixture-only" },
        }),
      ),
    ],
  );
  return integrationId;
}
