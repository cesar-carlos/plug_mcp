import type {
  AdministrativeSession,
  AdministrativeSessionPort,
} from "../../../domain/ports/persona-v2.port.js";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";

/** Hub JWT remains server-side, only a hash of the opaque browser ID is indexed. */
export class MemoryAdministrativeSessions implements AdministrativeSessionPort {
  private readonly sessions = new Map<string, AdministrativeSession>();

  constructor(
    private readonly crypto: CryptoPort,
    private readonly capacity = 1000,
  ) {}

  create(session: AdministrativeSession): string {
    const now = Date.now();
    for (const [key, value] of this.sessions) {
      if (value.expiresAt.getTime() <= now) {
        this.sessions.delete(key);
      }
    }
    if (this.sessions.size >= this.capacity) {
      throw new Error("Limite de sessões administrativas atingido.");
    }
    const id = this.crypto.randomToken(32);
    this.sessions.set(this.crypto.sha256Hex(id), session);
    return id;
  }

  find(opaqueId: string, now: Date): AdministrativeSession | null {
    const key = this.crypto.sha256Hex(opaqueId);
    const session = this.sessions.get(key);
    if (!session || session.expiresAt <= now) {
      this.sessions.delete(key);
      return null;
    }
    return session;
  }

  remove(opaqueId: string): void {
    this.sessions.delete(this.crypto.sha256Hex(opaqueId));
  }
}
