import { z } from "zod";
import { sourceRestrictionsSchema } from "../../domain/persona-v2/source-restrictions.js";

export const sourceRegistrationSchema = z.strictObject({
  name: z.string().min(1).max(200),
  purpose: z.string().min(1).max(5000),
  environment: z.string().min(1).max(100),
  agentId: z.uuid(),
  database: z.string().min(1).max(500).optional(),
  rowRestrictions: sourceRestrictionsSchema.default([]),
  dialect: z.enum(["postgres", "mssql", "sybase"]),
  email: z.email().max(320),
  password: z.string().min(1).max(1024),
  clientToken: z.string().min(1).max(8192),
});

export const sourceReplacementSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  source: sourceRegistrationSchema,
});
