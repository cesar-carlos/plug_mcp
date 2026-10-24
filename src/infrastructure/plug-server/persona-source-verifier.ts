import type { SourceVerificationPort } from "../../domain/ports/persona-v2.port.js";
import type { PlugServerGatewayPort } from "../../domain/ports/plug-server-gateway.port.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { requireDurableSource } from "../../domain/persona-v2/source-discovery.js";

export class PersonaSourceVerifier implements SourceVerificationPort {
  constructor(
    private readonly hub: Pick<
      PlugServerGatewayPort,
      "login" | "getAgentAccessStatus" | "getClientTokenPolicy" | "describeSource"
    >,
  ) {}
  async verify(
    input: Parameters<SourceVerificationPort["verify"]>[0],
  ): ReturnType<SourceVerificationPort["verify"]> {
    const tokens = await this.hub.login(input.email, input.password);
    const access = await this.hub.getAgentAccessStatus(tokens.accessToken, input.agentId);
    if (access.state !== "approved") {
      throw new PersonaV2Error(
        "AUTHORIZATION_DENIED",
        "ClientAgentAccess da fonte não está aprovado.",
      );
    }
    const policy = await this.hub.getClientTokenPolicy({
      accessToken: tokens.accessToken,
      agentId: input.agentId,
      clientToken: input.clientToken,
    });
    if (!policy.fullPolicy) {
      throw new PersonaV2Error(
        "CAPABILITY_UNAVAILABLE",
        "Policy completa da fonte não está disponível.",
      );
    }
    if (
      policy.fullPolicy.revoked ||
      (input.database !== undefined && policy.fullPolicy.database !== input.database)
    ) {
      throw new PersonaV2Error(
        "AUTHORIZATION_DENIED",
        "Token da fonte revogado ou banco incompatível.",
      );
    }
    const database = policy.fullPolicy.database;
    if (typeof database !== "string" || !database.trim() || database.length > 500) {
      throw new PersonaV2Error(
        "CAPABILITY_UNAVAILABLE",
        "O agente precisa informar uma base obrigatória na policy do CLIENT_TOKEN para cadastrar a fonte.",
      );
    }
    if (access.sourceIdentity !== 1)
      throw new PersonaV2Error(
        "CAPABILITY_UNAVAILABLE",
        "Agente sem verificação de identidade na conexão executora.",
      );
    if (!this.hub.describeSource)
      throw new PersonaV2Error(
        "CAPABILITY_UNAVAILABLE",
        "Identificação física indisponível no hub/agente.",
      );
    const proof = requireDurableSource(
      await this.hub.describeSource({
        accessToken: tokens.accessToken,
        agentId: input.agentId,
        clientToken: input.clientToken,
        database,
      }),
      { database, dialect: input.dialect },
    );
    return {
      database,
      dialect: proof.dialect,
      identityHash: proof.identityHash,
      verifiedAt: proof.verifiedAt,
    };
  }
}
