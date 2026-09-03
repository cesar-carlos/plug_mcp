import type { AuditLogEntry, NewAuditLog } from "../entities/audit-log.js";

export interface AuditLogPort {
  append(entry: NewAuditLog): Promise<AuditLogEntry>;
  listByUsuario(usuarioId: string, limite: number): Promise<readonly AuditLogEntry[]>;
  listByAcesso(acessoId: string, limite: number): Promise<readonly AuditLogEntry[]>;
  purgeOlderThan(cutoff: Date): Promise<number>;
}
