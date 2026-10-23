import type pg from "pg";
import { suspendSourcePublications } from "./suspend-source-publications.js";
import type { Source } from "../../../domain/persona-v2/model.js";
import type {
  SourceCredential,
  SourceCredentialPort,
} from "../../../domain/ports/source-credential.port.js";

export class PostgresSourceCredentials implements SourceCredentialPort {
  constructor(private readonly pool: pg.Pool) {}
  async invalidateIdentity(source: Source): Promise<void> {
    const tx = await this.pool.connect();
    try {
      await tx.query("BEGIN");
      // Lock personas before business records, in the same order used by authorized mutations.
      const owners = await tx.query<{ persona_id: string }>(
        "SELECT DISTINCT persona_id FROM fonte WHERE fonte_fisica_id=$1 AND identity_hash=$2 AND ativa ORDER BY persona_id",
        [source.physicalSourceId, source.identityHash],
      );
      for (const owner of owners.rows)
        await tx.query("SELECT id FROM persona WHERE id=$1 FOR UPDATE", [owner.persona_id]);
      if (owners.rows.length) {
        const changed = await tx.query<{ id: string }>(
          "UPDATE fonte SET ativa=false,authorization_version=authorization_version+1 WHERE fonte_fisica_id=$1 AND identity_hash=$2 AND ativa AND persona_id=ANY($3::uuid[]) RETURNING id",
          [source.physicalSourceId, source.identityHash, owners.rows.map((r) => r.persona_id)],
        );
        if (changed.rows.length) {
          await tx.query("UPDATE fonte_fisica SET cache_revision=cache_revision+1 WHERE id=$1", [
            source.physicalSourceId,
          ]);
          await suspendSourcePublications(
            tx,
            changed.rows.map((r) => r.id),
            "source_identity_changed",
          );
        }
      }
      await tx.query("COMMIT");
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    } finally {
      tx.release();
    }
  }
  async find(personaId: string, credentialId: string): Promise<SourceCredential | null> {
    const result = await this.pool.query<{
      id: string;
      persona_id: string;
      versao: number;
      email_enc: string;
      senha_enc: string;
      client_token_enc: string;
    }>("SELECT * FROM fonte_credencial WHERE persona_id=$1 AND id=$2", [personaId, credentialId]);
    const r = result.rows[0];
    return r
      ? {
          id: r.id,
          personaId: r.persona_id,
          version: r.versao,
          emailEnc: r.email_enc,
          passwordEnc: r.senha_enc,
          clientTokenEnc: r.client_token_enc,
        }
      : null;
  }
}
