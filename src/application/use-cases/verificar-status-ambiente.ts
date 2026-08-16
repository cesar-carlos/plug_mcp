import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { PlugServerGatewayPort } from "../../domain/ports/plug-server-gateway.port.js";
import { toAmbientePublico, type AmbientePublico } from "../../domain/entities/ambiente.js";
import type { AgentAccessStatus } from "../../domain/ports/plug-server-gateway.port.js";
import { requireAccount, requireAmbiente } from "./shared/guards.js";

export class VerificarStatusAmbiente {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    ambienteId: string | undefined,
  ): Promise<{
    success: true;
    ambiente: AmbientePublico;
    plugServer: AgentAccessStatus;
    proximoPasso: string;
  }> {
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, ambienteId ?? "", accountId);
    const status = await this.plug.getAgentAccessStatus(ambiente.agentId);

    let nextStatus = ambiente.statusAcesso;
    switch (status.state) {
      case "approved":
        nextStatus = "approved";
        break;
      case "pending":
        nextStatus = "pending";
        break;
      case "rejected":
      case "revoked":
      case "expired":
        nextStatus = "revoked";
        break;
      case "unknown":
        break;
    }

    const updated =
      nextStatus !== ambiente.statusAcesso
        ? await this.ambientes.updateStatus(ambiente.id, nextStatus)
        : ambiente;

    if (nextStatus === "pending") {
      throw new DomainError({
        code: ERROR_CODES.AGENT_ACCESS_PENDING,
        message: "O acesso deste Client de serviço ao agente ainda não foi aprovado.",
        hint: "Peça ao usuário (ou ao dono User do agente no plug-server) para aprovar o pedido de acesso. Depois chame verificar_status_ambiente de novo. Não execute consultar_dados enquanto estiver pending.",
        retryable: true,
      });
    }

    if (nextStatus === "revoked") {
      throw new DomainError({
        code: ERROR_CODES.ACCESS_REVOKED,
        message: "Acesso ao agente foi recusado ou revogado.",
        hint: "O usuário precisa reconectar o ambiente (conectar_ambiente) para reabrir o pedido, e o dono do agente precisa aprovar.",
      });
    }

    return {
      success: true as const,
      ambiente: toAmbientePublico(updated),
      plugServer: status,
      proximoPasso: status.hasClientToken
        ? "Ambiente pronto. Use listar_fontes e obter_fonte antes de consultar_dados."
        : "Acesso aprovado, mas falta client_token. Chame configurar_client_token.",
    };
  }
}
