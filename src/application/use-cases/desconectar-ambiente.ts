import { isDomainError } from "../../domain/errors/domain-error.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { PlugServerGatewayPort } from "../../domain/ports/plug-server-gateway.port.js";
import { requireAccount, requireAmbiente } from "./shared/guards.js";

export class DesconectarAmbiente {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly audit: AuditLogPort,
    private readonly logger: LoggerPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    ambienteId: string | undefined,
  ): Promise<{ success: true; desconectado: true; ambienteId: string }> {
    const started = Date.now();
    const accountId = requireAccount(mcpAccountId);
    const ambiente = await requireAmbiente(this.ambientes, ambienteId ?? "", accountId);

    try {
      await this.plug.putClientToken(ambiente.agentId, null);
    } catch (error) {
      this.logger.warn("failed to clear client_token on plug-server during disconnect", {
        ambienteId: ambiente.id,
        code: isDomainError(error) ? error.code : "unknown",
      });
    }

    await this.audit.append({
      mcpAccountId: accountId,
      ambienteId: ambiente.id,
      tool: "desconectar_ambiente",
      sqlEnviado: null,
      sucesso: true,
      codigoErro: null,
      linhasRetornadas: null,
      duracaoMs: Date.now() - started,
    });

    await this.ambientes.delete(ambiente.id, accountId);
    return { success: true as const, desconectado: true as const, ambienteId: ambiente.id };
  }
}
