import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { UsuarioRepositoryPort } from "../../domain/ports/usuario-repository.port.js";
import type {
  PlugHubTokens,
  PlugServerGatewayPort,
  UsuarioPlugSessionPort,
} from "../../domain/ports/plug-server-gateway.port.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";

interface CachedTokens {
  tokens: PlugHubTokens;
  accessExpMs: number;
}

const jwtExpMs = (token: string): number | null => {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return null;
    }
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
};

export class UsuarioTokenManager implements UsuarioPlugSessionPort {
  private readonly cache = new Map<string, CachedTokens>();
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(
    private readonly usuarios: UsuarioRepositoryPort,
    private readonly crypto: CryptoPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly logger: LoggerPort,
  ) {}

  async getAccessToken(usuarioId: string): Promise<string> {
    const cached = this.cache.get(usuarioId);
    if (cached && cached.accessExpMs - Date.now() > 60_000) {
      return cached.tokens.accessToken;
    }
    const pending = this.inflight.get(usuarioId);
    if (pending) {
      return pending;
    }
    const job = this.loginOrRefresh(usuarioId).finally(() => {
      this.inflight.delete(usuarioId);
    });
    this.inflight.set(usuarioId, job);
    return job;
  }

  invalidate(usuarioId: string): void {
    this.cache.delete(usuarioId);
  }

  remember(usuarioId: string, tokens: PlugHubTokens): void {
    this.cache.set(usuarioId, {
      tokens,
      accessExpMs: jwtExpMs(tokens.accessToken) ?? Date.now() + 10 * 60_000,
    });
  }

  private async loginOrRefresh(usuarioId: string): Promise<string> {
    const usuario = await this.usuarios.findById(usuarioId);
    if (!usuario) {
      throw new DomainError({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: "Usuário do cofre não encontrado.",
        hint: "Chame registrar_acesso novamente.",
      });
    }
    const cached = this.cache.get(usuarioId);
    if (cached?.tokens.refreshToken) {
      try {
        const tokens = await this.plug.refresh(cached.tokens.refreshToken);
        this.remember(usuarioId, tokens);
        this.logger.info("plug-server token refreshed", { usuarioId });
        return tokens.accessToken;
      } catch (error) {
        this.logger.warn("plug-server refresh failed, falling back to login", {
          usuarioId,
          code: error instanceof DomainError ? error.code : "unknown",
        });
        this.cache.delete(usuarioId);
      }
    }
    const email = this.crypto.decrypt(usuario.emailEnc);
    const password = this.crypto.decrypt(usuario.senhaEnc);
    try {
      const tokens = await this.plug.login(email, password);
      this.remember(usuarioId, tokens);
      this.logger.info("plug-server login ok", { usuarioId });
      return tokens.accessToken;
    } catch (error) {
      if (error instanceof DomainError && error.code === ERROR_CODES.USER_AUTH_EXPIRED) {
        throw new DomainError({
          code: ERROR_CODES.CREDENTIAL_STALE,
          message: "E-mail ou senha do Client no plug-server foram recusados.",
          hint: "Chame atualizar_credencial_plug com o e-mail e a senha atuais do Client. Não é falha de senha do MCP.",
        });
      }
      throw error;
    }
  }

}
