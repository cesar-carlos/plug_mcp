import cookieParser from "cookie-parser";
import cors from "cors";
import compression from "compression";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Logger as PinoLogger } from "pino";
import type { AppConfig } from "../../config/env.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { createOAuthRouter, type OAuthDeps } from "../oauth/oauth-router.js";
import { createMcpHttpHandler } from "../mcp/mcp-http.js";
import type { ToolUseCases } from "../mcp/register-tools.js";
import type { McpJwtService } from "../oauth/jwt.js";
import { createRateLimiter, mcpRateLimitKey, type RateLimitStore } from "./rate-limit.js";

export const createExpressApp = (input: {
  config: AppConfig;
  logger: LoggerPort;
  oauth: OAuthDeps;
  jwt: McpJwtService;
  useCases: ToolUseCases;
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
        autoLogging: {
          ignore: (req: { url?: string }) => req.url === "/health",
        },
      }),
    );
  }
  // Clientes MCP no browser (e o handshake OAuth) precisam ler Mcp-Session-Id/mcp-protocol-version
  // de respostas cross-origin; sem exposedHeaders o SDK MCP falha ao inicializar a sessão no cliente web.
  app.use(
    cors({
      origin: input.config.allowedOrigins.length > 0 ? [...input.config.allowedOrigins] : true,
      methods: ["GET", "POST", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id", "mcp-protocol-version"],
      exposedHeaders: ["Mcp-Session-Id", "mcp-protocol-version"],
    }),
  );
  // Respostas de consultar_dados podem ter até QUERY_ABSOLUTE_MAX_ROWS linhas em JSON; comprimir
  // reduz bytes na rede. Nunca comprima text/event-stream — quebraria o streaming incremental
  // do transport MCP (SSE precisa de flush imediato, não de buffer do gzip).
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
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "se7e-mcp-server" });
  });

  app.use(createOAuthRouter(input.oauth));

  const mcp = createMcpHttpHandler({
    config: input.config,
    jwt: input.jwt,
    useCases: input.useCases,
    logger: input.logger,
  });

  const mcpRateLimiter = createRateLimiter({
    windowMs: input.config.MCP_RATE_LIMIT_WINDOW_MS,
    max: input.config.MCP_RATE_LIMIT_MAX,
    keyGenerator: mcpRateLimitKey,
    store: input.mcpRateLimitStore,
  });

  app.all("/mcp", mcpRateLimiter, (req, res) => {
    void mcp.handle(req, res);
  });

  return { app, dispose: mcp.dispose };
};
