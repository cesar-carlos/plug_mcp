import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import pino from "pino";
import { PersonaPdfReports } from "../../src/application/persona-v2/pdf-reports.js";
import { PersonaSourceQueries } from "../../src/application/persona-v2/source-query.js";
import { PersonaAttachments } from "../../src/application/persona-v2/attachments.js";
import {
  compileQueryTraining,
  sourceFingerprint,
} from "../../src/application/persona-v2/query-training.js";
import { attachmentTraining, trainingSource } from "../helpers/persona-v2-training.js";
import { queryLimits } from "../../src/domain/persona-v2/execution-limits.js";
import { PersonaV2Error } from "../../src/domain/persona-v2/model.js";
import { PinoLoggerAdapter } from "../../src/infrastructure/logging/pino-logger.adapter.js";
import { renderPdfReport } from "../../src/infrastructure/persona-v2/pdf-renderer.js";
import type { SqlExecuteResult } from "../../src/domain/ports/plug-server-gateway.port.js";
import express from "express";
import httpRequest from "supertest";
import { registerPersonaAttachmentRoutes } from "../../src/infrastructure/http/persona-v2-attachments.js";
import { createPersonaWorker } from "../../src/infrastructure/persona-v2/worker.js";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { PostgresPdfReportJobs } from "../../src/infrastructure/persistence/persona-v2/pdf-report-jobs.js";
import { readPdfReportHealth } from "../../src/infrastructure/persistence/persona-v2/pdf-report-health.js";
import { PostgresPersonaAttachments } from "../../src/infrastructure/persistence/persona-v2/attachments.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { PersonaVaultRotation } from "../../src/application/persona-v2/vault-rotation.js";
import { PostgresPersonaVaultRotationStore } from "../../src/infrastructure/persistence/persona-v2/vault-rotation.js";

const url = new URL(personaV2TestDatabaseUrl());
const name = `persona_pdf_${randomUUID().replaceAll("-", "")}_test`;
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
url.pathname = `/${name}`;
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const db = new pg.Pool({ connectionString: url.toString() });
const second = new pg.Pool({ connectionString: url.toString() });
const crypto = new NodeCryptoAdapter("a".repeat(64), "initial");
const origin = "https://pdf.fixture.test";
const jobs = (pool = db) => new PostgresPdfReportJobs(pool, crypto, origin);
const persona = randomUUID(),
  token = randomUUID();
const request = () => ({
  personaId: persona,
  tokenId: token,
  binding: "fixture-binding",
  requestId: randomUUID(),
  requestJson: JSON.stringify({ synthetic: "private data never in clear" }),
  timeoutMs: 60000,
  ttlMs: 300000,
  authorityExpiresAt: Date.now() + 600000,
});
beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  await applyPersonaMigrations(url.toString());
  const owner = randomUUID();
  await db.query(
    "INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,'https://fixture.test','fixture')",
    [owner],
  );
  await db.query(
    "INSERT INTO persona(id,responsavel_id,nome,especialidade) VALUES($1,$2,'Fixture','Synthetic')",
    [persona, owner],
  );
  await db.query(
    "INSERT INTO persona_token(id,persona_id,nome,token_hash,permissoes,delegacao) VALUES($1,$2,'Fixture',$3,'{}','{}')",
    [token, persona, "f".repeat(64)],
  );
});
beforeEach(async () => {
  // This database is newly provisioned for this suite; no operational state is used.
  await db.query("TRUNCATE persona_pdf_job_v2,persona_attachment_v2,audit_v2");
});
afterAll(async () => {
  await db.end();
  await second.end();
  await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
});

it("reads operator aggregates without exposing content or changing jobs", async () => {
  const input = request();
  const { row } = await jobs().admit(input);
  const before = (await db.query("SELECT * FROM persona_pdf_job_v2")).rows;
  const health = await readPdfReportHealth(db);
  expect(health).toEqual({
    counts: {
      metadata: 1,
      payloads: 1,
      queued: 1,
      collecting: 0,
      rendering: 0,
      unconfirmed: 0,
      overdue: 0,
      expired_leases: 0,
    },
    limits: { metadata: 100000, payloads: 8 },
    readOnly: true,
  });
  for (const secret of [row.id, persona, token, input.requestId, input.requestJson])
    expect(JSON.stringify(health)).not.toContain(secret);
  expect((await db.query("SELECT * FROM persona_pdf_job_v2")).rows).toEqual(before);
  await jobs().cancel(row.id, input.binding);
  expect((await readPdfReportHealth(db)).counts).toMatchObject({
    metadata: 1,
    payloads: 0,
    queued: 0,
  });
});

it("deduplicates admission across instances and permits only one SQL dispatch claim", async () => {
  const input = request();
  const attempts = await Promise.all([jobs().admit(input), jobs(second).admit(input)]);
  expect(new Set(attempts.map((a) => a.row.id)).size).toBe(1);
  expect(attempts.filter((a) => a.created)).toHaveLength(1);
  const id = attempts[0].row.id;
  expect(
    (
      await Promise.all([
        jobs().startCapture(id, input.binding),
        jobs(second).startCapture(id, input.binding),
      ])
    ).filter(Boolean),
  ).toHaveLength(1);
  await expect(jobs().admit({ ...input, requestJson: "different" })).rejects.toMatchObject({
    code: "INVALID_PLAN",
  });
  expect(await jobs().claimRender()).toBeNull();
  const raw = JSON.stringify((await db.query("SELECT * FROM persona_pdf_job_v2")).rows);
  expect(raw).not.toContain("private data");
  expect(raw).not.toContain(input.requestId);
  expect(await jobs().get(id, "other binding")).toBeNull();
});

it("reserves quota atomically and keeps tombstone after cancellation", async () => {
  const attempts = await Promise.allSettled([
    jobs().admit(request()),
    jobs(second).admit(request()),
    jobs().admit(request()),
  ]);
  expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(2);
  expect(attempts.filter((a) => a.status === "rejected")).toHaveLength(1);
  await db.query("TRUNCATE persona_pdf_job_v2");
  const input = request();
  const { row } = await jobs().admit(input);
  await jobs().cancel(row.id, input.binding);
  expect((await jobs(second).admit(input)).created).toBe(false);
  expect(await jobs().startCapture(row.id, input.binding)).toBe(false);
  await expect(db.query("DELETE FROM persona_pdf_job_v2 WHERE id=$1", [row.id])).rejects.toThrow();
});

it("fences stale renderer and finalizes attachment, job and audit atomically", async () => {
  const input = request();
  const { row } = await jobs().admit(input);
  await jobs().startCapture(row.id, input.binding);
  await jobs().sealCapture(row.id, input.binding, "synthetic sealed capture");
  const first = (await jobs().claimRender())!;
  expect(jobs().decode(first)).toBe("synthetic sealed capture");
  await db.query(
    "UPDATE persona_pdf_job_v2 SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
    [row.id],
  );
  const current = (await jobs(second).claimRender())!;
  await expect(jobs().finish(row.id, first.render_token!, "file", {})).rejects.toThrow();
  const result = JSON.parse(
    await jobs(second).finish(row.id, current.render_token!, "synthetic file", { format: "pdf" }),
  ) as { handle: string };
  const attachments = new PostgresPersonaAttachments(db, crypto, origin);
  expect(await attachments.get(result.handle, input.binding)).toBe("synthetic file");
  const ready = (await jobs().get(row.id, input.binding))!;
  expect(crypto.decrypt(ready.result_enc!)).toContain(result.handle);
  expect(ready.payload_enc).toBeNull();
  expect((await db.query("SELECT * FROM audit_v2 WHERE evento='pdf_report_ready'")).rowCount).toBe(
    1,
  );
  await expect(jobs().finish(row.id, current.render_token!, "again", {})).rejects.toThrow();
  await jobs().cancel(row.id, input.binding);
  expect(await attachments.get(result.handle, input.binding)).toBeNull();
  attachments.close();
});

it("serializes renderer claims across instances without dropping a queued capture", async () => {
  const one = request(),
    two = request();
  for (const input of [one, two]) {
    const { row } = await jobs().admit(input);
    await jobs().startCapture(row.id, input.binding);
    await jobs().sealCapture(row.id, input.binding, "synthetic capture");
  }
  const claims = await Promise.all([jobs().claimRender(), jobs(second).claimRender()]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const claim = claims.find(Boolean)!;
  await jobs().failRender(claim.id, claim.render_token!, randomUUID());
  const next = await jobs(second).claimRender();
  expect(next).not.toBeNull();
  expect(next!.id).not.toBe(claim.id);
});

it("audit failure rolls back ready and artifact; cancellation wins late result", async () => {
  const input = request();
  const { row } = await jobs().admit(input);
  await jobs().startCapture(row.id, input.binding);
  await jobs().sealCapture(row.id, input.binding, "capture");
  const claim = (await jobs().claimRender())!;
  await db.query(
    "ALTER TABLE audit_v2 ADD CONSTRAINT pdf_fixture_fail CHECK(evento<>'pdf_report_ready')",
  );
  try {
    await expect(jobs().finish(row.id, claim.render_token!, "file", {})).rejects.toThrow();
  } finally {
    await db.query("ALTER TABLE audit_v2 DROP CONSTRAINT pdf_fixture_fail");
  }
  expect((await db.query("SELECT * FROM persona_attachment_v2")).rowCount).toBe(0);
  expect((await jobs().get(row.id, input.binding))!.state).toBe("rendering");
  await jobs().cancel(row.id, input.binding);
  await expect(jobs().finish(row.id, claim.render_token!, "file", {})).rejects.toThrow();
});

it("expired in-flight capture becomes uncertain without permitting SQL replay", async () => {
  const input = { ...request(), timeoutMs: 600 };
  const { row } = await jobs().admit(input);
  await jobs().startCapture(row.id, input.binding);
  await db.query("SELECT pg_sleep(0.7)");
  expect(await jobs().expire()).toBe(1);
  const expired = (await jobs().get(row.id, input.binding))!;
  expect(expired.state).toBe("capture_unconfirmed");
  expect(expired.payload_enc).toBeNull();
  expect(expired.request_key_enc).toBeNull();
  expect((await jobs().admit(input)).created).toBe(false);
  expect(await jobs().startCapture(row.id, input.binding)).toBe(false);
  expect(await jobs().claimRender()).toBeNull();
});

function applicationFixture(withChart = false, withSections = false) {
  const identity = { personaId: persona, tokenId: token, tokenVersion: 1, personaVersion: 1 };
  const source = { ...trainingSource, personaId: persona };
  const pkg = compileQueryTraining(
    {
      ...attachmentTraining(),
      generatedPdf: {
        schemaVersion: 1,
        templates: ["table-v1"],
        columns: ["id", "amount"],
        columnFormats: { id: "text", amount: "currency" },
        maxRows: 30,
        maxPages: 10,
        maxBytes: 1048576,
        ttlMs: 300000,
        ...(withSections ? { successiveSections: 4 } : {}),
        ...(withChart
          ? {
              charts: [
                { id: "amounts", kind: "bar", category: "id", value: "amount", unit: "BRL" },
              ],
            }
          : {}),
      },
    },
    source,
    crypto,
  );
  const skillId = randomUUID();
  const evidence = {
    source,
    cacheFence: { revision: "1", writePending: false },
    executionLimits: queryLimits(),
    publications: [
      {
        id: randomUUID(),
        personaId: persona,
        skillId,
        revision: 1,
        package: pkg,
        hash: crypto.sha256Hex(JSON.stringify(pkg)),
        sourceVersion: 1,
        sourceFingerprint: sourceFingerprint(source, crypto),
        suspendedAt: null,
      },
    ],
  };
  const catalog = {
    query: vi.fn(async () => evidence),
    revalidateQuery: vi.fn(async () => undefined),
    sourceForVerification: vi.fn(async () => source),
    suspendStructuralQuery: vi.fn(async () => undefined),
  };
  const lease = {
    policyFingerprint: "a".repeat(64),
    execute: vi.fn<() => Promise<SqlExecuteResult>>(async () => ({
      columns: ["id", "amount"],
      rows: [{ id: 1, amount: "10.25" }],
      truncated: false,
    })),
    revalidate: vi.fn(async () => undefined),
  };
  const gateway = { authorize: vi.fn(async () => lease) };
  const queries = new PersonaSourceQueries(catalog, gateway);
  const store = new PostgresPersonaAttachments(db, crypto, origin);
  const attachments = new PersonaAttachments(catalog, queries, gateway, store, crypto);
  const logs: string[] = [];
  const logger = new PinoLoggerAdapter(
    pino(
      {},
      {
        write: (value: string) => {
          logs.push(value);
        },
      },
    ),
  );
  const renderer = { render: vi.fn(renderPdfReport) };
  const service = new PersonaPdfReports(
    catalog,
    queries,
    attachments,
    jobs(),
    renderer,
    crypto,
    logger,
  );
  const input = {
    schemaVersion: 1,
    requestId: randomUUID(),
    query: { fonteId: source.id, skillIds: [skillId], params: { minimum: 0 } },
    scope: "integral",
    layout: { templateId: "table-v1", orientation: "portrait", columns: ["id", "amount"] },
  };
  return { identity, catalog, lease, attachments, renderer, service, input, logs, evidence };
}

it("requires explicit successive reads and publication authority for every section before SQL", async () => {
  const f = applicationFixture();
  const section = { query: f.input.query, scope: f.input.scope, layout: f.input.layout };
  await expect(
    f.service.create(f.identity, { ...f.input, additionalSections: [section] }),
  ).rejects.toThrow();
  await expect(
    f.service.create(f.identity, {
      ...f.input,
      additionalSections: [section],
      consistency: "snapshot",
    }),
  ).rejects.toThrow();
  await expect(
    f.service.create(f.identity, {
      ...f.input,
      additionalSections: [section],
      consistency: "successive_reads",
    }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  expect(f.lease.execute).not.toHaveBeenCalled();
});

it("preflights PDF authority and ceilings without reserving a job or executing SQL", async () => {
  const f = applicationFixture();
  expect(await f.service.validate(f.identity, f.input)).toMatchObject({
    contractValid: true,
    sqlExecuted: false,
    authorizationReserved: false,
    dataCompletenessVerified: false,
    sections: 1,
    limits: { maxRows: 30, maxPages: 10 },
  });
  expect(f.lease.execute).not.toHaveBeenCalled();
  expect(f.renderer.render).not.toHaveBeenCalled();
  expect(
    (await db.query("SELECT count(*)::int AS total FROM persona_pdf_job_v2")).rows[0].total,
  ).toBe(0);
  f.catalog.revalidateQuery.mockRejectedValue(
    new PersonaV2Error("AUTHORIZATION_DENIED", "revoked"),
  );
  await expect(f.service.validate(f.identity, f.input)).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  await expect(f.service.create(f.identity, f.input)).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  expect(f.lease.execute).not.toHaveBeenCalled();
  expect(
    (await db.query("SELECT count(*)::int AS total FROM persona_pdf_job_v2")).rows[0].total,
  ).toBe(0);
});

it("locates a lost response by requestId without recapture and isolates other connections", async () => {
  const f = applicationFixture();
  const created = await f.service.create(f.identity, f.input);
  expect(await f.service.locate(f.identity, { requestId: f.input.requestId })).toMatchObject({
    jobId: created.jobId,
    state: "captured",
  });
  await expect(
    f.service.locate({ ...f.identity, tokenId: randomUUID() }, { requestId: f.input.requestId }),
  ).rejects.toMatchObject({ code: "ATTACHMENT_UNAVAILABLE" });
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
  expect(f.renderer.render).not.toHaveBeenCalled();
});

it("filters unauthorized jobs before pagination without reading files or leaking counts", async () => {
  const first = applicationFixture(),
    hidden = applicationFixture();
  const firstJob = await first.service.create(first.identity, first.input);
  await first.service.cancel(first.identity, { jobId: firstJob.jobId });
  const hiddenJob = await hidden.service.create(hidden.identity, hidden.input);
  await hidden.service.cancel(hidden.identity, { jobId: hiddenJob.jobId });
  first.catalog.query.mockImplementation(async (...args: unknown[]) => {
    if ((args[1] as { skillIds: string[] }).skillIds.includes(hidden.input.query.skillIds[0]!))
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "fixture");
    return first.evidence;
  });
  const read = vi.spyOn(first.attachments, "read");
  const page = await first.service.list(first.identity, { page: 1, pageSize: 1 });
  expect(page).toMatchObject({
    items: [{ jobId: firstJob.jobId, state: "cancelled" }],
    pagination: { hasNextPage: false },
  });
  expect(JSON.stringify(page)).not.toContain(hiddenJob.jobId as string);
  expect(page).not.toHaveProperty("totalCount");
  expect(await first.service.list({ ...first.identity, tokenId: randomUUID() }, {})).toMatchObject({
    items: [],
  });
  expect(read).not.toHaveBeenCalled();
  expect(first.lease.execute).toHaveBeenCalledTimes(1);
});

it("preserves the primary supportId when storing capture failure also fails", async () => {
  const f = applicationFixture();
  f.lease.execute.mockRejectedValue(new PersonaV2Error("INVALID_PLAN", "secret primary SQL"));
  const persist = vi
    .spyOn(PostgresPdfReportJobs.prototype, "failCapture")
    .mockRejectedValue(new Error("secret storage password"));
  try {
    const failed = await f.service.create(f.identity, f.input);
    expect(failed).toMatchObject({
      state: "capture_unconfirmed",
      errorCode: "INVALID_PLAN",
      diagnosticPersisted: false,
    });
    const logs = f.logs.map((line) => JSON.parse(line));
    expect(logs.filter((entry) => entry.supportId === failed.supportId)).toHaveLength(2);
    expect(JSON.stringify(logs)).not.toMatch(/secret|password|primary SQL/);
    expect(JSON.stringify(failed)).not.toMatch(/secret|password|primary SQL/);
    await f.service.create(f.identity, f.input);
    expect(f.lease.execute).toHaveBeenCalledTimes(1);
  } finally {
    persist.mockRestore();
  }
});

it("preserves cancelled status without file data and revalidates current authority", async () => {
  const f = applicationFixture();
  const created = await f.service.create(f.identity, f.input);
  await f.service.processOnce();
  await f.service.cancel(f.identity, { jobId: created.jobId });
  expect(await f.service.status(f.identity, { jobId: created.jobId })).toMatchObject({
    state: "cancelled",
  });
  expect(await f.service.create(f.identity, f.input)).toMatchObject({ state: "cancelled" });
  const row = (
    await db.query("SELECT result_enc,payload_enc FROM persona_pdf_job_v2 WHERE id=$1", [
      created.jobId,
    ])
  ).rows[0];
  expect(row.payload_enc).toBeNull();
  const result = JSON.parse(crypto.decrypt(row.result_enc));
  expect(Object.keys(result).sort()).toEqual(["publicationId", "skillId", "sourceId"]);
  f.catalog.query.mockRejectedValue(
    new PersonaV2Error("AUTHORIZATION_DENIED", "Fixture revocation"),
  );
  await expect(f.service.cancel(f.identity, { jobId: created.jobId })).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
});

it("reports cancellation winning against an in-flight capture without reopening the job", async () => {
  const f = applicationFixture();
  f.lease.execute.mockImplementation(async () => {
    const row = (await db.query("SELECT id FROM persona_pdf_job_v2 WHERE state='collecting'"))
      .rows[0];
    await f.service.cancel(f.identity, { jobId: row.id });
    return { columns: ["id", "amount"], rows: [{ id: 1, amount: "10.25" }], truncated: false };
  });
  expect(await f.service.create(f.identity, f.input)).toMatchObject({ state: "cancelled" });
  expect(await f.service.create(f.identity, f.input)).toMatchObject({ state: "cancelled" });
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
  expect(f.renderer.render).not.toHaveBeenCalled();
});

it("preserves closed failure diagnostics on later status calls without SQL or values", async () => {
  const f = applicationFixture();
  f.lease.execute.mockRejectedValue(new PersonaV2Error("INVALID_PLAN", "secret SQL value"));
  const failed = await f.service.create(f.identity, f.input);
  expect(await f.service.status(f.identity, { jobId: failed.jobId })).toMatchObject({
    errorCode: "INVALID_PLAN",
    supportId: failed.supportId,
  });
  const row = (
    await db.query("SELECT result_enc FROM persona_pdf_job_v2 WHERE id=$1", [failed.jobId])
  ).rows[0];
  expect(crypto.decrypt(row.result_enc)).not.toMatch(/secret|SQL value/);
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
});

it("bounds combined response bytes independently from the final PDF budget", async () => {
  const control = applicationFixture(false, true);
  const first = await control.service.create(control.identity, control.input);
  const row = (
    await db.query("SELECT payload_enc FROM persona_pdf_job_v2 WHERE id=$1", [first.jobId])
  ).rows[0];
  const bytes = Buffer.byteLength(
    JSON.stringify(JSON.parse(crypto.decrypt(row.payload_enc)).response),
  );
  await control.service.cancel(control.identity, { jobId: first.jobId });
  const f = applicationFixture(false, true);
  const query = { ...f.input.query, options: { maxBytes: bytes + 100 } };
  const request = {
    ...f.input,
    query,
    consistency: "successive_reads",
    additionalSections: [{ query, scope: f.input.scope, layout: f.input.layout }],
  };
  const failed = await f.service.create(f.identity, request);
  expect(failed).toMatchObject({ state: "capture_unconfirmed", errorCode: "BUDGET_EXCEEDED" });
  expect(f.renderer.render).not.toHaveBeenCalled();
  const calls = f.lease.execute.mock.calls.length;
  await f.service.create(f.identity, request);
  expect(f.lease.execute).toHaveBeenCalledTimes(calls);
});

it("applies the smallest requested row ceiling to all sections together", async () => {
  const f = applicationFixture(false, true);
  const request = {
    ...f.input,
    scope: "limitado",
    consistency: "successive_reads",
    additionalSections: [
      {
        query: { ...f.input.query, options: { maxRows: 1 } },
        scope: "limitado",
        layout: f.input.layout,
      },
    ],
  };
  const result = await f.service.create(f.identity, request);
  expect(result).toMatchObject({ state: "capture_unconfirmed", errorCode: "BUDGET_EXCEEDED" });
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
  expect(f.renderer.render).not.toHaveBeenCalled();
  await f.service.create(f.identity, request);
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
});

it("renders two sections once and denies the whole download if the second publication is revoked", async () => {
  const f = applicationFixture(false, true);
  const secondSkill = randomUUID(),
    secondPublication = randomUUID();
  const other = {
    ...f.evidence,
    publications: [{ ...f.evidence.publications[0]!, id: secondPublication, skillId: secondSkill }],
  };
  f.catalog.query.mockImplementation(async (...args: unknown[]) =>
    (args[1] as { skillIds: string[] }).skillIds.includes(secondSkill) ? other : f.evidence,
  );
  const section = {
    query: { ...f.input.query, skillIds: [secondSkill], params: { minimum: 10 } },
    scope: f.input.scope,
    layout: f.input.layout,
  };
  const input = { ...f.input, additionalSections: [section], consistency: "successive_reads" };
  const created = await f.service.create(f.identity, input);
  await f.service.processOnce();
  const ready = await f.service.status(f.identity, { jobId: created.jobId });
  expect(ready.state).toBe("ready");
  expect(ready.consistency).toBe("successive_reads");
  expect(f.lease.execute).toHaveBeenCalledTimes(2);
  const descriptor = ready.descriptor as {
    handle: string;
    pdfSections: unknown[];
    consistency: string;
  };
  expect(descriptor.pdfSections).toHaveLength(2);
  expect(descriptor.consistency).toBe("successive_reads");
  expect((await f.service.create(f.identity, input)).descriptor).toEqual(descriptor);
  expect(f.lease.execute).toHaveBeenCalledTimes(2);
  f.catalog.revalidateQuery.mockImplementation(async (...args: unknown[]) => {
    if ((args[1] as typeof f.evidence).publications[0]!.id === secondPublication)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fixture revocation");
  });
  await expect(f.attachments.read(f.identity, descriptor.handle)).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  expect(f.lease.execute).toHaveBeenCalledTimes(2);
});

it("stops before the next section after revocation and never resumes an uncertain capture", async () => {
  const f = applicationFixture(false, true);
  const input = {
    ...f.input,
    consistency: "successive_reads",
    additionalSections: [{ query: f.input.query, scope: f.input.scope, layout: f.input.layout }],
  };
  f.catalog.revalidateQuery.mockImplementation(async () => {
    if (f.lease.execute.mock.calls.length)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fixture revocation");
  });
  const failed = await f.service.create(f.identity, input);
  expect(failed.state).toBe("capture_unconfirmed");
  expect(failed.supportId).toEqual(expect.any(String));
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
  await expect(f.service.create(f.identity, input)).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  await expect(f.service.status(f.identity, { jobId: failed.jobId })).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  expect(
    (await db.query("SELECT support_id FROM persona_pdf_job_v2 WHERE id=$1", [failed.jobId]))
      .rows[0].support_id,
  ).toBe(failed.supportId);
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
  expect(f.renderer.render).not.toHaveBeenCalled();
});

it("refuses unpublished chart IDs before SQL and renders authorized charts from the sealed capture", async () => {
  const denied = applicationFixture();
  await expect(
    denied.service.create(denied.identity, {
      ...denied.input,
      layout: { ...denied.input.layout, chartId: "amounts" },
    }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  expect(denied.lease.execute).not.toHaveBeenCalled();
  const allowed = applicationFixture(true);
  const request = { ...allowed.input, layout: { ...allowed.input.layout, chartId: "amounts" } };
  const created = await allowed.service.create(allowed.identity, request);
  await allowed.service.processOnce();
  const ready = await allowed.service.status(allowed.identity, { jobId: created.jobId });
  expect(ready.state).toBe("ready");
  expect(allowed.renderer.render.mock.calls[0]![0]).toMatchObject({
    rows: [["1", "10.25"]],
    chart: { kind: "bar", categoryIndex: 0, valueIndex: 1, unit: "BRL" },
  });
  expect((await allowed.service.create(allowed.identity, request)).descriptor).toEqual(
    ready.descriptor,
  );
  expect(allowed.lease.execute).toHaveBeenCalledTimes(1);
});

it("captures once, renders a real PDF and recovers the same handle without another SELECT", async () => {
  const f = applicationFixture();
  const created = await f.service.create(f.identity, f.input);
  expect(created.state).toBe("captured");
  await f.service.processOnce();
  const ready = await f.service.status(f.identity, { jobId: created.jobId });
  expect(ready.state).toBe("ready");
  const descriptor = ready.descriptor as { handle: string; format: string };
  expect(descriptor.format).toBe("pdf");
  const downloaded = await f.attachments.read(f.identity, descriptor.handle);
  expect(Buffer.from(downloaded.data).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await f.service.create(f.identity, f.input)).descriptor).toEqual(ready.descriptor);
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
  expect(f.renderer.render).toHaveBeenCalledTimes(1);
  expect(f.renderer.render.mock.calls[0]![0]).toMatchObject({
    formats: ["text", "currency"],
    rows: [["1", "10.25"]],
  });
  await f.service.cancel(f.identity, { jobId: created.jobId });
  await expect(f.attachments.read(f.identity, descriptor.handle)).rejects.toMatchObject({
    code: "ATTACHMENT_UNAVAILABLE",
  });
});

it("revocation after sealing does not misclassify a confirmed capture or repeat SQL", async () => {
  const f = applicationFixture();
  const evidence = await f.catalog.query();
  f.catalog.query
    .mockResolvedValueOnce(evidence)
    .mockResolvedValueOnce(evidence)
    .mockRejectedValue(new PersonaV2Error("AUTHORIZATION_DENIED", "revoked"));
  await expect(f.service.create(f.identity, f.input)).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  const row = (await db.query("SELECT state FROM persona_pdf_job_v2")).rows[0];
  expect(row.state).toBe("captured");
  expect(f.logs).toHaveLength(0);
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
});

it("uncertain capture retains safe supportId in the real logger and never retries", async () => {
  const f = applicationFixture();
  f.lease.execute.mockRejectedValue(new Error("SELECT private password=synthetic-secret"));
  const result = await f.service.create(f.identity, f.input);
  expect(result).toMatchObject({
    state: "capture_unconfirmed",
    supportId: expect.any(String),
    replayAllowed: false,
  });
  const repeated = await f.service.create(f.identity, f.input);
  expect(repeated.supportId).toBe(result.supportId);
  const cancelled = await f.service.cancel(f.identity, { jobId: result.jobId });
  expect(cancelled.state).toBe("capture_unconfirmed");
  expect(cancelled.supportId).toBe(result.supportId);
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
  expect(f.logs.join("")).toContain(String(result.supportId));
  expect(f.logs.join("")).not.toMatch(/SELECT|password|synthetic-secret/);
  expect(await jobs().claimRender()).toBeNull();
});

it("refresh preserves request idempotency and the original access deadline", async () => {
  const f = applicationFixture();
  const deadline = Date.now() + 45000;
  const identity = { ...f.identity, grant: { id: randomUUID(), expiresAt: deadline } };
  const first = await f.service.create(identity, f.input);
  const refreshed = await f.service.create(
    { ...identity, grant: { ...identity.grant, expiresAt: deadline + 600000 } },
    f.input,
  );
  expect(refreshed.jobId).toBe(first.jobId);
  expect(Date.parse(String(refreshed.artifactExpiresAt))).toBe(deadline);
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
});

it("refuses non-scalar cells rather than producing misleading text", async () => {
  const f = applicationFixture();
  f.lease.execute.mockResolvedValue({
    columns: ["id", "amount"],
    rows: [{ id: 1, amount: { secret: "synthetic-private" } }],
    truncated: false,
  });
  const created = await f.service.create(f.identity, f.input);
  await f.service.processOnce();
  // Existing query transport already refuses objects before sealing; preserve that guard.
  expect((await f.service.status(f.identity, { jobId: created.jobId })).state).toBe(
    "capture_unconfirmed",
  );
  expect(f.renderer.render).not.toHaveBeenCalled();
  expect(f.logs.join("")).not.toContain("synthetic-private");
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
});

it("refuses incomplete integral capture without generating a partial substitute", async () => {
  const f = applicationFixture();
  f.lease.execute.mockResolvedValue({
    columns: ["id", "amount"],
    rows: [{ id: 1, amount: "1.00" }],
    truncated: true,
  });
  const result = await f.service.create(f.identity, f.input);
  expect(result.errorCode).toBe("INCOMPLETE_INPUT");
  await f.service.processOnce();
  expect(f.renderer.render).not.toHaveBeenCalled();
  expect(f.lease.execute).toHaveBeenCalledTimes(1);
});

it("bounds permanent metadata per persona without consuming another persona's quota", async () => {
  await db.query(`CREATE FUNCTION pg_temp.seed_pdf_metadata(p uuid,t uuid,c text) RETURNS void LANGUAGE plpgsql AS $$
    DECLARE i integer; marker uuid;
    BEGIN FOR i IN 1..1000 LOOP
      marker:=gen_random_uuid();
      INSERT INTO persona_pdf_job_v2(id,persona_id,token_id,namespace,scope_hash,request_hash,request_fingerprint,
        request_key_enc,state,created_at,work_deadline,artifact_expires_at,payload_enc)
        VALUES(marker,p,t,repeat('a',64),repeat('b',64),lpad(to_hex(i),64,'0'),repeat('c',64),c,
        'accepted',clock_timestamp(),clock_timestamp()+interval '30 seconds',clock_timestamp()+interval '1 minute',c);
      UPDATE persona_pdf_job_v2 SET state='cancelled',payload_enc=NULL,request_key_enc=NULL WHERE id=marker;
    END LOOP; END $$`);
  await db.query("SELECT pg_temp.seed_pdf_metadata($1,$2,$3)", [
    persona,
    token,
    crypto.encrypt("synthetic"),
  ]);
  await expect(jobs().admit(request())).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  const otherPersona = randomUUID(),
    otherToken = randomUUID();
  await db.query(
    "INSERT INTO persona(id,responsavel_id,nome,especialidade) SELECT $1,responsavel_id,'Other fixture','Synthetic' FROM persona WHERE id=$2",
    [otherPersona, persona],
  );
  await db.query(
    "INSERT INTO persona_token(id,persona_id,nome,token_hash,permissoes,delegacao) VALUES($1,$2,'Fixture',$3,'{}','{}')",
    [otherToken, otherPersona, crypto.sha256Hex(randomUUID())],
  );
  expect(
    (
      await jobs().admit({
        ...request(),
        personaId: otherPersona,
        tokenId: otherToken,
        binding: "other fixture",
      })
    ).created,
  ).toBe(true);
});

it.each(["bearer", "oauth"] as const)(
  "downloads generated PDF over authenticated HTTP and denies revocation (%s)",
  async (mode) => {
    const f = applicationFixture();
    const identity =
      mode === "oauth"
        ? { ...f.identity, grant: { id: randomUUID(), expiresAt: Date.now() + 600000 } }
        : f.identity;
    const created = await f.service.create(identity, f.input);
    await f.service.processOnce();
    const ready = await f.service.status(identity, { jobId: created.jobId });
    const descriptor = ready.descriptor as { handle: string; bytes: number; downloadPath: string };
    const app = express();
    const authenticate = vi.fn(async () => identity);
    registerPersonaAttachmentRoutes(app, {
      publicBaseUrl: origin,
      attachments: f.attachments,
      catalog: { authenticate },
      oauth: { resolve: authenticate },
    } as unknown as Parameters<typeof registerPersonaAttachmentRoutes>[1]);
    const download = () =>
      httpRequest(app)
        .get(descriptor.downloadPath)
        .set("Host", "pdf.fixture.test")
        .set("Authorization", "Bearer synthetic");
    const before = f.lease.execute.mock.calls.length;
    const response = await download().expect(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(Buffer.from(response.body).byteLength).toBe(descriptor.bytes);
    expect(Buffer.from(response.body).subarray(0, 5).toString()).toBe("%PDF-");
    f.catalog.revalidateQuery.mockRejectedValue(
      new PersonaV2Error("AUTHORIZATION_DENIED", "synthetic private revocation"),
    );
    const denied = await download().expect(403);
    expect(denied.body.error.supportId).toEqual(expect.any(String));
    expect(denied.headers["www-authenticate"]).toBeUndefined();
    expect(JSON.stringify(denied.body)).not.toContain("synthetic private revocation");
    expect(f.lease.execute).toHaveBeenCalledTimes(before);
  },
);

it("cleans expired captures in the maintenance worker even without PDF generation enabled", async () => {
  const input = { ...request(), timeoutMs: 100 };
  const { row } = await jobs().admit(input);
  await jobs().startCapture(row.id, input.binding);
  await db.query("SELECT pg_sleep(0.15)");
  const logger = new PinoLoggerAdapter(pino({ level: "silent" }));
  const worker = createPersonaWorker(db, crypto, logger, undefined, origin);
  try {
    await worker.tick();
  } finally {
    await worker.stop();
  }
  const expired = (await jobs().get(row.id, input.binding))!;
  expect(expired.state).toBe("capture_unconfirmed");
  expect(expired.payload_enc).toBeNull();
  expect((await jobs().admit(input)).created).toBe(false);
});

it("rewraps captured job without changing deadline, binding or idempotency", async () => {
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='persona_v2_vault_operator') THEN CREATE ROLE persona_v2_vault_operator NOLOGIN; END IF; END $$",
  );
  const input = request();
  const { row } = await jobs().admit(input);
  await jobs().startCapture(row.id, input.binding);
  await jobs().sealCapture(row.id, input.binding, "private synthetic capture");
  const rotated = new NodeCryptoAdapter("b".repeat(64), "rotated", { initial: "a".repeat(64) });
  const rotation = new PersonaVaultRotation(
    new PostgresPersonaVaultRotationStore(url.toString()),
    rotated,
  );
  expect(
    await rotation.run({ apply: true, keyId: "rotated", confirmDatabase: name }),
  ).toMatchObject({ status: "completed" });
  const recovered = new PostgresPdfReportJobs(
    second,
    new NodeCryptoAdapter("b".repeat(64), "rotated"),
    origin,
  );
  const after = (await recovered.get(row.id, input.binding))!;
  expect(recovered.decode(after)).toBe("private synthetic capture");
  expect(after.work_deadline).toEqual(row.work_deadline);
  expect(after.artifact_expires_at).toEqual(row.artifact_expires_at);
  expect((await recovered.admit(input)).created).toBe(false);
  expect(await recovered.get(row.id, "other binding")).toBeNull();
});
