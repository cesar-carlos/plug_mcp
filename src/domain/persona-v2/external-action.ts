import type { ConsumerIdentity } from "./model.js";
import type { PreparedOperation } from "./operation.js";
import type { ExternalPackage } from "./external-contract.js";
import type { OperationRetention } from "./operation-retention.js";

export interface ExternalActionReceipt {
  readonly operationId: string;
  readonly fingerprint: string;
  readonly state: "concluida" | "resultado_desconhecido";
  readonly observedAt: string;
  readonly responseHash: string | null;
  readonly provesBusinessOutcome: false;
}
export interface ExternalAction extends PreparedOperation {
  readonly skillId: string;
  readonly integrationId: string;
  readonly identity: ConsumerIdentity;
  readonly authorizationHash: string;
  readonly payloadEnc: string | null;
  readonly resultEnc: string | null;
  readonly claimedAt: Date | null;
  readonly receipt: ExternalActionReceipt | null;
  readonly retention?: OperationRetention;
}
export interface ExternalActionPayload {
  readonly version: 1;
  readonly operationId: string;
  readonly personaId: string;
  readonly tokenId: string;
  readonly publicationId: string;
  readonly authorizationHash: string;
  readonly package: ExternalPackage;
  readonly input: Record<string, string | number | boolean>;
  readonly limits: { readonly maxBytes: number; readonly timeoutMs: number };
}
