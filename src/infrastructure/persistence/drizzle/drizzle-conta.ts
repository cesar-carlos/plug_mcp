import { eq } from "drizzle-orm";
import type { McpAccount } from "../../../domain/entities/conta.js";
import type { ContaRepositoryPort } from "../../../domain/ports/conta-repository.port.js";
import * as schema from "../schema.js";
import type { Db } from "./db.js";

const mapAccount = (row: typeof schema.mcpAccount.$inferSelect): McpAccount => ({
  id: row.id,
  email: row.email,
  passwordHash: row.passwordHash,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class DrizzleContaRepository implements ContaRepositoryPort {
  constructor(private readonly db: Db) {}

  async findByEmail(email: string): Promise<McpAccount | null> {
    const rows = await this.db
      .select()
      .from(schema.mcpAccount)
      .where(eq(schema.mcpAccount.email, email));
    return rows[0] ? mapAccount(rows[0]) : null;
  }

  async findById(accountId: string): Promise<McpAccount | null> {
    const rows = await this.db
      .select()
      .from(schema.mcpAccount)
      .where(eq(schema.mcpAccount.id, accountId));
    return rows[0] ? mapAccount(rows[0]) : null;
  }

  async insert(email: string, passwordHash: string): Promise<McpAccount> {
    const rows = await this.db
      .insert(schema.mcpAccount)
      .values({ email, passwordHash })
      .returning();
    return mapAccount(rows[0]!);
  }
}
