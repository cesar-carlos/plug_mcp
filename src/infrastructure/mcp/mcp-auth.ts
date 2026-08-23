import type { AppConfig } from "../../config/env.js";
import type { Request } from "express";
import { timingSafeEqual } from "node:crypto";

export const wwwAuthenticate = (config: AppConfig): string =>
  `Bearer realm="se7e-mcp", resource="${config.mcpResourceUrl}"`;

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
