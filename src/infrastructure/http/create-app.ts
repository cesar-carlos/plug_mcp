import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import compression from "compression";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Logger as PinoLogger } from "pino";
import type { AppConfig } from "../../config/env.js";
import { buildInfo } from "../../config/build-info.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { SkillRepositoryPort } from "../../domain/ports/skill-repository.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { McpSetupRepositoryPort } from "../../domain/ports/mcp-setup-repository.port.js";
import { createMcpHttpHandler, McpSessionQuota } from "../mcp/mcp-http.js";
import type { ChatGptOAuth } from "../../application/use-cases/chatgpt-oauth.js";
import { registerOAuthRoutes } from "./oauth-routes.js";
import { chatGptOAuthChallenge } from "../oauth/challenge.js";
import { sessionContext } from "../../application/session-context.js";
import { isDomainError } from "../../domain/errors/domain-error.js";
import { verifyBearerToken, OAuthError as SdkOAuthError } from "@modelcontextprotocol/server";
import type { ToolUseCases } from "../mcp/register-tools.js";
import { isMcpTokenExpired } from "../mcp/mcp-auth.js";
import { ERROR_MAPPING_DOC_PATH } from "../../domain/errors/error-next-action.js";
import { createRateLimiter, mcpRateLimitKey, type RateLimitStore } from "./rate-limit.js";
import { readErrorMappingMarkdown } from "./error-mapping-doc.js";
import type { SetupCodeStore } from "./setup-code-store.js";
import { registerConsoleApi } from "./console-api.js";
import { sendCaughtError, wantsJson } from "./console-errors.js";
import {
  setupFormPage,
  setupNoticePage,
  setupTokenPage,
  setupUpdatedPage,
} from "./setup-browser-page.js";

export const consumeSetupToken = async (
  memory: SetupCodeStore,
  persistent: McpSetupRepositoryPort | undefined,
  code: string,
): Promise<string | null> => {
  const trimmed = code.trim();
  if (!trimmed) {
    return null;
  }
  const fromMem = memory.consume(trimmed);
  if (fromMem) {
    if (persistent) {
      await persistent.consume(trimmed);
    }
    return fromMem;
  }
  if (!persistent) {
    return null;
  }
  return persistent.consume(trimmed);
};

export const createExpressApp = (input: {
  config: AppConfig;
  logger: LoggerPort;
  useCases: ToolUseCases;
  acessos: AcessoRepositoryPort;
  skills: SkillRepositoryPort;
  crypto: CryptoPort;
  setup: SetupCodeStore;
  setupPersistent?: McpSetupRepositoryPort;
  pino?: PinoLogger;
  mcpRateLimitStore?: RateLimitStore;
  readinessCheck?: () => Promise<boolean>;
  oauth?: ChatGptOAuth;
}): { app: Express; dispose: () => void } => {
  const app = express();
  app.disable("x-powered-by");
  if (input.config.TRUST_PROXY) {
    app.set(
      "trust proxy",
      input.config.TRUST_PROXY.split(",").map((item) => item.trim()),
    );
  }
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'unsafe-inline'"],
          imgSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
        },
      },
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
      frameguard: { action: "deny" },
    }),
  );
  if (input.pino && input.config.NODE_ENV !== "test") {
    app.use(
      pinoHttp({
        logger: input.pino,
        autoLogging: { ignore: (req: { url?: string }) => req.url === "/health" },
        serializers: {
          req: (req: { method?: string; url?: string }) => ({
            method: req.method,
            url: req.url?.startsWith("/setup/") ? "/setup/[redacted]" : req.url?.split("?")[0],
          }),
        },
      }),
    );
  }
  app.use(
    cors({
      origin: [...input.config.allowedOrigins],
      methods: ["GET", "POST", "DELETE"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Mcp-Session-Id",
        "mcp-protocol-version",
        "mcp-method",
        "mcp-name",
      ],
      exposedHeaders: ["Mcp-Session-Id", "mcp-protocol-version"],
    }),
  );
  app.use(
    compression({
      filter: (req, res) => {
        const contentType = res.getHeader("Content-Type");
        if (typeof contentType === "string" && contentType.includes("text/event-stream")) {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false, limit: "16kb", parameterLimit: 32 }));

  app.use((req, res, next) => {
    if (
      req.path !== "/mcp" &&
      req.path !== "/mcp/chatgpt" &&
      !req.path.startsWith("/oauth/") &&
      !req.path.startsWith("/.well-known/") &&
      !req.path.startsWith("/setup/") &&
      !req.path.startsWith("/app")
    ) {
      next();
      return;
    }
    const origin = req.header("origin");
    const browserForm =
      req.path === "/oauth/authorize/authenticate" ||
      req.path === "/oauth/authorize/consent" ||
      req.path.startsWith("/setup/") ||
      req.path.startsWith("/app");
    const originAllowed = browserForm
      ? origin === new URL(input.config.PUBLIC_BASE_URL).origin
      : origin !== undefined && input.config.allowedOrigins.includes(origin);
    if (origin && (origin === "null" || !originAllowed)) {
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }
    const configured = input.config.MCP_ALLOWED_HOSTS.split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const allowedHosts = configured.length
      ? configured
      : [new URL(input.config.PUBLIC_BASE_URL).host.toLowerCase()];
    const host = req.header("host")?.toLowerCase();
    let hostname = "";
    try {
      hostname = new URL(`http://${host ?? ""}`).hostname;
    } catch {
      /* host inválido */
    }
    if (
      !host ||
      !allowedHosts.some(
        (allowed) => allowed === host || (!allowed.includes(":") && allowed === hostname),
      )
    ) {
      res.status(403).json({ error: "host_not_allowed" });
      return;
    }
    next();
  });

  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      resource: input.config.mcpResourceUrl,
      bearer_methods_supported: ["header"],
    });
  });
  if (input.oauth)
    registerOAuthRoutes(app, input.oauth, input.config, input.logger, input.mcpRateLimitStore);

  app.get("/health", (_req, res) => {
    const info = buildInfo();
    res.json({
      status: "ok",
      service: "se7e-mcp-server",
      version: info.version,
      sha: info.sha,
      buildTime: info.buildTime,
      uptimeSec: info.uptimeSec,
    });
  });

  app.get(ERROR_MAPPING_DOC_PATH, (_req, res) => {
    const markdown = readErrorMappingMarkdown();
    if (markdown === null) {
      res.status(404).type("text/plain; charset=utf-8").send("error-mapping.md not packaged");
      return;
    }
    res.type("text/markdown; charset=utf-8").send(markdown);
  });

  app.get("/ready", (_req, res) => {
    const check = input.readinessCheck;
    if (!check) {
      res.json({ status: "ready", database: "skipped" });
      return;
    }
    void check()
      .then((ok) => {
        if (!ok) {
          res.status(503).json({ status: "not_ready", database: "error" });
          return;
        }
        res.json({ status: "ready", database: "ok" });
      })
      .catch(() => {
        res.status(503).json({ status: "not_ready", database: "error" });
      });
  });

  const setupLimiter = createRateLimiter({
    windowMs: input.config.MCP_RATE_LIMIT_WINDOW_MS,
    max: input.config.MCP_BOOTSTRAP_RATE_LIMIT_MAX,
    keyGenerator: (req) => `setup:${req.ip ?? "unknown"}`,
    store: input.mcpRateLimitStore,
  });
  app.use("/setup", setupLimiter, (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.get("/setup/:code", async (req, res) => {
    const form = await input.useCases.setupOperations?.form(req.params.code ?? "");
    if (!form) {
      res
        .status(404)
        .type("html")
        .send(setupNoticePage("Operação inválida ou expirada. Gere outra URL."));
      return;
    }
    res.setHeader("Referrer-Policy", "same-origin");
    res.type("html").send(
      setupFormPage({
        purpose: form.purpose,
        code: req.params.code ?? "",
        csrf: form.csrf,
      }),
    );
  });
  app.post("/setup/:code", async (req, res) => {
    const json = wantsJson(req.header("accept"));
    if (req.header("origin") !== new URL(input.config.PUBLIC_BASE_URL).origin) {
      if (json) {
        res.status(403).json({
          success: false,
          code: "VALIDATION_ERROR",
          message: "Origem não autorizada.",
          hint: "O POST do formulário usa a origem de PUBLIC_BASE_URL.",
        });
        return;
      }
      res.status(403).type("html").send(setupNoticePage("Origem não autorizada."));
      return;
    }
    try {
      const form = Object.fromEntries(
        Object.entries(req.body as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
      const result = await input.useCases.setupOperations?.complete(req.params.code ?? "", form);
      if (!result) {
        if (json) {
          res.status(404).json({
            success: false,
            code: "VALIDATION_ERROR",
            message: "Operação indisponível.",
            hint: "Gere uma nova URL de operação e confirme no navegador.",
          });
          return;
        }
        res.status(404).type("html").send(setupNoticePage("Operação indisponível."));
        return;
      }
      if (json) {
        res.json({
          success: true,
          ...(result.token ? { token: result.token } : {}),
          ...(result.acessoId ? { acessoId: result.acessoId } : {}),
        });
        return;
      }
      res.type("html").send(result.token ? setupTokenPage(result.token) : setupUpdatedPage());
    } catch (error) {
      if (json) {
        sendCaughtError(res, error);
        return;
      }
      res
        .status(400)
        .type("html")
        .send(
          setupNoticePage(
            "Operação não concluída. Verifique as credenciais no hub e gere uma nova URL.",
          ),
        );
    }
  });

  registerConsoleApi(app, {
    config: input.config,
    useCases: input.useCases,
    acessos: input.acessos,
    crypto: input.crypto,
    mcpRateLimitStore: input.mcpRateLimitStore,
  });

  const spaDir = path.resolve(process.cwd(), "web", "dist");
  app.use("/app", (req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    next();
  });
  app.use("/app", express.static(spaDir, { index: false, fallthrough: true }));
  app.get(/^\/app(?:\/.*)?$/, (req, res, next) => {
    if (req.path.startsWith("/app/api")) {
      next();
      return;
    }
    const index = path.join(spaDir, "index.html");
    if (!existsSync(index)) {
      res
        .status(503)
        .type("text/plain; charset=utf-8")
        .send("Console indisponível. Execute npm run web:build.");
      return;
    }
    res.sendFile(index);
  });

  const quota = new McpSessionQuota();
  const mcp = createMcpHttpHandler({
    config: input.config,
    useCases: input.useCases,
    logger: input.logger,
    catalog: { acessos: input.acessos, skills: input.skills },
    rateLimit: input.mcpRateLimitStore,
    quota,
    resolveBearer: async (token) => {
      const acesso = await input.acessos.findByTokenHash(input.crypto.sha256Hex(token));
      if (!acesso || acesso.statusAcesso === "revoked" || isMcpTokenExpired(acesso)) {
        return null;
      }
      return {
        usuarioId: acesso.usuarioId,
        acessoId: acesso.id,
        auth: {
          kind: "manual" as const,
          usuarioId: acesso.usuarioId,
          acessoId: acesso.id,
          sourceHash: acesso.tokenHash,
        },
      };
    },
  });
  const oauth = input.oauth;
  const chatgpt = oauth
    ? createMcpHttpHandler({
        config: input.config,
        useCases: input.useCases,
        logger: input.logger,
        catalog: { acessos: input.acessos, skills: input.skills },
        rateLimit: input.mcpRateLimitStore,
        quota,
        oauth,
        resolveBearer: async (token) => {
          const auth = await oauth.resolve(token);
          if (auth?.kind !== "oauth") return null;
          await verifyBearerToken(`Bearer ${token}`, {
            expectedResource: new URL(oauth.policy.resource),
            requiredScopes: ["se7e:access"],
            verifier: {
              verifyAccessToken: () =>
                Promise.resolve({
                  token,
                  clientId: "chatgpt",
                  scopes: ["se7e:access"],
                  expiresAt: Math.floor(auth.expiresAt / 1000),
                  resource: new URL(oauth.policy.resource),
                }),
            },
          });
          return { usuarioId: auth.usuarioId, acessoId: auth.acessoId, auth };
        },
      })
    : undefined;
  const unbindRevocation = oauth?.onRevocation((id) => {
    const context = sessionContext.getStore();
    if (context?.auth?.kind === "oauth" && context.auth.grantId === id && context.onComplete)
      context.onComplete.push(() => chatgpt?.invalidateGrant(id));
    else chatgpt?.invalidateGrant(id);
  });
  if (chatgpt)
    app.all(
      "/mcp/chatgpt",
      createRateLimiter({
        windowMs: input.config.MCP_RATE_LIMIT_WINDOW_MS,
        max: input.config.MCP_RATE_LIMIT_MAX,
        keyGenerator: (req) => `chatgpt:${req.ip ?? "unknown"}`,
        store: input.mcpRateLimitStore,
      }),
      async (req, res) => {
        try {
          await chatgpt.handle(req, res);
        } catch (error) {
          if (!res.headersSent) {
            if (
              error instanceof SdkOAuthError ||
              (isDomainError(error) && error.stage === "oauth")
            ) {
              res.setHeader(
                "WWW-Authenticate",
                chatGptOAuthChallenge(input.config.PUBLIC_BASE_URL, true),
              );
              res.status(401).json({ error: "invalid_token" });
            } else res.status(503).json({ error: "temporarily_unavailable" });
          }
        }
      },
    );

  const mcpRateLimiter = createRateLimiter({
    windowMs: input.config.MCP_RATE_LIMIT_WINDOW_MS,
    max: input.config.MCP_RATE_LIMIT_MAX,
    keyGenerator: mcpRateLimitKey,
    store: input.mcpRateLimitStore,
  });

  const bootstrapLimiter = createRateLimiter({
    windowMs: input.config.MCP_RATE_LIMIT_WINDOW_MS,
    max: input.config.MCP_BOOTSTRAP_RATE_LIMIT_MAX,
    keyGenerator: (req) => `boot:${req.ip ?? "unknown"}`,
    store: input.mcpRateLimitStore,
  });

  app.all(
    "/mcp",
    (req, res, next) => {
      const auth = req.header("authorization");
      if (!auth) {
        bootstrapLimiter(req, res, next);
        return;
      }
      mcpRateLimiter(req, res, next);
    },
    (req, res) => {
      void mcp.handle(req, res).catch(() => {
        if (!res.headersSent) {
          res.status(500).json({ error: "mcp_request_failed" });
        }
      });
    },
  );

  app.use(
    (
      _error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (!res.headersSent) {
        res.status(400).json({ error: "invalid_request" });
      }
    },
  );
  const unbindInvalidation = input.useCases.setupOperations?.onInvalidation((id) => {
    mcp.invalidateAccess(id);
    chatgpt?.invalidateAccess(id);
  });
  return {
    app,
    dispose: () => {
      unbindInvalidation?.();
      unbindRevocation?.();
      mcp.dispose();
      chatgpt?.dispose();
    },
  };
};
