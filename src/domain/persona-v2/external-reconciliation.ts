import type { ExternalContract } from "./external-contract.js";

/** Provider evidence never replaces the technical receipt or makes an action executable. */
export interface ExternalReconciliation {
  readonly id: string;
  readonly operationId: string;
  readonly fingerprint: string;
  readonly publicationId: string;
  readonly contractHash: string;
  readonly observedAt: string;
  readonly status: "applied_verified" | "inconclusive";
  readonly reason:
    | "trained_evidence_matches"
    | "incomplete"
    | "not_unique"
    | "correlation_mismatch"
    | "outcome_unconfirmed"
    | "provider_unavailable";
  readonly responseHash: string | null;
  readonly permitsRetry: false;
}

export function classifyExternalEvidence(
  check: NonNullable<ExternalContract["reconciliationCheck"]>,
  original: Record<string, string | number | boolean>,
  data: Record<string, string | number | boolean>,
): Pick<ExternalReconciliation, "status" | "reason"> {
  const e = check.evidence;
  if (data[e.completeField] !== true) return { status: "inconclusive", reason: "incomplete" };
  if (data[e.countField] !== 1) return { status: "inconclusive", reason: "not_unique" };
  if (e.correlation.some((p) => data[p.outputField] !== original[p.inputField]))
    return { status: "inconclusive", reason: "correlation_mismatch" };
  if (data[e.statusField] !== e.appliedValue)
    return { status: "inconclusive", reason: "outcome_unconfirmed" };
  return { status: "applied_verified", reason: "trained_evidence_matches" };
}
