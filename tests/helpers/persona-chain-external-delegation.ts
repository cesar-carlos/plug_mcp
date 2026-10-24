import { randomUUID } from "node:crypto";
import type pg from "pg";
import request from "supertest";
import { expect } from "vitest";
import { testConfig } from "../../src/config/env.js";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { PostgresPersonaRepository } from "../../src/infrastructure/persistence/persona-v2/repository.js";
import { MemoryAdministrativeSessions } from "../../src/infrastructure/persistence/persona-v2/admin-sessions.js";
import { PersonaOwnerAuthentication } from "../../src/infrastructure/plug-server/persona-owner-auth.js";
import { PersonaOwnerDelegationHub } from "../../src/infrastructure/plug-server/persona-owner-delegation.js";
import { PersonaSourceVerifier } from "../../src/infrastructure/plug-server/persona-source-verifier.js";
import { PlugServerRestAdapter } from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { PersonaAdministration } from "../../src/application/persona-v2/administration.js";
import { PersonaOwnerDelegation } from "../../src/application/persona-v2/owner-delegation.js";
import { PersonaAdministrativeAuthorization } from "../../src/application/persona-v2/administrative-authorization.js";
import { PersonaExternalIntegrations } from "../../src/application/persona-v2/external-integrations.js";
import { PersonaCatalog } from "../../src/application/persona-v2/catalog.js";
import type {
  ExternalTransport,
  ExternalActionTransport,
} from "../../src/domain/persona-v2/external-contract.js";
import { seedExternalConnection } from "./persona-external-action.js";
import { reviewDateFixture } from "./review-deadline.js";
import { SilentTestLogger } from "./silent-logger.js";
import { parseMcpPayload } from "./mcp-rpc.js";
import { exerciseIntegrationManagementOAuth } from "./persona-chain-integration-management-oauth.js";
import { physicalOAuthClient, physicalOAuthRedirect } from "./persona-chain-physical-oauth.js";
import { externalProviderFixture } from "./external-provider.js";

/** Real persistent hub authority; provider results below are editorial fixture data only. */
export async function exerciseExternalDelegation(c: {
  db: pg.Pool;
  databaseUrl: string;
  hubUrl: string;
  client: { email: string; password: string };
}) {
  const origin = "https://mcp.fixture.test";
  const config = testConfig({
    DATABASE_URL: c.databaseUrl,
    PLUG_SERVER_BASE_URL: c.hubUrl,
    PUBLIC_BASE_URL: origin,
    LOG_LEVEL: "silent",
    PERSONA_V2_OAUTH_ENABLED: true,
    PERSONA_V2_OAUTH_CLIENTS: { [physicalOAuthClient]: [physicalOAuthRedirect] },
  });
  const crypto = new NodeCryptoAdapter(config.MCP_ENCRYPTION_KEY);
  const hub = new PlugServerRestAdapter(c.hubUrl, new SilentTestLogger());
  const services = {
    repository: new PostgresPersonaRepository(c.db, crypto),
    crypto,
    sessions: new MemoryAdministrativeSessions(crypto),
    now: () => new Date(),
    ownerAuth: new PersonaOwnerAuthentication(c.hubUrl, hub),
    sourceVerifier: new PersonaSourceVerifier(hub),
  };
  const admin = new PersonaAdministration(services);
  const session = (await admin.login(c.client.email, c.client.password)).sessionId;
  const persona = await admin.createPersona(session, {
    name: "External editorial fixture",
    specialty: "Fixture",
    instructions: "Only synthetic cases",
  });
  const remoteDelegation = new PersonaOwnerDelegationHub(c.hubUrl, fetch);
  const delegation = new PersonaOwnerDelegation(services, admin, remoteDelegation, origin);
  const authorization = new PersonaAdministrativeAuthorization(services, admin, delegation);
  let providerCalls = 0;
  const transport: ExternalTransport & ExternalActionTransport = {
    invoke: async () => {
      providerCalls++;
      return { name: "fixture" };
    },
    executeAction: async (_c, _p, _i, _s, beforeDispatch, beforeEffect) => {
      await beforeDispatch();
      await beforeEffect();
      providerCalls++;
      return { name: "fixture" };
    },
  };
  const external = new PersonaExternalIntegrations(services, authorization, transport);
  const integrationId = await seedExternalConnection(c.db, crypto, persona.id, "rest");
  const managedId = await seedExternalConnection(c.db, crypto, persona.id, "rest");
  const discoveryId = await seedExternalConnection(c.db, crypto, persona.id, "mcp_http");
  const draft = await external.create(session, persona.id, {
    slug: "external-editorial",
    name: "Fixture",
    contract: {
      integrationId,
      operationId: randomUUID(),
      purpose: "Editorial fixture",
      effect: "acao",
      effectDescription: "Synthetic fixture only",
      reconciliation: "No automatic retry",
      transport: { kind: "rest", method: "POST", path: "/write" },
      input: {
        id: { type: "string", required: true, purpose: "Reference", classification: "livre" },
      },
      output: {
        name: { type: "string", required: true, purpose: "Result", classification: "livre" },
      },
      timeoutMs: 1000,
      maxResponseBytes: 4096,
    },
  });
  const catalog = new PersonaCatalog(services, admin, authorization);
  await catalog.addCase(session, persona.id, draft.skillId, {
    required: true,
    content: { name: "Synthetic", input: { id: "1" }, expected: { name: "fixture" } },
  });
  await external.runFixtureCases(
    session,
    persona.id,
    draft.skillId,
    {
      destination: "https://fixture.example.com",
      credential: { credentialType: "bearer", token: "fixture-only" },
    },
    transport,
  );
  const preview = await external.preview(session, persona.id, draft.skillId, reviewDateFixture());
  const publication = await external.publish(
    session,
    persona.id,
    draft.skillId,
    preview.confirmationHash,
  );
  const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const permissions = {
    ...empty,
    administrative: ["treinar" as const, "gerenciar_integracoes" as const, "publicar" as const],
    managedIntegrationIds: [managedId, discoveryId],
    externalOperationIds: [draft.operationId],
    skills: [
      {
        skillId: draft.skillId,
        capabilities: publication.package.requiredCapabilities,
        effects: [],
        requireHumanApproval: false,
      },
    ],
  };
  const issued = await admin.issueToken(session, {
    personaId: persona.id,
    name: "Editor",
    permissions,
    delegation: empty,
    expiresAt: new Date(Date.now() + 3600000),
  });
  const delegated = await delegation.create(session, persona.id, 0, [
    "treinar",
    "gerenciar_integracoes",
    "publicar",
  ]);
  const baselineCalls = providerCalls;
  const provider = await externalProviderFixture("mcp_http");
  const compose = () =>
    composePersonaV2(config, {
      oauthClient: { validate: async () => undefined },
      externalDiscovery: provider.discovery,
    });
  let candidate = await compose();
  const call = async (name: string, args: object, bearer = issued.bearer) => {
    const response = await request(candidate.app)
      .post("/mcp")
      .set("Host", "mcp.fixture.test")
      .set("Authorization", `Bearer ${bearer}`)
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "tools/call",
        params: { name, arguments: args },
      });
    expect(response.status).toBe(200);
    const payload = parseMcpPayload(response);
    if (payload.error) {
      expect(payload.error).toMatchObject({ code: -32602 });
      return { isError: true, content: [] };
    }
    return payload.result as { isError?: boolean; content: { text: string }[] };
  };
  try {
    const listed = await call("listar_integracoes_administraveis", {});
    expect(listed.isError).not.toBe(true);
    const connections = JSON.parse(listed.content[0]!.text) as { id: string }[];
    expect(connections.map((row) => row.id).sort()).toEqual([managedId, discoveryId].sort());
    expect((await call("revisar_gestao_integracao", { integrationId })).isError).toBe(true);
    const creation = await call("criar_skill_externa", {
      slug: "delegated-unpublished",
      name: "Rascunho delegado",
      contract: { ...publication.package.training, integrationId: managedId },
    });
    expect(creation.isError).not.toBe(true);
    const editorial = JSON.parse(creation.content[0]!.text) as { skillId: string };
    expect(
      (
        await call("criar_skill_externa", {
          slug: "outside-scope",
          name: "Fora",
          contract: publication.package.training,
        })
      ).isError,
    ).toBe(true);
    const caseInput = {
      kind: "acao_externa",
      skillId: editorial.skillId,
      expectedRevision: 1,
      required: true,
      content: { name: "Rascunho", input: { id: "3" }, expected: { name: "fixture" } },
    };
    expect((await call("editar_caso_skill", caseInput)).isError).not.toBe(true);
    expect((await call("editar_caso_skill", caseInput)).isError).toBe(true);
    const editorialRead = await call("obter_rascunho_externo", { skillId: editorial.skillId });
    expect(editorialRead.isError).not.toBe(true);
    const editorialContract = JSON.parse(editorialRead.content[0]!.text).contract;
    expect(
      (
        await call("editar_skill_externa", {
          skillId: editorial.skillId,
          expectedRevision: 2,
          name: "Revisão persistente",
          contract: editorialContract,
        })
      ).isError,
    ).not.toBe(true);
    const review = await call("revisar_gestao_integracao", { integrationId: managedId });
    expect(review.isError).not.toBe(true);
    const impact = JSON.parse(review.content[0]!.text);
    const suspension = {
      integrationId: managedId,
      suspended: true,
      expectedVersion: impact.connection.managementVersion,
      fingerprint: impact.fingerprint,
      confirmed: true,
    };
    expect((await call("alterar_estado_integracao", suspension)).isError).not.toBe(true);
    expect((await call("alterar_estado_integracao", suspension)).isError).toBe(true);
    const args = { kind: "acao_externa", skillId: draft.skillId };
    const initial = await call("obter_testes_skill", args);
    expect(initial.isError).not.toBe(true);
    const details = JSON.parse(initial.content[0]!.text);
    expect(details.requiredApproved).toBe(true);
    const edit = {
      ...args,
      expectedRevision: details.revision,
      required: true,
      content: { name: "Delegated synthetic", input: { id: "2" }, expected: { name: "fixture" } },
    };
    expect((await call("editar_caso_skill", edit)).isError).not.toBe(true);
    expect((await call("editar_caso_skill", edit)).isError).toBe(true);
    await candidate.close();
    candidate = await compose();
    const persisted = await call("revisar_gestao_integracao", { integrationId: managedId });
    expect(persisted.isError).not.toBe(true);
    const persistedImpact = JSON.parse(persisted.content[0]!.text);
    expect(persistedImpact.connection.managementVersion).toBe(suspension.expectedVersion + 1);
    const recovery = {
      ...suspension,
      suspended: false,
      expectedVersion: persistedImpact.connection.managementVersion,
      fingerprint: persistedImpact.fingerprint,
    };
    const resumed = await call("obter_testes_skill", args);
    expect(resumed.isError).not.toBe(true);
    expect(JSON.parse(resumed.content[0]!.text)).toMatchObject({
      revision: details.revision + 1,
      requiredApproved: false,
    });
    expect(
      (await services.repository.transaction({ personaIds: [persona.id], tokenIds: [] }, (tx) =>
        tx.external!.publication(persona.id, draft.skillId),
      ))!.id,
    ).toBe(publication.id);
    const local = await services.repository.transaction(
      { personaIds: [persona.id], tokenIds: [] },
      (tx) => tx.security.delegation(persona.id),
    );
    expect((await call("alterar_estado_integracao", recovery)).isError).not.toBe(true);
    const isolatedTransport: ExternalTransport & ExternalActionTransport = {
      invoke: async () => ({ name: "fixture" }),
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
    await external.runFixtureCases(
      session,
      persona.id,
      editorial.skillId,
      {
        destination: "https://isolated-editor.example.com",
        credential: { credentialType: "bearer", token: "fixture-only" },
      },
      isolatedTransport,
    );
    await external.preview(session, persona.id, editorial.skillId, reviewDateFixture());
    const assertOAuthRevoked = await exerciseIntegrationManagementOAuth(
      candidate.app,
      issued.bearer,
      managedId,
      integrationId,
      editorial.skillId,
      discoveryId,
    );
    const tokenAfter = await c.db.query("SELECT permissoes FROM persona_token WHERE id=$1", [
      issued.tokenId,
    ]);
    expect(tokenAfter.rows[0].permissoes).toEqual(permissions);
    const owner = await admin.validateSession(session);
    await remoteDelegation.revoke(owner.accessToken, local!.hubId);
    // Local state deliberately remains active: denial must come from the real hub.
    expect((await delegation.status(session, persona.id)).active).toBe(true);
    await assertOAuthRevoked();
    expect((await call("listar_integracoes_administraveis", {})).isError).toBe(true);
    expect((await call("alterar_estado_integracao", recovery)).isError).toBe(true);
    expect((await call("obter_testes_skill", args)).isError).toBe(true);
    expect(
      (await call("editar_caso_skill", { ...edit, expectedRevision: details.revision + 1 }))
        .isError,
    ).toBe(true);
    const httpDenied = await request(candidate.app)
      .get(`/api/consumer/bearer/administration/skills/${draft.skillId}/testes?kind=acao_externa`)
      .set("Host", "mcp.fixture.test")
      .set("Origin", origin)
      .set("Authorization", `Bearer ${issued.bearer}`);
    expect(httpDenied.status).toBe(403);
    await delegation.revoke(session, persona.id, delegated.version);
    expect(providerCalls).toBe(baselineCalls);
    expect(provider.state).toMatchObject({
      writes: 0,
      reads: 0,
      invalidCredential: 0,
      invalidProtocol: 0,
    });
  } finally {
    try {
      await candidate.close();
    } finally {
      await provider.close();
    }
  }
}
