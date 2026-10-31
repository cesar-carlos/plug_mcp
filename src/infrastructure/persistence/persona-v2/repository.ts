import { randomUUID } from "node:crypto";
import type { PhysicalQueryFence } from "../../../domain/ports/persona-query-reuse.port.js";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import { PostgresPersonaSecurity } from "./security.js";
import { PostgresPersonaNotifications } from "./notifications.js";
import { PostgresPersonaOAuthConnections } from "./oauth-connections.js";
import { PostgresPersonaExternal } from "./external.js";
import { PostgresSharedKnowledgeTransaction } from "./shared-knowledge.js";
import { PostgresPhysicalProfiles } from "./physical-profiles.js";
import { PostgresPhysicalCuration } from "./physical-curation.js";
import { PostgresKnowledgeMaintenance } from "./knowledge-maintenance.js";
import { PostgresInteractionErrors } from "./interaction-error-report.js";
import { PostgresPublicationKnowledgeIndex } from "./publication-knowledge.js";
import type {
  StoredStructureEvidence,
  SchemaInspection,
} from "../../../domain/persona-v2/source-schema.js";
import type pg from "pg";
import type {
  PersonaRepositoryPort,
  PersonaTransaction,
} from "../../../domain/ports/persona-v2.port.js";
import {
  PersonaV2Error,
  type AuthorizationSnapshot,
  type ConsumerIdentity,
  type Owner,
  type Persona,
  type PersonaToken,
  type ManagedPersonaToken,
  type Source,
  type SourcePublicationImpact,
} from "../../../domain/persona-v2/model.js";
import type { StoredPersonaIcon } from "../../../domain/persona-v2/persona-icon.js";
import { parsePermissions } from "./permissions-schema.js";
import { isDialeto } from "../../../domain/entities/dialeto.js";
import { personaHistory } from "./history.js";
import type { HistoryFilter, HistoryPage } from "../../../domain/persona-v2/console.js";
import { PostgresPersonaCatalogTransaction } from "./catalog.js";
import { sourceRestrictionsSchema } from "../../../domain/persona-v2/source-restrictions.js";
import {
  suspendSourcePublications,
  sourcePublicationImpact,
} from "./suspend-source-publications.js";

interface PersonaRow {
  id: string;
  responsavel_id: string;
  nome: string;
  especialidade: string;
  instrucoes: string;
  ativa: boolean;
  authorization_version: number;
}
interface TokenRow {
  id: string;
  nome: string;
  persona_id: string;
  token_hash: string;
  expires_at: Date | null;
  revoked_at: Date | null;
  authorization_version: number;
  permissoes: unknown;
  delegacao: unknown;
}
interface SourceRow {
  substituida_por_id: string | null;
  identity_hash: string | null;
  identity_verified_at: Date | null;
  recortes: readonly unknown[];
  id: string;
  persona_id: string;
  fonte_fisica_id: string;
  credencial_id: string;
  credencial_version: number;
  nome: string;
  finalidade: string;
  ambiente: string;
  agent_id: string;
  banco: string;
  dialeto: string;
  ativa: boolean;
  authorization_version: number;
}

const personaFrom = (r: PersonaRow): Persona => ({
  id: r.id,
  ownerId: r.responsavel_id,
  name: r.nome,
  specialty: r.especialidade,
  instructions: r.instrucoes,
  active: r.ativa,
  authorizationVersion: r.authorization_version,
});
const tokenFrom = (r: TokenRow): PersonaToken => ({
  id: r.id,
  personaId: r.persona_id,
  tokenHash: r.token_hash,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
  authorizationVersion: r.authorization_version,
  permissions: parsePermissions(r.permissoes),
  delegation: parsePermissions(r.delegacao),
});
const sourceFrom = (r: SourceRow): Source => {
  if (!isDialeto(r.dialeto) || r.dialeto === "firebird") {
    throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Dialeto desconhecido recusado.");
  }
  return {
    id: r.id,
    personaId: r.persona_id,
    physicalSourceId: r.fonte_fisica_id,
    ...(r.identity_hash && r.identity_verified_at
      ? { identityHash: r.identity_hash, identityVerifiedAt: r.identity_verified_at.toISOString() }
      : {}),
    credentialId: r.credencial_id,
    credentialVersion: r.credencial_version,
    rowRestrictions: sourceRestrictionsSchema.parse(r.recortes),
    name: r.nome,
    purpose: r.finalidade,
    environment: r.ambiente,
    agentId: r.agent_id,
    database: r.banco,
    dialect: r.dialeto,
    active: r.ativa,
    authorizationVersion: r.authorization_version,
    replacedBySourceId: r.substituida_por_id,
  };
};

export class PostgresPersonaTransaction implements PersonaTransaction {
  readonly knowledgeMaintenance: PostgresKnowledgeMaintenance;
  readonly interactionErrors: PostgresInteractionErrors;
  readonly physicalCuration: PostgresPhysicalCuration;
  async structureEvidence(
    personaId: string,
    id: string,
  ): ReturnType<PersonaTransaction["structureEvidence"]> {
    const r = await this.client.query<{
      sourceId: string;
      sourceVersion: number;
      credentialVersion: number;
      identityHash: string;
      evidence: StoredStructureEvidence;
      scope: SchemaInspection;
      hash: string;
      expiresAt: Date;
    }>(
      `SELECT fonte_id AS "sourceId",source_version AS "sourceVersion",credential_version AS "credentialVersion",identity_hash AS "identityHash",scope,evidence,evidence_hash AS hash,expires_at AS "expiresAt" FROM source_structure_evidence_v2 WHERE persona_id=$1 AND id=$2`,
      [personaId, id],
    );
    return r.rows[0] ?? null;
  }
  async recordStructureEvidence(
    input: Parameters<PersonaTransaction["recordStructureEvidence"]>[0],
  ): Promise<void> {
    await this.client.query(
      `INSERT INTO source_structure_evidence_v2(id,persona_id,fonte_id,source_version,credential_version,identity_hash,scope,evidence,evidence_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        input.id,
        input.source.personaId,
        input.source.id,
        input.source.authorizationVersion,
        input.source.credentialVersion,
        input.source.identityHash,
        JSON.stringify(input.scope),
        JSON.stringify(input.evidence),
        input.hash,
        input.expiresAt,
      ],
    );
    for (const [ordinal, page] of (input.evidence.composition?.pages ?? []).entries()) {
      await this.client.query(
        `INSERT INTO source_structure_evidence_part_v2(persona_id,evidence_id,page_id,ordinal,fonte_id,source_version,credential_version,identity_hash,parent_hash,page_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          input.source.personaId,
          input.id,
          page.id,
          ordinal,
          input.source.id,
          input.source.authorizationVersion,
          input.source.credentialVersion,
          input.source.identityHash,
          input.hash,
          page.hash,
        ],
      );
    }
    await this.client.query(
      "INSERT INTO audit_v2(id,persona_id,fonte_id,evento,origem,sucesso,resource_version) VALUES($1,$2,$3,$5,'admin',true,$4)",
      [
        randomUUID(),
        input.source.personaId,
        input.source.id,
        input.source.authorizationVersion,
        input.evidence.composition ? "source.schema_composed" : "source.schema_inspected",
      ],
    );
  }
  readonly security: PostgresPersonaSecurity;
  readonly notifications: PostgresPersonaNotifications;
  readonly oauthConnections: PostgresPersonaOAuthConnections;
  readonly external: PostgresPersonaExternal;
  readonly knowledge: PostgresSharedKnowledgeTransaction;
  readonly profiles: PostgresPhysicalProfiles;
  readonly catalog: PostgresPersonaCatalogTransaction;
  readonly knowledgeIndex: PostgresPublicationKnowledgeIndex;
  constructor(
    private readonly client: pg.PoolClient,
    crypto?: CryptoPort,
  ) {
    this.security = new PostgresPersonaSecurity(client, crypto);
    this.notifications = new PostgresPersonaNotifications(client);
    this.oauthConnections = new PostgresPersonaOAuthConnections(client, crypto);
    this.external = new PostgresPersonaExternal(client, crypto);
    this.knowledge = new PostgresSharedKnowledgeTransaction(client);
    this.profiles = new PostgresPhysicalProfiles(client);
    this.physicalCuration = new PostgresPhysicalCuration(client);
    this.knowledgeMaintenance = new PostgresKnowledgeMaintenance(client);
    this.interactionErrors = new PostgresInteractionErrors(client);
    this.catalog = new PostgresPersonaCatalogTransaction(client);
    this.knowledgeIndex = new PostgresPublicationKnowledgeIndex(client);
  }

  async setAdministrativeActor(ownerId: string): Promise<void> {
    await this.client.query("SELECT set_config('persona_v2.owner_id',$1,true)", [ownerId]);
  }

  async setAdministrativeConsumer(identity: ConsumerIdentity): Promise<void> {
    await this.client.query(
      "SELECT set_config('persona_v2.actor_token_id',$1,true),set_config('persona_v2.actor_grant_id',$2,true)",
      [identity.tokenId, identity.grant?.id ?? ""],
    );
  }

  history(personaId: string, filter: HistoryFilter): Promise<HistoryPage> {
    return personaHistory(this.client, personaId, filter);
  }

  async lastCompletedQuery(personaId: string): Promise<string | null> {
    const r = await this.client.query<{ at: string }>(
      `SELECT created_at::text AS at FROM audit_v2
      WHERE persona_id=$1 AND evento='query.completed' AND sucesso ORDER BY created_at DESC,id DESC LIMIT 1`,
      [personaId],
    );
    return r.rows[0]?.at ?? null;
  }

  async lastConsumerConnection(personaId: string): Promise<string | null> {
    const r = await this.client.query<{ at: string }>(
      "SELECT created_at::text AS at FROM audit_v2 WHERE persona_id=$1 AND evento='consumer.connected' AND sucesso ORDER BY created_at DESC,id DESC LIMIT 1",
      [personaId],
    );
    return r.rows[0]?.at ?? null;
  }

  async recordConsumerConnection(identity: ConsumerIdentity): Promise<void> {
    await this.client.query(
      "INSERT INTO audit_v2(id,persona_id,token_id,evento,origem,sucesso,resource_version) VALUES($1,$2,$3,'consumer.connected','mcp',true,$4)",
      [randomUUID(), identity.personaId, identity.tokenId, identity.tokenVersion],
    );
  }

  async queryCacheFence(source: Source): Promise<PhysicalQueryFence> {
    const row = (
      await this.client.query<{ revision: string; write_pending: boolean }>(
        `SELECT p.cache_revision::text AS revision, EXISTS(
        SELECT 1 FROM operacao_v2 o JOIN fonte f ON f.persona_id=o.persona_id AND f.id=o.fonte_id
        WHERE f.fonte_fisica_id=p.id AND o.estado IN ('executando','cancelamento_solicitado','resultado_desconhecido')
      ) AS write_pending FROM fonte_fisica p JOIN fonte own ON own.fonte_fisica_id=p.id
      WHERE own.persona_id=$1 AND own.id=$2 AND p.id=$3`,
        [source.personaId, source.id, source.physicalSourceId],
      )
    ).rows[0];
    if (!row) throw new PersonaV2Error("STALE_AUTHORIZATION", "Vínculo físico indisponível.");
    return { revision: row.revision, writePending: row.write_pending };
  }

  async recordQuery(input: Parameters<PersonaTransaction["recordQuery"]>[0]): Promise<void> {
    await this.client.query(
      `INSERT INTO audit_v2(id,persona_id,token_id,fonte_id,skill_id,publicacao_id,evento,origem,sucesso,duracao_ms,linhas,query_reuse_kind)
       VALUES($1,$2,$3,$4,$5,$6,$7,'mcp',true,$8,$9,$10)`,
      [
        randomUUID(),
        input.personaId,
        input.tokenId,
        input.sourceId,
        input.skillId,
        input.publicationId,
        input.validation ? "query.validated" : "query.completed",
        input.durationMs,
        input.rows,
        input.reuseKind ?? null,
      ],
    );
  }
  async recordAttachment(
    input: Parameters<NonNullable<PersonaTransaction["recordAttachment"]>>[0],
  ): Promise<void> {
    await this.client.query(
      `INSERT INTO audit_v2(id,persona_id,token_id,fonte_id,skill_id,publicacao_id,attachment_id,attachment_bytes,evento,origem,sucesso,linhas,duracao_ms)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'mcp',true,$10,$11)`,
      [
        randomUUID(),
        input.personaId,
        input.tokenId,
        input.sourceId,
        input.skillId,
        input.publicationId,
        input.id,
        input.bytes,
        `attachment.${input.event}`,
        input.rows,
        input.durationMs,
      ],
    );
  }
  async recordFederation(
    input: Parameters<PersonaTransaction["recordFederation"]>[0],
  ): Promise<void> {
    await this.client.query(
      `INSERT INTO audit_v2(id,persona_id,token_id,skill_id,publicacao_id,evento,origem,sucesso,duracao_ms,linhas,etapa)
      VALUES($1,$2,$3,$4,$5,$6,'mcp',true,$7,$8,$9)`,
      [
        randomUUID(),
        input.personaId,
        input.tokenId,
        input.skillId,
        input.publicationId,
        input.validation ? "federation.validated" : "federation.completed",
        input.durationMs,
        input.rows,
        input.steps,
      ],
    );
  }

  async authorization(identity: ConsumerIdentity): Promise<AuthorizationSnapshot | null> {
    const tokens = await this.client.query<TokenRow>(
      "SELECT * FROM persona_token WHERE persona_id=$1 AND id=$2",
      [identity.personaId, identity.tokenId],
    );
    const token = tokens.rows[0];
    const persona = await this.findPersona(identity.personaId);
    if (!token || !persona) return null;
    const grants = identity.grant
      ? await this.client.query<{
          id: string;
          persona_id: string;
          token_id: string;
          token_version: number;
          permissoes: unknown;
          expires_at: Date;
          revoked_at: Date | null;
        }>("SELECT * FROM oauth_concessao_v2 WHERE persona_id=$1 AND token_id=$2 AND id=$3", [
          identity.personaId,
          identity.tokenId,
          identity.grant.id,
        ])
      : null;
    const grant = grants?.rows[0];
    return {
      persona,
      token: tokenFrom(token),
      sources: await this.listSources(persona.id),
      ...(grant
        ? {
            grant: {
              id: grant.id,
              personaId: grant.persona_id,
              tokenId: grant.token_id,
              tokenVersion: grant.token_version,
              permissions: parsePermissions(grant.permissoes),
              expiresAt: grant.expires_at,
              revokedAt: grant.revoked_at,
            },
          }
        : {}),
    };
  }

  async owner(hubOrigin: string, hubClientId: string): Promise<Owner> {
    const result = await this.client.query<{ id: string }>(
      `INSERT INTO responsavel(id,hub_origin,hub_client_id) VALUES($1,$2,$3)
       ON CONFLICT(hub_origin,hub_client_id) DO UPDATE SET hub_client_id=excluded.hub_client_id
       RETURNING id`,
      [randomUUID(), hubOrigin, hubClientId],
    );
    return { id: result.rows[0]!.id, hubOrigin, hubClientId };
  }

  async findPersona(id: string): Promise<Persona | null> {
    const result = await this.client.query<PersonaRow>("SELECT * FROM persona WHERE id=$1", [id]);
    return result.rows[0] ? personaFrom(result.rows[0]) : null;
  }

  async createPersona(p: Persona): Promise<void> {
    await this.client.query(
      `INSERT INTO persona(id,responsavel_id,nome,especialidade,instrucoes,ativa,authorization_version)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [p.id, p.ownerId, p.name, p.specialty, p.instructions, p.active, p.authorizationVersion],
    );
    await this.client.query(
      "INSERT INTO audit_v2(id,persona_id,evento,origem,sucesso,resource_version) VALUES($1,$2,'persona.created','admin',true,1)",
      [randomUUID(), p.id],
    );
  }

  async listPersonas(ownerId: string): Promise<readonly Persona[]> {
    const result = await this.client.query<PersonaRow>(
      "SELECT * FROM persona WHERE responsavel_id=$1 ORDER BY created_at,id",
      [ownerId],
    );
    return result.rows.map(personaFrom);
  }

  async updatePersona(p: Persona, expectedVersion: number): Promise<void> {
    const updated = await this.client.query(
      `UPDATE persona SET nome=$3,especialidade=$4,instrucoes=$5,authorization_version=$6,updated_at=now()
       WHERE id=$1 AND authorization_version=$2 AND ativa RETURNING id`,
      [p.id, expectedVersion, p.name, p.specialty, p.instructions, p.authorizationVersion],
    );
    if (updated.rowCount !== 1) {
      throw new PersonaV2Error("OPERATION_CONFLICT", "Persona mudou durante a edição.");
    }
    await this.client.query(
      "INSERT INTO audit_v2(id,persona_id,evento,origem,sucesso,previous_version,resource_version) VALUES($1,$2,'persona.updated','admin',true,$3,$4)",
      [randomUUID(), p.id, expectedVersion, p.authorizationVersion],
    );
  }

  async changePersonaState(p: Persona, expectedVersion: number, now: Date): Promise<void> {
    const updated = await this.client.query(
      `UPDATE persona SET ativa=$3,authorization_version=$4,updated_at=$5
       WHERE id=$1 AND authorization_version=$2 AND ativa<>$3 RETURNING id`,
      [p.id, expectedVersion, p.active, p.authorizationVersion, now],
    );
    if (updated.rowCount !== 1) {
      throw new PersonaV2Error("OPERATION_CONFLICT", "Estado da persona mudou; recarregue.");
    }
    if (!p.active) {
      // Snapshots remain immutable. Recovery never removes these suspensions or revocations.
      await this.client.query(
        `INSERT INTO publicacao_suspensao(persona_id,publicacao_id,motivo,suspended_at)
         SELECT persona_id,id,'persona_suspended',$2 FROM publicacao WHERE persona_id=$1
         ON CONFLICT(publicacao_id) DO NOTHING`,
        [p.id, now],
      );
      await this.client.query(
        "UPDATE oauth_concessao_v2 SET revoked_at=$2 WHERE persona_id=$1 AND revoked_at IS NULL",
        [p.id, now],
      );
    }
    await this.client.query(
      `INSERT INTO audit_v2(id,persona_id,evento,origem,sucesso,previous_version,resource_version)
       VALUES($1,$2,$3,'admin',true,$4,$5)`,
      [
        randomUUID(),
        p.id,
        p.active ? "persona.recovered" : "persona.suspended",
        expectedVersion,
        p.authorizationVersion,
      ],
    );
  }

  async physicalSource(identityHash: string): Promise<string> {
    const result = await this.client.query<{ id: string }>(
      `INSERT INTO fonte_fisica(id,identity_hash) VALUES($1,$2)
       ON CONFLICT(identity_hash) DO UPDATE SET identity_hash=excluded.identity_hash RETURNING id`,
      [randomUUID(), identityHash],
    );
    return result.rows[0]!.id;
  }

  async listSources(personaId: string): Promise<readonly Source[]> {
    const result = await this.client.query<SourceRow>(
      `SELECT f.*,c.versao AS credencial_version FROM fonte f JOIN fonte_credencial c
       ON c.id=f.credencial_id AND c.persona_id=f.persona_id WHERE f.persona_id=$1 ORDER BY f.id`,
      [personaId],
    );
    return result.rows.map(sourceFrom);
  }

  sourcePublicationImpact(personaId: string, sourceId: string): Promise<SourcePublicationImpact> {
    return sourcePublicationImpact(this.client, personaId, sourceId);
  }

  async publicationImpact(
    personaId: string,
    publicationId: string,
  ): Promise<SourcePublicationImpact> {
    const r = await this.client.query<
      SourcePublicationImpact["publications"][number] & { total: number }
    >(
      `WITH RECURSIVE affected(id) AS (
      SELECT publicacao_id FROM publicacao_dependencia WHERE persona_id=$1 AND dependencia_id=$2
      UNION SELECT d.publicacao_id FROM publicacao_dependencia d JOIN affected a ON a.id=d.dependencia_id WHERE d.persona_id=$1
    ) SELECT p.id AS "publicationId",p.skill_id AS "skillId",p.pacote->>'name' AS name,p.revisao AS revision,s.tipo AS kind,
      EXISTS(SELECT 1 FROM publicacao_dependencia d WHERE d.persona_id=$1 AND d.publicacao_id=p.id AND d.dependencia_id=$2) AS direct,
      coalesce(s.publicacao_ativa_id=p.id AND x.publicacao_id IS NULL,false) AS active,
      x.publicacao_id IS NOT NULL AS suspended,count(*) OVER()::int AS total
      FROM affected a JOIN publicacao p ON p.id=a.id AND p.persona_id=$1
      JOIN skill_v2 s ON s.persona_id=$1 AND s.id=p.skill_id
      LEFT JOIN publicacao_suspensao x ON x.persona_id=$1 AND x.publicacao_id=p.id ORDER BY p.id LIMIT 200`,
      [personaId, publicationId],
    );
    return {
      total: r.rows[0]?.total ?? 0,
      publications: r.rows.map(({ total: _total, ...p }) => p),
    };
  }

  async addSource(
    s: Source,
    credentials: {
      emailEnc: string;
      passwordEnc: string;
      clientTokenEnc: string;
    },
  ): Promise<void> {
    await this.client.query(
      `INSERT INTO fonte_credencial(id,persona_id,email_enc,senha_enc,client_token_enc,versao)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [
        s.credentialId,
        s.personaId,
        credentials.emailEnc,
        credentials.passwordEnc,
        credentials.clientTokenEnc,
        s.credentialVersion,
      ],
    );
    await this.client.query(
      `INSERT INTO fonte(id,persona_id,fonte_fisica_id,credencial_id,agent_id,banco,dialeto,nome,
        finalidade,ambiente,ativa,authorization_version,recortes,identity_hash,identity_verified_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        s.id,
        s.personaId,
        s.physicalSourceId,
        s.credentialId,
        s.agentId,
        s.database,
        s.dialect,
        s.name,
        s.purpose,
        s.environment,
        s.active,
        s.authorizationVersion,
        JSON.stringify(sourceRestrictionsSchema.parse(s.rowRestrictions ?? [])),
        s.identityHash ?? null,
        s.identityVerifiedAt ?? null,
      ],
    );
    await this.client.query(
      "INSERT INTO audit_v2(id,persona_id,fonte_id,evento,origem,sucesso,resource_version) VALUES($1,$2,$3,'source.created','admin',true,1)",
      [randomUUID(), s.personaId, s.id],
    );
  }

  async updateSource(
    s: Source,
    expectedVersion: number,
    credentials?: { emailEnc: string; passwordEnc: string; clientTokenEnc: string },
  ): Promise<void> {
    if (credentials) {
      const rotated = await this.client.query(
        `UPDATE fonte_credencial SET email_enc=$3,senha_enc=$4,client_token_enc=$5,versao=$6
         WHERE persona_id=$1 AND id=$2 AND versao=$7 RETURNING id`,
        [
          s.personaId,
          s.credentialId,
          credentials.emailEnc,
          credentials.passwordEnc,
          credentials.clientTokenEnc,
          s.credentialVersion,
          s.credentialVersion - 1,
        ],
      );
      if (rotated.rowCount !== 1) {
        throw new PersonaV2Error("OPERATION_CONFLICT", "Credencial mudou durante a edição.");
      }
    }
    const updated = await this.client.query(
      `UPDATE fonte SET nome=$3,finalidade=$4,ambiente=$5,recortes=$6,authorization_version=$7,identity_verified_at=$8
       WHERE persona_id=$1 AND id=$2 AND authorization_version=$9 AND ativa RETURNING id`,
      [
        s.personaId,
        s.id,
        s.name,
        s.purpose,
        s.environment,
        JSON.stringify(sourceRestrictionsSchema.parse(s.rowRestrictions ?? [])),
        s.authorizationVersion,
        s.identityVerifiedAt,
        expectedVersion,
      ],
    );
    if (updated.rowCount !== 1) {
      throw new PersonaV2Error("OPERATION_CONFLICT", "Fonte mudou durante a edição.");
    }
    await suspendSourcePublications(
      this.client,
      [s.id],
      credentials ? "source_credential_rotated" : "source_updated",
    );
    await this.client.query(
      "INSERT INTO audit_v2(id,persona_id,fonte_id,evento,origem,sucesso,previous_version,resource_version) VALUES($1,$2,$3,$4,'admin',true,$5,$6)",
      [
        randomUUID(),
        s.personaId,
        s.id,
        credentials ? "source.credential_rotated" : "source.updated",
        expectedVersion,
        s.authorizationVersion,
      ],
    );
  }

  async changeSourceState(
    s: Source,
    expectedVersion: number,
    credentials?: { emailEnc: string; passwordEnc: string; clientTokenEnc: string },
  ): Promise<void> {
    const updated = await this.client.query(
      `UPDATE fonte SET ativa=$3,authorization_version=$4,identity_verified_at=$5
       WHERE persona_id=$1 AND id=$2 AND authorization_version=$6
         AND ativa<>$3 AND substituida_por_id IS NULL RETURNING id`,
      [s.personaId, s.id, s.active, s.authorizationVersion, s.identityVerifiedAt, expectedVersion],
    );
    if (updated.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Estado da fonte mudou; recarregue.");
    if (credentials) {
      const rotated = await this.client.query(
        `UPDATE fonte_credencial SET email_enc=$3,senha_enc=$4,client_token_enc=$5,versao=$6
         WHERE persona_id=$1 AND id=$2 AND versao=$7 RETURNING id`,
        [
          s.personaId,
          s.credentialId,
          credentials.emailEnc,
          credentials.passwordEnc,
          credentials.clientTokenEnc,
          s.credentialVersion,
          s.credentialVersion - 1,
        ],
      );
      if (rotated.rowCount !== 1)
        throw new PersonaV2Error("OPERATION_CONFLICT", "Credencial mudou durante a recuperação.");
    }
    // Recovery leaves all previous suspensions in place and invalidates any remaining old package.
    await suspendSourcePublications(
      this.client,
      [s.id],
      s.active ? "source_recovered" : "source_suspended",
    );
    await this.client.query(
      `INSERT INTO audit_v2(id,persona_id,fonte_id,evento,origem,sucesso,previous_version,resource_version)
       VALUES($1,$2,$3,$4,'admin',true,$5,$6)`,
      [
        randomUUID(),
        s.personaId,
        s.id,
        s.active ? "source.recovered" : "source.suspended",
        expectedVersion,
        s.authorizationVersion,
      ],
    );
    if (credentials)
      await this.client.query(
        `INSERT INTO audit_v2(id,persona_id,fonte_id,evento,origem,sucesso,previous_version,resource_version)
         VALUES($1,$2,$3,'source.credential_rotated','admin',true,$4,$5)`,
        [randomUUID(), s.personaId, s.id, expectedVersion, s.authorizationVersion],
      );
  }

  async replaceSource(s: Source, replacementId: string, expectedVersion: number): Promise<void> {
    const updated = await this.client.query(
      `UPDATE fonte SET ativa=false,authorization_version=authorization_version+1,substituida_por_id=$3
       WHERE persona_id=$1 AND id=$2 AND authorization_version=$4
         AND substituida_por_id IS NULL RETURNING id`,
      [s.personaId, s.id, replacementId, expectedVersion],
    );
    if (updated.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Vínculo mudou durante a substituição.");
    await suspendSourcePublications(this.client, [s.id], "source_replaced");
    await this.client.query(
      `INSERT INTO audit_v2(id,persona_id,fonte_id,evento,origem,sucesso,previous_version,resource_version)
       VALUES($1,$2,$3,'source.replaced','admin',true,$4,$5)`,
      [randomUUID(), s.personaId, s.id, expectedVersion, expectedVersion + 1],
    );
  }

  private async validateTokenResources(
    t: Pick<PersonaToken, "personaId" | "permissions" | "delegation">,
  ): Promise<void> {
    const permissions = parsePermissions(t.permissions);
    const delegation = parsePermissions(t.delegation);
    for (const [table, ids] of [
      ["fonte", [...permissions.sourceIds, ...delegation.sourceIds]],
      ["skill_v2", [...permissions.skills, ...delegation.skills].map((s) => s.skillId)],
      [
        "integracao_operacao",
        [...permissions.externalOperationIds, ...delegation.externalOperationIds],
      ],
    ] as const) {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length > 0) {
        // Table names originate exclusively in the constant list above.
        const found = await this.client.query<{ id: string }>(
          `SELECT id FROM ${table} WHERE persona_id=$1 AND id=ANY($2::uuid[])`,
          [t.personaId, uniqueIds],
        );
        if (found.rows.length !== uniqueIds.length) {
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Concessão referencia outra persona ou recurso inexistente.",
          );
        }
      }
    }
  }

  async issueToken(t: PersonaToken, name: string): Promise<void> {
    await this.validateTokenResources(t);
    await this.client.query(
      `INSERT INTO persona_token(id,persona_id,nome,token_hash,expires_at,revoked_at,
        authorization_version,permissoes,delegacao) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        t.id,
        t.personaId,
        name,
        t.tokenHash,
        t.expiresAt,
        t.revokedAt,
        t.authorizationVersion,
        JSON.stringify(parsePermissions(t.permissions)),
        JSON.stringify(parsePermissions(t.delegation)),
      ],
    );
    await this.client.query(
      "INSERT INTO audit_v2(id,persona_id,token_id,evento,origem,sucesso,resource_version) VALUES($1,$2,$3,'token.issued','admin',true,1)",
      [randomUUID(), t.personaId, t.id],
    );
  }

  async listTokens(personaId: string): Promise<readonly ManagedPersonaToken[]> {
    const result = await this.client.query<Omit<TokenRow, "token_hash">>(
      `SELECT id,persona_id,nome,expires_at,revoked_at,authorization_version,permissoes,delegacao
       FROM persona_token WHERE persona_id=$1 ORDER BY created_at,id`,
      [personaId],
    );
    return result.rows.map((r) => ({
      id: r.id,
      personaId: r.persona_id,
      name: r.nome,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      authorizationVersion: r.authorization_version,
      permissions: parsePermissions(r.permissoes),
      delegation: parsePermissions(r.delegacao),
    }));
  }

  async changeToken(
    t: ManagedPersonaToken,
    expectedVersion: number,
    tokenHash?: string,
  ): Promise<void> {
    await this.validateTokenResources(t);
    const result = await this.client.query(
      `UPDATE persona_token SET nome=$4,expires_at=$5,permissoes=$6,delegacao=$7,
       token_hash=coalesce($8,token_hash),authorization_version=authorization_version+1
       WHERE persona_id=$1 AND id=$2 AND authorization_version=$3 AND revoked_at IS NULL RETURNING id`,
      [
        t.personaId,
        t.id,
        expectedVersion,
        t.name,
        t.expiresAt,
        JSON.stringify(t.permissions),
        JSON.stringify(t.delegation),
        tokenHash ?? null,
      ],
    );
    if (result.rowCount !== 1)
      throw new PersonaV2Error(
        "OPERATION_CONFLICT",
        "Token mudou ou foi revogado. Recarregue antes de editar.",
      );
    await this.client.query(
      "UPDATE oauth_concessao_v2 SET revoked_at=coalesce(revoked_at,now()) WHERE persona_id=$1 AND token_id=$2",
      [t.personaId, t.id],
    );
    await this.client.query(
      "INSERT INTO audit_v2(id,persona_id,token_id,evento,origem,sucesso,previous_version,resource_version) VALUES($1,$2,$3,$4,'admin',true,$5,$6)",
      [
        randomUUID(),
        t.personaId,
        t.id,
        tokenHash ? "token.rotated" : "token.updated",
        expectedVersion,
        expectedVersion + 1,
      ],
    );
  }

  async readPersonaIcon(personaId: string): Promise<StoredPersonaIcon | null> {
    const result = await this.client.query<{ bytes: Buffer; revision: number }>(
      "SELECT bytes, revision FROM persona_icone WHERE persona_id=$1",
      [personaId],
    );
    const row = result.rows[0];
    return row ? { mediaType: "image/png", bytes: row.bytes, revision: row.revision } : null;
  }

  async savePersonaIcon(
    personaId: string,
    bytes: Uint8Array,
    expectedRevision: number,
  ): Promise<number> {
    const saved =
      expectedRevision === 0
        ? await this.client.query<{ revision: number }>(
            `INSERT INTO persona_icone(persona_id,media_type,bytes,revision)
             VALUES($1,'image/png',$2,1) ON CONFLICT DO NOTHING RETURNING revision`,
            [personaId, bytes],
          )
        : await this.client.query<{ revision: number }>(
            `UPDATE persona_icone SET bytes=$3,revision=revision+1,updated_at=now()
             WHERE persona_id=$1 AND revision=$2 RETURNING revision`,
            [personaId, expectedRevision, bytes],
          );
    const revision = saved.rows[0]?.revision;
    if (saved.rowCount !== 1 || revision === undefined) {
      throw new PersonaV2Error("OPERATION_CONFLICT", "Ícone mudou; recarregue antes de salvar.");
    }
    await this.client.query(
      "INSERT INTO audit_v2(id,persona_id,evento,origem,sucesso,previous_version,resource_version) VALUES($1,$2,'persona.icon_updated','admin',true,$3,$4)",
      [randomUUID(), personaId, expectedRevision > 0 ? expectedRevision : null, revision],
    );
    return revision;
  }

  async clearPersonaIcon(personaId: string, expectedRevision: number): Promise<void> {
    const removed = await this.client.query(
      "UPDATE persona_icone SET bytes=''::bytea,revision=revision+1,updated_at=now() WHERE persona_id=$1 AND revision=$2 RETURNING persona_id",
      [personaId, expectedRevision],
    );
    if (removed.rowCount !== 1) {
      throw new PersonaV2Error("OPERATION_CONFLICT", "Ícone mudou; recarregue antes de salvar.");
    }
    await this.client.query(
      "INSERT INTO audit_v2(id,persona_id,evento,origem,sucesso,previous_version,resource_version) VALUES($1,$2,'persona.icon_cleared','admin',true,$3,$4)",
      [randomUUID(), personaId, expectedRevision, expectedRevision + 1],
    );
  }

  async revokeToken(personaId: string, tokenId: string, now: Date): Promise<void> {
    const result = await this.client.query(
      `UPDATE persona_token SET revoked_at=coalesce(revoked_at,$3),
       authorization_version=CASE WHEN revoked_at IS NULL THEN authorization_version+1 ELSE authorization_version END
       WHERE persona_id=$1 AND id=$2 RETURNING id`,
      [personaId, tokenId, now],
    );
    if (result.rowCount !== 1) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Token indisponível nesta persona.");
    }
    await this.client.query(
      "UPDATE oauth_concessao_v2 SET revoked_at=coalesce(revoked_at,$3) WHERE persona_id=$1 AND token_id=$2",
      [personaId, tokenId, now],
    );
    await this.client.query(
      "INSERT INTO audit_v2(id,persona_id,token_id,evento,origem,sucesso) VALUES($1,$2,$3,'token.revoked','admin',true)",
      [randomUUID(), personaId, tokenId],
    );
  }
}

export class PostgresPersonaRepository implements PersonaRepositoryPort {
  constructor(
    private readonly pool: pg.Pool,
    private readonly crypto?: CryptoPort,
  ) {}

  async transaction<T>(
    locks: { readonly personaIds: readonly string[]; readonly tokenIds: readonly string[] },
    action: (transaction: PersonaTransaction) => Promise<T>,
    beforeCommit?: () => Promise<void>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Every caller takes persona locks before token locks, both in ID order.
      await client.query("SELECT id FROM persona WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [
        [...new Set(locks.personaIds)].sort(),
      ]);
      await client.query(
        "SELECT id FROM persona_token WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [[...new Set(locks.tokenIds)].sort()],
      );
      const result = await action(new PostgresPersonaTransaction(client, this.crypto));
      await beforeCommit?.();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async readPersonaIcon(personaId: string): Promise<StoredPersonaIcon | null> {
    const result = await this.pool.query<{ bytes: Buffer; revision: number }>(
      `SELECT i.bytes, i.revision FROM persona_icone i
       JOIN persona p ON p.id=i.persona_id
       WHERE i.persona_id=$1 AND p.ativa AND octet_length(i.bytes)>0`,
      [personaId],
    );
    const row = result.rows[0];
    return row ? { mediaType: "image/png", bytes: row.bytes, revision: row.revision } : null;
  }

  async authentication(tokenHash: string): Promise<AuthorizationSnapshot | null> {
    return this.snapshot("token_hash", tokenHash);
  }

  async authorization(identity: ConsumerIdentity): Promise<AuthorizationSnapshot | null> {
    return this.snapshot("id", identity.tokenId, identity.grant?.id);
  }

  private async snapshot(
    field: "id" | "token_hash",
    value: string,
    grantId?: string,
  ): Promise<AuthorizationSnapshot | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const tokens = await client.query<TokenRow>(`SELECT * FROM persona_token WHERE ${field}=$1`, [
        value,
      ]);
      const token = tokens.rows[0];
      if (!token) {
        await client.query("COMMIT");
        return null;
      }
      const personas = await client.query<PersonaRow>("SELECT * FROM persona WHERE id=$1", [
        token.persona_id,
      ]);
      const sources = await client.query<SourceRow>(
        `SELECT f.*,c.versao AS credencial_version FROM fonte f JOIN fonte_credencial c
         ON c.persona_id=f.persona_id AND c.id=f.credencial_id WHERE f.persona_id=$1`,
        [token.persona_id],
      );
      const grants = grantId
        ? await client.query<{
            id: string;
            persona_id: string;
            token_id: string;
            token_version: number;
            permissoes: unknown;
            expires_at: Date;
            revoked_at: Date | null;
          }>("SELECT * FROM oauth_concessao_v2 WHERE persona_id=$1 AND token_id=$2 AND id=$3", [
            token.persona_id,
            token.id,
            grantId,
          ])
        : null;
      const grant = grants?.rows[0];
      await client.query("COMMIT");
      return {
        persona: personaFrom(personas.rows[0]!),
        token: tokenFrom(token),
        sources: sources.rows.map(sourceFrom),
        ...(grant
          ? {
              grant: {
                id: grant.id,
                personaId: grant.persona_id,
                tokenId: grant.token_id,
                tokenVersion: grant.token_version,
                permissions: parsePermissions(grant.permissoes),
                expiresAt: grant.expires_at,
                revokedAt: grant.revoked_at,
              },
            }
          : {}),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
