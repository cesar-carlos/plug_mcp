import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import { toAmbientePublico, type AmbientePublico } from "../../domain/entities/ambiente.js";
import { requireAccount } from "./shared/guards.js";

export class ListarAmbientes {
  constructor(private readonly ambientes: AmbienteRepositoryPort) {}

  async execute(
    mcpAccountId: string | undefined,
  ): Promise<{ success: true; ambientes: AmbientePublico[] }> {
    const accountId = requireAccount(mcpAccountId);
    const rows = await this.ambientes.listByAccount(accountId);
    return { success: true, ambientes: rows.map(toAmbientePublico) };
  }
}
