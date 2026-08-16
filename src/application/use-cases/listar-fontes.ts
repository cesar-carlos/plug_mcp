import type { CatalogoQueryPort } from "../../domain/ports/catalogo-repository.port.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { Dialeto } from "../../domain/entities/dialeto.js";
import { origemFonte } from "../../domain/entities/fonte.js";
import { requireAccount, requireAmbiente } from "./shared/guards.js";

export class ListarFontes {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly catalogo: CatalogoQueryPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    ambienteId: string | undefined,
  ): Promise<{
    success: true;
    dialeto: Dialeto;
    fontes: { id: string; nome: string; descricao: string; origem: "seed" | "minha" }[];
  }> {
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, ambienteId ?? "", accountId);
    const fontes = await this.catalogo.listFontesAtivas({
      mcpAccountId: accountId,
      agentId: ambiente.agentId,
    });
    return {
      success: true as const,
      dialeto: ambiente.dialeto,
      fontes: fontes.map((f) => ({
        id: f.slug,
        nome: f.nome,
        descricao: f.descricao,
        origem: origemFonte(f),
      })),
    };
  }
}
