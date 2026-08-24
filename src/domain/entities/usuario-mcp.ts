export interface UsuarioMcp {
  readonly id: string;
  readonly emailEnc: string;
  readonly emailHash: string;
  readonly senhaEnc: string;
  readonly tokenHash: string;
  readonly tokenExpiresAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NovoUsuarioMcp {
  readonly emailEnc: string;
  readonly emailHash: string;
  readonly senhaEnc: string;
  readonly tokenHash: string;
  readonly tokenExpiresAt: Date | null;
}
