import { z } from "zod";
import {
  fixtureTablesSchema,
  fixtureSeedsSchema,
} from "../../../domain/persona-v2/publication-fixture.js";
import { expectedStructureSchema } from "../../../domain/persona-v2/source-schema.js";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const operatorExpectationSchema = z.strictObject({
  revision: z.number().int().positive(),
  packageHash: hash,
  casesHash: hash,
  sourceId: z.uuid(),
  sourceFingerprint: hash,
});
export const operatorFixtureSchema = z
  .strictObject({
    runId: z.string().regex(/^se7e_persona_[a-f0-9]{12}_test$/),
    expiresAt: z.iso.datetime(),
    tables: fixtureTablesSchema,
    source: z.strictObject({
      id: z.uuid(),
      personaId: z.uuid(),
      physicalSourceId: z.uuid(),
      name: z.literal("Operator fixture"),
      purpose: z.literal("Synthetic publication cases"),
      environment: z.literal("test"),
      agentId: z.uuid(),
      database: z.string(),
      dialect: z.literal("mssql"),
      credentialId: z.uuid(),
      credentialVersion: z.literal(1),
      authorizationVersion: z.literal(1),
      active: z.literal(true),
      identityHash: hash,
      identityVerifiedAt: z.iso.datetime(),
      rowRestrictions: z.tuple([]),
    }),
  })
  .refine((x) => x.source.database === x.runId);
export const operatorStartSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("inspect"),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    personaId: z.uuid(),
    skillId: z.uuid(),
  }),
  z.strictObject({
    mode: z.literal("run"),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    personaId: z.uuid(),
    skillId: z.uuid(),
    expected: operatorExpectationSchema,
    fixture: operatorFixtureSchema,
  }),
]);
const resources = z
  .array(z.strictObject({ name: z.string().min(1).max(200), type: z.enum(["table", "view"]) }))
  .min(1)
  .max(100);
export const operatorCallSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("prepare"), seeds: fixtureSeedsSchema }),
  z.strictObject({ op: z.literal("clear") }),
  z.strictObject({
    op: z.literal("authorize"),
    resources,
    fences: z
      .strictObject({
        exactResources: z.literal(true),
        requireDatabase: z.literal(true),
        requireSchema: z.literal(true).optional(),
        requireConstraints: z.literal(true).optional(),
      })
      .optional(),
  }),
  z.strictObject({ op: z.literal("revalidate"), lease: z.uuid() }),
  z.strictObject({
    op: z.literal("execute"),
    lease: z.uuid(),
    sql: z.string().min(1).max(100000),
    params: z.record(z.string(), z.unknown()),
    options: z.strictObject({
      maxRows: z.number().int().min(1).max(101).optional(),
      timeoutMs: z.number().int().min(1).max(15000).optional(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(101).optional(),
    }),
    expectedStructure: expectedStructureSchema.optional(),
  }),
]);
export const operatorRequestSchema = z.strictObject({
  kind: z.literal("request"),
  id: z.number().int().positive().max(2000),
  call: operatorCallSchema,
});
export const operatorResponseSchema = z.strictObject({
  kind: z.literal("response"),
  id: z.number().int().positive().max(2000),
  ok: z.boolean(),
  value: z.unknown().optional(),
});

/** Liveness only while waiting to prepare the next synthetic case; never a result. */
export const operatorPrepareWaitSchema = z.strictObject({
  kind: z.literal("prepare-wait"),
  id: z.number().int().positive().max(2000),
  remainingMs: z.number().int().min(1).max(90000),
});
