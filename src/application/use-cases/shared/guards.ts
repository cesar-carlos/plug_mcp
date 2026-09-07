import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { Acesso, StatusAcesso } from "../../../domain/entities/acesso.js";
import type { AcessoRepositoryPort } from "../../../domain/ports/acesso-repository.port.js";
import type { SkillRepositoryPort } from "../../../domain/ports/skill-repository.port.js";
import type {
  PlugServerGatewayPort,
  UsuarioPlugSessionPort,
} from "../../../domain/ports/plug-server-gateway.port.js";
import { currentAcessoId } from "../../session-context.js";
import { withHubAuth } from "./hub-auth.js";

export interface BindAcessoHint {
  readonly skills?: SkillRepositoryPort;
  readonly skillId?: string;
  readonly skillIds?: readonly string[];
  readonly slug?: string;
}

export const requireUsuario = (usuarioId: string | undefined): string => {
  if (!usuarioId) {
    throw DomainError.unauthenticated();
  }
  return usuarioId;
};

export const requireAcesso = async (
  acessos: AcessoRepositoryPort,
  acessoId: string | undefined,
  usuarioId: string,
  _hint?: BindAcessoHint,
): Promise<Acesso> => {
  const bound = currentAcessoId()?.trim();
  const requested = acessoId?.trim();
  if (bound && requested && requested !== bound) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "acessoId não corresponde ao token MCP.",
      hint: "Este Bearer autentica um único acesso. Omita acessoId. Outra persona usa o token MCP dela (setupUrl de adicionar_acesso / registrar_acesso).",
    });
  }
  const effective = requested ?? bound;
  if (effective) {
    const acesso = await acessos.findByIdForUsuario(effective, usuarioId);
    if (!acesso) {
      throw new DomainError({
        code: ERROR_CODES.ACESSO_NOT_FOUND,
        message: "Acesso não encontrado para este token MCP.",
        hint: "Este Bearer autentica só a persona atual. Confira listar_acessos ou use o token MCP da outra persona.",
      });
    }
    return acesso;
  }
  const lista = await acessos.listByUsuario(usuarioId);
  if (lista.length === 1 && lista[0]) {
    return lista[0];
  }
  throw new DomainError({
    code: ERROR_CODES.VALIDATION_ERROR,
    message: "acessoId é obrigatório.",
    hint: "O token MCP autentica um único acesso. Com Bearer, omita acessoId. Sem sessão, passe o id de listar_acessos.",
  });
};

export const statusFromHub = (state: string): StatusAcesso => {
  if (state === "approved") {
    return "approved";
  }
  if (state === "revoked") {
    return "revoked";
  }
  return "pending";
};

export const requireAcessoAprovado = (acesso: Acesso): Acesso => {
  if (acesso.statusAcesso === "pending") {
    throw new DomainError({
      code: ERROR_CODES.AGENT_ACCESS_PENDING,
      message: "Acesso ao agente ainda aguarda aprovação no plug-server.",
      hint: "Chame verificar_acesso. Peça ao dono do Agent para aprovar o Client. Não faça polling agressivo.",
      retryable: true,
      source: "client_agent_access",
      stage: "requireAcessoAprovado",
    });
  }
  if (acesso.statusAcesso === "revoked") {
    throw new DomainError({
      code: ERROR_CODES.ACCESS_REVOKED,
      message: "Acesso ao agente está revogado.",
      hint: "Reabra o pedido com adicionar_acesso ou registrar_acesso.",
      source: "client_agent_access",
      stage: "requireAcessoAprovado",
    });
  }
  return acesso;
};

export const refreshAndRequireAcessoAprovado = async (
  acessos: AcessoRepositoryPort,
  plug: PlugServerGatewayPort,
  sessions: UsuarioPlugSessionPort,
  acesso: Acesso,
  usuarioId: string,
): Promise<Acesso> => {
  if (acesso.statusAcesso !== "pending") {
    return requireAcessoAprovado(acesso);
  }
  const hub = await withHubAuth(sessions, usuarioId, (accessToken) =>
    plug.getAgentAccessStatus(accessToken, acesso.agentId),
  );
  const statusAcesso = statusFromHub(hub.state);
  await acessos.updateStatus(acesso.id, statusAcesso);
  return requireAcessoAprovado({ ...acesso, statusAcesso });
};
