import type { Acesso, NovoAcesso, StatusAcesso } from "../entities/acesso.js";

export interface AcessoRepositoryPort {
  create(input: NovoAcesso): Promise<Acesso>;
  findById(id: string): Promise<Acesso | null>;
  findByIdForUsuario(id: string, usuarioId: string): Promise<Acesso | null>;
  listByUsuario(usuarioId: string): Promise<readonly Acesso[]>;
  findByUsuarioAgentTokenHash(
    usuarioId: string,
    agentId: string,
    clientTokenHash: string,
  ): Promise<Acesso | null>;
  updateStatus(id: string, status: StatusAcesso): Promise<void>;
  updateClientToken(id: string, clientTokenEnc: string, clientTokenHash: string): Promise<void>;
  deleteById(id: string): Promise<void>;
}
