import type { ExternalConnection } from "../persona-v2/external-contract.js";
import type { ExternalToolCatalog } from "../persona-v2/external-import.js";
export interface ExternalDiscoveryTransport {
  discover(
    connection: ExternalConnection,
    signal: AbortSignal,
    beforeDispatch: () => Promise<void>,
  ): Promise<ExternalToolCatalog>;
}
