import type { ExternalAction } from "../persona-v2/external-action.js";
import type { OwnerApproval } from "../persona-v2/operation.js";
import type { ExternalReconciliation } from "../persona-v2/external-reconciliation.js";
export interface ExternalActionTransaction {
  find(personaId: string, operationId: string): Promise<ExternalAction | null>;
  list(personaId: string, afterId?: string): Promise<readonly ExternalAction[]>;
  insert(action: ExternalAction): Promise<void>;
  save(action: ExternalAction, expectedVersion: number): Promise<void>;
  approval(personaId: string, operationId: string): Promise<OwnerApproval | null>;
  approve(personaId: string, approval: OwnerApproval): Promise<void>;
  recordReconciliation(personaId: string, evidence: ExternalReconciliation): Promise<void>;
  latestReconciliation(
    personaId: string,
    operationId: string,
  ): Promise<ExternalReconciliation | null>;
}
