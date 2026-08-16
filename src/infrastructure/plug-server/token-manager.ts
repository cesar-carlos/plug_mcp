import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import {
  mapPlugServerFailure,
  mapPlugServerAbort,
  isAbortError,
  parseRetryAfterMs,
} from "./map-plug-error.js";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const jwtExpMs = (token: string): number | null => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
};

export class ServiceTokenManager {
  private pair: TokenPair | null = null;
  private inflight: Promise<string> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly email: string,
    private readonly password: string,
    private readonly logger: LoggerPort,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly httpTimeoutMs = 35_000,
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.pair && this.isFresh(this.pair.accessToken)) {
      return this.pair.accessToken;
    }
    this.inflight ??= this.loginOrRefresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  invalidate(): void {
    this.pair = null;
  }

  private isFresh(token: string): boolean {
    const exp = jwtExpMs(token);
    if (!exp) return true;
    return exp - Date.now() > 60_000;
  }

  private async loginOrRefresh(): Promise<string> {
    if (!this.email || !this.password) {
      throw new DomainError({
        code: ERROR_CODES.SERVICE_AUTH_EXPIRED,
        message: "Credenciais de serviço do plug-server não configuradas.",
        hint: "Defina PLUG_SERVER_CLIENT_EMAIL e PLUG_SERVER_CLIENT_PASSWORD no ambiente do MCP.",
      });
    }
    if (this.pair?.refreshToken) {
      try {
        this.pair = await this.postTokens("/api/v1/client-auth/refresh", {
          refreshToken: this.pair.refreshToken,
        });
        this.logger.info("plug-server service token refreshed", {
          accessTokenLen: this.pair.accessToken.length,
        });
        return this.pair.accessToken;
      } catch (error) {
        this.logger.warn("plug-server refresh failed, falling back to login", {
          code: error instanceof DomainError ? error.code : "unknown",
        });
        this.pair = null;
      }
    }
    this.pair = await this.postTokens("/api/v1/client-auth/login", {
      email: this.email,
      password: this.password,
    });
    this.logger.info("plug-server service login ok", {
      accessTokenLen: this.pair.accessToken.length,
    });
    return this.pair.accessToken;
  }

  private async postTokens(path: string, body: Record<string, string>): Promise<TokenPair> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw mapPlugServerAbort();
      }
      throw error;
    }
    const json: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw mapPlugServerFailure(
        {
          status: response.status,
          body: json,
          retryAfterMs: parseRetryAfterMs(
            response.headers.get("retry-after"),
            response.headers.get("ratelimit-reset"),
          ),
        },
        this.logger,
      );
    }
    const record = json as Record<string, unknown>;
    const accessToken =
      (typeof record.accessToken === "string" && record.accessToken) ||
      (typeof record.token === "string" && record.token) ||
      "";
    const refreshToken = typeof record.refreshToken === "string" ? record.refreshToken : "";
    if (!accessToken) {
      throw new DomainError({
        code: ERROR_CODES.SERVICE_AUTH_EXPIRED,
        message: "Login no plug-server não devolveu accessToken.",
        hint: "Confira o contrato /client-auth/login e as credenciais de serviço.",
      });
    }
    return { accessToken, refreshToken };
  }
}
