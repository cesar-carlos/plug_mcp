const reasons = new Set([
  "invalid_params",
  "invalid_request",
  "method_not_found",
  "parse_error",
  "internal_error",
  "missing_client_token",
  "invalid_signature",
  "authentication_failed",
  "invalid_payload",
]);
const errnos = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ECONNABORTED",
  "EPIPE",
]);
/** Positive allowlist: never copy upstream message, SQL, identifiers, payload or nested objects. */
export function safeErrorDetails(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const result: Record<string, string | number | boolean> = {};
  if (
    typeof raw.httpStatus === "number" &&
    Number.isInteger(raw.httpStatus) &&
    raw.httpStatus >= 100 &&
    raw.httpStatus <= 599
  )
    result.httpStatus = raw.httpStatus;
  if (raw.outcome_unknown === true) result.outcome_unknown = true;
  if (
    typeof raw.failureCode === "string" &&
    ["SOURCE_IDENTITY_MISMATCH", "SOURCE_STRUCTURE_MISMATCH"].includes(raw.failureCode)
  )
    result.failureCode = raw.failureCode;
  if (
    typeof raw.transportReason === "string" &&
    ["capacity", "timeout", "network", "invalid_response"].includes(raw.transportReason)
  ) {
    result.transportReason = raw.transportReason;
  }
  if (
    typeof raw.rpcCode === "number" &&
    Number.isSafeInteger(raw.rpcCode) &&
    raw.rpcCode >= -32768 &&
    raw.rpcCode <= -32000
  )
    result.rpcCode = raw.rpcCode;
  if (typeof raw.reason === "string" && reasons.has(raw.reason)) result.reason = raw.reason;
  if (typeof raw.errno === "string" && errnos.has(raw.errno)) result.errno = raw.errno;
  if (typeof raw.sqlstate === "string" && /^[0-9A-Z]{5}$/.test(raw.sqlstate))
    result.sqlstate = raw.sqlstate;
  return result;
}
