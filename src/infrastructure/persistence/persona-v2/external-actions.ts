import type pg from "pg";
import { randomUUID } from "node:crypto";
import type { ExternalActionTransaction } from "../../../domain/ports/external-action.port.js";
import type { ExternalAction } from "../../../domain/persona-v2/external-action.js";
import type { OwnerApproval } from "../../../domain/persona-v2/operation.js";
import type { ExternalReconciliation } from "../../../domain/persona-v2/external-reconciliation.js";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";
interface Row {
  id: string;
  persona_id: string;
  token_id: string;
  skill_id: string;
  publicacao_id: string;
  integracao_id: string;
  fingerprint: string;
  identity_snapshot: ExternalAction["identity"];
  authorization_hash: string;
  estado: ExternalAction["state"];
  exige_aprovacao: boolean;
  expires_at: Date;
  versao: number;
  payload_enc: string | null;
  result_enc: string | null;
  claimed_at: Date | null;
  comprovante: ExternalAction["receipt"];
  terminal_at: Date | null;
  payload_purged_at: Date | null;
  receipt_purged_at: Date | null;
}
const from = (r: Row): ExternalAction => ({
  id: r.id,
  personaId: r.persona_id,
  tokenId: r.token_id,
  skillId: r.skill_id,
  publicationId: r.publicacao_id,
  integrationId: r.integracao_id,
  fingerprint: r.fingerprint,
  identity: r.identity_snapshot,
  authorizationHash: r.authorization_hash,
  state: r.estado,
  requireHumanApproval: r.exige_aprovacao,
  expiresAt: r.expires_at,
  version: r.versao,
  payloadEnc: r.payload_enc,
  resultEnc: r.result_enc,
  claimedAt: r.claimed_at,
  receipt: r.comprovante,
  retention: {
    terminalAt: r.terminal_at?.toISOString() ?? null,
    payloadPurgedAt: r.payload_purged_at?.toISOString() ?? null,
    receiptPurgedAt: r.receipt_purged_at?.toISOString() ?? null,
  },
});
export class PostgresExternalActions implements ExternalActionTransaction {
  constructor(private readonly db: pg.PoolClient) {}
  async recordReconciliation(personaId: string, e: ExternalReconciliation): Promise<void> {
    await this.db.query(
      `INSERT INTO external_action_reconciliation_v2(id,persona_id,operacao_id,
      publicacao_id,fingerprint,contract_hash,observed_at,status,reason,response_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        e.id,
        personaId,
        e.operationId,
        e.publicationId,
        e.fingerprint,
        e.contractHash,
        e.observedAt,
        e.status,
        e.reason,
        e.responseHash,
      ],
    );
    await this.db.query(
      `INSERT INTO audit_v2(id,persona_id,token_id,skill_id,publicacao_id,integracao_id,
      external_action_id,evento,origem,sucesso) SELECT $1,persona_id,token_id,skill_id,publicacao_id,
      integracao_id,id,'external_action.reconciliation','external-action',true
      FROM external_action_v2 WHERE persona_id=$2 AND id=$3`,
      [randomUUID(), personaId, e.operationId],
    );
  }
  async latestReconciliation(
    personaId: string,
    id: string,
  ): Promise<ExternalReconciliation | null> {
    const r = await this.db.query<ExternalReconciliation>(
      `SELECT id,operacao_id AS "operationId",
      fingerprint,publicacao_id AS "publicationId",contract_hash AS "contractHash",
      to_char(observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "observedAt",
      status,reason,response_hash AS "responseHash",false AS "permitsRetry"
      FROM external_action_reconciliation_v2 WHERE persona_id=$1 AND operacao_id=$2
      ORDER BY observed_at DESC,id DESC LIMIT 1`,
      [personaId, id],
    );
    return r.rows[0] ?? null;
  }
  async find(personaId: string, id: string): Promise<ExternalAction | null> {
    const r = await this.db.query<Row>(
      "SELECT * FROM external_action_v2 WHERE persona_id=$1 AND id=$2 FOR UPDATE",
      [personaId, id],
    );
    return r.rows[0] ? from(r.rows[0]) : null;
  }
  async list(personaId: string, afterId?: string): Promise<readonly ExternalAction[]> {
    const r = await this.db.query<Row>(
      "SELECT * FROM external_action_v2 WHERE persona_id=$1 AND ($2::uuid IS NULL OR id>$2::uuid) ORDER BY id LIMIT 51",
      [personaId, afterId ?? null],
    );
    return r.rows.map(from);
  }
  async insert(a: ExternalAction): Promise<void> {
    await this.db.query(
      `INSERT INTO external_action_v2(id,persona_id,token_id,skill_id,publicacao_id,integracao_id,
      fingerprint,identity_snapshot,authorization_hash,estado,exige_aprovacao,expires_at,payload_enc)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        a.id,
        a.personaId,
        a.tokenId,
        a.skillId,
        a.publicationId,
        a.integrationId,
        a.fingerprint,
        JSON.stringify(a.identity),
        a.authorizationHash,
        a.state,
        a.requireHumanApproval,
        a.expiresAt,
        a.payloadEnc,
      ],
    );
    await this.audit(a);
  }
  async save(a: ExternalAction, expectedVersion: number): Promise<void> {
    const terminal = ["concluida", "cancelada", "expirada", "recusada"].includes(a.state);
    const r = await this.db.query(
      `UPDATE external_action_v2 SET estado=$4,versao=$5,claimed_at=$6,result_enc=$7,comprovante=$8,
      updated_at=now(),payload_purge_at=CASE WHEN $9 THEN coalesce(payload_purge_at,now()+interval '24 hours') ELSE NULL END
      WHERE persona_id=$1 AND id=$2 AND versao=$3`,
      [
        a.personaId,
        a.id,
        expectedVersion,
        a.state,
        a.version,
        a.claimedAt,
        a.resultEnc,
        a.receipt ? JSON.stringify(a.receipt) : null,
        terminal,
      ],
    );
    if (r.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Ação alterada em outra requisição.");
    await this.audit(a);
  }
  async approval(personaId: string, id: string): Promise<OwnerApproval | null> {
    const r = await this.db.query<{
      operacao_id: string;
      responsavel_id: string;
      fingerprint: string;
      expires_at: Date;
    }>("SELECT * FROM external_action_approval_v2 WHERE persona_id=$1 AND operacao_id=$2", [
      personaId,
      id,
    ]);
    const a = r.rows[0];
    return a
      ? {
          operationId: a.operacao_id,
          ownerId: a.responsavel_id,
          fingerprint: a.fingerprint,
          expiresAt: a.expires_at,
        }
      : null;
  }
  async approve(personaId: string, a: OwnerApproval): Promise<void> {
    await this.db.query(
      "INSERT INTO external_action_approval_v2(persona_id,operacao_id,responsavel_id,fingerprint,expires_at) VALUES($1,$2,$3,$4,$5)",
      [personaId, a.operationId, a.ownerId, a.fingerprint, a.expiresAt],
    );
    await this.db.query(
      `INSERT INTO audit_v2(id,persona_id,responsavel_id,external_action_id,evento,origem,sucesso)
      VALUES($1,$2,$3,$4,'external_action.approval','console',true)`,
      [randomUUID(), personaId, a.ownerId, a.operationId],
    );
  }
  private async audit(a: ExternalAction): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_v2(id,persona_id,token_id,skill_id,publicacao_id,integracao_id,external_action_id,
      evento,origem,sucesso,resource_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'external-action',true,$9)`,
      [
        randomUUID(),
        a.personaId,
        a.tokenId,
        a.skillId,
        a.publicationId,
        a.integrationId,
        a.id,
        `external_action.${a.state}`,
        a.version,
      ],
    );
  }
}
