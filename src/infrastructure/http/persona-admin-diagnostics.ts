import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import type { OutgoingHttpHeaders, OutgoingHttpHeader } from "node:http";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import {
  ADMIN_JSON_BYTES,
  TOKEN_JSON_BYTES,
  isTokenWritePath,
} from "../../domain/persona-v2/admin-request-limits.js";

function routeLabel(req: Request): string {
  if (isTokenWritePath(req.path, req.method)) {
    if (/\/editar\/?$/i.test(req.path)) return "token.edit";
    if (/\/rotacionar\/?$/i.test(req.path)) return "token.rotate";
    return "token.issue";
  }
  if (/^\/api\/admin\/personas(?:\/|$)/i.test(req.path)) return "admin.personas";
  if (/^\/api\/admin(?:\/|$)/i.test(req.path)) return "admin.other";
  if (/^\/mcp(?:\/|$)/i.test(req.path)) return "mcp";
  if (/^\/(?:oauth|\.well-known)(?:\/|$)/i.test(req.path)) return "oauth";
  if (/^\/api(?:\/|$)/i.test(req.path)) return "api.other";
  if (/^\/app(?:\/|$)/i.test(req.path)) return "console";
  return "http.other";
}

/** Only fixed route labels, generated IDs and numeric transport metadata enter logs. */
export function adminRequestDiagnostics(
  logger?: LoggerPort,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const requestId = randomUUID();
    const route = routeLabel(req);
    const administrative = /^\/api\/admin(?:\/|$)/i.test(req.path);
    const limitBytes = isTokenWritePath(req.path, req.method) ? TOKEN_JSON_BYTES : ADMIN_JSON_BYTES;
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("Cache-Control", "no-store");
    // Ignore caller IDs. Preserve an ID already assigned by the failing subsystem.
    const supportId = () => {
      const current = res.getHeader("X-Support-Id");
      const id =
        typeof current === "string" && /^[0-9a-f-]{36}$/i.test(current) ? current : requestId;
      res.setHeader("X-Support-Id", id);
      return id;
    };
    const json = res.json;
    res.json = function (body: unknown) {
      if (
        res.statusCode >= 400 &&
        administrative &&
        body &&
        typeof body === "object" &&
        "error" in body &&
        body.error &&
        typeof body.error === "object" &&
        !Array.isArray(body.error)
      ) {
        return json.call(this, { ...body, error: { ...body.error, supportId: supportId() } });
      }
      return json.call(this, body);
    };
    const writeHead = res.writeHead.bind(res);
    res.writeHead = function (
      status: number,
      messageOrHeaders?: string | OutgoingHttpHeaders | OutgoingHttpHeader[],
      headers?: OutgoingHttpHeaders | OutgoingHttpHeader[],
    ) {
      if (status >= 400) supportId();
      return typeof messageOrHeaders === "string"
        ? writeHead(status, messageOrHeaders, headers)
        : writeHead(status, messageOrHeaders);
    };
    res.once("finish", () => {
      if (res.statusCode < 400) return;
      logger?.warn("admin request rejected", {
        requestId,
        supportId: res.getHeader("X-Support-Id"),
        route,
        method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(req.method)
          ? req.method
          : "OTHER",
        reason:
          res.statusCode === 404
            ? req.route
              ? "resource_unavailable"
              : "unmatched_route"
            : res.statusCode === 401 || res.statusCode === 403
              ? "access_rejected"
              : "request_failed",
        status: res.statusCode,
        limitBytes,
      });
    });
    next();
  };
}

export function requestSizeMetadata(error: unknown): Record<string, number> {
  if (typeof error !== "object" || error === null) return {};
  const fields: Record<string, number> = {};
  for (const [source, target] of [
    ["length", "declaredBytes"],
    ["received", "receivedBytes"],
    ["limit", "limitBytes"],
  ] as const) {
    const value = source in error ? (error as Record<string, unknown>)[source] : undefined;
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
      fields[target] = value;
  }
  return fields;
}
