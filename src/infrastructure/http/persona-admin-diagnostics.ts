import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
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
  return "admin.other";
}

/** Only fixed route labels, generated IDs and numeric transport metadata enter logs. */
export function adminRequestDiagnostics(
  logger?: LoggerPort,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const requestId = randomUUID();
    const route = routeLabel(req);
    const limitBytes = isTokenWritePath(req.path, req.method) ? TOKEN_JSON_BYTES : ADMIN_JSON_BYTES;
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("Cache-Control", "no-store");
    res.once("finish", () => {
      if (res.statusCode < 400) return;
      logger?.warn("admin request rejected", {
        requestId,
        route,
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
