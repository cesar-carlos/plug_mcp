import type { Source } from "../../domain/persona-v2/model.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import {
  sourceDiscoverySchema,
  sourceIdentityMatches,
} from "../../domain/persona-v2/source-discovery.js";
import type { PlugServerGatewayPort } from "../../domain/ports/plug-server-gateway.port.js";
import type { SourceCredentialPort } from "../../domain/ports/source-credential.port.js";

/** A transport failure is not evidence of replacement. Only a valid, incompatible proof quarantines links. */
export async function verifySourceIdentity(
  hub: PlugServerGatewayPort,
  credentials: SourceCredentialPort,
  source: Source,
  carrier: { accessToken: string; clientToken: string },
): Promise<void> {
  if (!source.identityHash || !hub.describeSource)
    throw new PersonaV2Error(
      "CAPABILITY_UNAVAILABLE",
      "Fonte sem identificação física confirmada. Cadastre novamente com agente compatível.",
    );
  const proof = sourceDiscoverySchema.parse(
    await hub.describeSource({
      ...carrier,
      agentId: source.agentId,
      database: source.database,
    }),
  );
  if (!sourceIdentityMatches(source, proof)) {
    await credentials.invalidateIdentity?.(source);
    throw new PersonaV2Error(
      "STALE_AUTHORIZATION",
      "Identidade física ou dialeto da fonte mudou. Fonte suspensa; revisão e novo cadastro necessários.",
    );
  }
}
