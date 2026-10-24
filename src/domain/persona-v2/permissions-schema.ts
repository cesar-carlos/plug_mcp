import { z } from "zod";
import type { Permissions } from "./model.js";
import { federationBudgetSchema } from "./federation-budget-schema.js";
import { queryLimitsSchema, operationLimitsSchema } from "./execution-limits.js";

export const permissionsSchema = z.strictObject({
  managedIntegrationIds: z.array(z.uuid()).max(1000).readonly().optional(),
  queryLimits: queryLimitsSchema.optional(),
  operationLimits: operationLimitsSchema.optional(),
  federationLimits: federationBudgetSchema.optional(),
  sourceIds: z.array(z.uuid()).max(1000),
  skills: z
    .array(
      z.strictObject({
        skillId: z.uuid(),
        queryLimits: queryLimitsSchema.optional(),
        operationLimits: operationLimitsSchema.optional(),
        federationLimits: federationBudgetSchema.optional(),
        capabilities: z.array(z.string().min(1).max(500)).max(5000),
        effects: z.array(z.enum(["select", "insert", "update", "delete"])).max(4),
        requireHumanApproval: z.boolean(),
      }),
    )
    .max(1000),
  externalOperationIds: z.array(z.uuid()).max(1000),
  administrative: z
    .array(
      z.enum([
        "treinar",
        "publicar",
        "gerenciar_fontes",
        "gerenciar_tokens",
        "gerenciar_integracoes",
      ]),
    )
    .max(5),
});

export const parsePermissions = (value: unknown): Permissions => permissionsSchema.parse(value);
