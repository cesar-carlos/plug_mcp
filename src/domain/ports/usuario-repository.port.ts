import type { NovoUsuarioMcp, UsuarioMcp } from "../entities/usuario-mcp.js";

export interface UsuarioRepositoryPort {
  create(input: NovoUsuarioMcp): Promise<UsuarioMcp>;
  findById(id: string): Promise<UsuarioMcp | null>;
  findByEmailHash(emailHash: string): Promise<UsuarioMcp | null>;
  updateCredenciais(id: string, emailEnc: string, senhaEnc: string): Promise<void>;
  deleteById(id: string): Promise<void>;
}
