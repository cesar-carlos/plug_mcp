import { assertPersonaDeployment } from "../config/persona-deployment.js";
import pg from "pg";
import { PersonaAttachments } from "../application/persona-v2/attachments.js";
import { PostgresPersonaAttachments } from "../infrastructure/persistence/persona-v2/attachments.js";
import { createClient } from "redis";
import type { PersonaQueryReuseStore } from "../domain/ports/persona-query-reuse.port.js";
import {
  PersonaQueryReuse,
  PersonaMemoryQueryStore,
} from "../infrastructure/persona-v2/query-reuse.js";
import { PersonaRedisQueryStore } from "../infrastructure/persona-v2/query-reuse-redis.js";
import { PersonaNotifications } from "../application/persona-v2/notifications.js";
import { PersonaOAuthConnections } from "../application/persona-v2/oauth-connections.js";
import type { PersonaNotificationTransport } from "../domain/ports/persona-outbox.port.js";
import { PersonaNotificationHttps } from "../infrastructure/persona-v2/notification-transport.js";
import { PersonaExternalIntegrations } from "../application/persona-v2/external-integrations.js";
import { PersonaIntegrationManagement } from "../application/persona-v2/integration-management.js";
import { PersonaExternalActions } from "../application/persona-v2/external-actions.js";
import type {
  ExternalTransport,
  ExternalActionTransport,
} from "../domain/persona-v2/external-contract.js";
import { PersonaExternalAdapters } from "../infrastructure/persona-v2/external-adapters.js";
import { PersonaExternalDiscovery } from "../infrastructure/persona-v2/external-discovery.js";
import type { ExternalDiscoveryTransport } from "../domain/ports/external-discovery.port.js";
import type { Express } from "express";
import type { AppConfig } from "../config/env.js";
import { PersonaAdministration } from "../application/persona-v2/administration.js";
import { PersonaAdministrativeAuthorization } from "../application/persona-v2/administrative-authorization.js";
import { PersonaDelegatedTokens } from "../application/persona-v2/delegated-tokens.js";
import { PersonaSchemaInspection } from "../application/persona-v2/schema-inspection.js";
import { PersonaPhysicalProfiles } from "../application/persona-v2/physical-profiles.js";
import { PhysicalKnowledgeAuthority } from "../application/persona-v2/physical-knowledge-authority.js";
import { PersonaPhysicalCuration } from "../application/persona-v2/physical-curation.js";
import { PersonaKnowledgeMaintenance } from "../application/persona-v2/knowledge-maintenance.js";
import { PersonaMaintenance } from "../application/persona-v2/maintenance.js";
import { PersonaCatalog } from "../application/persona-v2/catalog.js";
import { PersonaKnowledgeTraining } from "../application/persona-v2/knowledge-training.js";
import { PersonaConsumerCatalog } from "../application/persona-v2/consumer-catalog.js";
import { NodeCryptoAdapter } from "../infrastructure/crypto/node-crypto.adapter.js";
import { assertPersonaVaultKeyring } from "../infrastructure/persistence/persona-v2/vault-keyring.js";
import { MemoryAdministrativeSessions } from "../infrastructure/persistence/persona-v2/admin-sessions.js";
import { PostgresPersonaRepository } from "../infrastructure/persistence/persona-v2/repository.js";
import { verifyPersonaMigrations } from "../infrastructure/persistence/persona-v2/migrate.js";
import { PersonaOwnerAuthentication } from "../infrastructure/plug-server/persona-owner-auth.js";
import { PlugServerRestAdapter } from "../infrastructure/plug-server/plug-server-rest.adapter.js";
import { createPino, PinoLoggerAdapter } from "../infrastructure/logging/pino-logger.adapter.js";
import { createPersonaAdministrationApp } from "../infrastructure/http/persona-v2-admin.js";
import {
  createHubHttpAgents,
  createPooledFetch,
  destroyHubHttpAgents,
} from "../infrastructure/plug-server/hub-http.js";
import type { OwnerAuthenticationPort } from "../domain/ports/persona-v2.port.js";
import type { SourceVerificationPort } from "../domain/ports/persona-v2.port.js";
import { PersonaSourceVerifier } from "../infrastructure/plug-server/persona-source-verifier.js";
import { PersonaSourceQueries } from "../application/persona-v2/source-query.js";
import { PersonaPublishedFederation } from "../application/persona-v2/published-federation.js";
import { PersonaSourceQuery } from "../infrastructure/plug-server/persona-source-query.js";
import { PostgresSourceCredentials } from "../infrastructure/persistence/persona-v2/source-credentials.js";
import type { PlugServerGatewayPort } from "../domain/ports/plug-server-gateway.port.js";
import type { SqlOperationTransportPort } from "../domain/ports/sql-operation-transport.port.js";
import { PersonaSqlOperations } from "../application/persona-v2/sql-operations.js";
import { PublishedSqlOperationAuthority } from "../application/persona-v2/operation-authority.js";
import { PostgresSqlOperationStore } from "../infrastructure/persistence/persona-v2/sql-operations.js";
import { PersonaSqlOperationGateway } from "../infrastructure/plug-server/persona-sql-operation.js";
import { SharedKnowledge } from "../application/persona-v2/shared-knowledge.js";
import { PostgresSharedKnowledgeRepository } from "../infrastructure/persistence/persona-v2/shared-knowledge.js";
import { PersonaOAuth } from "../application/persona-v2/oauth.js";
import { PostgresPersonaOAuthStore } from "../infrastructure/persistence/persona-v2/oauth.js";
import { CimdClient } from "../infrastructure/oauth/cimd-client.js";
import type { PersonaOAuthClient } from "../domain/ports/persona-oauth.port.js";
import { createHash } from "node:crypto";
import { PersonaOwnerDelegation } from "../application/persona-v2/owner-delegation.js";
import { PersonaTemporarySetups } from "../application/persona-v2/setup.js";
import { PersonaOwnerDelegationHub } from "../infrastructure/plug-server/persona-owner-delegation.js";
import type { OwnerDelegationHubPort } from "../domain/ports/persona-security.port.js";
import { PersonaV2Error } from "../domain/persona-v2/model.js";

export const composePersonaV2 = async (
  config: AppConfig,
  overrides: {
    ownerAuth?: OwnerAuthenticationPort;
    sourceVerifier?: SourceVerificationPort;
    hub?: PlugServerGatewayPort;
    operationTransport?: SqlOperationTransportPort;
    oauthClient?: PersonaOAuthClient;
    delegationHub?: OwnerDelegationHubPort;
    externalTransport?: ExternalTransport & ExternalActionTransport;
    externalDiscovery?: ExternalDiscoveryTransport;
    notificationTransport?: PersonaNotificationTransport;
  } = {},
): Promise<{ app: Express; close: () => Promise<void> }> => {
  assertPersonaDeployment(config);
  if (!config.DATABASE_URL) {
    throw new Error("persona-v2 exige PostgreSQL dedicado.");
  }
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });
  const agents = createHubHttpAgents();
  let queryRedis: ReturnType<typeof createClient> | undefined;
  let attachmentStore: PostgresPersonaAttachments | undefined;
  try {
    const client = await pool.connect();
    try {
      await verifyPersonaMigrations(client);
    } finally {
      client.release();
    }
    const crypto = new NodeCryptoAdapter(
      config.MCP_ENCRYPTION_KEY,
      config.MCP_ENCRYPTION_KEY_ID,
      config.MCP_ENCRYPTION_PREVIOUS_KEYS,
      config.MCP_ENCRYPTION_LEGACY_KEY,
    );
    await assertPersonaVaultKeyring(pool, crypto, config.MCP_ENCRYPTION_KEY_ID);
    const restHub = new PlugServerRestAdapter(
      config.PLUG_SERVER_BASE_URL,
      new PinoLoggerAdapter(createPino(config.LOG_LEVEL, false)),
      {
        auth: createPooledFetch(agents.auth),
        sql: createPooledFetch(agents.sql),
      },
    );
    const hub = overrides.hub ?? restHub;
    const services = {
      repository: new PostgresPersonaRepository(pool, crypto),
      crypto,
      sessions: new MemoryAdministrativeSessions(crypto),
      ownerAuth:
        overrides.ownerAuth ?? new PersonaOwnerAuthentication(config.PLUG_SERVER_BASE_URL, restHub),
      sourceVerifier: overrides.sourceVerifier ?? new PersonaSourceVerifier(hub),
      now: () => new Date(),
    };
    const administration = new PersonaAdministration(services);
    const consumerCatalog = new PersonaConsumerCatalog(services);
    const credentials = new PostgresSourceCredentials(pool);
    const sourceQueries = new PersonaSourceQuery(credentials, hub, crypto);
    let queryReuse: PersonaQueryReuse | undefined;
    if (config.PERSONA_V2_QUERY_CACHE_TTL_MS > 0) {
      let store: PersonaQueryReuseStore = new PersonaMemoryQueryStore();
      if (config.PERSONA_V2_REDIS_URL) {
        queryRedis = createClient({
          url: config.PERSONA_V2_REDIS_URL,
          socket: { connectTimeout: 1000, reconnectStrategy: false },
          disableOfflineQueue: true,
          commandsQueueMaxLength: 64,
        });
        const logger = new PinoLoggerAdapter(createPino(config.LOG_LEVEL, false));
        queryRedis.on("error", () =>
          logger.warn("Armazenamento de cache v2 indisponível; autorização permanece obrigatória."),
        );
        try {
          await queryRedis.connect();
        } catch {
          logger.warn("Cache Redis v2 não conectado; otimização distribuída desativada.");
        }
        // The closed client fails fast. The coordinator only falls back before dispatch.
        store = new PersonaRedisQueryStore(queryRedis.withCommandOptions({ timeout: 1000 }));
      }
      queryReuse = new PersonaQueryReuse(
        store,
        crypto,
        config.MCP_ENCRYPTION_KEY,
        JSON.stringify({
          origin: new URL(config.PUBLIC_BASE_URL).origin,
          controlDatabase: config.DATABASE_URL,
        }),
        config.PERSONA_V2_QUERY_CACHE_TTL_MS,
      );
    }
    const queries = new PersonaSourceQueries(consumerCatalog, sourceQueries, queryReuse);
    attachmentStore = new PostgresPersonaAttachments(pool, crypto, config.PUBLIC_BASE_URL);
    const attachments = new PersonaAttachments(
      consumerCatalog,
      queries,
      sourceQueries,
      attachmentStore,
      crypto,
    );
    const operationGateway = new PersonaSqlOperationGateway(
      credentials,
      hub,
      overrides.operationTransport ?? restHub,
      crypto,
      config.PLUG_SERVER_BASE_URL,
    );
    const maintenance = new PersonaMaintenance(services, administration, {
      verifyIdentity: async (source) => {
        const credential = await credentials.find(source.personaId, source.credentialId);
        if (credential?.version !== source.credentialVersion)
          throw new PersonaV2Error("STALE_AUTHORIZATION", "Credencial da fonte alterada.");
        return services.sourceVerifier.verify({
          agentId: source.agentId,
          database: source.database,
          dialect: source.dialect,
          email: crypto.decrypt(credential.emailEnc),
          password: crypto.decrypt(credential.passwordEnc),
          clientToken: crypto.decrypt(credential.clientTokenEnc),
        });
      },
      invalidateIdentity: (source) => credentials.invalidateIdentity(source),
      discardSession: (id) => {
        sourceQueries.discardCredentialSession(id);
        operationGateway.discardCredentialSession(id);
      },
    });
    const delegation = new PersonaOwnerDelegation(
      services,
      administration,
      overrides.delegationHub ??
        new PersonaOwnerDelegationHub(config.PLUG_SERVER_BASE_URL, createPooledFetch(agents.auth)),
      new URL(config.PUBLIC_BASE_URL).origin,
    );
    const administrativeAuthorization = new PersonaAdministrativeAuthorization(
      services,
      administration,
      delegation,
    );
    const catalog = new PersonaCatalog(services, administration, administrativeAuthorization);
    const setups = new PersonaTemporarySetups(
      services,
      delegation,
      administration,
      maintenance,
      new URL(config.PUBLIC_BASE_URL).origin,
    );
    const externalAdapters = overrides.externalTransport ?? new PersonaExternalAdapters();
    const externalIntegrations = new PersonaExternalIntegrations(
      services,
      administrativeAuthorization,
      externalAdapters,
      overrides.externalDiscovery ?? new PersonaExternalDiscovery(),
    );
    const externalActions = new PersonaExternalActions(
      services,
      administration,
      externalIntegrations,
      externalAdapters,
    );
    return {
      app: createPersonaAdministrationApp({
        attachments,
        externalIntegrations,
        integrationManagement: new PersonaIntegrationManagement(
          services,
          administration,
          administrativeAuthorization,
        ),
        externalActions,
        ...(config.PERSONA_V2_OAUTH_ENABLED
          ? {
              oauth: new PersonaOAuth(
                new PostgresPersonaOAuthStore(pool, crypto),
                services.repository,
                crypto,
                overrides.oauthClient ?? new CimdClient(config.PERSONA_V2_OAUTH_CLIENTS),
                {
                  issuer: config.PUBLIC_BASE_URL,
                  resource: `${config.PUBLIC_BASE_URL}/mcp/chatgpt`,
                  clients: config.PERSONA_V2_OAUTH_CLIENTS,
                },
                (verifier) => createHash("sha256").update(verifier).digest("base64url"),
                Date.now,
                async (identity) => {
                  return administrativeAuthorization.available(identity);
                },
              ),
            }
          : {}),
        administration,
        administrativeAuthorization,
        delegatedTokens: new PersonaDelegatedTokens(services, administrativeAuthorization),
        schemaInspection: new PersonaSchemaInspection(
          services,
          administrativeAuthorization,
          sourceQueries,
        ),
        physicalProfiles: new PersonaPhysicalProfiles(
          services,
          administrativeAuthorization,
          sourceQueries,
        ),
        physicalCuration: new PersonaPhysicalCuration(
          services,
          new PhysicalKnowledgeAuthority(services, administrativeAuthorization, sourceQueries),
          consumerCatalog,
        ),
        knowledgeMaintenance: new PersonaKnowledgeMaintenance(
          services,
          consumerCatalog,
          administrativeAuthorization,
          new PhysicalKnowledgeAuthority(services, administrativeAuthorization, sourceQueries),
          new SharedKnowledge(
            services,
            administration,
            new PostgresSharedKnowledgeRepository(pool),
          ),
        ),
        delegation,
        setups,
        sharedKnowledge: new SharedKnowledge(
          services,
          administration,
          new PostgresSharedKnowledgeRepository(pool),
        ),
        maintenance,
        oauthConnections: new PersonaOAuthConnections(services, administration),
        notifications: new PersonaNotifications(
          services,
          administration,
          overrides.notificationTransport ?? new PersonaNotificationHttps(),
        ),
        catalog,
        knowledgeTraining: new PersonaKnowledgeTraining(
          services,
          administrativeAuthorization,
          consumerCatalog,
        ),
        consumerCatalog,
        queries,
        federation: new PersonaPublishedFederation(consumerCatalog, queries),
        operations: new PersonaSqlOperations(
          services,
          administration,
          new PublishedSqlOperationAuthority(services),
          new PostgresSqlOperationStore(pool, crypto, services.now),
          operationGateway,
          sourceQueries,
        ),
        crypto,
        publicBaseUrl: config.PUBLIC_BASE_URL,
        ready: async () => {
          await verifyPersonaMigrations(pool);
          return true;
        },
      }),
      close: async () => {
        attachmentStore?.close();
        if (queryRedis?.isOpen) queryRedis.destroy();
        destroyHubHttpAgents(agents);
        await pool.end();
      },
    };
  } catch (error) {
    attachmentStore?.close();
    if (queryRedis?.isOpen) queryRedis.destroy();
    destroyHubHttpAgents(agents);
    await pool.end();
    throw error;
  }
};
