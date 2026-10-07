import type { Express, Request, Response } from "express";
import {
  buildOAuthProtectedResourceMetadata,
  getOAuthProtectedResourceMetadataUrl,
} from "@modelcontextprotocol/server";
import type { ChatGptOAuth } from "../../application/use-cases/chatgpt-oauth.js";
import { OAuthError } from "../../domain/errors/oauth-error.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { RateLimitStore } from "./rate-limit.js";
import type { AppConfig } from "../../config/env.js";
import { createRateLimiter } from "./rate-limit.js";
import { oauthConnectErrorPage, oauthConsentPage, oauthTokenPage } from "./oauth-connect-page.js";

const cookieName = "__Host-se7e-oauth";
const cookie = (req: Request): string => {
  const values = (req.header("cookie") ?? "")
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${cookieName}=`));
  return values.length === 1 ? values[0]!.slice(cookieName.length + 1) : "";
};
const params = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new OAuthError("invalid_request");
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val !== "string" || val.length > 4096) throw new OAuthError("invalid_request");
    result[key] = val;
  }
  return result;
};
const formHeaders = (res: Response, redirectUri: string): void => {
  // Chromium envia Origin:null em POST de navegação com no-referrer.
  // O redirect 303 mantém no-referrer; páginas só enviam Referer ao próprio servidor.
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self' ${new URL(redirectUri).origin}; frame-ancestors 'none'; base-uri 'none'`,
  );
};

export const registerOAuthRoutes = (
  app: Express,
  oauth: ChatGptOAuth,
  config: AppConfig,
  logger: LoggerPort,
  rateLimit?: RateLimitStore,
): void => {
  const issuer = config.PUBLIC_BASE_URL,
    resource = new URL(`${issuer}/mcp/chatgpt`);
  app.get(new URL(getOAuthProtectedResourceMetadataUrl(resource)).pathname, (_req, res) =>
    res.json(
      buildOAuthProtectedResourceMetadata({
        resourceServerUrl: resource,
        oauthMetadata: {
          issuer,
          authorization_endpoint: `${issuer}/oauth/authorize`,
          token_endpoint: `${issuer}/oauth/token`,
          response_types_supported: ["code"],
        },
        scopesSupported: ["se7e:access"],
        resourceName: "Se7e ChatGPT",
      }),
    ),
  );
  app.get("/.well-known/oauth-authorization-server", (_req, res) =>
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["se7e:access"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    }),
  );
  app.use(
    "/oauth",
    createRateLimiter({
      windowMs: config.MCP_RATE_LIMIT_WINDOW_MS,
      max: config.MCP_BOOTSTRAP_RATE_LIMIT_MAX,
      keyGenerator: (req) => `oauth:${req.ip ?? "unknown"}`,
      store: rateLimit,
    }),
    (_req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Referrer-Policy", "no-referrer");
      next();
    },
  );
  const route =
    (step: string, handler: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response): Promise<void> => {
      const started = Date.now();
      try {
        if (req.method === "POST" && !req.is("application/x-www-form-urlencoded"))
          throw new OAuthError("invalid_request", 415);
        if (
          (step === "authenticate" || step === "consent") &&
          req.header("origin") !== new URL(issuer).origin
        )
          throw new OAuthError("invalid_request", 403);
        await handler(req, res);
        logger.info("OAuth etapa concluída", {
          stage: step,
          durationMs: Date.now() - started,
          success: true,
        });
      } catch (error) {
        const known = error instanceof OAuthError;
        const code = known ? error.code : "temporarily_unavailable";
        logger.warn("OAuth etapa recusada", {
          stage: step,
          durationMs: Date.now() - started,
          errorCode: code,
        });
        res.status(known ? error.status : 503);
        if (step === "token" || step === "revoke") res.json({ error: code });
        else res.type("html").send(oauthConnectErrorPage());
      }
    };
  app.get(
    "/oauth/authorize",
    route("authorize", async (req, res) => {
      const { transaction, nonce, csrf } = await oauth.begin(params(req.query));
      res.cookie(cookieName, nonce, {
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 900_000,
      });
      formHeaders(res, transaction.redirectUri);
      res.type("html").send(
        oauthTokenPage({
          clientId: transaction.clientId,
          transactionId: transaction.id,
          csrf,
        }),
      );
    }),
  );
  app.post(
    "/oauth/authorize/authenticate",
    route("authenticate", async (req, res) => {
      const body = params(req.body);
      const result = await oauth.authenticate(
        body.transaction ?? "",
        cookie(req),
        body.csrf ?? "",
        body.token ?? "",
      );
      formHeaders(res, result.transaction.redirectUri);
      res.type("html").send(
        oauthConsentPage({
          persona: result.name,
          clientId: result.transaction.clientId,
          transactionId: result.transaction.id,
          csrf: result.csrf,
        }),
      );
    }),
  );
  app.post(
    "/oauth/authorize/consent",
    route("consent", async (req, res) => {
      const body = params(req.body);
      if (body.confirmed !== "yes" && body.confirmed !== "no")
        throw new OAuthError("invalid_request");
      const location = await oauth.consent(
        body.transaction ?? "",
        cookie(req),
        body.csrf ?? "",
        body.confirmed === "yes",
      );
      res.clearCookie(cookieName, { secure: true, httpOnly: true, sameSite: "lax", path: "/" });
      res.redirect(303, location);
    }),
  );
  app.post(
    "/oauth/token",
    route("token", async (req, res) => {
      const body = params(req.body);
      if (
        req.header("authorization") ||
        body.client_secret !== undefined ||
        body.client_assertion !== undefined
      )
        throw new OAuthError("invalid_client");
      const result =
        body.grant_type === "authorization_code"
          ? await oauth.exchange(body)
          : body.grant_type === "refresh_token"
            ? await oauth.refresh(body)
            : (() => {
                throw new OAuthError("unsupported_grant_type");
              })();
      res.json(result);
    }),
  );
  app.post(
    "/oauth/revoke",
    route("revoke", async (req, res) => {
      const body = params(req.body);
      if (!body.token || !body.client_id) throw new OAuthError("invalid_request");
      await oauth.revoke(body.token, body.client_id);
      res.status(200).end();
    }),
  );
};
