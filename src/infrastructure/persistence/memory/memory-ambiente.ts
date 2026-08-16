import type { Ambiente } from "../../../domain/entities/ambiente.js";
import type {
  AmbienteRepositoryPort,
  NewAmbiente,
} from "../../../domain/ports/ambiente-repository.port.js";
import { id, now } from "./memory-util.js";

export class InMemoryAmbienteRepository implements AmbienteRepositoryPort {
  readonly rows = new Map<string, Ambiente>();

  async listByAccount(mcpAccountId: string): Promise<readonly Ambiente[]> {
    return [...this.rows.values()].filter((a) => a.mcpAccountId === mcpAccountId);
  }

  async findByIdForAccount(ambienteId: string, mcpAccountId: string): Promise<Ambiente | null> {
    const row = this.rows.get(ambienteId);
    return row?.mcpAccountId === mcpAccountId ? row : null;
  }

  async findByAgentForAccount(agentId: string, mcpAccountId: string): Promise<Ambiente | null> {
    return (
      [...this.rows.values()].find(
        (a) => a.agentId === agentId && a.mcpAccountId === mcpAccountId,
      ) ?? null
    );
  }

  async insert(input: NewAmbiente): Promise<Ambiente> {
    const row: Ambiente = {
      id: id(),
      ...input,
      clientTokenEncriptado: null,
      createdAt: now(),
      updatedAt: now(),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async updateClientToken(
    ambienteId: string,
    clientTokenEncriptado: string | null,
  ): Promise<Ambiente> {
    const row = this.rows.get(ambienteId);
    if (!row) {
      throw new Error("ambiente missing");
    }
    const next = { ...row, clientTokenEncriptado, updatedAt: now() };
    this.rows.set(ambienteId, next);
    return next;
  }

  async updateStatus(
    ambienteId: string,
    statusAcesso: Ambiente["statusAcesso"],
  ): Promise<Ambiente> {
    const row = this.rows.get(ambienteId);
    if (!row) {
      throw new Error("ambiente missing");
    }
    const next = { ...row, statusAcesso, updatedAt: now() };
    this.rows.set(ambienteId, next);
    return next;
  }

  async delete(ambienteId: string, mcpAccountId: string): Promise<boolean> {
    const row = this.rows.get(ambienteId);
    if (row?.mcpAccountId !== mcpAccountId) {
      return false;
    }
    return this.rows.delete(ambienteId);
  }
}
