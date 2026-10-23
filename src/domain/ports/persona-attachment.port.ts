/** Encrypted and bounded. Storage never substitutes live authorization. */
export interface PersonaAttachmentStore {
  readonly storage: "process-memory" | "shared-postgres";
  put(binding: string, plaintext: string, expiresAt: number): string | Promise<string>;
  get(handle: string, binding: string): string | null | Promise<string | null>;
  remove(handle: string, binding: string): void | Promise<void>;
  close(): void;
}
