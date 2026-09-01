import type { Dialeto } from "./dialeto.js";
import type { EscopoPadraoAcesso } from "./escopo.js";

export type StatusAcesso = "pending" | "approved" | "revoked";

export type SqlAccessState = "unknown" | "pending" | "active" | "revoked";

export type SqlAccessSource = "vault" | "hub" | "policy";

/** Nome curto da persona no acesso (tom/uso). Não licencia SQL. */
export const NOME_PERSONA_MAX_CHARS = 80;

/** Teto duro das instruções de persona no acesso. */
export const INSTRUCOES_PERSONA_MAX_CHARS = 4000;

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
  readonly nomePersona: string | null;
  readonly instrucoesPersona: string | null;
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
  readonly nomePersona?: string | null;
  readonly instrucoesPersona?: string | null;
}

export interface AcessoPublico {
  readonly id: string;
  readonly agentId: string;
  readonly dialeto: Dialeto;
  readonly nomeAmigavel: string;
  readonly statusAcesso: StatusAcesso;
  readonly sqlAccessState: SqlAccessState;
  readonly sqlAccessSource: SqlAccessSource;
  readonly clientTokenMasked: string;
  readonly nomePersona: string | null;
  readonly instrucoesPersona: string | null;
}

export const maskToken = (token: string): string => {
  if (token.length <= 8) {
    return "••••";
  }
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
};

export const sqlAccessFromVault = (
  statusAcesso: StatusAcesso,
): { sqlAccessState: SqlAccessState; sqlAccessSource: SqlAccessSource } => {
  if (statusAcesso === "pending") {
    return { sqlAccessState: "pending", sqlAccessSource: "vault" };
  }
  if (statusAcesso === "revoked") {
    return { sqlAccessState: "revoked", sqlAccessSource: "vault" };
  }
  return { sqlAccessState: "unknown", sqlAccessSource: "vault" };
};

export const toAcessoPublico = (
  acesso: Acesso,
  tokenPlain?: string,
  sqlAccess?: { sqlAccessState: SqlAccessState; sqlAccessSource: SqlAccessSource },
): AcessoPublico => {
  const derived = sqlAccess ?? sqlAccessFromVault(acesso.statusAcesso);
  return {
    id: acesso.id,
    agentId: acesso.agentId,
    dialeto: acesso.dialeto,
    nomeAmigavel: acesso.nomeAmigavel,
    statusAcesso: acesso.statusAcesso,
    sqlAccessState: derived.sqlAccessState,
    sqlAccessSource: derived.sqlAccessSource,
    clientTokenMasked: tokenPlain ? maskToken(tokenPlain) : "••••",
    nomePersona: acesso.nomePersona,
    instrucoesPersona: acesso.instrucoesPersona,
  };
};

/** Recorte seguro para initialize / pre_treino (sem tokens). */
export interface PersonaSessao {
  readonly acessoId: string;
  readonly agentId: string;
  readonly nomePersona: string | null;
  readonly instrucoesPersona: string | null;
}

export const personaSessaoDeAcesso = (
  acesso: Pick<Acesso, "id" | "agentId" | "nomePersona" | "instrucoesPersona">,
): PersonaSessao => ({
  acessoId: acesso.id,
  agentId: acesso.agentId,
  nomePersona: acesso.nomePersona,
  instrucoesPersona: acesso.instrucoesPersona,
});
