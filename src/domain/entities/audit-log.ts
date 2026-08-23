export interface NewAuditLog {
  readonly usuarioId: string | null;
  readonly acessoId: string | null;
  readonly tool: string;
  readonly sqlEnviado: string | null;
  readonly sucesso: boolean;
  readonly codigoErro: string | null;
  readonly linhasRetornadas: number | null;
  readonly duracaoMs: number | null;
}

export interface AuditLogEntry extends NewAuditLog {
  readonly id: string;
  readonly createdAt: Date;
}
