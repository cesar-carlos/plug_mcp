import { createHash } from "node:crypto";

export const QUERY_CACHE_PREFIX = "mcp:query:";

export const queryCachePrefixForAcesso = (acessoId: string): string =>
  `${QUERY_CACHE_PREFIX}acesso:${acessoId}:`;

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
  publicacoes?: readonly { skillId: string; id: string | null; hash: string | null }[];
  sql: string;
  params: Record<string, unknown>;
  maxRows: number;
  timezone: string | null;
  escopoEmpresa?: string;
  escopoFilial?: string;
  policyFingerprint?: string;
}): string => {
  const payload = canonicalJson({
    usuarioId: input.usuarioId,
    acessoId: input.acessoId,
    clientTokenHash: input.clientTokenHash,
    agentId: input.agentId,
    skills: input.skillIds
      .map((id, index) => ({ id, versao: input.skillVersoes[index] }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    publicacoes: [...(input.publicacoes ?? [])].sort((a, b) => a.skillId.localeCompare(b.skillId)),
    sql: input.sql,
    params: input.params,
    maxRows: input.maxRows,
    timezone: input.timezone,
    empresa: input.escopoEmpresa ?? null,
    filial: input.escopoFilial ?? null,
    policy: input.policyFingerprint ?? null,
  });
  return `${queryCachePrefixForAcesso(input.acessoId)}${createHash("sha256").update(payload).digest("hex")}`;
};

export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};
