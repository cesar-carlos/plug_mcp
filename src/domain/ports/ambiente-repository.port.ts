import type { Ambiente, StatusAcesso } from "../entities/ambiente.js";
import type { Dialeto } from "../entities/dialeto.js";

export interface NewAmbiente {
  mcpAccountId: string;
  nomeAmigavel: string;
  agentId: string;
  dialeto: Dialeto;
  statusAcesso: StatusAcesso;
}

export interface AmbienteRepositoryPort {
  listByAccount(mcpAccountId: string): Promise<readonly Ambiente[]>;
  findByIdForAccount(id: string, mcpAccountId: string): Promise<Ambiente | null>;
  findByAgentForAccount(agentId: string, mcpAccountId: string): Promise<Ambiente | null>;
  insert(input: NewAmbiente): Promise<Ambiente>;
  updateClientToken(id: string, clientTokenEncriptado: string | null): Promise<Ambiente>;
  updateStatus(id: string, statusAcesso: StatusAcesso): Promise<Ambiente>;
  delete(id: string, mcpAccountId: string): Promise<boolean>;
}
