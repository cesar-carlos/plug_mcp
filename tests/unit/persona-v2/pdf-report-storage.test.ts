import type pg from "pg";
import { expect, it, vi } from "vitest";
import { PostgresPdfReportJobs } from "../../../src/infrastructure/persistence/persona-v2/pdf-report-jobs.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { hasCleanupFailure } from "../../../src/domain/errors/cleanup-failure.js";
import { readPdfReportHealth } from "../../../src/infrastructure/persistence/persona-v2/pdf-report-health.js";

it("sanitizes operator metrics failures and discards an uncertain read transaction", async () => {
  const secret = new Error("password=private SELECT sensitive");
  await expect(
    readPdfReportHealth({ connect: vi.fn().mockRejectedValue(secret) } as unknown as pg.Pool),
  ).rejects.toThrow("PDF operational metrics unavailable");
  const release = vi.fn();
  const query = vi.fn().mockRejectedValue(secret);
  await expect(
    readPdfReportHealth({ connect: vi.fn(async () => ({ query, release })) } as unknown as pg.Pool),
  ).rejects.toThrow("PDF operational metrics unavailable");
  expect(release).toHaveBeenCalledExactlyOnceWith(true);
  expect(query).toHaveBeenCalledExactlyOnceWith("BEGIN READ ONLY");
});

const crypto = new NodeCryptoAdapter("a".repeat(64));
it("reports temporary storage failure without turning it into a missing report or leaking details", async () => {
  const connect = vi.fn().mockRejectedValue(new Error("password=synthetic-private database host"));
  const query = vi.fn().mockRejectedValue(new Error("SELECT private"));
  const store = new PostgresPdfReportJobs(
    { connect, query } as unknown as pg.Pool,
    crypto,
    "https://fixture.test",
  );
  for (const action of [() => store.claimRender(), () => store.get("id", "binding")]) {
    const error = await action().catch((failure: unknown) => failure);
    expect(error).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(String(error)).not.toMatch(/password|synthetic-private|SELECT|host/);
  }
  expect(connect).toHaveBeenCalledTimes(1);
  expect(query).toHaveBeenCalledTimes(1);
});

it("preserves the safe primary failure when rollback also fails and discards the connection", async () => {
  const release = vi.fn();
  const query = vi.fn().mockRejectedValue(new Error("private rollback failure"));
  const connect = vi.fn(async () => ({ query, release }));
  const store = new PostgresPdfReportJobs(
    { connect } as unknown as pg.Pool,
    crypto,
    "https://fixture.test",
  );
  const error = await store.claimRender().catch((failure: unknown) => failure);
  expect(error).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
  expect(hasCleanupFailure(error)).toBe(true);
  expect(String(error)).not.toContain("private");
  expect(release).toHaveBeenCalledExactlyOnceWith(true);
  expect(query.mock.calls.map((call) => call[0])).toEqual(["BEGIN", "ROLLBACK"]);
});
