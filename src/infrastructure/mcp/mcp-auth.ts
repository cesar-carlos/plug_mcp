import type { AppConfig } from "../../config/env.js";
import type { Request } from "express";
import { timingSafeEqual } from "node:crypto";

export const wwwAuthenticate = (config: AppConfig): string =>
  `Bearer realm="se7e-mcp", resource="${config.mcpResourceUrl}", error="invalid_token", error_description="Obtain the token at GET /setup/{code} after registrar_acesso"`;

export const isMcpTokenExpired = (
  usuario: { tokenExpiresAt?: Date | null },
  now = Date.now(),
): boolean => usuario.tokenExpiresAt != null && usuario.tokenExpiresAt.getTime() <= now;

export const readBearer = (req: Request): string | null => {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
};

export const timingSafeEqualText = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
