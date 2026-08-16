import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AppConfig } from "../../config/env.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { authenticateBearer, wwwAuthenticate } from "../oauth/bearer-auth.js";
import type { McpJwtService } from "../oauth/jwt.js";
import { accountContext } from "./account-context.js";
import { registerTools, type ToolUseCases } from "./register-tools.js";
import { MCP_SERVER_INSTRUCTIONS } from "./server-instructions.js";

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  lastActivityAt: number;
}

/** Cap the sweep interval so short idle timeouts (tests) are still honored promptly. */
const MAX_SWEEP_INTERVAL_MS = 5 * 60_000;

export const createMcpHttpHandler = (input: {
  config: AppConfig;
  jwt: McpJwtService;
  useCases: ToolUseCases;
  logger: LoggerPort;
}): {
  handle: (req: Request, res: Response) => Promise<void>;
  sessions: Map<string, Session>;
  dispose: () => void;
} => {
  const sessions = new Map<string, Session>();
  const idleTimeoutMs = input.config.MCP_SESSION_IDLE_TIMEOUT_MS;

  const createSession = (): Session => {
    const server = new McpServer(
      {
        name: "se7e-mcp-server",
        version: "0.1.0",
      },
      { instructions: MCP_SERVER_INSTRUCTIONS },
    );
    registerTools(server, input.config, input.useCases, input.logger);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        sessions.set(sid, { transport, server, lastActivityAt: Date.now() });
      },
    });
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) sessions.delete(sid);
    };
    return { transport, server, lastActivityAt: Date.now() };
  };

  // Sessions live in memory keyed by sessionId; without eviction, a client that never
  // sends DELETE /mcp leaks a session (and its McpServer/transport) forever.
  const sweepIdleSessions = (): void => {
    const now = Date.now();
    for (const [sessionId, session] of sessions) {
      if (now - session.lastActivityAt <= idleTimeoutMs) continue;
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
    const accountId = await authenticateBearer(req, input.config, input.jwt);
    if (!accountId) {
      res.setHeader("WWW-Authenticate", wwwAuthenticate(input.config));
      res.status(401).json({ error: "invalid_token" });
      return;
    }

    const sessionId = req.header("mcp-session-id") ?? undefined;
    const existing = sessionId ? sessions.get(sessionId) : undefined;

    const run = async (session: Session): Promise<void> => {
      session.lastActivityAt = Date.now();
      await accountContext.run(accountId, async () => {
        await session.transport.handleRequest(req, res, req.body);
      });
    };

    if (existing) {
      await run(existing);
      return;
    }

    if (req.method === "POST" && isInitializeRequest(req.body)) {
      const session = createSession();
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
