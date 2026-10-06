import { createHash, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import {
  NodeStreamableHTTPServerTransport,
  toNodeHandler,
  toWebRequest,
} from "@modelcontextprotocol/node";
import {
  McpServer,
  isInitializeRequest,
  isLegacyRequest,
  createMcpHandler,
} from "@modelcontextprotocol/server";
import type { AppConfig } from "../../config/env.js";
import { buildInfo } from "../../config/build-info.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { RateLimitStore } from "../http/rate-limit.js";
import { wwwAuthenticate, readBearer } from "./mcp-auth.js";
import {
  accountContext,
  currentClientIp,
  currentAccountId,
  currentAcessoId,
} from "./account-context.js";
import { registerTools, type ToolUseCases } from "./register-tools.js";
import { montarInstrucoesServidor, CHATGPT_INSTRUCOES } from "./server-instructions.js";
import { createToolRunner } from "./tool-result.js";
import { syncSkillTools, type SkillCatalogPorts } from "./skill-tools.js";
import { personaSessaoDeAcesso, type PersonaSessao } from "../../domain/entities/acesso.js";
import type { ConsumerAuth } from "../../domain/entities/consumer-auth.js";
import {
  currentConsumerAuth,
  assertConsumerAuthorized,
  sessionContext,
  type SessionStore,
} from "../../application/session-context.js";
import type { ChatGptOAuth } from "../../application/use-cases/chatgpt-oauth.js";
import { chatGptServer, registerChatGptTools } from "./chatgpt-tools.js";
import { chatGptOAuthChallenge } from "../oauth/challenge.js";

export class McpSessionQuota {
  private readonly counters = new Set<(aid?: string | null) => number>();
  private readonly pending = new Map<symbol, string | null>();
  add(counter: (aid?: string | null) => number): () => void {
    this.counters.add(counter);
    return () => {
      this.counters.delete(counter);
    };
  }
  count(aid?: string | null): number {
    return (
      [...this.counters].reduce((sum, counter) => sum + counter(aid), 0) +
      [...this.pending.values()].filter((id) => aid === undefined || id === aid).length
    );
  }
  reserve(aid: string | null): () => void {
    const key = Symbol();
    this.pending.set(key, aid);
    return () => {
      this.pending.delete(key);
    };
  }
}

interface Session {
  transport: NodeStreamableHTTPServerTransport;
  server: McpServer;
  lastActivityAt: number;
  bootstrap: boolean;
  usuarioId: string | null;
  acessoId: string | null;
  skillTools: Map<string, { remove: () => void }>;
  advertisedBuild: string | null;
  auth?: ConsumerAuth;
}

const MAX_SWEEP_INTERVAL_MS = 5 * 60_000;

export const sessaoDeveReceberSkillsChanged = (
  session: { bootstrap: boolean; usuarioId: string | null; acessoId: string | null },
  publisherUsuarioId: string,
  publisherAcessoId: string,
): boolean =>
  !session.bootstrap &&
  session.usuarioId === publisherUsuarioId &&
  session.acessoId === publisherAcessoId;

const rpcName = (body: unknown): { method?: string; tool?: string } => {
  if (typeof body !== "object" || body === null) {
    return {};
  }
  const rec = body as Record<string, unknown>;
  const method = typeof rec.method === "string" ? rec.method : undefined;
  const params = rec.params as Record<string, unknown> | undefined;
  const tool = typeof params?.name === "string" ? params.name : undefined;
  return { method, tool };
};

export const createMcpHttpHandler = (input: {
  config: AppConfig;
  useCases: ToolUseCases;
  logger: LoggerPort;
  resolveBearer: (
    token: string,
  ) => Promise<{ usuarioId: string; acessoId: string; auth?: ConsumerAuth } | null>;
  catalog: SkillCatalogPorts;
  rateLimit?: RateLimitStore;
  oauth?: ChatGptOAuth;
  quota?: McpSessionQuota;
}): {
  handle: (req: Request, res: Response) => Promise<void>;
  sessions: Map<string, Session>;
  dispose: () => void;
  invalidateAccess: (acessoId: string) => void;
  invalidateGrant: (grantId: string) => void;
} => {
  const sessions = new Map<string, Session>();
  const modernByAccess = new Map<
    string,
    {
      uid: string | null;
      aid: string | null;
      handler: ReturnType<typeof createMcpHandler>;
      node: ReturnType<typeof toNodeHandler>;
      lastActivityAt: number;
      auth?: ConsumerAuth;
    }
  >();
  const idleTimeoutMs = input.config.MCP_SESSION_IDLE_TIMEOUT_MS;
  const quota = input.quota ?? new McpSessionQuota();
  const unbindQuota = quota.add(
    (aid) =>
      [...sessions.values()].filter((s) => aid === undefined || s.acessoId === aid).length +
      [...modernByAccess.values()].filter((s) => aid === undefined || s.aid === aid).length,
  );
  const challenge = (): string =>
    input.oauth
      ? chatGptOAuthChallenge(input.config.PUBLIC_BASE_URL, true)
      : wwwAuthenticate(input.config);
  const authorized = async (auth?: ConsumerAuth): Promise<boolean> => {
    if (auth?.kind !== "oauth" || !input.oauth) return true;
    try {
      await input.oauth.assert(auth);
      return true;
    } catch {
      return false;
    }
  };

  const runner = (): ReturnType<typeof createToolRunner> =>
    createToolRunner(input.config, input.logger, {
      rateLimit: input.rateLimit,
      clientIp: () => currentClientIp(),
    });

  const refreshSkillTools = async (
    session: Session,
    usuarioId: string,
    acessoId: string,
  ): Promise<void> => {
    if (!input.config.MCP_SKILL_TOOLS_ENABLED) {
      for (const handle of session.skillTools.values()) {
        handle.remove();
      }
      session.skillTools.clear();
      return;
    }
    await syncSkillTools({
      server: session.server,
      ports: input.catalog,
      consultarDados: input.useCases.consultarDados,
      run: runner(),
      usuarioId,
      acessoId,
      registered: session.skillTools,
    });
  };

  const notifyAcesso = async (usuarioId: string, acessoId: string): Promise<void> => {
    for (const session of sessions.values()) {
      if (sessaoDeveReceberSkillsChanged(session, usuarioId, acessoId)) {
        if (!(await authorized(session.auth))) {
          invalidateGrant(session.auth?.kind === "oauth" ? session.auth.grantId : "");
          continue;
        }
        await refreshSkillTools(session, usuarioId, acessoId);
        if (!(await authorized(session.auth))) {
          invalidateGrant(session.auth?.kind === "oauth" ? session.auth.grantId : "");
          continue;
        }
        session.server.sendResourceListChanged();
      }
    }
    for (const entry of modernByAccess.values()) {
      if (entry.uid === usuarioId && entry.aid === acessoId) {
        if (!(await authorized(entry.auth))) {
          invalidateGrant(entry.auth?.kind === "oauth" ? entry.auth.grantId : "");
          continue;
        }
        entry.handler.bus.publish({ kind: "tools_list_changed" });
        entry.handler.bus.publish({ kind: "resources_list_changed" });
      }
    }
  };

  const loadPersonaSessao = async (
    usuarioId: string | null,
    acessoId: string | null,
  ): Promise<readonly PersonaSessao[]> => {
    if (!usuarioId || !acessoId) {
      return [];
    }
    try {
      const acesso = await input.catalog.acessos.findByIdForUsuario(acessoId, usuarioId);
      return acesso ? [personaSessaoDeAcesso(acesso)] : [];
    } catch (error: unknown) {
      input.logger.warn("failed to load acesso personas for initialize", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  };

  const createSession = async (
    bootstrap: boolean,
    usuarioId: string | null,
    acessoId: string | null,
  ): Promise<Session> => {
    const personas = await loadPersonaSessao(usuarioId, acessoId);
    await assertConsumerAuthorized();
    const rawServer = new McpServer(
      { name: "se7e-mcp-server", version: buildInfo().version },
      {
        capabilities: {
          // OAuth instala a extensão antes de registerTool criar o handler tools/list.
          ...(input.oauth ? {} : { tools: { listChanged: true } }),
          resources: { listChanged: true },
          prompts: {},
        },
        instructions:
          montarInstrucoesServidor(personas) + (input.oauth ? `\n${CHATGPT_INSTRUCOES}` : ""),
      },
    );
    const server = input.oauth ? chatGptServer(rawServer) : rawServer;
    const session: Session = {
      transport: undefined as unknown as NodeStreamableHTTPServerTransport,
      server,
      lastActivityAt: Date.now(),
      bootstrap,
      usuarioId,
      acessoId,
      skillTools: new Map(),
      advertisedBuild: null,
      auth: currentConsumerAuth(),
    };
    registerTools(server, input.config, input.useCases, input.logger, {
      bootstrapOnly: bootstrap,
      catalog: bootstrap ? undefined : input.catalog,
      rateLimit: input.rateLimit,
      clientIp: () => currentClientIp(),
      onSkillsChanged: notifyAcesso,
    });
    if (input.oauth) registerChatGptTools(server, input.oauth, input.catalog.acessos, runner());
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        sessions.set(sid, session);
      },
    });
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        sessions.delete(sid);
      }
    };
    session.transport = transport;
    return session;
  };

  const sweepIdleSessions = async (): Promise<void> => {
    const now = Date.now();
    for (const [key, entry] of modernByAccess) {
      if (now - entry.lastActivityAt > idleTimeoutMs || !(await authorized(entry.auth))) {
        modernByAccess.delete(key);
        void entry.handler.close().catch(() => input.logger.warn("failed to close modern handler"));
      }
    }
    for (const [sessionId, session] of sessions) {
      if (now - session.lastActivityAt <= idleTimeoutMs && (await authorized(session.auth))) {
        continue;
      }
      sessions.delete(sessionId);
      session.transport.close().catch((error: unknown) => {
        input.logger.warn("failed to close idle mcp session", {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  };
  let sweeping = false;
  const sweepTimer = setInterval(
    () => {
      if (sweeping) return;
      sweeping = true;
      void sweepIdleSessions()
        .catch(() => input.logger.warn("failed to sweep sessions"))
        .finally(() => {
          sweeping = false;
        });
    },
    Math.min(idleTimeoutMs, input.oauth ? 5000 : MAX_SWEEP_INTERVAL_MS),
  );
  sweepTimer.unref();

  const handle = async (req: Request, res: Response): Promise<void> => {
    if (input.oauth && !req.header("authorization")) {
      res.setHeader("WWW-Authenticate", chatGptOAuthChallenge(input.config.PUBLIC_BASE_URL));
      res.status(401).json({ error: "authentication_required" });
      return;
    }
    if (req.method === "POST" && !req.is("application/json")) {
      res.status(415).json({ error: "unsupported_media_type" });
      return;
    }
    const bearer = readBearer(req);
    if (req.header("authorization") && !bearer) {
      res.setHeader("WWW-Authenticate", challenge());
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    let usuarioId: string | null = null;
    let acessoId: string | null = null;
    let auth: ConsumerAuth | undefined;
    if (bearer) {
      const resolved = await input.resolveBearer(bearer);
      if (!resolved) {
        res.setHeader("WWW-Authenticate", challenge());
        res.status(401).json({ error: "invalid_token" });
        return;
      }
      usuarioId = resolved.usuarioId;
      acessoId = resolved.acessoId;
      auth = resolved.auth;
      if (auth?.kind === "oauth" && input.rateLimit) {
        for (const key of [`mcp:access:${auth.acessoId}`, `mcp:grant:${auth.grantId}`]) {
          const hit = await input.rateLimit.hit(
            key,
            input.config.MCP_RATE_LIMIT_WINDOW_MS,
            input.config.MCP_RATE_LIMIT_MAX,
          );
          if (!hit.allowed) {
            res.setHeader("Retry-After", Math.ceil(hit.retryAfterMs / 1000).toString());
            res.status(429).json({ error: "rate_limited", retryAfterMs: hit.retryAfterMs });
            return;
          }
        }
      }
    } else {
      const { method, tool } = rpcName(req.body);
      const allowed =
        req.method !== "POST" ||
        method === "initialize" ||
        method === "server/discover" ||
        method === "subscriptions/listen" ||
        method === "notifications/initialized" ||
        method === "tools/list" ||
        method === "prompts/list" ||
        method === "prompts/get" ||
        method === "resources/list" ||
        method === "resources/templates/list" ||
        method === "resources/read" ||
        (method === "tools/call" &&
          (tool === "registrar_acesso" || tool === "obter_treinamento_base"));
      if (!allowed) {
        res.setHeader("WWW-Authenticate", challenge());
        res.status(401).json({ error: "invalid_token" });
        return;
      }
    }

    const onComplete: (() => void)[] = [];
    res.once("finish", () => {
      for (const fn of onComplete) fn();
      if (store.terminal && auth?.kind === "oauth") invalidateGrant(auth.grantId);
    });
    if (auth?.kind === "oauth") {
      const timeout = setTimeout(
        () => {
          if (!res.writableEnded) res.end();
        },
        Math.max(1, auth.expiresAt - Date.now()),
      );
      timeout.unref();
      res.once("close", () => clearTimeout(timeout));
    }
    const store: SessionStore = {
      usuarioId: usuarioId ?? undefined,
      acessoId: acessoId ?? undefined,
      clientIp: req.ip,
      auth,
      onComplete,
      authorize: auth && input.oauth ? () => input.oauth!.assert(auth) : undefined,
    };
    if (!(await isLegacyRequest(await toWebRequest(req, req.body)))) {
      const key =
        auth?.kind === "oauth"
          ? `oauth:${auth.grantId}`
          : `${usuarioId ?? "public"}:${acessoId ?? "public"}:${createHash("sha256")
              .update(bearer ?? "")
              .digest("hex")}`;
      let entry = modernByAccess.get(key);
      if (!entry) {
        if (
          quota.count() >= input.config.MCP_MAX_SESSIONS ||
          quota.count(acessoId) >= input.config.MCP_MAX_SESSIONS_PER_ACCESS
        ) {
          res.status(429).json({ error: "session_limit" });
          return;
        }
        const handler = createMcpHandler(
          async () => {
            const uid = currentAccountId() ?? null,
              aid = currentAcessoId() ?? null;
            const session = await createSession(!uid, uid, aid);
            if (uid && aid) {
              await refreshSkillTools(session, uid, aid);
              await assertConsumerAuthorized();
            }
            return session.server;
          },
          { legacy: "reject", maxSubscriptions: input.config.MCP_MAX_SESSIONS_PER_ACCESS },
        );
        entry = {
          uid: usuarioId,
          aid: acessoId,
          handler,
          node: toNodeHandler(handler),
          lastActivityAt: Date.now(),
          auth,
        };
        modernByAccess.set(key, entry);
      }
      entry.lastActivityAt = Date.now();
      entry.auth = auth;
      const modernNode = entry.node;
      await accountContext.run(store, async () => {
        await assertConsumerAuthorized();
        await modernNode(req, res, req.body);
      });
      return;
    }

    const sessionId = req.header("mcp-session-id") ?? undefined;
    const existing = sessionId ? sessions.get(sessionId) : undefined;

    const run = async (session: Session): Promise<void> => {
      session.lastActivityAt = Date.now();
      if (
        session.usuarioId !== usuarioId ||
        session.acessoId !== acessoId ||
        (session.auth?.kind === "oauth" ? session.auth.grantId : null) !==
          (auth?.kind === "oauth" ? auth.grantId : null)
      ) {
        res.status(403).json({ error: "session_access_mismatch" });
        return;
      }
      session.auth = auth;
      await accountContext.run(store, async () => {
        await assertConsumerAuthorized();
        await session.transport.handleRequest(req, res, req.body);
      });
      if (usuarioId && acessoId && !session.bootstrap && isInitializeRequest(req.body)) {
        await refreshSkillTools(session, usuarioId, acessoId);
        const buildKey = `${buildInfo().version}:${buildInfo().sha}`;
        if (session.advertisedBuild !== buildKey) {
          session.server.sendToolListChanged();
          session.advertisedBuild = buildKey;
        }
      }
    };

    if (existing) {
      await run(existing);
      return;
    }

    if (req.method === "POST" && isInitializeRequest(req.body)) {
      if (
        quota.count() >= input.config.MCP_MAX_SESSIONS ||
        quota.count(acessoId) >= input.config.MCP_MAX_SESSIONS_PER_ACCESS
      ) {
        res.status(429).json({ error: "session_limit" });
        return;
      }
      const release = quota.reserve(acessoId);
      try {
        const session = await sessionContext.run(store, () =>
          createSession(!usuarioId, usuarioId, acessoId),
        );
        await session.server.connect(session.transport);
        await run(session);
      } finally {
        release();
      }
      return;
    }

    if (req.method === "GET" || req.method === "DELETE") {
      res.status(400).json({ error: "missing mcp-session-id" });
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: no valid session" },
      id: null,
    });
  };

  const invalidateAccess = (aid: string): void => {
    for (const [id, session] of sessions) {
      if (session.acessoId === aid) {
        sessions.delete(id);
        void session.transport
          .close()
          .catch(() => input.logger.warn("failed to close revoked session"));
      }
    }
    for (const [key, entry] of modernByAccess) {
      if (entry.aid === aid) {
        modernByAccess.delete(key);
        void entry.handler
          .close()
          .catch(() => input.logger.warn("failed to close revoked subscriptions"));
      }
    }
  };
  const invalidateGrant = (gid: string): void => {
    for (const [id, session] of sessions)
      if (session.auth?.kind === "oauth" && session.auth.grantId === gid) {
        sessions.delete(id);
        void session.transport
          .close()
          .catch(() => input.logger.warn("failed to close revoked session"));
      }
    for (const [key, entry] of modernByAccess)
      if (entry.auth?.kind === "oauth" && entry.auth.grantId === gid) {
        modernByAccess.delete(key);
        void entry.handler
          .close()
          .catch(() => input.logger.warn("failed to close revoked handler"));
      }
  };
  return {
    handle,
    sessions,
    invalidateAccess,
    invalidateGrant,
    dispose: () => {
      clearInterval(sweepTimer);
      unbindQuota();
      for (const entry of modernByAccess.values()) {
        void entry.handler.close().catch(() => input.logger.warn("failed to close modern handler"));
      }
      for (const session of sessions.values()) {
        void session.transport
          .close()
          .catch(() => input.logger.warn("failed to close legacy transport"));
      }
      sessions.clear();
      modernByAccess.clear();
    },
  };
};
