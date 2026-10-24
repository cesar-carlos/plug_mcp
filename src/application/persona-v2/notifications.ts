import { z } from "zod";
import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { PersonaNotificationTransport } from "../../domain/ports/persona-outbox.port.js";
import { notificationConfigurationSchema } from "../../domain/persona-v2/notifications.js";
import type {
  NotificationConfiguration,
  NotificationDeliveryPage,
} from "../../domain/persona-v2/notifications.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { PersonaAdministration } from "./administration.js";

export class PersonaNotifications {
  constructor(
    private readonly services: PersonaServices,
    private readonly administration: PersonaAdministration,
    private readonly transport: PersonaNotificationTransport,
  ) {}
  private async owned<T>(
    sessionId: string,
    personaId: string,
    action: (tx: PersonaTransaction) => Promise<T>,
  ) {
    z.uuid().parse(personaId);
    const session = await this.administration.validateSession(sessionId);
    return this.services.repository.transaction(
      { personaIds: [personaId], tokenIds: [] },
      async (tx) => {
        const persona = await tx.findPersona(personaId);
        if (persona?.ownerId !== session.owner.id)
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Persona indisponível para este responsável.",
          );
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
  status(session: string, persona: string): Promise<NotificationConfiguration> {
    return this.owned(session, persona, (tx) => tx.notifications!.status(persona));
  }
  deliveries(session: string, persona: string, after?: string): Promise<NotificationDeliveryPage> {
    if (after !== undefined) z.uuid().parse(after);
    return this.owned(session, persona, (tx) => tx.notifications!.deliveries(persona, after));
  }
  async configure(
    session: string,
    persona: string,
    raw: unknown,
  ): Promise<NotificationConfiguration> {
    const input = notificationConfigurationSchema.parse(raw);
    // Ownership is checked before DNS, then identity is revalidated outside the commit transaction.
    await this.status(session, persona);
    if (input.active) await this.transport.validate(input.destination!);
    return this.owned(session, persona, async (tx) => {
      const p = await tx.findPersona(persona);
      if (input.active && !p?.active)
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Persona suspensa.");
      return tx.notifications!.configure(persona, p!.ownerId, {
        expectedVersion: input.expectedVersion,
        active: input.active,
        events: input.events,
        ...(input.active
          ? {
              destinationEnc: this.services.crypto.encrypt(input.destination!),
              secretEnc: this.services.crypto.encrypt(input.secret!),
            }
          : {}),
      });
    });
  }
}
