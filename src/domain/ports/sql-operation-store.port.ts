import type { ConsumerIdentity, Source } from "../persona-v2/model.js";
import type { OperationLimits } from "../persona-v2/execution-limits.js";
import type { OperationRetention } from "../persona-v2/operation-retention.js";
import type {
  OperationReceipt,
  OwnerApproval,
  PreparedOperation,
  SqlOperationCommand,
  OperationReconciliation,
  OperationReconciliationQuery,
} from "../persona-v2/operation.js";

/** Encrypted operational content is separate from audit metadata. */
export interface StoredSqlOperation extends PreparedOperation {
  readonly identity: ConsumerIdentity;
  readonly sourceId: string;
  readonly authorizationHash: string;
  readonly payloadEnc: string | null;
  readonly receipt: OperationReceipt | null;
  readonly reconciliation?: OperationReconciliation | null;
  readonly retention?: OperationRetention;
}

export interface SqlOperationAuthority {
  readonly limits?: OperationLimits;
  readonly ownerId: string;
  readonly source: Source;
  readonly authorizationHash: string;
  readonly requireHumanApproval: boolean;
  /** Compiles parameters against the immutable published contract; never accepts arbitrary SQL. */
  command(
    operationId: string,
    input: unknown,
    limits?: Partial<OperationLimits>,
  ): SqlOperationCommand;
  reconciliationQuery?(operationId: string): OperationReconciliationQuery;
}

export interface SqlOperationAuthorityPort {
  authorize(identity: ConsumerIdentity, publicationId: string): Promise<SqlOperationAuthority>;
}

export interface SqlOperationStoreTransaction {
  assertOwner(personaId: string, ownerId: string): Promise<void>;
  assertAuthorized(identity: ConsumerIdentity): Promise<void>;
  assertAuthority(operation: StoredSqlOperation): Promise<void>;
  list(personaId: string, afterId?: string): Promise<readonly StoredSqlOperation[]>;
  find(personaId: string, operationId: string): Promise<StoredSqlOperation | null>;
  insert(operation: StoredSqlOperation): Promise<void>;
  approval(personaId: string, operationId: string): Promise<OwnerApproval | null>;
  approve(personaId: string, approval: OwnerApproval): Promise<void>;
  /** CAS enforces one dispatch, including across replicas. */
  save(operation: StoredSqlOperation, expectedVersion: number): Promise<void>;
  invalidatePhysicalSource(personaId: string, sourceId: string): Promise<void>;
  /** Trusted structural refusal suspends only the exact shared publication; never its snapshot. */
  suspendStructuralPublication(operation: StoredSqlOperation): Promise<void>;
  recordReconciliation(
    operation: StoredSqlOperation,
    evidence: OperationReconciliation,
  ): Promise<void>;
}

export interface SqlOperationStorePort {
  /** Same persona/token lock order as authorization and revocation. No remote calls inside. */
  transaction<T>(
    identity: ConsumerIdentity,
    action: (tx: SqlOperationStoreTransaction) => Promise<T>,
  ): Promise<T>;
}
