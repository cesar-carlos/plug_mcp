import type pg from "pg";

interface PdfHealthCounts {
  metadata: number;
  payloads: number;
  queued: number;
  collecting: number;
  rendering: number;
  unconfirmed: number;
  overdue: number;
  expired_leases: number;
}
/** Operator-only aggregates. Never selects identities, content, handles or diagnostics. */
export async function readPdfReportHealth(pool: pg.Pool): Promise<{
  counts: PdfHealthCounts;
  limits: { metadata: number; payloads: number };
  readOnly: true;
}> {
  let db: pg.PoolClient;
  try {
    db = await pool.connect();
  } catch {
    throw new Error("PDF operational metrics unavailable");
  }
  try {
    await db.query("BEGIN READ ONLY");
    await db.query("SET LOCAL statement_timeout='5s'");
    const result = await db.query<PdfHealthCounts>(`SELECT count(*)::int AS metadata,
      count(*) FILTER(WHERE payload_enc IS NOT NULL)::int AS payloads,
      count(*) FILTER(WHERE state IN ('accepted','captured'))::int AS queued,
      count(*) FILTER(WHERE state='collecting')::int AS collecting,
      count(*) FILTER(WHERE state='rendering')::int AS rendering,
      count(*) FILTER(WHERE state='capture_unconfirmed')::int AS unconfirmed,
      count(*) FILTER(WHERE payload_enc IS NOT NULL AND work_deadline<=statement_timestamp())::int AS overdue,
      count(*) FILTER(WHERE state='rendering' AND lease_until<=statement_timestamp())::int AS expired_leases
      FROM persona_pdf_job_v2`);
    await db.query("COMMIT");
    return { counts: result.rows[0]!, limits: { metadata: 100000, payloads: 8 }, readOnly: true };
  } catch {
    // Discard rather than returning a connection with an uncertain transaction.
    throw new Error("PDF operational metrics unavailable");
  } finally {
    db.release(true);
  }
}
