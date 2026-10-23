import { expect, it } from "vitest";
import { parseFullClientPolicy } from "../../../src/infrastructure/plug-server/full-policy.js";

it("preserva banco, revogação, permissões e regras sem inferir escrita de policy incompleta", () => {
  const permissions = { read: true, update: false, delete: false, ddl: false };
  const policy = parseFullClientPolicy({
    all_tables: true,
    all_views: false,
    all_permissions: false,
    is_revoked: true,
    payload: { database: "fixture" },
    global_permissions: permissions,
    rules: [{ ...permissions, resource_type: "table", resource: "secret", effect: "deny" }],
  });
  expect(policy).toEqual({
    allViews: false,
    allPermissions: false,
    revoked: true,
    database: "fixture",
    globalPermissions: permissions,
    rules: [{ ...permissions, resourceType: "table", resource: "secret", effect: "deny" }],
  });
  expect(parseFullClientPolicy({ all_tables: true })).toBeUndefined();
});
