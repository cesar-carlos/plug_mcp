import type { EscopoCatalogo, Fonte } from "../../../domain/entities/fonte.js";

export const now = (): Date => new Date();
export const id = (): string => crypto.randomUUID();

export const visivel = (fonte: Fonte, escopo: EscopoCatalogo): boolean =>
  fonte.mcpAccountId === null ||
  (fonte.mcpAccountId === escopo.mcpAccountId && fonte.agentId === escopo.agentId);

export const noEscopo = (
  row: { mcpAccountId: string; agentId: string },
  escopo: EscopoCatalogo,
): boolean => row.mcpAccountId === escopo.mcpAccountId && row.agentId === escopo.agentId;
