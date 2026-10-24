import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
if (process.env.CI !== "true" || process.env.NODE_ENV !== "test" || !process.env.DATABASE_URL)
  throw new Error("Dedicated CI PostgreSQL required");
const url = new URL(process.env.DATABASE_URL);
url.pathname = "/postgres";
const admin = new pg.Client({ connectionString: url.toString() });
await admin.connect();
const name = "cleanup_" + randomUUID().replaceAll("-", "");
await admin.query(`CREATE DATABASE ${name}`);
url.pathname = "/" + name;
const pool = new pg.Pool({ connectionString: url.toString() });
const failures: (string | undefined)[] = [];
pool.on("error", (e) => failures.push((e as Error & { code?: string }).code));
try {
  await pool.query("SELECT 1");
  await assert.rejects(
    admin.query(`DROP DATABASE ${name}`),
    (e: unknown) => e instanceof Error && "code" in e && e.code === "55006",
  );
  assert.equal((await pool.query("SELECT 1 AS n")).rows[0].n, 1);
  assert.deepEqual(failures, []);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const terminated = new Promise<void>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Expected pool error was not delivered")), 5000);
    pool.once("error", () => resolve());
  });
  try {
    await Promise.all([admin.query(`DROP DATABASE ${name} WITH (FORCE)`), terminated]);
  } finally {
    clearTimeout(timer);
  }
  assert.deepEqual(failures, ["57P01"]);
  console.log("Normal DROP refuses live session without killing it; FORCE emits pool error 57P01.");
} finally {
  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${name}`);
  await admin.end();
}
