import type { AuditLogEntry, NewAuditLog } from "../../../domain/entities/audit-log.js";
import type { AuditLogPort } from "../../../domain/ports/audit-log.port.js";
import { id, now } from "./memory-util.js";

export class InMemoryAuditLog implements AuditLogPort {
  readonly rows: AuditLogEntry[] = [];

  async append(entry: NewAuditLog): Promise<AuditLogEntry> {
    const row: AuditLogEntry = { ...entry, id: id(), createdAt: now() };
    this.rows.push(row);
    return row;
  }

  async purgeOlderThan(cutoff: Date): Promise<number> {
    const before = this.rows.length;
    this.rows.splice(0, this.rows.length, ...this.rows.filter((row) => row.createdAt >= cutoff));
    return before - this.rows.length;
  }
}
