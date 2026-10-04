export type SetupPurpose = "registrar" | "adicionar" | "credenciais" | "rotacionar";
export interface SetupOperation {
  readonly codeHash: string;
  readonly purpose: SetupPurpose;
  readonly usuarioId: string | null;
  readonly acessoId: string | null;
  readonly bearerHash: string | null;
  readonly expiresAt: Date;
  readonly csrfHash: string | null;
  readonly claimedAt: Date | null;
}
export interface SetupOperationRepositoryPort {
  create(operation: SetupOperation): Promise<void>;
  find(codeHash: string): Promise<SetupOperation | null>;
  setCsrf(codeHash: string, csrfHash: string, now: Date): Promise<boolean>;
  claim(codeHash: string, csrfHash: string, now: Date): Promise<SetupOperation | null>;
  purgeExpired(now: Date): Promise<number>;
}
