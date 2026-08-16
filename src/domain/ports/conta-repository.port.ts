import type { McpAccount } from "../entities/conta.js";

export interface ContaRepositoryPort {
  findByEmail(email: string): Promise<McpAccount | null>;
  findById(id: string): Promise<McpAccount | null>;
  insert(email: string, passwordHash: string): Promise<McpAccount>;
}
