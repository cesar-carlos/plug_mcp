export interface OperationRetentionCounts {
  sqlPayloads: number;
  externalPayloads: number;
  sqlReceipts: number;
  externalReceipts: number;
}
export interface PersonaRetentionWorkerPort {
  claim(owner: string, now: Date, leaseUntil: Date): Promise<boolean>;
  process(owner: string, now: Date): Promise<OperationRetentionCounts>;
  release(owner: string): Promise<void>;
}
