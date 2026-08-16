import type { Dialeto } from "./dialeto.js";

export const STATUS_ACESSO = ["pending", "approved", "revoked"] as const;

export type StatusAcesso = (typeof STATUS_ACESSO)[number];

export interface Ambiente {
  readonly id: string;
  readonly mcpAccountId: string;
  readonly nomeAmigavel: string;
  readonly agentId: string;
  readonly dialeto: Dialeto;
  readonly clientTokenEncriptado: string | null;
  readonly statusAcesso: StatusAcesso;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AmbientePublico {
  readonly id: string;
  readonly nomeAmigavel: string;
  readonly agentId: string;
  readonly dialeto: Dialeto;
  readonly statusAcesso: StatusAcesso;
  readonly hasClientToken: boolean;
}

export const toAmbientePublico = (ambiente: Ambiente): AmbientePublico => ({
  id: ambiente.id,
  nomeAmigavel: ambiente.nomeAmigavel,
  agentId: ambiente.agentId,
  dialeto: ambiente.dialeto,
  statusAcesso: ambiente.statusAcesso,
  hasClientToken: Boolean(ambiente.clientTokenEncriptado),
});
