export interface AuditLogEntry {
  readonly id: string;
  readonly mcpAccountId: string;
  readonly ambienteId: string | null;
  readonly tool: string;
  readonly sqlEnviado: string | null;
  readonly sucesso: boolean;
  readonly codigoErro: string | null;
  readonly linhasRetornadas: number | null;
  readonly duracaoMs: number;
  readonly createdAt: Date;
}

export type NewAuditLog = Omit<AuditLogEntry, "id" | "createdAt">;
