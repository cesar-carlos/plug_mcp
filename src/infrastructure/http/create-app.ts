import cors from "cors";
import compression from "compression";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Logger as PinoLogger } from "pino";
import type { AppConfig } from "../../config/env.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { UsuarioRepositoryPort } from "../../domain/ports/usuario-repository.port.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { SkillRepositoryPort } from "../../domain/ports/skill-repository.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import { createMcpHttpHandler } from "../mcp/mcp-http.js";
import type { ToolUseCases } from "../mcp/register-tools.js";
import { isMcpTokenExpired } from "../mcp/mcp-auth.js";
import { createRateLimiter, mcpRateLimitKey, type RateLimitStore } from "./rate-limit.js";
import type { SetupCodeStore } from "./setup-code-store.js";

export const createExpressApp = (input: {
  config: AppConfig;
  logger: LoggerPort;
  useCases: ToolUseCases;
  usuarios: UsuarioRepositoryPort;
  acessos: AcessoRepositoryPort;
  skills: SkillRepositoryPort;
  crypto: CryptoPort;
  setup: SetupCodeStore;
  pino?: PinoLogger;
  mcpRateLimitStore?: RateLimitStore;
}): { app: Express; dispose: () => void } => {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'unsafe-inline'"],
          imgSrc: ["'none'"],
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
      }),
    );
  }
  app.use(
    cors({
      origin: input.config.allowedOrigins.length > 0 ? [...input.config.allowedOrigins] : true,
      methods: ["GET", "POST", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id", "mcp-protocol-version"],
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
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    if (req.path !== "/mcp") {
      next();
      return;
    }
    const allowed = input.config.allowedOrigins;
    if (allowed.length === 0) {
      next();
      return;
    }
    const origin = req.header("origin");
    if (origin && !allowed.includes(origin)) {
      res.status(403).json({ error: "origin_not_allowed" });
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

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "se7e-mcp-server" });
  });

  app.get("/setup/:code", (req, res) => {
    const token = input.setup.consume(req.params.code ?? "");
    if (!token) {
      res.status(404).type("html").send("<p>Código inválido ou já usado.</p>");
      return;
    }
    res
      .type("html")
      .send(
        `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Token MCP</title></head><body><p>Copie o token abaixo para o header Authorization: Bearer do seu cliente MCP. Ele não será mostrado de novo.</p><pre>${token}</pre></body></html>`,
      );
  });

  const mcp = createMcpHttpHandler({
    config: input.config,
    useCases: input.useCases,
    logger: input.logger,
    catalog: { acessos: input.acessos, skills: input.skills },
    rateLimit: input.mcpRateLimitStore,
    resolveUsuarioId: async (token) => {
      const usuario = await input.usuarios.findByTokenHash(input.crypto.sha256Hex(token));
      if (!usuario || isMcpTokenExpired(usuario)) {
        return null;
      }
      return usuario.id;
    },
  });

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
      void mcp.handle(req, res);
    },
  );

  return { app, dispose: mcp.dispose };
};
