import type { Source } from "../persona-v2/model.js";
import type { VerifiedSource } from "./persona-v2.port.js";
export interface SourceCredential {
  readonly id: string;
  readonly personaId: string;
  readonly version: number;
  readonly emailEnc: string;
  readonly passwordEnc: string;
  readonly clientTokenEnc: string;
}
export interface SourceCredentialPort {
  find(personaId: string, credentialId: string): Promise<SourceCredential | null>;
  invalidateIdentity?(source: Source): Promise<void>;
}

export interface SourceConnectionLifecyclePort {
  verifyIdentity(source: Source): Promise<VerifiedSource>;
  invalidateIdentity(source: Source): Promise<void>;
  discardSession(credentialId: string): void;
}
