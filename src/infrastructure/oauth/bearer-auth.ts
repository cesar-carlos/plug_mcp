import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { AppConfig } from "../../config/env.js";
import type { McpJwtService } from "./jwt.js";

export const timingSafeStringEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

export const wwwAuthenticate = (config: AppConfig): string =>
  `Bearer realm="se7e-mcp", resource_metadata="${config.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`;

export const authenticateBearer = async (
  req: Request,
  config: AppConfig,
  jwt: McpJwtService,
): Promise<string | null> => {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1];
  if (!token) {
    return null;
  }
  if (
    config.MCP_DEV_BEARER_TOKEN &&
    config.devAccountId &&
    timingSafeStringEqual(token, config.MCP_DEV_BEARER_TOKEN)
  ) {
    return config.devAccountId;
  }
  try {
    const claims = await jwt.verifyAccessToken(token);
    return claims.sub;
  } catch {
    return null;
  }
};
