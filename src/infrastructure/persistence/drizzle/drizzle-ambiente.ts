import { and, eq } from "drizzle-orm";
import type { Ambiente } from "../../../domain/entities/ambiente.js";
import type {
  AmbienteRepositoryPort,
  NewAmbiente,
} from "../../../domain/ports/ambiente-repository.port.js";
import * as schema from "../schema.js";
import type { Db } from "./db.js";

const mapAmbiente = (row: typeof schema.ambiente.$inferSelect): Ambiente => ({
  id: row.id,
  mcpAccountId: row.mcpAccountId,
  nomeAmigavel: row.nomeAmigavel,
  agentId: row.agentId,
  dialeto: row.dialeto,
  clientTokenEncriptado: row.clientTokenEncriptado,
  statusAcesso: row.statusAcesso,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class DrizzleAmbienteRepository implements AmbienteRepositoryPort {
  constructor(private readonly db: Db) {}

  async listByAccount(mcpAccountId: string): Promise<readonly Ambiente[]> {
    const rows = await this.db
      .select()
      .from(schema.ambiente)
      .where(eq(schema.ambiente.mcpAccountId, mcpAccountId));
    return rows.map(mapAmbiente);
  }

  async findByIdForAccount(ambienteId: string, mcpAccountId: string): Promise<Ambiente | null> {
    const rows = await this.db
      .select()
      .from(schema.ambiente)
      .where(
        and(eq(schema.ambiente.id, ambienteId), eq(schema.ambiente.mcpAccountId, mcpAccountId)),
      );
    return rows[0] ? mapAmbiente(rows[0]) : null;
  }

  async findByAgentForAccount(agentId: string, mcpAccountId: string): Promise<Ambiente | null> {
    const rows = await this.db
      .select()
      .from(schema.ambiente)
      .where(
        and(eq(schema.ambiente.agentId, agentId), eq(schema.ambiente.mcpAccountId, mcpAccountId)),
      );
    return rows[0] ? mapAmbiente(rows[0]) : null;
  }

  async insert(input: NewAmbiente): Promise<Ambiente> {
    const rows = await this.db.insert(schema.ambiente).values(input).returning();
    return mapAmbiente(rows[0]!);
  }

  async updateClientToken(
    ambienteId: string,
    clientTokenEncriptado: string | null,
  ): Promise<Ambiente> {
    const rows = await this.db
      .update(schema.ambiente)
      .set({ clientTokenEncriptado, updatedAt: new Date() })
      .where(eq(schema.ambiente.id, ambienteId))
      .returning();
    return mapAmbiente(rows[0]!);
  }

  async updateStatus(
    ambienteId: string,
    statusAcesso: Ambiente["statusAcesso"],
  ): Promise<Ambiente> {
    const rows = await this.db
      .update(schema.ambiente)
      .set({ statusAcesso, updatedAt: new Date() })
      .where(eq(schema.ambiente.id, ambienteId))
      .returning();
    return mapAmbiente(rows[0]!);
  }

  async delete(ambienteId: string, mcpAccountId: string): Promise<boolean> {
    const rows = await this.db
      .delete(schema.ambiente)
      .where(
        and(eq(schema.ambiente.id, ambienteId), eq(schema.ambiente.mcpAccountId, mcpAccountId)),
      )
      .returning({ id: schema.ambiente.id });
    return rows.length > 0;
  }
}
