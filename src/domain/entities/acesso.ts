import type { Dialeto } from "./dialeto.js";
import type { EscopoPadraoAcesso } from "./escopo.js";

export type StatusAcesso = "pending" | "approved" | "revoked";

export interface Acesso {
  readonly id: string;
  readonly usuarioId: string;
  readonly agentId: string;
  readonly dialeto: Dialeto;
  readonly nomeAmigavel: string;
  readonly clientTokenEnc: string;
  readonly clientTokenHash: string;
  readonly statusAcesso: StatusAcesso;
  readonly escopoPadrao: EscopoPadraoAcesso | null;
  readonly timezone: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NovoAcesso {
  readonly usuarioId: string;
  readonly agentId: string;
  readonly dialeto: Dialeto;
  readonly nomeAmigavel: string;
  readonly clientTokenEnc: string;
  readonly clientTokenHash: string;
  readonly statusAcesso: StatusAcesso;
  readonly escopoPadrao?: EscopoPadraoAcesso | null;
  readonly timezone?: string | null;
}

export interface AcessoPublico {
  readonly id: string;
  readonly agentId: string;
  readonly dialeto: Dialeto;
  readonly nomeAmigavel: string;
  readonly statusAcesso: StatusAcesso;
  readonly clientTokenMasked: string;
}

export const maskToken = (token: string): string => {
  if (token.length <= 8) {
    return "••••";
  }
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
};

export const toAcessoPublico = (acesso: Acesso, tokenPlain?: string): AcessoPublico => ({
  id: acesso.id,
  agentId: acesso.agentId,
  dialeto: acesso.dialeto,
  nomeAmigavel: acesso.nomeAmigavel,
  statusAcesso: acesso.statusAcesso,
  clientTokenMasked: tokenPlain ? maskToken(tokenPlain) : "••••",
});
