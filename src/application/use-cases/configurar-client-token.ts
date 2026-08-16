import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { TokenEncryptorPort } from "../../domain/ports/crypto.port.js";
import type { PlugServerGatewayPort } from "../../domain/ports/plug-server-gateway.port.js";
import { toAmbientePublico, type AmbientePublico } from "../../domain/entities/ambiente.js";
import { requireAccount, requireAmbiente } from "./shared/guards.js";

export class ConfigurarClientToken {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly crypto: TokenEncryptorPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: { ambienteId?: string; clientToken?: string },
  ): Promise<{ success: true; ambiente: AmbientePublico }> {
    const accountId = requireAccount(mcpAccountId);
    if (!input.clientToken?.trim()) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "clientToken é obrigatório.",
        hint: "Solicite ao administrador do ERP o token de autorização SQL (client_token) deste agente. Não é a senha do plug-server nem a senha do banco.",
      });
    }
    const ambiente = await requireAmbiente(this.ambientes, input.ambienteId ?? "", accountId);
    const token = input.clientToken.trim();
    if (token.length > 512) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "clientToken excede 512 caracteres.",
        hint: "O plug-server limita o token a 512 caracteres. Confira se o valor não inclui espaços ou JSON extra.",
      });
    }
    await this.plug.putClientToken(ambiente.agentId, token);
    const encrypted = this.crypto.encrypt(token);
    const updated = await this.ambientes.updateClientToken(ambiente.id, encrypted);
    return { success: true as const, ambiente: toAmbientePublico(updated) };
  }
}
