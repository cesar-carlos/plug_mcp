import type pg from "pg";

type LeaseTable =
  | "persona_review_worker_lease_v2"
  | "persona_ephemeral_worker_lease_v2"
  | "persona_retention_worker_lease_v2";

interface WorkerLeaseRequest {
  table: LeaseTable;
  name: string;
  owner: string;
  now: Date;
  until: Date;
  maxDurationMs: number;
}

/** Application time requests a duration; only database time can expire another owner. */
export async function claimWorkerLease(
  pool: pg.Pool,
  { table, name, owner, now, until, maxDurationMs }: WorkerLeaseRequest,
): Promise<boolean> {
  const duration = Math.min(maxDurationMs, until.getTime() - now.getTime());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Invalid worker lease duration.");
  }
  const result = await pool.query(
    `INSERT INTO ${table}(name,owner,expires_at)
     VALUES($1,$2,clock_timestamp()+$3*interval '1 millisecond')
     ON CONFLICT(name) DO UPDATE SET owner=$2,expires_at=clock_timestamp()+$3*interval '1 millisecond'
     WHERE ${table}.expires_at<=clock_timestamp() RETURNING name`,
    [name, owner, duration],
  );
  return result.rowCount === 1;
}
