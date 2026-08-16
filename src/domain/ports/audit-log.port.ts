import type { AuditLogEntry, NewAuditLog } from "../entities/audit-log.js";

export interface AuditLogPort {
  append(entry: NewAuditLog): Promise<AuditLogEntry>;
  purgeOlderThan(cutoff: Date): Promise<number>;
}
