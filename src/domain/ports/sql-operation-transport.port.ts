import type { ExpectedSource } from "../persona-v2/source-discovery.js";
import type { SqlOperationCommand } from "../persona-v2/operation.js";
export interface SqlOperationTransportPort {
  operationRpc(input: {
    accessToken: string;
    agentId: string;
    clientToken: string;
    sourcePhysicalId: string;
    expectedSource?: ExpectedSource;
    method: "sql.operation.execute" | "sql.operation.get" | "sql.operation.cancel";
    reference: { operationId: string; fingerprint: string; database: string };
    command?: SqlOperationCommand;
  }): Promise<unknown>;
}
