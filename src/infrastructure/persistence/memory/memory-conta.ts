import type { McpAccount } from "../../../domain/entities/conta.js";
import type { ContaRepositoryPort } from "../../../domain/ports/conta-repository.port.js";
import { id, now } from "./memory-util.js";

export class InMemoryContaRepository implements ContaRepositoryPort {
  readonly rows = new Map<string, McpAccount>();

  async findByEmail(email: string): Promise<McpAccount | null> {
    return [...this.rows.values()].find((a) => a.email === email) ?? null;
  }

  async findById(accountId: string): Promise<McpAccount | null> {
    return this.rows.get(accountId) ?? null;
  }

  async insert(email: string, passwordHash: string): Promise<McpAccount> {
    const account: McpAccount = {
      id: id(),
      email,
      passwordHash,
      createdAt: now(),
      updatedAt: now(),
    };
    this.rows.set(account.id, account);
    return account;
  }
}
