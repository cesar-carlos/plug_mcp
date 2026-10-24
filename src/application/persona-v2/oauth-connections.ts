import { z } from "zod";
import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { PersonaOAuthConnectionPage } from "../../domain/persona-v2/oauth-connections.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { PersonaAdministration } from "./administration.js";
const revokeSchema = z.strictObject({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  confirmed: z.literal(true),
});
export class PersonaOAuthConnections {
  constructor(
    private readonly services: PersonaServices,
    private readonly administration: PersonaAdministration,
  ) {}
  private async owned<T>(
    sessionId: string,
    personaId: string,
    action: (tx: PersonaTransaction) => Promise<T>,
    tokenIds: readonly string[] = [],
  ) {
    z.uuid().parse(personaId);
    const session = await this.administration.validateSession(sessionId);
    return this.services.repository.transaction(
      { personaIds: [personaId], tokenIds },
      async (tx) => {
        if ((await tx.findPersona(personaId))?.ownerId !== session.owner.id)
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Persona indisponível para este responsável.",
          );
        if (!tx.oauthConnections)
          throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Gestão OAuth indisponível.");
        await tx.setAdministrativeActor(session.owner.id);
        return action(tx);
      },
      () => {
        if (session.expiresAt <= this.services.now())
          throw new PersonaV2Error("ADMIN_SESSION_EXPIRED", "Sessão administrativa expirada.");
        return Promise.resolve();
      },
    );
  }
  list(session: string, persona: string, after?: string): Promise<PersonaOAuthConnectionPage> {
    if (after !== undefined) z.uuid().parse(after);
    return this.owned(session, persona, (tx) => tx.oauthConnections!.list(persona, after));
  }
  async revoke(
    session: string,
    persona: string,
    connectionId: string,
    raw: unknown,
  ): Promise<{ id: string; status: "revoked"; revokedAt: string }> {
    z.uuid().parse(connectionId);
    const input = revokeSchema.parse(raw);
    const connection = await this.owned(session, persona, (tx) =>
      tx.oauthConnections!.find(persona, connectionId),
    );
    if (!connection)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Conexão indisponível nesta persona.");
    return this.owned(
      session,
      persona,
      (tx) => tx.oauthConnections!.revoke(persona, connectionId, input.fingerprint),
      [connection.tokenId],
    );
  }
}
