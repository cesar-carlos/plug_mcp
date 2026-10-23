import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type {
  PlugHubTokens,
  PlugServerGatewayPort,
} from "../../domain/ports/plug-server-gateway.port.js";
import type { SourceCredentialPort } from "../../domain/ports/source-credential.port.js";
import { PersonaV2Error, type Source } from "../../domain/persona-v2/model.js";

interface Session {
  readonly tokens: PlugHubTokens;
  readonly expiresAt: number;
}

/** Sessions and in-flight logins are scoped to credential identity + version, never owner/email. */
export class SourceTokenManager {
  private readonly sessions = new Map<string, Session>();
  private readonly pending = new Map<string, { promise: Promise<string>; valid: boolean }>();
  constructor(
    private readonly credentials: SourceCredentialPort,
    private readonly hub: Pick<PlugServerGatewayPort, "login">,
    private readonly crypto: CryptoPort,
    private readonly now: () => number = Date.now,
  ) {}

  async getAccessToken(source: Source): Promise<string> {
    const credential = await this.credentials.find(source.personaId, source.credentialId);
    if (credential?.version !== source.credentialVersion || !source.active) {
      this.invalidate(source.credentialId);
      throw new PersonaV2Error(
        "STALE_AUTHORIZATION",
        "Credencial da fonte foi alterada ou removida.",
      );
    }
    const key = `${source.personaId}:${credential.id}:${credential.version}`;
    const session = this.sessions.get(key);
    if (session && session.expiresAt > this.now()) {
      return session.tokens.accessToken;
    }
    const pending = this.pending.get(key);
    if (pending) {
      return pending.promise;
    }
    const attempt = { valid: true, promise: Promise.resolve("") };
    const login = async (): Promise<string> => {
      const tokens = await this.hub.login(
        this.crypto.decrypt(credential.emailEnc),
        this.crypto.decrypt(credential.passwordEnc),
      );
      const current = await this.credentials.find(source.personaId, source.credentialId);
      if (!attempt.valid || current?.version !== credential.version) {
        throw new PersonaV2Error("STALE_AUTHORIZATION", "Credencial mudou durante autenticação.");
      }
      for (const [id, entry] of this.sessions) {
        if (entry.expiresAt <= this.now()) {
          this.sessions.delete(id);
        }
      }
      // JWTs have a short local cache only, even if the hub issued a longer expiry.
      if (this.sessions.size >= 1000) {
        this.sessions.delete(this.sessions.keys().next().value!);
      }
      this.sessions.set(key, { tokens, expiresAt: this.now() + 30000 });
      return tokens.accessToken;
    };
    const promise = login();
    attempt.promise = promise;
    this.pending.set(key, attempt);
    try {
      return await promise;
    } finally {
      if (this.pending.get(key) === attempt) {
        this.pending.delete(key);
      }
    }
  }

  invalidate(credentialId: string): void {
    for (const key of this.sessions.keys()) {
      if (key.split(":")[1] === credentialId) {
        this.sessions.delete(key);
      }
    }
    for (const [key, attempt] of this.pending) {
      if (key.split(":")[1] === credentialId) {
        attempt.valid = false;
        this.pending.delete(key);
      }
    }
  }
}
