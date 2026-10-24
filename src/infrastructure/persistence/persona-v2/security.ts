import type pg from "pg";
import { randomUUID } from "node:crypto";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import type {
  OwnerDelegation,
  PersonaSetup,
  PersonaSecurityTransaction,
} from "../../../domain/ports/persona-security.port.js";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";
import { z } from "zod";
import { tokenIssuanceSchema } from "../../../domain/persona-v2/token-issuance.js";
import { integrationReferenceSchema } from "../../../domain/persona-v2/integration-credential.js";
import type { IntegrationReference } from "../../../domain/persona-v2/integration-credential.js";
const identitySchema = z.strictObject({
  personaId: z.uuid(),
  personaVersion: z.number().int().positive(),
  tokenId: z.uuid(),
  tokenVersion: z.number().int().positive(),
  grant: z.strictObject({ id: z.uuid(), expiresAt: z.number().optional() }).optional(),
});
const contextSchema = z.strictObject({
  identity: identitySchema,
  delegationVersion: z.number().int().positive(),
  hash: z.string(),
  purpose: z.enum([
    "source_create",
    "source_rotate",
    "token_rotate",
    "token_issue",
    "integration_create",
    "integration_rotate",
  ]),
  integration: integrationReferenceSchema.optional(),
  issuance: tokenIssuanceSchema.optional(),
  csrfHash: z.string(),
  expiresAt: z.iso.datetime(),
  sourceId: z.uuid().optional(),
  sourceVersion: z.number().int().positive().optional(),
});
export class PostgresPersonaSecurity implements PersonaSecurityTransaction {
  constructor(
    private readonly db: pg.PoolClient,
    private readonly crypto?: CryptoPort,
  ) {}
  async integration(personaId: string, id: string): Promise<IntegrationReference | null> {
    const r = await this.db.query(
      `SELECT id,nome AS name,tipo AS kind,destino AS destination,credencial_versao AS version
       FROM integracao WHERE persona_id=$1 AND id=$2 FOR UPDATE`,
      [personaId, id],
    );
    return r.rows[0] ? integrationReferenceSchema.parse(r.rows[0]) : null;
  }
  async saveIntegration(
    input: Parameters<PersonaSecurityTransaction["saveIntegration"]>[0],
  ): Promise<void> {
    if (!this.crypto) throw new Error("Security keyring required");
    const { personaId, id, expectedVersion, registration: r, credential } = input;
    const encrypted = this.crypto.encrypt(
      JSON.stringify({
        personaId,
        id,
        version: expectedVersion + 1,
        registration: r,
        credential,
      }),
    );
    const result =
      expectedVersion === 0
        ? await this.db.query(
            `INSERT INTO integracao(id,persona_id,tipo,nome,destino,credencial_enc,ativa)
        VALUES($1,$2,$3,$4,$5,$6,false) ON CONFLICT DO NOTHING`,
            [id, personaId, r.kind, r.name, r.destination, encrypted],
          )
        : await this.db.query(
            `UPDATE integracao SET credencial_enc=$3,credencial_versao=credencial_versao+1,versao_gestao=versao_gestao+1,ativa=false
        WHERE persona_id=$1 AND id=$2 AND credencial_versao=$4 AND nome=$5 AND tipo=$6 AND destino=$7`,
            [personaId, id, encrypted, expectedVersion, r.name, r.kind, r.destination],
          );
    if (result.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Integração alterada ou indisponível.");
    // Credential setup cannot publish or reactivate operations. Published
    // snapshots remain immutable; dispatch must honor these live state gates.
    await this.db.query(
      "UPDATE integracao_operacao SET ativa=false WHERE persona_id=$1 AND integracao_id=$2",
      [personaId, id],
    );
    await this.db.query(
      `INSERT INTO publicacao_suspensao(persona_id,publicacao_id,motivo) SELECT b.persona_id,b.publicacao_id,'integration_credential_rotated' FROM publicacao_integracao b JOIN integracao_operacao o ON o.persona_id=b.persona_id AND o.id=b.operacao_id WHERE o.persona_id=$1 AND o.integracao_id=$2 ON CONFLICT(publicacao_id) DO NOTHING`,
      [personaId, id],
    );
    await this.db.query(
      `INSERT INTO audit_v2(id,persona_id,integracao_id,evento,origem,sucesso,previous_version,resource_version)
      VALUES($1,$2,$3,$4,'admin',true,$5,$6)`,
      [
        randomUUID(),
        personaId,
        id,
        expectedVersion === 0 ? "integration.created" : "integration.credential_rotated",
        expectedVersion || null,
        expectedVersion + 1,
      ],
    );
  }
  async delegation(personaId: string): Promise<OwnerDelegation | null> {
    const r = await this.db.query<OwnerDelegation>(
      `SELECT persona_id AS "personaId",responsavel_id AS "ownerId",
      administrative,hub_id AS "hubId",credential_enc AS "credentialEnc",expires_at AS "expiresAt",version,revoked_at AS "revokedAt"
      FROM responsavel_delegacao_v2 WHERE persona_id=$1 FOR UPDATE`,
      [personaId],
    );
    return r.rows[0] ?? null;
  }
  async saveDelegation(v: OwnerDelegation, expected: number): Promise<void> {
    const r =
      expected === 0
        ? await this.db.query(
            `INSERT INTO responsavel_delegacao_v2
      (persona_id,responsavel_id,hub_id,credential_enc,expires_at,version,revoked_at,administrative) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT DO NOTHING`,
            [
              v.personaId,
              v.ownerId,
              v.hubId,
              v.credentialEnc,
              v.expiresAt,
              v.version,
              v.revokedAt,
              JSON.stringify(v.administrative),
            ],
          )
        : await this.db.query(
            `UPDATE responsavel_delegacao_v2 SET hub_id=$3,credential_enc=$4,expires_at=$5,version=$6,revoked_at=$7
       ,administrative=$9 WHERE persona_id=$1 AND responsavel_id=$2 AND version=$8`,
            [
              v.personaId,
              v.ownerId,
              v.hubId,
              v.credentialEnc,
              v.expiresAt,
              v.version,
              v.revokedAt,
              expected,
              JSON.stringify(v.administrative),
            ],
          );
    if (r.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Delegação mudou. Recarregue.");
    await this.audit(v.personaId, v.revokedAt ? "delegation.revoked" : "delegation.created");
  }
  async setup(hash: string): Promise<PersonaSetup | null> {
    const r = await this.db.query<{
      persona_id: string;
      token_id: string;
      finalidade: string;
      csrf_hash: string;
      expires_at: Date;
      consumed_at: Date | null;
      contexto_enc: string;
    }>("SELECT * FROM setup_v2 WHERE code_hash=$1 FOR UPDATE", [hash]);
    const v = r.rows[0];
    if (!v) return null;
    if (!this.crypto) throw new Error("Security keyring required");
    const c = contextSchema.parse(JSON.parse(this.crypto.decrypt(v.contexto_enc)));
    if (
      v.persona_id !== c.identity.personaId ||
      v.token_id !== c.identity.tokenId ||
      c.hash !== hash ||
      c.purpose !== v.finalidade ||
      c.csrfHash !== v.csrf_hash ||
      c.expiresAt !== v.expires_at.toISOString() ||
      (c.purpose === "token_issue") !== Boolean(c.issuance) ||
      (c.purpose === "integration_rotate") !== Boolean(c.integration)
    )
      throw new Error("Invalid setup envelope");
    return { ...c, expiresAt: v.expires_at, consumedAt: v.consumed_at };
  }
  async createSetup(v: PersonaSetup): Promise<void> {
    if (!this.crypto) throw new Error("Security keyring required");
    await this.db.query(
      `INSERT INTO setup_v2(code_hash,persona_id,token_id,finalidade,csrf_hash,expires_at,contexto_enc)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        v.hash,
        v.identity.personaId,
        v.identity.tokenId,
        v.purpose,
        v.csrfHash,
        v.expiresAt,
        this.crypto.encrypt(
          JSON.stringify({
            hash: v.hash,
            purpose: v.purpose,
            csrfHash: v.csrfHash,
            expiresAt: v.expiresAt.toISOString(),
            identity: v.identity,
            delegationVersion: v.delegationVersion,
            ...(v.issuance ? { issuance: v.issuance } : {}),
            ...(v.integration ? { integration: v.integration } : {}),
            ...(v.sourceId ? { sourceId: v.sourceId, sourceVersion: v.sourceVersion } : {}),
          }),
        ),
      ],
    );
    await this.audit(v.identity.personaId, "setup.created", v.identity.tokenId);
  }
  async consumeSetup(hash: string, now: Date): Promise<void> {
    const r = await this.db.query<{ persona_id: string; token_id: string }>(
      `UPDATE setup_v2 SET consumed_at=$2
      WHERE code_hash=$1 AND consumed_at IS NULL AND expires_at>$2 RETURNING persona_id,token_id`,
      [hash, now],
    );
    if (!r.rows[0])
      throw new PersonaV2Error("OPERATION_CONFLICT", "Setup expirou ou já foi usado.");
    await this.audit(r.rows[0].persona_id, "setup.completed", r.rows[0].token_id);
  }
  private async audit(personaId: string, event: string, tokenId?: string) {
    await this.db.query(
      "INSERT INTO audit_v2(id,persona_id,token_id,evento,origem,sucesso) VALUES($1,$2,$3,$4,$5,true)",
      [
        randomUUID(),
        personaId,
        tokenId ?? null,
        event,
        event === "setup.created" ? "mcp" : "admin",
      ],
    );
  }
}
