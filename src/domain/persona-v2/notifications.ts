import { z } from "zod";

export const notificationEvents = [
  "knowledge.review_due",
  "sql.operation_state",
  "external.action_state",
] as const;
export type NotificationEvent = (typeof notificationEvents)[number];
export const OUTBOX_LIMITS = {
  batchSize: 10,
  maxAttempts: 10,
  lifetimeHours: 24,
  leaseSeconds: 30,
  timeoutMs: 5000,
  maxResponseBytes: 8192,
} as const;
export interface NotificationDeliveryPage {
  items: readonly NotificationDelivery[];
  nextCursor: string | null;
}
export interface OutboxCounts {
  claimed: number;
  delivered: number;
  failed: number;
  stale: number;
}
export const notificationConfigurationSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    active: z.boolean(),
    confirmed: z.literal(true),
    destination: z.string().max(2048).optional(),
    secret: z
      .string()
      .min(32)
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    events: z.array(z.enum(notificationEvents)).min(1).max(3),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.events).size !== v.events.length || (v.active && (!v.destination || !v.secret)))
      ctx.addIssue({
        code: "custom",
        message: "Destino, segredo e seleção explícita obrigatórios.",
      });
  });
export interface NotificationConfiguration {
  version: number;
  active: boolean;
  events: readonly NotificationEvent[];
  configured: boolean;
}
export interface NotificationDelivery {
  id: string;
  event: NotificationEvent;
  state: "pendente" | "entregue" | "dead_letter";
  attempts: number;
  createdAt: string;
  deliveredAt: string | null;
  failure: string | null;
}
export interface OutboxClaim {
  id: string;
  claim: string;
  body: string;
  destinationEnc: string;
  secretEnc: string;
  attempts: number;
}
export interface PersonaNotificationTransaction {
  status(personaId: string): Promise<NotificationConfiguration>;
  configure(
    personaId: string,
    ownerId: string,
    input: {
      expectedVersion: number;
      active: boolean;
      events: readonly NotificationEvent[];
      destinationEnc?: string;
      secretEnc?: string;
    },
  ): Promise<NotificationConfiguration>;
  deliveries(personaId: string, after?: string): Promise<NotificationDeliveryPage>;
}
