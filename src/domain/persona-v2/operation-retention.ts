/** Local control timestamps; no execution result is inferred from a missing payload/receipt. */
export interface OperationRetention {
  readonly terminalAt: string | null;
  readonly payloadPurgedAt: string | null;
  readonly receiptPurgedAt: string | null;
}
