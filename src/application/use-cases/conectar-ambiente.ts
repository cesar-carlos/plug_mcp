import { isDialeto } from "../../domain/entities/dialeto.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AmbienteRepositoryPort } from "../../domain/ports/ambiente-repository.port.js";
import type { PlugServerGatewayPort } from "../../domain/ports/plug-server-gateway.port.js";
import { toAmbientePublico, type AmbientePublico } from "../../domain/entities/ambiente.js";
import type { RequestAgentAccessResult } from "../../domain/ports/plug-server-gateway.port.js";
import { requireAccount } from "./shared/guards.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ConectarAmbienteInput {
  agentId?: string;
  dialeto?: string;
  nomeAmigavel?: string;
}

export class ConectarAmbiente {
  constructor(
    private readonly ambientes: AmbienteRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
  ) {}

  async execute(
    mcpAccountId: string | undefined,
    input: ConectarAmbienteInput,
  ): Promise<{ success: true; ambiente: AmbientePublico; plugServer: RequestAgentAccessResult }> {
    const accountId = requireAccount(mcpAccountId);
    const missing: string[] = [];
    if (!input.agentId?.trim()) missing.push("agentId");
    if (!input.dialeto?.trim()) missing.push("dialeto");
    if (!input.nomeAmigavel?.trim()) missing.push("nomeAmigavel");
    if (missing.length > 0) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Informe: ${missing.join(", ")}.`,
        hint: "Peça ao usuário o UUID do agente (admin Se7e/ERP), o dialeto do banco (mssql|sybase|postgres|firebird) e um nome amigável. Não peça senha do plug-server.",
      });
    }

    const agentId = input.agentId!.trim();
    if (!UUID_RE.test(agentId)) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "agentId deve ser um UUID.",
        hint: "O agentId é o identificador do plug_agente no plug-server. Confirme com o administrador Se7e.",
      });
    }

    const dialetoRaw = input.dialeto!.trim().toLowerCase();
    if (!isDialeto(dialetoRaw)) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Dialeto inválido: ${input.dialeto}.`,
        hint: "Use exatamente um de: mssql, sybase, postgres, firebird. O usuário define o dialeto; não tente adivinhar.",
      });
    }

    const existing = await this.ambientes.findByAgentForAccount(agentId, accountId);
    const ambiente =
      existing ??
      (await this.ambientes.insert({
        mcpAccountId: accountId,
        agentId,
        dialeto: dialetoRaw,
        nomeAmigavel: input.nomeAmigavel!.trim(),
        statusAcesso: "pending",
      }));

    const access = await this.plug.requestAgentAccess(agentId);
    const alreadyApproved = access.alreadyApproved.includes(agentId);
    if (alreadyApproved && ambiente.statusAcesso !== "approved") {
      await this.ambientes.updateStatus(ambiente.id, "approved");
    }

    const updated = await this.ambientes.findByIdForAccount(ambiente.id, accountId);
    return {
      success: true,
      ambiente: toAmbientePublico(updated ?? ambiente),
      plugServer: access,
    };
  }
}
