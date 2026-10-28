import { TOKEN_JSON_BYTES } from "../../../src/domain/persona-v2/admin-request-limits";
import { issuanceExpiresAt } from "./access-workspace";
import { emptyTokenPermissions, type TokenPermissions } from "./token-permissions";

export interface TokenIssuanceBody {
  name: string;
  expiresAt: string | null;
  permissions: TokenPermissions;
  delegation: TokenPermissions;
}

export function tokenIssuanceBody(
  input: {
    name: string;
    noExpiry: boolean;
    days: number;
    canDelegate: boolean;
    permissions: TokenPermissions;
  },
  now: number,
): TokenIssuanceBody {
  return {
    name: input.name,
    expiresAt: issuanceExpiresAt(input.noExpiry, input.days, now),
    permissions: input.permissions,
    delegation: input.canDelegate ? input.permissions : emptyTokenPermissions(),
  };
}

export function tokenRequestSize(body: TokenIssuanceBody): {
  bytes: number;
  delegationBytes: number;
  percent: number;
  exceeded: boolean;
  nearLimit: boolean;
} {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(JSON.stringify(body)).byteLength;
  return {
    bytes,
    delegationBytes: encoder.encode(JSON.stringify(body.delegation)).byteLength,
    percent: Math.ceil((bytes * 100) / TOKEN_JSON_BYTES),
    exceeded: bytes > TOKEN_JSON_BYTES,
    nearLimit: bytes >= TOKEN_JSON_BYTES * 0.8,
  };
}
