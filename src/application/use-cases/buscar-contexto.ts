import {
  BUSCAR_CONTEXTO_DEFAULT_LIMIT,
  BUSCAR_CONTEXTO_MAX_LIMIT,
} from "../../domain/ports/indice-contexto.port.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { IndiceContextoPort } from "../../domain/ports/indice-contexto.port.js";
import { requireAccount, requireAmbiente } from "./shared/guards.js";

export class BuscarContexto {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly indice: IndiceContextoPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: { ambienteId?: string; pergunta?: string; limite?: number },
  ): Promise<{
    success: true;
    hits: {
      tipo: "fonte" | "anotacao" | "consulta";
      id: string;
      slug: string | null;
      trecho: string;
      score: number;
    }[];
  }> {
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    const pergunta = input.pergunta?.trim() ?? "";
    if (pergunta.length < 2) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "pergunta é obrigatória.",
        hint: "Passe a pergunta do usuário em linguagem natural. buscar_contexto só enxerga este agentId.",
      });
    }
    const requested = input.limite ?? BUSCAR_CONTEXTO_DEFAULT_LIMIT;
    const limite = Math.min(Math.max(1, requested), BUSCAR_CONTEXTO_MAX_LIMIT);
    const hits = await this.indice.buscar(
      { mcpAccountId: accountId, agentId: ambiente.agentId },
      pergunta,
      limite,
    );
    return { success: true as const, hits: [...hits] };
  }
}
