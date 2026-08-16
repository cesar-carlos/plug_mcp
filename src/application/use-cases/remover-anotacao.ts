import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AnotacaoRepositoryPort } from "../../domain/ports/anotacao-repository.port.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import { auditarTool, codigoErroDe } from "./shared/auditar.js";
import { requireAccount, requireAmbiente } from "./shared/guards.js";

export class RemoverAnotacao {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly anotacoes: AnotacaoRepositoryPort,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: { ambienteId?: string; anotacaoId?: string },
  ): Promise<{ success: true; removida: true }> {
    const started = Date.now();
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    try {
      const anotacaoId = input.anotacaoId?.trim() ?? "";
      if (!anotacaoId) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "anotacaoId é obrigatório.",
          hint: "Use o id devolvido por anotar_fonte ou obter_fonte.",
        });
      }
      const removed = await this.anotacoes.remover(anotacaoId, {
        mcpAccountId: accountId,
        agentId: ambiente.agentId,
      });
      if (!removed) {
        throw new DomainError({
          code: ERROR_CODES.ANOTACAO_NOT_FOUND,
          message: "Anotação não encontrada neste ambiente.",
          hint: "Confira o id em obter_fonte. Anotações de outro agentId não aparecem aqui.",
        });
      }
      await auditarTool(this.audit, {
        accountId,
        ambienteId: ambiente.id,
        tool: "remover_anotacao",
        sql: null,
        started,
        sucesso: true,
        codigoErro: null,
      });
      return { success: true as const, removida: true as const };
    } catch (error) {
      await auditarTool(this.audit, {
        accountId,
        ambienteId: ambiente.id,
        tool: "remover_anotacao",
        sql: null,
        started,
        sucesso: false,
        codigoErro: codigoErroDe(error),
      });
      throw error;
    }
  }
}
