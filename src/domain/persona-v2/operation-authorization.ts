import type { AuthorizationSnapshot, ConsumerIdentity, Source } from "./model.js";
import type { CryptoPort } from "../ports/crypto.port.js";
import { canonicalJson } from "./catalog.js";

/** Exact local authority; upstream Client/policy is revalidated by the gateway at dispatch. */
export const operationAuthorizationHash = (
  identity: ConsumerIdentity,
  state: AuthorizationSnapshot,
  publicationHash: string,
  source: Source,
  crypto: CryptoPort,
): string =>
  crypto.sha256Hex(
    canonicalJson({
      identity,
      ownerId: state.persona.ownerId,
      permissions: state.token.permissions,
      grantPermissions: state.grant?.permissions ?? null,
      publicationHash,
      source,
    }),
  );
