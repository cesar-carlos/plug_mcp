import type { NovoUsuarioMcp, UsuarioMcp } from "../entities/usuario-mcp.js";

export interface UsuarioRepositoryPort {
  create(input: NovoUsuarioMcp): Promise<UsuarioMcp>;
  findById(id: string): Promise<UsuarioMcp | null>;
  findByTokenHash(tokenHash: string): Promise<UsuarioMcp | null>;
  findByEmailHash(emailHash: string): Promise<UsuarioMcp | null>;
  updateTokenHash(id: string, tokenHash: string, tokenExpiresAt?: Date | null): Promise<void>;
  updateCredenciais(id: string, emailEnc: string, senhaEnc: string): Promise<void>;
  deleteById(id: string): Promise<void>;
}
