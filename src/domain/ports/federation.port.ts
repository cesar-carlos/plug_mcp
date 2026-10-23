import type { FederationPlan, LocalStep, LocalQueryResult } from "../persona-v2/federation.js";

export interface FederationGatewayPort {
  /** Must validate the complete plan against its immutable published contract and live grants. */
  authorize(plan: FederationPlan, signal?: AbortSignal): Promise<void>;
  /** Must use the normal read-only AST/package/privacy/policy gates. */
  query(
    step: LocalStep,
    limits: { maxRows: number; signal: AbortSignal },
  ): Promise<LocalQueryResult>;
}
