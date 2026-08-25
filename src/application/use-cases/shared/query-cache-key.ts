import { createHash } from "node:crypto";

export const queryCacheKey = (
  agentId: string,
  sql: string,
  params: Record<string, unknown>,
  maxRows: number,
): string => {
  const payload = JSON.stringify({ agentId, sql, params, maxRows });
  return `mcp:query:${createHash("sha256").update(payload).digest("hex")}`;
};
