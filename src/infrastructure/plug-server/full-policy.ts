import { z } from "zod";
import type { ClientTokenPolicy } from "../../domain/ports/plug-server-gateway.port.js";

const normalizeResource = (name: string): string =>
  name
    .toLowerCase()
    .replaceAll("[", "")
    .replaceAll("]", "")
    .replace(/["`\s]/g, "");

/** Exact names are required for structural dependencies; fallback is explicit for older paths. */
export const policyAllowsResource = (
  policy: ClientTokenPolicy,
  resource: { name: string; type: "table" | "view" },
  permission: "read" | "update" | "delete",
  exactResources: boolean,
): boolean => {
  const full = policy.fullPolicy;
  if (!full || full.revoked) return false;
  if (policy.allTables || full.allViews)
    return (
      (resource.type === "table" ? policy.allTables : full.allViews) &&
      full.globalPermissions[permission]
    );
  const name = normalizeResource(resource.name);
  const rules = full.rules.filter((r) => {
    const candidate = normalizeResource(r.resource);
    return (
      (r.resourceType === "unknown" || r.resourceType === resource.type) &&
      (candidate === name ||
        (!exactResources && candidate.split(".").at(-1) === name.split(".").at(-1)))
    );
  });
  return (
    !rules.some((r) => r.effect === "deny" && r[permission]) &&
    rules.some((r) => r.effect === "allow" && r[permission])
  );
};

export const policyAllowsRead = (
  policy: ClientTokenPolicy,
  resource: { name: string; type: "table" | "view" },
  exactResources: boolean,
): boolean => policyAllowsResource(policy, resource, "read", exactResources);

const permissions = z.object({
  read: z.boolean(),
  update: z.boolean(),
  delete: z.boolean(),
  ddl: z.boolean(),
});
const full = z.object({
  all_tables: z.boolean(),
  all_views: z.boolean(),
  all_permissions: z.boolean(),
  is_revoked: z.boolean(),
  global_permissions: permissions,
  payload: z.record(z.string(), z.unknown()),
  rules: z.array(
    permissions.extend({
      resource_type: z.enum(["table", "view", "unknown"]),
      resource: z.string(),
      effect: z.enum(["allow", "deny"]),
    }),
  ),
});

/** An incomplete full policy stays unavailable; never infer write permission from an old allowlist. */
export const parseFullClientPolicy = (result: unknown): ClientTokenPolicy["fullPolicy"] => {
  const parsed = full.safeParse(result);
  if (!parsed.success) {
    return undefined;
  }
  const p = parsed.data;
  const database = p.payload.database;
  if (database !== undefined && (typeof database !== "string" || !database)) {
    return undefined;
  }
  return {
    allViews: p.all_views,
    allPermissions: p.all_permissions,
    revoked: p.is_revoked,
    database: typeof database === "string" ? database : null,
    globalPermissions: p.global_permissions,
    rules: p.rules.map((rule) => ({
      resourceType: rule.resource_type,
      resource: rule.resource,
      effect: rule.effect,
      read: rule.read,
      update: rule.update,
      delete: rule.delete,
      ddl: rule.ddl,
    })),
  };
};
