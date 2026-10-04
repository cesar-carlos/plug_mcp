import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type {
  SetupOperation,
  SetupOperationRepositoryPort,
} from "../../domain/ports/setup-operation.port.js";
import type { Db } from "./drizzle/db.js";
import { setupOperation } from "./schema.js";

export class MemorySetupOperations implements SetupOperationRepositoryPort {
  private readonly operations = new Map<string, SetupOperation>();
  create(row: SetupOperation): Promise<void> {
    this.operations.set(row.codeHash, structuredClone(row));
    return Promise.resolve();
  }
  find(hash: string): Promise<SetupOperation | null> {
    const row = this.operations.get(hash);
    return Promise.resolve(row ? structuredClone(row) : null);
  }
  setCsrf(hash: string, csrfHash: string, now: Date): Promise<boolean> {
    const row = this.operations.get(hash);
    if (!row || row.claimedAt || row.expiresAt <= now) {
      return Promise.resolve(false);
    }
    this.operations.set(hash, { ...row, csrfHash });
    return Promise.resolve(true);
  }
  claim(hash: string, csrfHash: string, now: Date): Promise<SetupOperation | null> {
    const row = this.operations.get(hash);
    if (!row || row.claimedAt || row.csrfHash !== csrfHash || row.expiresAt <= now) {
      return Promise.resolve(null);
    }
    const claimed = { ...row, claimedAt: now };
    this.operations.set(hash, claimed);
    return Promise.resolve(structuredClone(claimed));
  }
  purgeExpired(now: Date): Promise<number> {
    let count = 0;
    for (const [hash, row] of this.operations) {
      if (row.expiresAt <= now) {
        this.operations.delete(hash);
        count++;
      }
    }
    return Promise.resolve(count);
  }
}
export class DrizzleSetupOperations implements SetupOperationRepositoryPort {
  constructor(private readonly db: Db) {}
  async create(row: SetupOperation): Promise<void> {
    await this.db.insert(setupOperation).values(row);
  }
  async find(hash: string): Promise<SetupOperation | null> {
    const [row] = await this.db
      .select()
      .from(setupOperation)
      .where(eq(setupOperation.codeHash, hash));
    return row ?? null;
  }
  async setCsrf(hash: string, csrfHash: string, now: Date): Promise<boolean> {
    const rows = await this.db
      .update(setupOperation)
      .set({ csrfHash })
      .where(
        and(
          eq(setupOperation.codeHash, hash),
          isNull(setupOperation.claimedAt),
          gt(setupOperation.expiresAt, now),
        ),
      )
      .returning();
    return rows.length === 1;
  }
  async claim(hash: string, csrfHash: string, now: Date): Promise<SetupOperation | null> {
    const [row] = await this.db
      .update(setupOperation)
      .set({ claimedAt: now })
      .where(
        and(
          eq(setupOperation.codeHash, hash),
          eq(setupOperation.csrfHash, csrfHash),
          isNull(setupOperation.claimedAt),
          gt(setupOperation.expiresAt, now),
        ),
      )
      .returning();
    return row ?? null;
  }
  async purgeExpired(now: Date): Promise<number> {
    const rows = await this.db
      .delete(setupOperation)
      .where(lt(setupOperation.expiresAt, now))
      .returning({ hash: setupOperation.codeHash });
    return rows.length;
  }
}
