import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { AppConfig } from "../../config/env.js";
import { DomainError, isDomainError } from "../../domain/errors/domain-error.js";
import type { TokenEncryptorPort } from "../../domain/ports/crypto.port.js";
import type { AutenticarConta, RegistrarConta } from "../../application/use-cases/conta.js";
import { createRateLimiter } from "../http/rate-limit.js";
import { type McpJwtService, pkceChallengeFromVerifier, readSession, signSession } from "./jwt.js";
import type { OAuthStorePort } from "./oauth-store.port.js";
import { timingSafeStringEqual } from "./bearer-auth.js";

const RATE_LIMIT_WINDOW_MS = 5 * 60_000;
const LOGIN_RATE_LIMIT_MAX = 10;
const TOKEN_RATE_LIMIT_MAX = 30;

const cookieValue = (req: Request, name: string): string | undefined => {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== "object" || cookies === null) return undefined;
  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
};

const formField = (body: unknown, key: string): string => {
  if (typeof body !== "object" || body === null) return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
};

export interface OAuthDeps {
  config: AppConfig;
  store: OAuthStorePort;
  jwt: McpJwtService;
  crypto: TokenEncryptorPort;
  registrar: RegistrarConta;
  autenticar: AutenticarConta;
}

const SESSION_COOKIE = "mcp_session";

export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const htmlPage = (title: string, body: string): string => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  form, .card{background:#1e293b;padding:24px;border-radius:12px;width:100%;max-width:420px;box-shadow:0 10px 40px #0006}
  h1{font-size:1.25rem;margin:0 0 8px}
  p{color:#94a3b8;font-size:.9rem}
  label{display:block;margin:12px 0 4px;font-size:.85rem}
  input{width:100%;padding:10px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;box-sizing:border-box}
  button{margin-top:16px;width:100%;padding:10px;border:0;border-radius:8px;background:#38bdf8;color:#0f172a;font-weight:600;cursor:pointer}
  a{color:#38bdf8}
  .err{color:#fca5a5;font-size:.85rem}
</style></head><body>${body}</body></html>`;

const redirectAllowed = (uris: string[], uri: string): boolean => uris.includes(uri);

/**
 * Só aceita paths relativos no mesmo origin. Rejeita protocol-relative (`//evil.com`),
 * `/\evil.com` e valores com scheme (`https:...`) para fechar open redirect no login.
 */
export const safeNext = (next: string): string => {
  const value = next.trim();
  const colon = value.indexOf(":");
  const firstSlash = value.indexOf("/");
  if (colon !== -1 && (firstSlash === -1 || colon < firstSlash)) {
    return "/";
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  return value;
};

export const createOAuthRouter = (deps: OAuthDeps): Router => {
  const router = createRouter();
  const { config, store, jwt, crypto, registrar, autenticar } = deps;
  const loginRateLimiter = createRateLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: LOGIN_RATE_LIMIT_MAX,
  });
  const tokenRateLimiter = createRateLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: TOKEN_RATE_LIMIT_MAX,
  });
  const registerRateLimiter = createRateLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: TOKEN_RATE_LIMIT_MAX,
  });
  const revokeRateLimiter = createRateLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: TOKEN_RATE_LIMIT_MAX,
  });

  /**
   * Confidential clients (issued a client_secret by DCR) must prove possession of it
   * on every token request. Public clients (no stored secret) rely on PKCE instead.
   */
  const authenticateClient = async (
    clientId: string,
    providedSecret: string | undefined,
  ): Promise<boolean> => {
    const client = await store.getClient(clientId);
    if (!client) return false;
    if (!client.clientSecretHash) return true;
    if (!providedSecret) return false;
    return timingSafeStringEqual(crypto.sha256Hex(providedSecret), client.clientSecretHash);
  };

  router.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer: config.PUBLIC_BASE_URL,
      authorization_endpoint: `${config.PUBLIC_BASE_URL}/oauth/authorize`,
      token_endpoint: `${config.PUBLIC_BASE_URL}/oauth/token`,
      registration_endpoint: `${config.PUBLIC_BASE_URL}/oauth/register`,
      revocation_endpoint: `${config.PUBLIC_BASE_URL}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      scopes_supported: ["mcp"],
      resource: config.mcpResourceUrl,
    });
  });

  router.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      resource: config.mcpResourceUrl,
      authorization_servers: [config.PUBLIC_BASE_URL],
      bearer_methods_supported: ["header"],
      scopes_supported: ["mcp"],
    });
  });

  router.post("/oauth/register", registerRateLimiter, async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const redirectUris = Array.isArray(body.redirect_uris)
        ? body.redirect_uris.filter((u): u is string => typeof u === "string")
        : [];
      if (redirectUris.length === 0) {
        res
          .status(400)
          .json({ error: "invalid_client_metadata", error_description: "redirect_uris required" });
        return;
      }
      const clientId = randomUUID();
      const confidential =
        body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none";
      const secret = confidential ? randomBytes(24).toString("base64url") : null;
      await store.saveClient({
        clientId,
        clientSecretHash: secret ? crypto.sha256Hex(secret) : null,
        clientName: typeof body.client_name === "string" ? body.client_name : "mcp-host",
        redirectUris,
      });
      res.status(201).json({
        client_id: clientId,
        client_secret: secret ?? undefined,
        redirect_uris: redirectUris,
        token_endpoint_auth_method: secret ? "client_secret_post" : "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      });
    } catch {
      res.status(500).json({ error: "server_error" });
    }
  });

  router.get("/oauth/authorize", async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    if (q.response_type !== "code" || !q.client_id || !q.redirect_uri || !q.code_challenge) {
      res
        .status(400)
        .send("invalid_request: response_type=code, client_id, redirect_uri, code_challenge");
      return;
    }
    if ((q.code_challenge_method ?? "S256") !== "S256") {
      res.status(400).send("code_challenge_method must be S256");
      return;
    }
    const client = await store.getClient(q.client_id);
    if (!client || !redirectAllowed(client.redirectUris, q.redirect_uri)) {
      res.status(400).send("invalid client or redirect_uri");
      return;
    }
    const accountId = readSession(config.MCP_SESSION_SECRET, cookieValue(req, SESSION_COOKIE));
    if (!accountId) {
      const next = encodeURIComponent(req.originalUrl);
      res.redirect(`/oauth/login?next=${next}`);
      return;
    }
    const code = randomBytes(24).toString("base64url");
    await store.saveCode({
      code,
      clientId: client.clientId,
      accountId,
      redirectUri: q.redirect_uri,
      codeChallenge: q.code_challenge,
      resource: q.resource ?? config.mcpResourceUrl,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const url = new URL(q.redirect_uri);
    url.searchParams.set("code", code);
    if (q.state) url.searchParams.set("state", q.state);
    res.redirect(url.toString());
  });

  const renderLogin = (next: string, error?: string, mode: "login" | "signup" = "login") =>
    htmlPage(
      mode === "login" ? "Entrar — Se7e MCP" : "Criar conta — Se7e MCP",
      `<form method="post" action="${mode === "login" ? "/oauth/login" : "/oauth/signup"}">
        <h1>${mode === "login" ? "Entrar no Se7e MCP" : "Criar conta Se7e MCP"}</h1>
        <p>Esta conta identifica você neste MCP. Não é o login do plug-server nem do banco ERP.</p>
        ${error ? `<p class="err">${escapeHtml(error)}</p>` : ""}
        <input type="hidden" name="next" value="${escapeHtml(next)}"/>
        <label>E-mail</label><input name="email" type="email" required/>
        <label>Senha</label><input name="password" type="password" minlength="8" required/>
        <button type="submit">${mode === "login" ? "Entrar" : "Criar conta"}</button>
        <p>${
          mode === "login"
            ? `Não tem conta? <a href="/oauth/signup?next=${encodeURIComponent(next)}">Registrar</a>`
            : `Já tem conta? <a href="/oauth/login?next=${encodeURIComponent(next)}">Entrar</a>`
        }</p>
      </form>`,
    );

  router.get("/oauth/login", (req, res) => {
    const next = typeof req.query.next === "string" ? safeNext(req.query.next) : "/oauth/authorize";
    res.type("html").send(renderLogin(next));
  });

  router.get("/oauth/signup", (req, res) => {
    const next = typeof req.query.next === "string" ? safeNext(req.query.next) : "/oauth/authorize";
    res.type("html").send(renderLogin(next, undefined, "signup"));
  });

  const finishLogin = (res: Response, accountId: string, next: string) => {
    res.cookie(SESSION_COOKIE, signSession(config.MCP_SESSION_SECRET, accountId), {
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      maxAge: 8 * 3600_000,
      path: "/",
    });
    res.redirect(safeNext(next));
  };

  router.post("/oauth/login", loginRateLimiter, async (req, res) => {
    const next = safeNext(formField(req.body, "next") || "/");
    try {
      const account = await autenticar.execute(
        formField(req.body, "email"),
        formField(req.body, "password"),
      );
      finishLogin(res, account.id, next);
    } catch (error) {
      const message = isDomainError(error) ? error.message : "Falha no login";
      res.status(401).type("html").send(renderLogin(next, message));
    }
  });

  router.post("/oauth/signup", loginRateLimiter, async (req, res) => {
    const next = safeNext(formField(req.body, "next") || "/");
    try {
      const account = await registrar.execute(
        formField(req.body, "email"),
        formField(req.body, "password"),
      );
      finishLogin(res, account.id, next);
    } catch (error) {
      const message = isDomainError(error) ? error.message : "Falha no registro";
      res
        .status(400)
        .type("html")
        .send(renderLogin(next, message, "signup"));
    }
  });

  router.post("/oauth/token", tokenRateLimiter, async (req, res) => {
    try {
      const body = req.body as Record<string, string>;
      const grant = body.grant_type;
      if (grant === "authorization_code") {
        const codeRow = await store.consumeCode(body.code ?? "");
        if (!codeRow || codeRow.expiresAt.getTime() < Date.now()) {
          res.status(400).json({ error: "invalid_grant" });
          return;
        }
        if (codeRow.redirectUri !== body.redirect_uri) {
          res
            .status(400)
            .json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
          return;
        }
        if (codeRow.clientId !== body.client_id && body.client_id) {
          res.status(400).json({ error: "invalid_client" });
          return;
        }
        if (!(await authenticateClient(codeRow.clientId, body.client_secret))) {
          res
            .status(401)
            .json({ error: "invalid_client", error_description: "client authentication failed" });
          return;
        }
        const expected = pkceChallengeFromVerifier(body.code_verifier ?? "");
        if (!timingSafeStringEqual(expected, codeRow.codeChallenge)) {
          res.status(400).json({ error: "invalid_grant", error_description: "pkce" });
          return;
        }
        const access = await jwt.issueAccessToken(codeRow.accountId, codeRow.clientId);
        const refresh = jwt.issueRefreshToken();
        await store.saveRefresh({
          tokenHash: createHash("sha256").update(refresh).digest("hex"),
          clientId: codeRow.clientId,
          accountId: codeRow.accountId,
          expiresAt: new Date(Date.now() + config.MCP_JWT_REFRESH_TTL_SECONDS * 1000),
          revokedAt: null,
        });
        res.json({
          access_token: access,
          refresh_token: refresh,
          token_type: "Bearer",
          expires_in: config.MCP_JWT_ACCESS_TTL_SECONDS,
          scope: "mcp",
        });
        return;
      }
      if (grant === "refresh_token") {
        const hash = createHash("sha256")
          .update(body.refresh_token ?? "")
          .digest("hex");
        const row = await store.getRefresh(hash);
        if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
          res.status(400).json({ error: "invalid_grant" });
          return;
        }
        if (row.clientId !== body.client_id && body.client_id) {
          res.status(400).json({ error: "invalid_client" });
          return;
        }
        if (!(await authenticateClient(row.clientId, body.client_secret))) {
          res
            .status(401)
            .json({ error: "invalid_client", error_description: "client authentication failed" });
          return;
        }
        await store.revokeRefresh(hash);
        const access = await jwt.issueAccessToken(row.accountId, row.clientId);
        const refresh = jwt.issueRefreshToken();
        await store.saveRefresh({
          tokenHash: createHash("sha256").update(refresh).digest("hex"),
          clientId: row.clientId,
          accountId: row.accountId,
          expiresAt: new Date(Date.now() + config.MCP_JWT_REFRESH_TTL_SECONDS * 1000),
          revokedAt: null,
        });
        res.json({
          access_token: access,
          refresh_token: refresh,
          token_type: "Bearer",
          expires_in: config.MCP_JWT_ACCESS_TTL_SECONDS,
          scope: "mcp",
        });
        return;
      }
      res.status(400).json({ error: "unsupported_grant_type" });
    } catch {
      res.status(400).json({ error: "invalid_request" });
    }
  });

  router.post("/oauth/revoke", revokeRateLimiter, async (req, res) => {
    const token = String((req.body as { token?: string })?.token ?? "");
    if (token) {
      await store.revokeRefresh(createHash("sha256").update(token).digest("hex"));
    }
    res.status(200).json({ revoked: true });
  });

  return router;
};

export { authenticateBearer, wwwAuthenticate } from "./bearer-auth.js";
export { DomainError };
