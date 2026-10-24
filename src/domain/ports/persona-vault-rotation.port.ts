import type { CryptoPort } from "./crypto.port.js";
import type { VaultRotationJob, VaultTarget } from "../persona-v2/vault-rotation.js";
export interface VaultRotationCipher extends CryptoPort {
  keyFingerprints(): Readonly<Record<string, string>>;
}
export interface VaultCipherRow {
  key: Record<string, unknown>;
  content: Record<string, unknown>;
}
export interface VaultRotationUnit {
  scan(
    target: VaultTarget,
    cursor: Record<string, unknown> | null,
    limit: number,
    lock: boolean,
  ): Promise<readonly VaultCipherRow[]>;
  start(
    keyId: string,
    bindings: Readonly<Record<string, string>>,
    resumeId?: string,
  ): Promise<VaultRotationJob>;
  rewrap(
    job: VaultRotationJob,
    target: VaultTarget,
    row: VaultCipherRow,
    replacements: Readonly<Record<string, string>>,
  ): Promise<void>;
  progress(job: VaultRotationJob): Promise<void>;
}
export interface VaultRotationSession extends VaultRotationUnit {
  databaseName: string;
  validateBindings(keyId: string, bindings: Readonly<Record<string, string>>): Promise<void>;
  transaction<T>(readOnly: boolean, work: (unit: VaultRotationUnit) => Promise<T>): Promise<T>;
}
export interface PersonaVaultRotationStore {
  exclusive<T>(work: (session: VaultRotationSession) => Promise<T>): Promise<T>;
}
