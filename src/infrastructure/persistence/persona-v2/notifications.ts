import type pg from "pg";
import { randomUUID } from "node:crypto";
import type {
  NotificationConfiguration,
  NotificationDelivery,
  NotificationDeliveryPage,
  PersonaNotificationTransaction,
} from "../../../domain/persona-v2/notifications.js";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";

export class PostgresPersonaNotifications implements PersonaNotificationTransaction {
  constructor(private readonly db: pg.PoolClient) {}
  async status(personaId: string): Promise<NotificationConfiguration> {
    const row = (
      await this.db.query<NotificationConfiguration>(
        "SELECT version,active,events,true AS configured FROM persona_notification_endpoint_v2 WHERE persona_id=$1",
        [personaId],
      )
    ).rows[0];
    return row ?? { version: 0, active: false, events: [], configured: false };
  }
  async configure(
    personaId: string,
    ownerId: string,
    input: Parameters<PersonaNotificationTransaction["configure"]>[2],
  ): Promise<NotificationConfiguration> {
    const current = await this.status(personaId);
    if (current.version !== input.expectedVersion || (!current.configured && !input.active))
      throw new PersonaV2Error(
        "OPERATION_CONFLICT",
        "Configuração mudou ou ainda não existe. Recarregue.",
      );
    const result = input.active
      ? await this.db.query(
          `INSERT INTO persona_notification_endpoint_v2(persona_id,owner_id,version,active,events,destino_enc,segredo_enc)
          VALUES($1,$2,1,true,$3,$4,$5) ON CONFLICT(persona_id) DO UPDATE
          SET version=persona_notification_endpoint_v2.version+1,active=true,events=$3,destino_enc=$4,segredo_enc=$5
          WHERE persona_notification_endpoint_v2.version=$6 RETURNING version`,
          [
            personaId,
            ownerId,
            input.events,
            input.destinationEnc,
            input.secretEnc,
            input.expectedVersion,
          ],
        )
      : await this.db.query(
          "UPDATE persona_notification_endpoint_v2 SET version=version+1,active=false,events=$3 WHERE persona_id=$1 AND version=$2 RETURNING version",
          [personaId, input.expectedVersion, input.events],
        );
    if (result.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Configuração mudou. Recarregue.");
    await this.db.query(
      "UPDATE outbox_v2 SET estado='dead_letter',failure_code='subscription_changed',lease_owner=NULL,lease_until=NULL WHERE persona_id=$1 AND notification_version IS NOT NULL AND estado='pendente'",
      [personaId],
    );
    await this.db.query(
      "INSERT INTO audit_v2(id,persona_id,evento,origem,sucesso,previous_version,resource_version) VALUES($1,$2,'notification.configured','admin',true,$3,$4)",
      [randomUUID(), personaId, input.expectedVersion || null, input.expectedVersion + 1],
    );
    return this.status(personaId);
  }
  async deliveries(personaId: string, after?: string): Promise<NotificationDeliveryPage> {
    const rows = await this.db.query<NotificationDelivery>(
      `SELECT id,evento AS event,estado AS state,tentativas AS attempts,created_at AS "createdAt",delivered_at AS "deliveredAt",failure_code AS failure
       FROM outbox_v2 WHERE persona_id=$1 AND notification_version IS NOT NULL
       AND ($2::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM outbox_v2 WHERE id=$2 AND persona_id=$1 AND notification_version IS NOT NULL))
       ORDER BY created_at DESC,id DESC LIMIT 21`,
      [personaId, after ?? null],
    );
    return {
      items: rows.rows.slice(0, 20),
      nextCursor: rows.rows.length > 20 ? rows.rows[19]!.id : null,
    };
  }
}
