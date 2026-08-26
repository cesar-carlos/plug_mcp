import { createHash } from "node:crypto";

export const QUERY_CACHE_PREFIX = "mcp:query:";

export const policyFingerprint = (policy: {
  allTables: boolean;
  tables: readonly string[];
}): string =>
  `${policy.allTables ? "all" : "list"}:${[...policy.tables]
    .map((item) => item.toLowerCase())
    .sort()
    .join(",")}`;

export const queryCacheKey = (input: {
  usuarioId: string;
  acessoId: string;
  clientTokenHash: string;
  agentId: string;
  skillIds: readonly string[];
  skillVersoes: readonly number[];
  sql: string;
  params: Record<string, unknown>;
  maxRows: number;
  timezone: string | null;
  escopoEmpresa?: string;
  escopoFilial?: string;
  policyFingerprint?: string;
}): string => {
  const payload = JSON.stringify({
    usuarioId: input.usuarioId,
    acessoId: input.acessoId,
    clientTokenHash: input.clientTokenHash,
    agentId: input.agentId,
    skillIds: [...input.skillIds].sort(),
    skillVersoes: input.skillVersoes,
    sql: input.sql,
    params: input.params,
    maxRows: input.maxRows,
    timezone: input.timezone,
    empresa: input.escopoEmpresa ?? null,
    filial: input.escopoFilial ?? null,
    policy: input.policyFingerprint ?? null,
  });
  return `${QUERY_CACHE_PREFIX}${createHash("sha256").update(payload).digest("hex")}`;
};
