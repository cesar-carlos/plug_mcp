import pg from "pg";
import { readPdfReportHealth } from "../src/infrastructure/persistence/persona-v2/pdf-report-health.js";

// Explicit operator invocation with the control-v2 database, never an ERP connection.
const url = process.env.PERSONA_V2_PDF_HEALTH_DATABASE_URL;
if (!url || process.argv.length !== 2) {
  process.stderr.write(
    "Set PERSONA_V2_PDF_HEALTH_DATABASE_URL for the dedicated v2 control database. No arguments accepted.\n",
  );
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000 });
  try {
    process.stdout.write(JSON.stringify(await readPdfReportHealth(pool)) + "\n");
  } catch {
    process.stderr.write("PDF operational metrics unavailable; connection details omitted.\n");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
