import express, { type Express } from "express";
import { adminRequestDiagnostics, requestSizeMetadata } from "./persona-admin-diagnostics.js";
import {
  ADMIN_JSON_BYTES,
  TOKEN_JSON_BYTES,
  TOKEN_REQUEST_TOO_LARGE,
  isTokenWritePath,
} from "../../domain/persona-v2/admin-request-limits.js";
import { createRateLimiter } from "./rate-limit.js";
import type { PersonaNotifications } from "../../application/persona-v2/notifications.js";
import type { PersonaOAuthConnections } from "../../application/persona-v2/oauth-connections.js";
import type { PersonaExternalIntegrations } from "../../application/persona-v2/external-integrations.js";
import type { PersonaIntegrationManagement } from "../../application/persona-v2/integration-management.js";
import type { PersonaExternalActions } from "../../application/persona-v2/external-actions.js";
import helmet from "helmet";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { delegatedPermissionsSchema } from "../../domain/persona-v2/administrative-permissions.js";
import type { PersonaSchemaInspection } from "../../application/persona-v2/schema-inspection.js";
import type { PersonaPhysicalProfiles } from "../../application/persona-v2/physical-profiles.js";
import type { PersonaPhysicalCuration } from "../../application/persona-v2/physical-curation.js";
import { registerPhysicalCurationRoutes } from "./persona-v2-physical-curation.js";
import type { PersonaKnowledgeMaintenance } from "../../application/persona-v2/knowledge-maintenance.js";
import { registerKnowledgeMaintenanceRoutes } from "./persona-v2-knowledge-maintenance.js";
import type { PersonaAdministration } from "../../application/persona-v2/administration.js";
import type { PersonaMaintenance } from "../../application/persona-v2/maintenance.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { adminUnexpectedFailure } from "./admin-unexpected-error.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { permissionsSchema } from "../persistence/persona-v2/permissions-schema.js";
import type { PersonaCatalog } from "../../application/persona-v2/catalog.js";
import type { PersonaConsumerCatalog } from "../../application/persona-v2/consumer-catalog.js";
import { createPersonaV2McpHandler } from "../mcp/persona-v2-http.js";
import type { PersonaSourceQueries } from "../../application/persona-v2/source-query.js";
import type { PersonaPublishedFederation } from "../../application/persona-v2/published-federation.js";
import { sourceRegistrationSchema } from "../../application/persona-v2/source-registration.js";
import type { PersonaSqlOperations } from "../../application/persona-v2/sql-operations.js";
import type { SharedKnowledge } from "../../application/persona-v2/shared-knowledge.js";
import { registerSharedKnowledgeRoutes } from "./persona-v2-knowledge.js";
import type { PersonaOAuth } from "../../application/persona-v2/oauth.js";
import { registerPersonaOAuthRoutes } from "./persona-v2-oauth.js";
import type { PersonaOwnerDelegation } from "../../application/persona-v2/owner-delegation.js";
import type { PersonaTemporarySetups } from "../../application/persona-v2/setup.js";
import { registerPersonaSetupRoutes } from "./persona-v2-setup.js";
import type { PersonaAdministrativeAuthorization } from "../../application/persona-v2/administrative-authorization.js";
import type { PersonaDelegatedTokens } from "../../application/persona-v2/delegated-tokens.js";
import type { PersonaAttachments } from "../../application/persona-v2/attachments.js";
import { registerPersonaAttachmentRoutes } from "./persona-v2-attachments.js";
import type { PersonaKnowledgeTraining } from "../../application/persona-v2/knowledge-training.js";
import { sqlExampleInputSchema } from "../../application/persona-v2/catalog.js";
import { registerDelegatedAdministrationRoutes } from "./persona-v2-delegated-administration.js";
import { registerPersonaBrandIcons, registerPersonaIconRoute } from "./persona-brand.js";
import { normalizePersonaIcon } from "../images/persona-icon.js";
import type { StoredPersonaIcon } from "../../domain/persona-v2/persona-icon.js";

/** Development server for the implemented persona-v2 subset; full acceptance remains blocked. */
export const createPersonaAdministrationApp = (input: {
  attachments?: PersonaAttachments;
  notifications?: PersonaNotifications;
  oauthConnections?: PersonaOAuthConnections;
  externalIntegrations?: PersonaExternalIntegrations;
  integrationManagement?: PersonaIntegrationManagement;
  externalActions?: PersonaExternalActions;
  administration: PersonaAdministration;
  maintenance?: PersonaMaintenance;
  catalog?: PersonaCatalog;
  consumerCatalog?: PersonaConsumerCatalog;
  queries?: PersonaSourceQueries;
  federation?: PersonaPublishedFederation;
  operations?: PersonaSqlOperations;
  sharedKnowledge?: SharedKnowledge;
  oauth?: PersonaOAuth;
  delegation?: PersonaOwnerDelegation;
  setups?: PersonaTemporarySetups;
  administrativeAuthorization?: PersonaAdministrativeAuthorization;
  delegatedTokens?: PersonaDelegatedTokens;
  schemaInspection?: PersonaSchemaInspection;
  physicalProfiles?: PersonaPhysicalProfiles;
  physicalCuration?: PersonaPhysicalCuration;
  knowledgeMaintenance?: PersonaKnowledgeMaintenance;
  knowledgeTraining?: PersonaKnowledgeTraining;
  crypto: CryptoPort;
  logger?: LoggerPort;
  publicBaseUrl: string;
  readPersonaIcon?: (personaId: string) => Promise<StoredPersonaIcon | null>;
  ready: () => Promise<boolean>;
}): Express => {
  const app = express();
  const origin = new URL(input.publicBaseUrl).origin;
  const secure = origin.startsWith("https:");
  const cookieName = secure ? "__Host-persona_admin" : "persona_admin";
  const csrfTokens = new Map<string, { hash: string; expiresAt: Date }>();
  const loginAttempts = new Map<string, { count: number; reset: number }>();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(adminRequestDiagnostics(input.logger));
  const defaultJson = express.json({ limit: ADMIN_JSON_BYTES });
  const tokenJson = express.json({ limit: TOKEN_JSON_BYTES });
  app.use((req, res, next) => {
    const parser = isTokenWritePath(req.path, req.method) ? tokenJson : defaultJson;
    parser(req, res, next);
  });
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const consoleRoot = fileURLToPath(new URL("../../../web/dist/", import.meta.url));
  app.use(
    "/app/assets",
    express.static(`${consoleRoot}/assets`, { index: false, fallthrough: false }),
  );
  for (const asset of [
    "favicon.ico",
    "apple-touch-icon.png",
    "icon-192.png",
    "icon-512.png",
    "icon-192-maskable.png",
    "icon-512-maskable.png",
    "persona-v2.webmanifest",
  ]) {
    app.get(`/app/${asset}`, (_req, res) => {
      if (asset.endsWith(".webmanifest")) res.type("application/manifest+json");
      res.sendFile(`${consoleRoot}/${asset}`);
    });
  }
  app.get(["/app", "/app/"], (_req, res) => {
    res.sendFile(`${consoleRoot}/persona-v2.html`);
  });
  registerPersonaBrandIcons(app, consoleRoot);
  if (input.readPersonaIcon) registerPersonaIconRoute(app, input.readPersonaIcon);
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", generation: "persona-v2", complete: false });
  });
  app.get("/ready", async (_req, res) => {
    const ready = await input.ready().catch(() => false);
    res.status(ready ? 200 : 503).json({
      ready,
      generation: "persona-v2",
      scope: "administration-catalog-local-query-and-federation",
      complete: false,
    });
  });
  if (input.consumerCatalog)
    app.all(
      "/mcp",
      createPersonaV2McpHandler(
        input.consumerCatalog,
        input.publicBaseUrl,
        input.queries,
        input.federation,
        input.operations,
        undefined,
        input.setups,
        input.catalog && input.administrativeAuthorization && input.delegatedTokens
          ? {
              catalog: input.catalog,
              authorization: input.administrativeAuthorization,
              tokens: input.delegatedTokens,
              inspection: input.schemaInspection,
              knowledgeTraining: input.knowledgeTraining,
              physicalCuration: input.physicalCuration,
              knowledgeMaintenance: input.knowledgeMaintenance,
              externalIntegrations: input.externalIntegrations,
              integrationManagement: input.integrationManagement,
              externalActions: input.externalActions,
            }
          : undefined,
        input.attachments,
        input.logger,
      ),
    );
  if (input.oauth && input.consumerCatalog) {
    registerPersonaOAuthRoutes(app, input.oauth, input.consumerCatalog, input.readPersonaIcon);
    app.all(
      "/mcp/chatgpt",
      createPersonaV2McpHandler(
        input.consumerCatalog,
        input.publicBaseUrl,
        input.queries,
        input.federation,
        input.operations,
        input.oauth,
        input.setups,
        input.catalog && input.administrativeAuthorization && input.delegatedTokens
          ? {
              catalog: input.catalog,
              authorization: input.administrativeAuthorization,
              tokens: input.delegatedTokens,
              inspection: input.schemaInspection,
              knowledgeTraining: input.knowledgeTraining,
              physicalCuration: input.physicalCuration,
              knowledgeMaintenance: input.knowledgeMaintenance,
              externalIntegrations: input.externalIntegrations,
              integrationManagement: input.integrationManagement,
              externalActions: input.externalActions,
            }
          : undefined,
        input.attachments,
        input.logger,
      ),
    );
  }
  if (input.attachments && input.consumerCatalog) {
    registerPersonaAttachmentRoutes(app, {
      attachments: input.attachments,
      catalog: input.consumerCatalog,
      oauth: input.oauth,
      publicBaseUrl: input.publicBaseUrl,
    });
  }
  if (input.setups) registerPersonaSetupRoutes(app, input.setups, origin);
  app.use("/api", (req, res, next) => {
    const requestOrigin = req.get("origin");
    // Browsers omit Origin on same-origin GET. Cookie and CSRF remain mandatory below.
    const browserRead =
      req.method === "GET" && !requestOrigin && req.get("sec-fetch-site") === "same-origin";
    if (req.get("host") !== new URL(origin).host || (requestOrigin !== origin && !browserRead)) {
      res.status(403).json({ error: { code: "ORIGIN_DENIED" } });
      return;
    }
    next();
  });
  if (input.catalog && input.consumerCatalog && input.delegatedTokens) {
    registerDelegatedAdministrationRoutes(
      app,
      input.consumerCatalog,
      input.catalog,
      input.delegatedTokens,
      input.oauth,
      input.externalIntegrations,
      input.integrationManagement,
    );
  }
  const session = (cookie: string | undefined): string => {
    const pairs = cookie?.split(";").map((p) => p.trim()) ?? [];
    const values = pairs.filter((p) => p.startsWith(`${cookieName}=`));
    if (values.length !== 1) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Sessão ausente.");
    }
    const id = values[0]!.slice(cookieName.length + 1);
    if (!/^[A-Za-z0-9_-]{43}$/.test(id)) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Sessão inválida.");
    }
    return id;
  };
  app.post("/api/admin/login", async (req, res) => {
    const now = Date.now();
    for (const [id, entry] of csrfTokens) {
      if (entry.expiresAt.getTime() <= now) {
        csrfTokens.delete(id);
      }
    }
    for (const [id, entry] of loginAttempts) {
      if (entry.reset <= now) {
        loginAttempts.delete(id);
      }
    }
    const key = req.ip ?? "unknown";
    const attempt = loginAttempts.get(key) ?? { count: 0, reset: now + 60000 };
    attempt.count += 1;
    loginAttempts.set(key, attempt);
    if (attempt.count > 10 || loginAttempts.size > 10000) {
      const retryAfter = Math.max(1, Math.ceil((attempt.reset - now) / 1000));
      res
        .set("Retry-After", String(retryAfter))
        .status(429)
        .json({
          error: {
            code: "RATE_LIMITED",
            message: `Muitas tentativas de entrada. Aguarde ${retryAfter} segundos antes de tentar novamente.`,
          },
        });
      return;
    }
    const credentials = z
      .strictObject({ email: z.email().max(320), password: z.string().min(1).max(1024) })
      .parse(req.body);
    const login = await input.administration.login(credentials.email, credentials.password);
    // Neither password nor hub access token enters browser state or persisted session data.
    const csrf = input.crypto.randomToken(32);
    csrfTokens.set(input.crypto.sha256Hex(login.sessionId), {
      hash: input.crypto.sha256Hex(csrf),
      expiresAt: login.expiresAt,
    });
    res.cookie(cookieName, login.sessionId, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
      maxAge: 15 * 60 * 1000,
    });
    res.json({ csrfToken: csrf, expiresAt: login.expiresAt });
  });
  app.use("/api/admin", (req, _res, next) => {
    const id = session(req.get("cookie"));
    const provided = req.get("x-csrf-token");
    const expected = csrfTokens.get(input.crypto.sha256Hex(id));
    if (expected && expected.expiresAt <= new Date())
      throw new PersonaV2Error("ADMIN_SESSION_EXPIRED", "Sessão administrativa expirada.");
    if (
      !provided ||
      !expected ||
      !timingSafeEqual(Buffer.from(input.crypto.sha256Hex(provided)), Buffer.from(expected.hash))
    ) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "CSRF inválido.");
    }
    next();
  });
  app.get("/api/admin/personas", async (req, res) => {
    res.json({ personas: await input.administration.listPersonas(session(req.get("cookie"))) });
  });
  if (input.notifications) {
    const notifications = input.notifications;
    const root = "/api/admin/personas/:personaId/notifications";
    app.get(root, async (req, res) =>
      res.json(
        await notifications.status(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
        ),
      ),
    );
    app.post(root, async (req, res) =>
      res.json(
        await notifications.configure(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          req.body,
        ),
      ),
    );
    app.get(`${root}/deliveries`, async (req, res) =>
      res.json(
        await notifications.deliveries(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().optional().parse(req.query.after),
        ),
      ),
    );
  }
  if (input.oauthConnections) {
    const connections = input.oauthConnections,
      root = "/api/admin/personas/:personaId/oauth-connections";
    app.get(root, async (req, res) =>
      res.json(
        await connections.list(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().optional().parse(req.query.after),
        ),
      ),
    );
    app.post(`${root}/:connectionId/revogar`, async (req, res) =>
      res.json(
        await connections.revoke(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.connectionId),
          req.body,
        ),
      ),
    );
  }
  if (input.externalActions) {
    const actions = input.externalActions,
      root = "/api/admin/personas/:personaId/external-actions";
    app.get(root, async (req, res) =>
      res.json(
        await actions.list(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().optional().parse(req.query.after),
        ),
      ),
    );
    app.get(`${root}/:operationId`, async (req, res) =>
      res.json(
        await actions.review(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.operationId),
        ),
      ),
    );
    app.post(`${root}/approve`, async (req, res) =>
      res.json(
        await actions.approve(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          req.body,
        ),
      ),
    );
  }
  if (input.integrationManagement) {
    const management = input.integrationManagement,
      root = "/api/admin/personas/:personaId/integracoes/gestao";
    app.post(root, createRateLimiter({ windowMs: 60000, max: 10 }), async (req, res) => {
      res
        .status(201)
        .json(
          await management.create(
            session(req.get("cookie")),
            z.uuid().parse(req.params.personaId),
            req.body,
          ),
        );
    });
    app.get(root, async (req, res) => {
      res.json({
        connections: await management.list(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
        ),
      });
    });
    app.get(`${root}/:id`, async (req, res) => {
      res.json(
        await management.review(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.id),
        ),
      );
    });
    for (const action of ["suspender", "recuperar"] as const) {
      app.post(`${root}/:id/${action}`, async (req, res) => {
        res.json(
          await management.state(
            session(req.get("cookie")),
            z.uuid().parse(req.params.personaId),
            z.uuid().parse(req.params.id),
            action === "suspender",
            req.body,
          ),
        );
      });
    }
    app.post(
      `${root}/:id/credenciais`,
      createRateLimiter({ windowMs: 60000, max: 10 }),
      async (req, res) => {
        res.json(
          await management.rotate(
            session(req.get("cookie")),
            z.uuid().parse(req.params.personaId),
            z.uuid().parse(req.params.id),
            req.body,
          ),
        );
      },
    );
  }
  if (input.externalIntegrations) {
    const external = input.externalIntegrations,
      root = "/api/admin/personas/:personaId/integracoes/skills";
    app.post("/api/admin/personas/:personaId/integracoes/importar", async (req, res) => {
      res.json(
        await external.importCandidates(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          req.body,
        ),
      );
    });
    app.get("/api/admin/personas/:personaId/integracoes/conexoes", async (req, res) => {
      res.json({
        connections: await external.connections(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
        ),
      });
    });
    app.get(`${root}/:skillId/rascunho`, async (req, res) => {
      res.json(
        await external.detail(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.skillId),
        ),
      );
    });
    app.post(`${root}/:skillId/rascunho`, async (req, res) => {
      res.json(
        await external.update(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.skillId),
          req.body,
        ),
      );
    });
    app.get(root, async (req, res) =>
      res.json({
        skills: await external.drafts(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
        ),
      }),
    );
    app.get(`${root}/:skillId/testes`, async (req, res) =>
      res.json(
        await external.tests(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.skillId),
          z.uuid().optional().parse(req.query.after),
        ),
      ),
    );
    app.post(`${root}/:skillId/casos`, async (req, res) =>
      res.json(
        await external.changeCase(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.skillId),
          req.body,
        ),
      ),
    );
    app.post(root, async (req, res) =>
      res
        .status(201)
        .json(
          await external.create(
            session(req.get("cookie")),
            z.uuid().parse(req.params.personaId),
            req.body,
          ),
        ),
    );
    app.post(`${root}/:skillId/preview`, async (req, res) => {
      const body = z.strictObject({ reviewDueAt: z.iso.datetime() }).parse(req.body);
      res.json(
        await external.preview(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.skillId),
          body.reviewDueAt,
        ),
      );
    });
    app.post(`${root}/:skillId/publicar`, async (req, res) => {
      const body = z
        .strictObject({ confirmationHash: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(req.body);
      res.json(
        await external.publish(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.skillId),
          body.confirmationHash,
        ),
      );
    });
  }
  app.get("/api/admin/oauth", async (req, res) => {
    await input.administration.validateSession(session(req.get("cookie")));
    res.json(
      input.oauth
        ? { enabled: true, endpoint: input.oauth.policy.resource, scope: "se7e:persona" }
        : { enabled: false },
    );
  });
  if (input.delegation) {
    const delegation = input.delegation;
    app.get("/api/admin/personas/:personaId/delegation", async (req, res) => {
      res.json(
        await delegation.status(session(req.get("cookie")), z.uuid().parse(req.params.personaId)),
      );
    });
    for (const action of ["create", "revoke"] as const)
      app.post(`/api/admin/personas/:personaId/delegation/${action}`, async (req, res) => {
        const { expectedVersion, administrative } = z
          .strictObject({
            expectedVersion: z.number().int().min(0),
            administrative: delegatedPermissionsSchema.optional(),
          })
          .parse(req.body);
        res.json(
          await delegation[action](
            session(req.get("cookie")),
            z.uuid().parse(req.params.personaId),
            expectedVersion,
            ...(action === "create" ? ([administrative ?? ["gerenciar_fontes"]] as const) : []),
          ),
        );
      });
  }
  if (input.sharedKnowledge) {
    registerSharedKnowledgeRoutes(app, input.sharedKnowledge, session);
  }
  if (input.schemaInspection) {
    const inspection = input.schemaInspection;
    app.post(
      "/api/admin/personas/:personaId/fontes/:sourceId/estrutura/compor",
      async (req, res) => {
        res.json(
          await inspection.compose(
            session(req.get("cookie")),
            z.uuid().parse(req.params.personaId),
            z.uuid().parse(req.params.sourceId),
            req.body,
          ),
        );
      },
    );
    app.post("/api/admin/personas/:personaId/fontes/:sourceId/estrutura", async (req, res) => {
      res.json(
        await inspection.inspect(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.sourceId),
          req.body,
        ),
      );
    });
    if (input.sharedKnowledge) {
      const knowledge = input.sharedKnowledge;
      app.post(
        "/api/admin/personas/:personaId/fontes/:sourceId/compatibilidade",
        async (req, res) => {
          const body = z
            .strictObject({
              evidenceId: z.uuid(),
              catalogId: z.uuid(),
              publicationId: z.uuid(),
              profilePublicationId: z.uuid().optional(),
              selectedTables: z
                .array(
                  z.strictObject({
                    id: z.string().min(1).max(100),
                    columns: z.array(z.string().min(1).max(128)).min(1).max(1024),
                  }),
                )
                .min(1)
                .max(16)
                .refine((items) => new Set(items.map((i) => i.id)).size === items.length)
                .optional(),
            })
            .parse(req.body);
          res.json(
            await inspection.compare(
              session(req.get("cookie")),
              z.uuid().parse(req.params.personaId),
              z.uuid().parse(req.params.sourceId),
              body.evidenceId,
              body.catalogId,
              body.publicationId,
              knowledge,
              body.profilePublicationId,
              body.selectedTables,
            ),
          );
        },
      );
    }
  }
  if (input.physicalProfiles) {
    if (input.physicalCuration)
      registerPhysicalCurationRoutes(app, input.physicalCuration, session);
    if (input.knowledgeMaintenance)
      registerKnowledgeMaintenanceRoutes(app, input.knowledgeMaintenance, session);
    const profiles = input.physicalProfiles;
    app.get("/api/admin/personas/:personaId/fontes/:sourceId/perfis/impacto", async (req, res) => {
      res.json(
        await profiles.impact(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.sourceId),
          req.query,
        ),
      );
    });
    app.get("/api/admin/personas/:personaId/fontes/:sourceId/perfis", async (req, res) => {
      res.json(
        await profiles.list(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.sourceId),
          req.query,
        ),
      );
    });
    for (const action of ["salvar", "preview", "publicar", "suspender", "comparar"] as const)
      app.post(
        `/api/admin/personas/:personaId/fontes/:sourceId/perfis/${action}`,
        async (req, res) => {
          const args = [
            session(req.get("cookie")),
            z.uuid().parse(req.params.personaId),
            z.uuid().parse(req.params.sourceId),
            req.body,
          ] as const;
          if (action === "comparar") res.json(await profiles.compare(...args));
          else if (action === "salvar")
            res.status(201).json({ profile: await profiles.save(...args) });
          else if (action === "suspender") {
            await profiles.suspend(...args);
            res.status(204).end();
          } else res.json(await profiles.review(...args, action === "publicar"));
        },
      );
  }
  if (input.operations) {
    const operations = input.operations;
    app.get("/api/admin/personas/:personaId/operations", async (req, res) => {
      const query = z.strictObject({ after: z.uuid().optional() }).parse(req.query);
      res.json(
        await operations.list(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          query.after,
        ),
      );
    });
    app.get("/api/admin/personas/:personaId/operations/:operationId", async (req, res) => {
      res.json(
        await operations.review(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.operationId),
        ),
      );
    });
    app.post("/api/admin/personas/:personaId/operations/approve", async (req, res) => {
      res.json(
        await operations.approve(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          req.body,
        ),
      );
    });
  }
  app.post("/api/admin/personas", async (req, res) => {
    const body = z
      .strictObject({
        name: z.string().min(1).max(200),
        specialty: z.string().min(1).max(5000),
        instructions: z.string().max(20000),
      })
      .parse(req.body);
    res.status(201).json({
      persona: await input.administration.createPersona(session(req.get("cookie")), body),
    });
  });
  if (input.maintenance) {
    const maintenance = input.maintenance;
    const path = "/api/admin/personas/:personaId";
    for (const [action, active] of [
      ["suspender", false],
      ["recuperar", true],
    ] as const) {
      app.post(`${path}/${action}`, async (req, res) => {
        res.json({
          persona: await maintenance.changePersonaState(
            session(req.get("cookie")),
            z.uuid().parse(req.params.personaId),
            active,
            req.body,
          ),
        });
      });
    }
    app.get(`${path}/progresso`, async (req, res) => {
      res.json(
        await maintenance.progress(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
        ),
      );
    });
    app.get(`${path}/historico`, async (req, res) => {
      res.json(
        await maintenance.history(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          req.query,
        ),
      );
    });
    app.get(`${path}/fontes/:sourceId/impacto`, async (req, res) => {
      const query = z
        .strictObject({ expectedVersion: z.coerce.number().int().positive() })
        .parse(req.query);
      res.json(
        await maintenance.sourceImpact(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.sourceId),
          query.expectedVersion,
        ),
      );
    });
    app.post(`${path}/editar`, async (req, res) => {
      res.json({
        persona: await maintenance.updatePersona(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          req.body,
        ),
      });
    });
    const iconBody = z.strictObject({
      expectedRevision: z.number().int().min(0).max(1_000_000),
      image: z.string().min(1).max(400_000).nullable(),
    });
    app.get(`${path}/icone`, async (req, res) => {
      res.json(
        await maintenance.personaIcon(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
        ),
      );
    });
    app.post(`${path}/icone`, async (req, res) => {
      const body = iconBody.parse(req.body);
      res.json(
        await maintenance.setPersonaIcon(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          {
            expectedRevision: body.expectedRevision,
            bytes: body.image === null ? null : await normalizePersonaIcon(body.image),
          },
        ),
      );
    });
    app.post(`${path}/fontes/:sourceId/editar`, async (req, res) => {
      res.json({
        fonte: await maintenance.updateSource(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.sourceId),
          req.body,
        ),
      });
    });
    app.post(`${path}/fontes/:sourceId/credencial`, async (req, res) => {
      res.json({
        fonte: await maintenance.rotateSourceCredential(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.sourceId),
          req.body,
        ),
      });
    });
    for (const [action, active] of [
      ["suspender", false],
      ["recuperar", true],
    ] as const) {
      app.post(`${path}/fontes/:sourceId/${action}`, async (req, res) => {
        res.json({
          fonte: await maintenance.changeSourceState(
            session(req.get("cookie")),
            z.uuid().parse(req.params.personaId),
            z.uuid().parse(req.params.sourceId),
            active,
            req.body,
          ),
        });
      });
    }
    app.post(`${path}/fontes/:sourceId/substituir`, async (req, res) => {
      res.status(201).json({
        fonte: await maintenance.replaceSource(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          z.uuid().parse(req.params.sourceId),
          req.body,
        ),
      });
    });
  }
  app.post("/api/admin/personas/:personaId/tokens", async (req, res) => {
    const personaId = z.uuid().parse(req.params.personaId);
    const body = z
      .strictObject({
        name: z.string().min(1).max(200),
        permissions: permissionsSchema,
        delegation: permissionsSchema,
        expiresAt: z.iso.datetime().nullable(),
      })
      .parse(req.body);
    res.status(201).json(
      await input.administration.issueToken(session(req.get("cookie")), {
        personaId,
        ...body,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      }),
    );
  });
  app.get("/api/admin/personas/:personaId/tokens", async (req, res) => {
    res.json({
      tokens: await input.administration.listTokens(
        session(req.get("cookie")),
        z.uuid().parse(req.params.personaId),
      ),
    });
  });
  for (const action of ["editar", "rotacionar"] as const) {
    app.post(`/api/admin/personas/:personaId/tokens/:tokenId/${action}`, async (req, res) => {
      const body = z
        .strictObject({
          expectedVersion: z.number().int().positive(),
          name: z.string().min(1).max(200),
          expiresAt: z.iso.datetime().nullable(),
          permissions: permissionsSchema,
          delegation: permissionsSchema,
        })
        .parse(req.body);
      res.json(
        await input.administration.changeToken(
          session(req.get("cookie")),
          {
            ...body,
            personaId: z.uuid().parse(req.params.personaId),
            tokenId: z.uuid().parse(req.params.tokenId),
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          },
          action === "rotacionar",
        ),
      );
    });
  }
  app.post("/api/admin/logout", (req, res) => {
    const id = session(req.get("cookie"));
    input.administration.logout(id);
    csrfTokens.delete(input.crypto.sha256Hex(id));
    res.clearCookie(cookieName, { httpOnly: true, secure, sameSite: "strict", path: "/" });
    res.status(204).end();
  });
  app.post("/api/admin/personas/:personaId/tokens/:tokenId/revogar", async (req, res) => {
    const personaId = z.uuid().parse(req.params.personaId),
      tokenId = z.uuid().parse(req.params.tokenId);
    z.strictObject({}).parse(req.body);
    await input.administration.revokeToken(session(req.get("cookie")), personaId, tokenId);
    res.status(204).end();
  });
  app.get("/api/admin/personas/:personaId/fontes", async (req, res) => {
    const personaId = z.uuid().parse(req.params.personaId);
    res.json({
      fontes: await input.administration.listSources(session(req.get("cookie")), personaId),
    });
  });
  app.post("/api/admin/personas/:personaId/fontes", async (req, res) => {
    const personaId = z.uuid().parse(req.params.personaId);
    const body = sourceRegistrationSchema.parse(req.body);
    res.status(201).json({
      fonte: await input.administration.addSource(session(req.get("cookie")), {
        personaId,
        ...body,
      }),
    });
  });
  if (input.catalog) {
    const catalog = input.catalog;
    const path = "/api/admin/personas/:personaId/skills";
    app.post(`${path}/template`, async (req, res) => {
      res.status(201).json({
        skill: await catalog.createFromTemplate(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          req.body,
        ),
      });
    });
    const ids = (req: express.Request) => ({
      personaId: z.uuid().parse(req.params.personaId),
      skillId: z.uuid().parse(req.params.skillId),
    });
    app.get(path, async (req, res) => {
      res.json({
        skills: await catalog.list(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
        ),
      });
    });
    app.post(path, async (req, res) => {
      res.status(201).json({
        skill: await catalog.create(
          session(req.get("cookie")),
          z.uuid().parse(req.params.personaId),
          req.body,
        ),
      });
    });
    app.get(`${path}/:skillId/publicacao`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      res.json({
        publication: await catalog.active(session(req.get("cookie")), personaId, skillId),
      });
    });
    app.post(`${path}/:skillId/exemplos`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      res.json({
        skill: await catalog.registerSqlExample(
          session(req.get("cookie")),
          personaId,
          skillId,
          sqlExampleInputSchema.parse(req.body),
        ),
      });
    });
    app.post(`${path}/:skillId/rascunho`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      res.json({
        skill: await catalog.update(session(req.get("cookie")), personaId, skillId, req.body),
      });
    });
    app.get(`${path}/:skillId/testes-operacao`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      const input = z.strictObject({ after: z.uuid().optional() }).parse(req.query);
      res.json(
        await catalog.operationTests(session(req.get("cookie")), personaId, skillId, input.after),
      );
    });
    app.get(`${path}/:skillId/testes-consulta`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      const input = z.strictObject({ after: z.uuid().optional() }).parse(req.query);
      res.json(
        await catalog.queryTests(session(req.get("cookie")), personaId, skillId, input.after),
      );
    });
    app.post(`${path}/:skillId/casos-consulta`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      res.json(
        await catalog.editQueryCase(session(req.get("cookie")), personaId, skillId, req.body),
      );
    });
    app.post(`${path}/:skillId/sementes-dataset`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      res.json(
        await catalog.datasetCaseSeeds(session(req.get("cookie")), personaId, skillId, req.body),
      );
    });
    app.post(`${path}/:skillId/datasets-caso`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      res.json(
        await catalog.datasetCaseOptions(session(req.get("cookie")), personaId, skillId, req.body),
      );
    });
    app.post(`${path}/:skillId/sementes-dataset-operacao`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      res.json(
        await catalog.operationDatasetSeeds(
          session(req.get("cookie")),
          personaId,
          skillId,
          req.body,
        ),
      );
    });
    app.post(`${path}/:skillId/compor-sementes-datasets`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      res.json(
        await catalog.datasetCompositionSeeds(
          session(req.get("cookie")),
          personaId,
          skillId,
          req.body,
        ),
      );
    });
    app.post(`${path}/:skillId/sementes-dataset-operacao-direto`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      res.json(
        await catalog.directOperationDatasetSeeds(
          session(req.get("cookie")),
          personaId,
          skillId,
          req.body,
        ),
      );
    });
    app.post(`${path}/:skillId/sementes-dataset-cruzamento`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      res.json(
        await catalog.federationDatasetSeeds(
          session(req.get("cookie")),
          personaId,
          skillId,
          req.body,
        ),
      );
    });
    app.post(`${path}/:skillId/casos-operacao`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      res.json(
        await catalog.editOperationCase(session(req.get("cookie")), personaId, skillId, req.body),
      );
    });
    app.get(`${path}/:skillId/testes-cruzamento`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      const input = z.strictObject({ after: z.uuid().optional() }).parse(req.query);
      res.json(
        await catalog.federationTests(session(req.get("cookie")), personaId, skillId, input.after),
      );
    });
    app.post(`${path}/:skillId/casos-cruzamento`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      res.json(
        await catalog.editFederationCase(session(req.get("cookie")), personaId, skillId, req.body),
      );
    });
    app.post(`${path}/:skillId/casos`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      res.status(201).json({
        case: await catalog.addCase(session(req.get("cookie")), personaId, skillId, req.body),
      });
    });
    app.post(`${path}/:skillId/preview`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      const { reviewDueAt } = z
        .strictObject({ reviewDueAt: z.iso.datetime().optional() })
        .parse(req.body);
      res.json(await catalog.preview(session(req.get("cookie")), personaId, skillId, reviewDueAt));
    });
    app.post(`${path}/:skillId/prazo-revisao`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      res.json(
        await catalog.setReviewDeadline(session(req.get("cookie")), personaId, skillId, req.body),
      );
    });
    app.post(`${path}/:skillId/publicar`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      const body = z
        .strictObject({ confirmationHash: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(req.body);
      res.status(201).json({
        publication: await catalog.publish(
          session(req.get("cookie")),
          personaId,
          skillId,
          body.confirmationHash,
        ),
      });
    });
    app.post(`${path}/:skillId/suspender`, async (req, res) => {
      const { personaId, skillId } = ids(req);
      z.strictObject({}).parse(req.body);
      await catalog.suspend(session(req.get("cookie")), personaId, skillId);
      res.status(204).end();
    });
  }
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "entity.too.large" &&
        "status" in error &&
        error.status === 413
      ) {
        res.setHeader("Cache-Control", "no-store");
        input.logger?.warn("admin request too large", {
          requestId: res.getHeader("X-Request-ID"),
          ...requestSizeMetadata(error),
        });
        res.status(413).json({
          error: {
            code: "REQUEST_TOO_LARGE",
            message: isTokenWritePath(_req.path, _req.method)
              ? TOKEN_REQUEST_TOO_LARGE
              : "A solicitação excede o limite de 64 KiB. Reduza o conteúdo antes de enviar. Nenhuma alteração foi aplicada.",
          },
        });
        return;
      }
      if (error instanceof PersonaV2Error) {
        res
          .status(
            error.code === "ADMIN_SESSION_EXPIRED"
              ? 401
              : error.code === "AUTHORIZATION_DENIED"
                ? 403
                : 409,
          )
          .json({ error: { code: error.code, message: error.message } });
      } else if (error instanceof z.ZodError) {
        // Only public form field names. Zod input, paths inside records and custom messages
        // can contain submitted secrets; never serialize them into an error response.
        const publicFields = new Set([
          "name",
          "specialty",
          "instructions",
          "purpose",
          "environment",
          "agentId",
          "email",
          "password",
          "clientToken",
          "dialect",
          "expectedVersion",
          "slug",
          "training",
          "contract",
          "permissions",
          "delegation",
          "expiresAt",
          "rowRestrictions",
        ]);
        const fields = [
          ...new Set(
            error.issues.flatMap((issue) => {
              const field = ["source", "credentials"].includes(String(issue.path[0]))
                ? issue.path[1]
                : issue.path[0];
              return typeof field === "string" && publicFields.has(field) ? [field] : [];
            }),
          ),
        ];
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Confira os campos indicados e tente novamente.",
            fields,
          },
        });
      } else if (error instanceof DomainError) {
        if (error.source === "sql") {
          res.status(409).json({
            error: {
              code: error.code,
              source: error.source,
              message: error.message,
              hint: error.hint,
            },
          });
          return;
        }
        const status =
          error.code === "UNAUTHENTICATED" || error.code === "USER_AUTH_EXPIRED"
            ? 401
            : [
                  "CLIENT_NOT_ACTIVE",
                  "AGENT_ACCESS_DENIED",
                  "PERMISSION_DENIED",
                  "ACCESS_REVOKED",
                ].includes(error.code)
              ? 403
              : error.code === "RATE_LIMITED"
                ? 429
                : 503;
        res.status(status).json({
          error: {
            code: error.code,
            source: error.source,
            message: "Falha na autoridade da conexão; confira a conta e o vínculo da fonte.",
          },
        });
      } else {
        // Never serialize upstream errors: they may contain credentials or payloads.
        const failure = adminUnexpectedFailure(error);
        input.logger?.error("admin request failed", {
          ...failure.log,
          requestId: res.getHeader("X-Request-ID"),
        });
        res.status(503).json({
          error: { code: failure.code, message: failure.message },
        });
      }
    },
  );
  return app;
};
