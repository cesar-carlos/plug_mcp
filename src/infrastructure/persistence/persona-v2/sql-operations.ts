import type pg from "pg";
import { randomUUID } from "node:crypto";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import type {
  SqlOperationStorePort,
  SqlOperationStoreTransaction,
  StoredSqlOperation,
} from "../../../domain/ports/sql-operation-store.port.js";
import type { ConsumerIdentity } from "../../../domain/persona-v2/model.js";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";
import { assertConsumer } from "../../../domain/persona-v2/authorization.js";
import { canonicalJson } from "../../../domain/persona-v2/catalog.js";
import { operationAuthorizationHash } from "../../../domain/persona-v2/operation-authorization.js";
import type {
  OwnerApproval,
  OperationReceipt,
  OperationState,
  OperationReconciliation,
} from "../../../domain/persona-v2/operation.js";
import { PostgresPersonaTransaction } from "./repository.js";
import { sourceFingerprint } from "../../../application/persona-v2/query-training.js";
import { authorizeOperationPublication } from "../../../application/persona-v2/operation-authority.js";
import { sharedOperationKnowledgeCurrent } from "../../../application/persona-v2/shared-operation-adoption.js";

interface Row {
  id: string;
  persona_id: string;
  token_id: string;
  publicacao_id: string;
  fonte_id: string;
  fingerprint: string;
  authorization_snapshot: { identity: ConsumerIdentity; hash: string };
  estado: OperationState;
  exige_aprovacao: boolean;
  expires_at: Date;
  versao: number;
  payload_enc: string | null;
  comprovante: OperationReceipt | null;
  conciliacao: OperationReconciliation | null;
  terminal_at: Date | null;
  payload_purged_at: Date | null;
  receipt_purged_at: Date | null;
}
const packageFormat = (value: object): unknown => Reflect.get(value, "format");
const from = (r: Row): StoredSqlOperation => ({
  id: r.id,
  personaId: r.persona_id,
  tokenId: r.token_id,
  publicationId: r.publicacao_id,
  sourceId: r.fonte_id,
  fingerprint: r.fingerprint,
  identity: r.authorization_snapshot.identity,
  authorizationHash: r.authorization_snapshot.hash,
  state: r.estado,
  requireHumanApproval: r.exige_aprovacao,
  expiresAt: r.expires_at,
  version: r.versao,
  payloadEnc: r.payload_enc,
  receipt: r.comprovante,
  reconciliation: r.conciliacao ?? null,
  retention: {
    terminalAt: r.terminal_at?.toISOString() ?? null,
    payloadPurgedAt: r.payload_purged_at?.toISOString() ?? null,
    receiptPurgedAt: r.receipt_purged_at?.toISOString() ?? null,
  },
});

class OperationTransaction implements SqlOperationStoreTransaction {
  private readonly persona: PostgresPersonaTransaction;
  constructor(
    private readonly client: pg.PoolClient,
    private readonly crypto: CryptoPort,
    private readonly now: () => Date,
  ) {
    this.persona = new PostgresPersonaTransaction(client);
  }
  async assertAuthorized(identity: ConsumerIdentity): Promise<void> {
    const snapshot = await this.persona.authorization(identity);
    if (!snapshot) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Consumidor indisponível.");
    assertConsumer(identity, snapshot, this.now());
  }
  async suspendStructuralPublication(operation: StoredSqlOperation): Promise<void> {
    const publication = await this.persona.catalog.publication(
      operation.personaId,
      operation.publicationId,
    );
    if (
      publication?.package.format === "persona-sql-operation-v2" &&
      publication.package.sharedKnowledge
    ) {
      await this.persona.catalog.suspend(
        operation.personaId,
        operation.publicationId,
        "source_structure_changed",
      );
    }
  }
  async assertOwner(personaId: string, ownerId: string): Promise<void> {
    const persona = await this.persona.findPersona(personaId);
    if (!persona?.active || persona.ownerId !== ownerId)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Responsável não autorizado.");
    await this.persona.setAdministrativeActor(ownerId);
  }
  async assertAuthority(operation: StoredSqlOperation): Promise<void> {
    const state = await this.persona.authorization(operation.identity);
    const publication = await this.persona.catalog.publication(
      operation.personaId,
      operation.publicationId,
    );
    const skill =
      publication && (await this.persona.catalog.find(operation.personaId, publication.skillId));
    const source = state?.sources.find((s) => s.id === operation.sourceId && s.active);
    if (
      !state ||
      !source ||
      !publication ||
      packageFormat(publication.package) !== "persona-sql-operation-v2" ||
      skill?.kind !== "operacao_sql" ||
      skill.activePublicationId !== publication.id ||
      publication.suspendedAt ||
      source.authorizationVersion !== publication.sourceVersion ||
      sourceFingerprint(source, this.crypto) !== publication.sourceFingerprint ||
      this.crypto.sha256Hex(canonicalJson(publication.package)) !== publication.hash ||
      operation.authorizationHash !==
        operationAuthorizationHash(operation.identity, state, publication.hash, source, this.crypto)
    )
      throw new PersonaV2Error("STALE_AUTHORIZATION", "Autoridade da operação foi alterada.");
    assertConsumer(operation.identity, state, this.now());
    if (publication.package.format !== "persona-sql-operation-v2")
      throw new PersonaV2Error("STALE_AUTHORIZATION", "Publicação incompatível.");
    if (
      !(await sharedOperationKnowledgeCurrent(
        this.persona,
        state.persona.ownerId,
        publication.package,
      ))
    ) {
      throw new PersonaV2Error(
        "STALE_AUTHORIZATION",
        "Conhecimento compartilhado da operação indisponível.",
      );
    }
    authorizeOperationPublication(
      operation.identity,
      state,
      { ...publication, package: publication.package },
      source,
      this.crypto,
      this.now(),
    );
  }
  async list(personaId: string, afterId?: string): Promise<readonly StoredSqlOperation[]> {
    const result = await this.client.query<Row>(
      `SELECT o.*,(SELECT evidencia FROM operacao_conciliacao_v2 c
        WHERE c.persona_id=o.persona_id AND c.operacao_id=o.id
        ORDER BY c.operation_version DESC LIMIT 1) AS conciliacao
       FROM operacao_v2 o WHERE persona_id=$1 AND ($2::uuid IS NULL OR id>$2::uuid)
       ORDER BY id LIMIT 51`,
      [personaId, afterId ?? null],
    );
    return result.rows.map(from);
  }
  async find(personaId: string, operationId: string): Promise<StoredSqlOperation | null> {
    const r = await this.client.query<Row>(
      `SELECT o.*,(SELECT evidencia FROM operacao_conciliacao_v2 c
        WHERE c.persona_id=o.persona_id AND c.operacao_id=o.id
        ORDER BY c.operation_version DESC LIMIT 1) AS conciliacao
        FROM operacao_v2 o WHERE o.persona_id=$1 AND o.id=$2 FOR UPDATE OF o`,
      [personaId, operationId],
    );
    return r.rows[0] ? from(r.rows[0]) : null;
  }
  async insert(o: StoredSqlOperation): Promise<void> {
    await this.client.query(
      `INSERT INTO operacao_v2(id,persona_id,token_id,publicacao_id,fonte_id,fingerprint,authorization_snapshot,estado,exige_aprovacao,expires_at,payload_enc)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        o.id,
        o.personaId,
        o.tokenId,
        o.publicationId,
        o.sourceId,
        o.fingerprint,
        JSON.stringify({ identity: o.identity, hash: o.authorizationHash }),
        o.state,
        o.requireHumanApproval,
        o.expiresAt,
        o.payloadEnc,
      ],
    );
    await this.audit(o);
  }
  async approval(personaId: string, operationId: string): Promise<OwnerApproval | null> {
    const r = await this.client.query<{
      operacao_id: string;
      responsavel_id: string;
      fingerprint: string;
      expires_at: Date;
    }>("SELECT * FROM aprovacao_v2 WHERE persona_id=$1 AND operacao_id=$2", [
      personaId,
      operationId,
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
    await this.client.query(
      "INSERT INTO aprovacao_v2(id,persona_id,operacao_id,responsavel_id,fingerprint,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), personaId, a.operationId, a.ownerId, a.fingerprint, a.expiresAt],
    );
  }
  async save(o: StoredSqlOperation, expectedVersion: number): Promise<void> {
    const terminal = [
      "concluida",
      "rollback_confirmado",
      "cancelada",
      "recusada",
      "expirada",
    ].includes(o.state);
    const r = await this.client.query(
      `UPDATE operacao_v2 SET estado=$4,versao=$5,comprovante=$6,updated_at=$7,
      payload_purge_at=CASE WHEN $8 THEN coalesce(payload_purge_at,$7::timestamptz+interval '24 hours') ELSE NULL END
      WHERE persona_id=$1 AND id=$2 AND versao=$3 RETURNING id`,
      [
        o.personaId,
        o.id,
        expectedVersion,
        o.state,
        o.version,
        o.receipt ? JSON.stringify(o.receipt) : null,
        this.now(),
        terminal,
      ],
    );
    if (r.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Operação alterada concorrentemente.");
    await this.audit(o);
  }
  async invalidatePhysicalSource(personaId: string, sourceId: string): Promise<void> {
    await this.client.query(
      "UPDATE fonte_fisica SET cache_revision=cache_revision+1 WHERE id IN (SELECT fonte_fisica_id FROM fonte WHERE persona_id=$1 AND id=$2)",
      [personaId, sourceId],
    );
  }
  async recordReconciliation(
    o: StoredSqlOperation,
    evidence: OperationReconciliation,
  ): Promise<void> {
    if (
      o.state !== "resultado_desconhecido" ||
      evidence.operationId !== o.id ||
      evidence.fingerprint !== o.fingerprint ||
      evidence.sourceId !== o.sourceId ||
      evidence.publicationId !== o.publicationId
    )
      throw new PersonaV2Error("OPERATION_CONFLICT", "Evidência divergente da operação.");
    const next = { ...o, version: o.version + 1 };
    await this.save(next, o.version);
    await this.client.query(
      `INSERT INTO operacao_conciliacao_v2(id,persona_id,operacao_id,evidencia,created_at,operation_version)
      VALUES($1,$2,$3,$4,$5,$6)`,
      [evidence.id, o.personaId, o.id, JSON.stringify(evidence), evidence.observedAt, next.version],
    );
    await this.client.query(
      `INSERT INTO audit_v2(id,persona_id,token_id,fonte_id,operacao_id,evento,origem,sucesso)
      VALUES($1,$2,$3,$4,$5,'operacao_conciliada','operacao',$6)`,
      [
        randomUUID(),
        o.personaId,
        o.tokenId,
        o.sourceId,
        o.id,
        evidence.classification === "aplicacao_verificada",
      ],
    );
  }
  private async audit(o: StoredSqlOperation) {
    await this.client.query(
      "INSERT INTO audit_v2(id,persona_id,token_id,fonte_id,operacao_id,evento,origem,sucesso,resource_version) VALUES($1,$2,$3,$4,$5,$6,'operacao',$7,$8)",
      [
        randomUUID(),
        o.personaId,
        o.tokenId,
        o.sourceId,
        o.id,
        `operacao_${o.state}`,
        !["resultado_desconhecido", "rollback_confirmado", "recusada", "expirada"].includes(
          o.state,
        ),
        o.version,
      ],
    );
  }
}

export class PostgresSqlOperationStore implements SqlOperationStorePort {
  constructor(
    private readonly pool: pg.Pool,
    private readonly crypto: CryptoPort,
    private readonly now: () => Date,
  ) {}
  async transaction<T>(
    identity: ConsumerIdentity,
    action: (tx: SqlOperationStoreTransaction) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM persona WHERE id=$1 FOR UPDATE", [identity.personaId]);
      if (identity.tokenId)
        await client.query(
          "SELECT id FROM persona_token WHERE persona_id=$1 AND id=$2 FOR UPDATE",
          [identity.personaId, identity.tokenId],
        );
      const result = await action(new OperationTransaction(client, this.crypto, this.now));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
