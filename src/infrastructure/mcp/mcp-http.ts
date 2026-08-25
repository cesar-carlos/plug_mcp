import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AppConfig } from "../../config/env.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { RateLimitStore } from "../http/rate-limit.js";
import { wwwAuthenticate, readBearer } from "./mcp-auth.js";
import { accountContext, currentClientIp } from "./account-context.js";
import { registerTools, type ToolUseCases } from "./register-tools.js";
import { MCP_SERVER_INSTRUCTIONS } from "./server-instructions.js";
import { createToolRunner } from "./tool-result.js";
import { syncSkillTools, type SkillCatalogPorts } from "./skill-tools.js";

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  lastActivityAt: number;
  bootstrap: boolean;
  usuarioId: string | null;
  skillTools: Map<string, { remove: () => void }>;
}

const MAX_SWEEP_INTERVAL_MS = 5 * 60_000;

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
  resolveUsuarioId: (token: string) => Promise<string | null>;
  catalog: SkillCatalogPorts;
  rateLimit?: RateLimitStore;
}): {
  handle: (req: Request, res: Response) => Promise<void>;
  sessions: Map<string, Session>;
  dispose: () => void;
} => {
  const sessions = new Map<string, Session>();
  const idleTimeoutMs = input.config.MCP_SESSION_IDLE_TIMEOUT_MS;

  const runner = (): ReturnType<typeof createToolRunner> =>
    createToolRunner(input.config, input.logger, {
      rateLimit: input.rateLimit,
      clientIp: () => currentClientIp(),
    });

  const refreshSkillTools = async (session: Session, usuarioId: string): Promise<void> => {
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
      registered: session.skillTools,
    });
  };

  const notifyUsuario = async (usuarioId: string): Promise<void> => {
    const publisherAcessos = await input.catalog.acessos.listByUsuario(usuarioId);
    const agentIds = new Set(publisherAcessos.map((acesso) => acesso.agentId));
    const matchingUsuarios = new Set<string>();
    const checked = new Set<string>();
    for (const session of sessions.values()) {
      if (session.bootstrap || !session.usuarioId || checked.has(session.usuarioId)) {
        continue;
      }
      checked.add(session.usuarioId);
      const sessionAcessos = await input.catalog.acessos.listByUsuario(session.usuarioId);
      if (sessionAcessos.some((acesso) => agentIds.has(acesso.agentId))) {
        matchingUsuarios.add(session.usuarioId);
      }
    }
    for (const session of sessions.values()) {
      if (session.usuarioId && matchingUsuarios.has(session.usuarioId) && !session.bootstrap) {
        await refreshSkillTools(session, session.usuarioId);
      }
    }
  };

  const createSession = (bootstrap: boolean, usuarioId: string | null): Session => {
    const server = new McpServer(
      { name: "se7e-mcp-server", version: "0.1.0" },
      {
        capabilities: { tools: { listChanged: true }, prompts: {} },
        instructions: MCP_SERVER_INSTRUCTIONS,
      },
    );
    const session: Session = {
      transport: undefined as unknown as StreamableHTTPServerTransport,
      server,
      lastActivityAt: Date.now(),
      bootstrap,
      usuarioId,
      skillTools: new Map(),
    };
    registerTools(server, input.config, input.useCases, input.logger, {
      bootstrapOnly: bootstrap,
      catalog: bootstrap ? undefined : input.catalog,
      rateLimit: input.rateLimit,
      clientIp: () => currentClientIp(),
      onSkillsChanged: notifyUsuario,
    });
    const transport = new StreamableHTTPServerTransport({
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

  const sweepIdleSessions = (): void => {
    const now = Date.now();
    for (const [sessionId, session] of sessions) {
      if (now - session.lastActivityAt <= idleTimeoutMs) {
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
  const sweepTimer = setInterval(sweepIdleSessions, Math.min(idleTimeoutMs, MAX_SWEEP_INTERVAL_MS));
  sweepTimer.unref();

  const handle = async (req: Request, res: Response): Promise<void> => {
    const bearer = readBearer(req);
    let usuarioId: string | null = null;
    if (bearer) {
      usuarioId = await input.resolveUsuarioId(bearer);
      if (!usuarioId) {
        res.setHeader("WWW-Authenticate", wwwAuthenticate(input.config));
        res.status(401).json({ error: "invalid_token" });
        return;
      }
    } else {
      const { method, tool } = rpcName(req.body);
      const allowed =
        req.method !== "POST" ||
        method === "initialize" ||
        method === "notifications/initialized" ||
        method === "tools/list" ||
        method === "prompts/list" ||
        method === "prompts/get" ||
        (method === "tools/call" && tool === "registrar_acesso");
      if (!allowed) {
        res.setHeader("WWW-Authenticate", wwwAuthenticate(input.config));
        res.status(401).json({ error: "invalid_token" });
        return;
      }
    }

    const sessionId = req.header("mcp-session-id") ?? undefined;
    const existing = sessionId ? sessions.get(sessionId) : undefined;

    const run = async (session: Session): Promise<void> => {
      session.lastActivityAt = Date.now();
      if (usuarioId) {
        session.usuarioId = usuarioId;
      }
      await accountContext.run(
        { usuarioId: usuarioId ?? undefined, clientIp: req.ip },
        async () => {
          await session.transport.handleRequest(req, res, req.body);
        },
      );
      if (usuarioId && !session.bootstrap && isInitializeRequest(req.body)) {
        await refreshSkillTools(session, usuarioId);
      }
    };

    if (existing) {
      await run(existing);
      return;
    }

    if (req.method === "POST" && isInitializeRequest(req.body)) {
      const session = createSession(!usuarioId, usuarioId);
      await session.server.connect(session.transport);
      await run(session);
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

  return { handle, sessions, dispose: () => clearInterval(sweepTimer) };
};
