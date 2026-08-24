import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { LoggerPort } from "../../../domain/ports/logger.port.js";
import type {
  PlugServerGatewayPort,
  UsuarioPlugSessionPort,
} from "../../../domain/ports/plug-server-gateway.port.js";

export const withHubAuth = async <T>(
  sessions: UsuarioPlugSessionPort,
  usuarioId: string,
  op: (accessToken: string) => Promise<T>,
): Promise<T> => {
  const first = await sessions.getAccessToken(usuarioId);
  try {
    return await op(first);
  } catch (error) {
    if (!(error instanceof DomainError) || error.code !== ERROR_CODES.USER_AUTH_EXPIRED) {
      throw error;
    }
    sessions.invalidate(usuarioId);
    const retry = await sessions.getAccessToken(usuarioId);
    return op(retry);
  }
};

export const tryPutClientToken = async (
  plug: PlugServerGatewayPort,
  logger: LoggerPort | undefined,
  accessToken: string,
  agentId: string,
  clientToken: string,
  pending: boolean,
): Promise<void> => {
  try {
    await plug.putClientToken(accessToken, agentId, clientToken);
  } catch (error) {
    const code = error instanceof DomainError ? error.code : "unknown";
    const expectedWhilePending =
      pending &&
      error instanceof DomainError &&
      (error.code === ERROR_CODES.AGENT_ACCESS_DENIED ||
        error.code === ERROR_CODES.AGENT_ACCESS_PENDING);
    if (expectedWhilePending) {
      return;
    }
    logger?.warn("putClientToken failed; RPC still sends client_token", { agentId, code });
  }
};
