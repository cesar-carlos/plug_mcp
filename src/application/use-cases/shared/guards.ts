import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { Ambiente } from "../../../domain/entities/ambiente.js";
import type { AmbienteRepositoryPort } from "../../../domain/ports/ambiente-repository.port.js";

export type AmbienteConsultavel = Ambiente & { readonly clientTokenEncriptado: string };

/** Guard clauses compartilhadas por todos os casos de uso que dependem de conta/ambiente autenticados. */
export const requireAccount = (mcpAccountId: string | undefined): string => {
  if (!mcpAccountId) {
    throw DomainError.unauthenticated();
  }
  return mcpAccountId;
};

export const requireAmbiente = async (
  ambientes: AmbienteRepositoryPort,
  ambienteId: string,
  mcpAccountId: string,
): Promise<Ambiente> => {
  if (!ambienteId?.trim()) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "ambienteId é obrigatório.",
      hint: "Chame listar_ambientes e use o id retornado, ou conectar_ambiente se ainda não houver ambiente.",
    });
  }
  const ambiente = await ambientes.findByIdForAccount(ambienteId, mcpAccountId);
  if (!ambiente) {
    throw new DomainError({
      code: ERROR_CODES.AMBIENTE_NOT_FOUND,
      message: "Ambiente não encontrado nesta conta.",
      hint: "Confira o ambienteId com listar_ambientes. O id pertence à conta autenticada.",
    });
  }
  return ambiente;
};

export const requireAmbienteConsultavel = (ambiente: Ambiente): AmbienteConsultavel => {
  if (ambiente.statusAcesso === "pending") {
    throw new DomainError({
      code: ERROR_CODES.AGENT_ACCESS_PENDING,
      message: "Ambiente ainda aguarda aprovação de acesso no plug-server.",
      hint: "Chame verificar_status_ambiente e oriente o usuário a aprovar o pedido.",
      retryable: true,
    });
  }
  if (ambiente.statusAcesso === "revoked") {
    throw new DomainError({
      code: ERROR_CODES.ACCESS_REVOKED,
      message: "Acesso ao agente está revogado.",
      hint: "Reabra o pedido com conectar_ambiente.",
    });
  }
  if (!ambiente.clientTokenEncriptado) {
    throw new DomainError({
      code: ERROR_CODES.MISSING_CLIENT_TOKEN,
      message: "Este ambiente não tem client_token configurado.",
      hint: "Chame configurar_client_token pedindo o token ao administrador do ERP.",
    });
  }
  return ambiente as AmbienteConsultavel;
};
