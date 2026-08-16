import { lt } from "drizzle-orm";
import type { AuditLogEntry, NewAuditLog } from "../../../domain/entities/audit-log.js";
import type { AuditLogPort } from "../../../domain/ports/audit-log.port.js";
import * as schema from "../schema.js";
import type { Db } from "./db.js";

export class DrizzleAuditLog implements AuditLogPort {
  constructor(private readonly db: Db) {}

  async append(entry: NewAuditLog): Promise<AuditLogEntry> {
    const rows = await this.db.insert(schema.auditLog).values(entry).returning();
    const row = rows[0]!;
    return row;
  }

  async purgeOlderThan(cutoff: Date): Promise<number> {
    const rows = await this.db
      .delete(schema.auditLog)
      .where(lt(schema.auditLog.createdAt, cutoff))
      .returning({ id: schema.auditLog.id });
    return rows.length;
  }
}
