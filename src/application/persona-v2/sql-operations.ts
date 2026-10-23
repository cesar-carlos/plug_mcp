import { z } from "zod";
import { PersonaV2Error, type ConsumerIdentity } from "../../domain/persona-v2/model.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import {
  assertExecutableOperation,
  preparationExpiry,
  transitionOperation,
  validateOperationCommand,
  type OperationReceipt,
  type OperationReconciliation,
} from "../../domain/persona-v2/operation.js";
import type {
  SqlOperationAuthorityPort,
  SqlOperationStorePort,
  StoredSqlOperation,
  SqlOperationStoreTransaction,
} from "../../domain/ports/sql-operation-store.port.js";
import type {
  PersonaServices,
  SqlOperationGatewayPort,
} from "../../domain/ports/persona-v2.port.js";
import type { PersonaAdministration } from "./administration.js";
import type { SourceQueryGatewayPort } from "../../domain/ports/source-query.port.js";
import { sqlParaOdbc } from "../use-cases/shared/sql-modelo.js";
import { operationLimitsSchema } from "../../domain/persona-v2/execution-limits.js";

export const prepareOperationSchema = z.strictObject({
  publicationId: z.uuid(),
  input: z.json(),
  limits: operationLimitsSchema.optional(),
});
export const operationReferenceSchema = z.strictObject({
  operationId: z.uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});

export interface OperationSummary {
  operationId: string;
  publicationId: string;
  sourceId: string;
  fingerprint: string;
  state: StoredSqlOperation["state"];
  requireHumanApproval: boolean;
  expiresAt: Date;
  version: number;
  receipt: OperationReceipt | null;
  reconciliation: OperationReconciliation | null;
  retention?: StoredSqlOperation["retention"];
}

/** Durable local claim precedes remote dispatch. Uncertain dispatch is never retried. */
export class PersonaSqlOperations {
  constructor(
    private readonly services: PersonaServices,
    private readonly administration: PersonaAdministration,
    private readonly authority: SqlOperationAuthorityPort,
    private readonly store: SqlOperationStorePort,
    private readonly gateway: SqlOperationGatewayPort,
    private readonly reconciliationGateway?: SourceQueryGatewayPort,
  ) {}

  /** Owner metadata listing does not decrypt payloads or confer consumer authority. */
  async list(
    sessionId: string,
    personaId: string,
    afterId?: string,
  ): Promise<{
    operations: readonly OperationSummary[];
    nextCursor: string | null;
  }> {
    z.uuid().parse(personaId);
    if (afterId) z.uuid().parse(afterId);
    const session = await this.administration.validateSession(sessionId);
    return this.store.transaction(
      { personaId, tokenId: "", personaVersion: 0, tokenVersion: 0 },
      async (tx) => {
        await tx.assertOwner(personaId, session.owner.id);
        const rows = await tx.list(personaId, afterId);
        if (session.expiresAt <= this.services.now())
          throw new PersonaV2Error("ADMIN_SESSION_EXPIRED", "Sessão administrativa expirou.");
        await tx.assertOwner(personaId, session.owner.id);
        return {
          operations: rows.slice(0, 50).map((row) => this.summary(row)),
          nextCursor: rows.length > 50 ? rows[49]!.id : null,
        };
      },
    );
  }

  async prepare(identity: ConsumerIdentity, raw: unknown): Promise<OperationSummary> {
    const input = prepareOperationSchema.parse(raw);
    const authority = await this.authority.authorize(identity, input.publicationId);
    const id = this.services.crypto.randomId();
    const command = authority.command(id, input.input, input.limits);
    validateOperationCommand(command);
    if (command.operationId !== id || command.database !== authority.source.database)
      throw new PersonaV2Error("INVALID_PLAN", "Identidade ou fonte do lançamento divergente.");
    const operation: StoredSqlOperation = {
      id,
      identity,
      personaId: identity.personaId,
      tokenId: identity.tokenId,
      sourceId: authority.source.id,
      publicationId: input.publicationId,
      fingerprint: command.fingerprint,
      authorizationHash: authority.authorizationHash,
      state: authority.requireHumanApproval ? "aprovacao_pendente" : "preparada",
      requireHumanApproval: authority.requireHumanApproval,
      expiresAt: preparationExpiry(this.services.now()),
      version: 1,
      payloadEnc: this.services.crypto.encrypt(canonicalJson(command)),
      receipt: null,
    };
    await this.store.transaction(identity, async (tx) => {
      await tx.assertAuthorized(identity);
      await tx.assertAuthority(operation);
      await tx.insert(operation);
      await tx.assertAuthorized(identity);
    });
    return this.summary(operation);
  }

  async approve(sessionId: string, personaId: string, raw: unknown): Promise<OperationSummary> {
    const reference = operationReferenceSchema.parse(raw);
    const session = await this.administration.validateSession(sessionId);
    // Network/profile validation completes before obtaining local DB locks.
    const persona = await this.services.repository.transaction(
      { personaIds: [personaId], tokenIds: [] },
      (tx) => tx.findPersona(personaId),
    );
    if (!persona?.active || persona.ownerId !== session.owner.id)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Responsável não autorizado.");
    // Finding the requesting identity does not authorize the owner to change its grants.
    const identity = {
      personaId,
      tokenId: "",
      personaVersion: persona.authorizationVersion,
      tokenVersion: 0,
    };
    const prepared = await this.store.transaction(identity, (tx) =>
      tx.find(personaId, reference.operationId),
    );
    if (!prepared) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Operação indisponível.");
    const authority = await this.authority.authorize(prepared.identity, prepared.publicationId);
    if (authority.ownerId !== session.owner.id)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Responsável divergente.");
    return this.store.transaction(prepared.identity, async (tx) => {
      await tx.assertOwner(personaId, session.owner.id);
      const current = await this.require(tx, prepared.identity, reference);
      await tx.assertAuthorized(prepared.identity);
      await tx.assertAuthority(current);
      if (
        current.state !== "aprovacao_pendente" ||
        current.expiresAt <= this.services.now() ||
        session.expiresAt <= this.services.now()
      )
        throw new PersonaV2Error("OPERATION_EXPIRED", "Aprovação indisponível ou expirada.");
      this.sameAuthority(current, authority.authorizationHash);
      const next = { ...current, ...transitionOperation(current, "aprovada") };
      await tx.approve(personaId, {
        operationId: current.id,
        ownerId: session.owner.id,
        fingerprint: current.fingerprint,
        expiresAt: current.expiresAt,
      });
      await tx.save(next, current.version);
      await tx.assertAuthorized(prepared.identity);
      if (session.expiresAt <= this.services.now())
        throw new PersonaV2Error("OPERATION_EXPIRED", "Sessão expirou antes da aprovação.");
      return this.summary(next);
    });
  }

  async get(identity: ConsumerIdentity, raw: unknown): Promise<OperationSummary> {
    const reference = operationReferenceSchema.parse(raw);
    const prepared = await this.store.transaction(identity, async (tx) => {
      await tx.assertAuthorized(identity);
      const current = await this.require(tx, identity, reference);
      await tx.assertAuthority(current);
      return current;
    });
    if (
      ["executando", "cancelamento_solicitado", "resultado_desconhecido"].includes(prepared.state)
    ) {
      const authority = await this.authority.authorize(identity, prepared.publicationId);
      this.sameAuthority(prepared, authority.authorizationHash);
      // Journal evidence may resolve lost confirmation. This path never executes SQL again.
      const receipt = await this.gateway.get(authority.source, prepared.id, prepared.fingerprint);
      if (
        receipt &&
        (prepared.state !== "resultado_desconhecido" ||
          ["concluida", "rollback_confirmado"].includes(receipt.state))
      ) {
        const command = prepared.payloadEnc
          ? (JSON.parse(this.services.crypto.decrypt(prepared.payloadEnc)) as Parameters<
              SqlOperationGatewayPort["execute"]
            >[1])
          : null;
        if (
          receipt.operationId !== prepared.id ||
          receipt.fingerprint !== prepared.fingerprint ||
          !receipt.executionId ||
          !Number.isFinite(Date.parse(receipt.completedAt)) ||
          (receipt.state === "concluida" &&
            (!command ||
              !Number.isSafeInteger(receipt.directlyAffectedRows) ||
              receipt.directlyAffectedRows! < 0 ||
              receipt.directlyAffectedRows! > command.maxAffectedRows)) ||
          !["concluida", "rollback_confirmado", "resultado_desconhecido", "cancelada"].includes(
            receipt.state,
          ) ||
          (receipt.state !== "concluida" && receipt.directlyAffectedRows !== null)
        )
          throw new PersonaV2Error("OPERATION_CONFLICT", "Comprovante do journal incompatível.");
        await this.store.transaction(identity, async (tx) => {
          await tx.assertAuthorized(identity);
          const current = await this.require(tx, identity, reference);
          await tx.assertAuthority(current);
          if (
            !["executando", "cancelamento_solicitado", "resultado_desconhecido"].includes(
              current.state,
            ) ||
            current.state === receipt.state ||
            (current.state === "resultado_desconhecido" &&
              !["concluida", "rollback_confirmado"].includes(receipt.state))
          )
            return;
          await tx.save(
            { ...current, ...transitionOperation(current, receipt.state), receipt },
            current.version,
          );
          await tx.invalidatePhysicalSource(identity.personaId, current.sourceId);
          if (
            receipt.state === "cancelada" &&
            receipt.failureCode === "SOURCE_STRUCTURE_MISMATCH"
          ) {
            await tx.suspendStructuralPublication(current);
          }
        });
        if (command) await this.gateway.verifyCapabilitiesAndPolicy(authority.source, command);
      }
    }
    return this.store.transaction(identity, async (tx) => {
      await tx.assertAuthorized(identity);
      const current = await this.require(tx, identity, reference);
      await tx.assertAuthority(current);
      return this.summary(current);
    });
  }

  /** Only the authenticated human owner may review decrypted preparation content. */
  async review(
    sessionId: string,
    personaId: string,
    operationId: string,
  ): Promise<OperationSummary & { command: unknown }> {
    z.uuid().parse(operationId);
    const session = await this.administration.validateSession(sessionId);
    const persona = await this.services.repository.transaction(
      { personaIds: [personaId], tokenIds: [] },
      (tx) => tx.findPersona(personaId),
    );
    if (!persona?.active || persona.ownerId !== session.owner.id)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Responsável não autorizado.");
    const identity = {
      personaId,
      tokenId: "",
      personaVersion: persona.authorizationVersion,
      tokenVersion: 0,
    };
    return this.store.transaction(identity, async (tx) => {
      const current = await tx.find(personaId, operationId);
      await tx.assertOwner(personaId, session.owner.id);
      if (!current || session.expiresAt <= this.services.now())
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Operação indisponível.");
      return {
        ...this.summary(current),
        command: current.payloadEnc
          ? (JSON.parse(this.services.crypto.decrypt(current.payloadEnc)) as unknown)
          : null,
      };
    });
  }

  async execute(identity: ConsumerIdentity, raw: unknown): Promise<OperationSummary> {
    const reference = operationReferenceSchema.parse(raw);
    const prepared = await this.store.transaction(identity, (tx) =>
      this.require(tx, identity, reference),
    );
    const authority = await this.authority.authorize(identity, prepared.publicationId);
    if (!prepared.payloadEnc)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Conteúdo operacional indisponível.");
    const command = JSON.parse(this.services.crypto.decrypt(prepared.payloadEnc)) as Parameters<
      SqlOperationGatewayPort["execute"]
    >[1];
    validateOperationCommand(command);
    if (
      command.operationId !== prepared.id ||
      command.fingerprint !== prepared.fingerprint ||
      command.database !== authority.source.database
    )
      throw new PersonaV2Error("OPERATION_CONFLICT", "Conteúdo preparado incompatível.");
    await this.gateway.verifyCapabilitiesAndPolicy(authority.source, command);
    const claimed = await this.store.transaction(identity, async (tx) => {
      await tx.assertAuthorized(identity);
      const current = await this.require(tx, identity, reference);
      this.sameAuthority(current, authority.authorizationHash);
      await tx.assertAuthority(current);
      assertExecutableOperation(
        current,
        reference.fingerprint,
        await tx.approval(identity.personaId, current.id),
        authority.ownerId,
        this.services.now(),
      );
      if (!current.payloadEnc)
        throw new PersonaV2Error("OPERATION_CONFLICT", "Conteúdo operacional indisponível.");
      const next = { ...current, ...transitionOperation(current, "executando") };
      await tx.save(next, current.version);
      await tx.assertAuthorized(identity);
      return next;
    });
    let receipt: OperationReceipt;
    let dispatched = false;
    try {
      await this.store.transaction(identity, async (tx) => {
        await tx.assertAuthorized(identity);
        await tx.assertAuthority(claimed);
      });
      // The gateway must revalidate Client/policy/capability before its single dispatch.
      dispatched = true;
      receipt = await this.gateway.execute(authority.source, command);
      if (
        receipt.operationId !== claimed.id ||
        receipt.fingerprint !== claimed.fingerprint ||
        !["concluida", "rollback_confirmado", "resultado_desconhecido", "cancelada"].includes(
          receipt.state,
        ) ||
        !receipt.executionId ||
        !Number.isFinite(Date.parse(receipt.completedAt)) ||
        (receipt.state === "concluida" &&
          (!Number.isSafeInteger(receipt.directlyAffectedRows) ||
            receipt.directlyAffectedRows! < 0 ||
            receipt.directlyAffectedRows! > command.maxAffectedRows)) ||
        (receipt.state !== "concluida" && receipt.directlyAffectedRows !== null)
      )
        throw new PersonaV2Error("OPERATION_CONFLICT", "Comprovante incompatível.");
    } catch {
      // Includes loss of confirmation after commit; never infer rollback from transport failure.
      receipt = {
        operationId: claimed.id,
        fingerprint: claimed.fingerprint,
        state: dispatched ? "resultado_desconhecido" : "cancelada",
        executionId: claimed.id,
        directlyAffectedRows: null,
        completedAt: this.services.now().toISOString(),
      };
    }
    await this.store.transaction(identity, async (tx) => {
      const current = await this.require(tx, identity, reference);
      // A concurrent journal lookup may already have persisted stronger evidence.
      if (!["executando", "cancelamento_solicitado"].includes(current.state)) {
        if (
          current.state !== "resultado_desconhecido" ||
          !["concluida", "rollback_confirmado"].includes(receipt.state)
        )
          return;
      }
      const next = { ...current, ...transitionOperation(current, receipt.state), receipt };
      await tx.save(next, current.version);
      if (receipt.state === "cancelada" && receipt.failureCode === "SOURCE_STRUCTURE_MISMATCH") {
        await tx.suspendStructuralPublication(current);
      }
      if (["concluida", "resultado_desconhecido"].includes(receipt.state))
        await tx.invalidatePhysicalSource(identity.personaId, current.sourceId);
      // Persist evidence even if the requester has been revoked; delivery below remains authorized.
    });
    await this.gateway.verifyCapabilitiesAndPolicy(authority.source, command);
    return this.get(identity, reference);
  }

  async cancel(identity: ConsumerIdentity, raw: unknown): Promise<OperationSummary> {
    const reference = operationReferenceSchema.parse(raw);
    const prepared = await this.store.transaction(identity, (tx) =>
      this.require(tx, identity, reference),
    );
    const authority = await this.authority.authorize(identity, prepared.publicationId);
    const next = await this.store.transaction(identity, async (tx) => {
      await tx.assertAuthorized(identity);
      const current = await this.require(tx, identity, reference);
      const state = ["preparada", "aprovada", "aprovacao_pendente"].includes(current.state)
        ? "cancelada"
        : "cancelamento_solicitado";
      const next = { ...current, ...transitionOperation(current, state) };
      await tx.save(next, current.version);
      return next;
    });
    if (next.state === "cancelamento_solicitado")
      await this.gateway.cancel(authority.source, next.id, next.fingerprint);
    return this.get(identity, reference);
  }

  async reconcile(identity: ConsumerIdentity, raw: unknown): Promise<OperationSummary> {
    const reference = operationReferenceSchema.parse(raw);
    const prepared = await this.store.transaction(identity, async (tx) => {
      await tx.assertAuthorized(identity);
      const o = await this.require(tx, identity, reference);
      await tx.assertAuthority(o);
      if (o.state !== "resultado_desconhecido")
        throw new PersonaV2Error("OPERATION_CONFLICT", "Conciliação exige resultado desconhecido.");
      return o;
    });
    const authority = await this.authority.authorize(identity, prepared.publicationId);
    this.sameAuthority(prepared, authority.authorizationHash);
    if (!authority.reconciliationQuery || !this.reconciliationGateway || !prepared.payloadEnc)
      throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Conciliação treinada indisponível.");
    const command = JSON.parse(this.services.crypto.decrypt(prepared.payloadEnc)) as Parameters<
      SqlOperationGatewayPort["execute"]
    >[1];
    validateOperationCommand(command);
    if (
      command.operationId !== prepared.id ||
      command.fingerprint !== prepared.fingerprint ||
      command.database !== authority.source.database
    )
      throw new PersonaV2Error("OPERATION_CONFLICT", "Preparação divergente.");
    await this.gateway.verifyCapabilitiesAndPolicy(authority.source, command);
    const query = authority.reconciliationQuery(prepared.id);
    const lease = await this.reconciliationGateway.authorize(
      authority.source,
      [{ name: query.table, type: "table" }],
      {
        exactResources: true,
        requireDatabase: true,
        ...(query.expectedStructure ? { requireSchema: true } : {}),
      },
    );
    await this.store.transaction(identity, async (tx) => {
      await tx.assertAuthorized(identity);
      await tx.assertAuthority(await this.require(tx, identity, reference));
    });
    const result = await lease.execute(
      sqlParaOdbc(query.sql),
      Object.fromEntries(Object.entries(query.params).map(([k, v]) => [k, v.value])),
      { maxRows: 2, timeoutMs: Math.min(10000, authority.limits?.timeoutMs ?? 10000) },
      query.expectedStructure,
    );
    if (
      result.columns.length !== 1 ||
      result.columns[0]!.toLowerCase() !== "operation_marker" ||
      result.rows.length > 2 ||
      result.rows.some((r) => {
        const marker = r[result.columns[0]!];
        return (
          Object.keys(r).length !== 1 ||
          typeof marker !== "string" ||
          marker.toLowerCase() !== prepared.id.toLowerCase()
        );
      })
    )
      throw new PersonaV2Error("OPERATION_CONFLICT", "Evidência retornada incompatível.");
    const complete =
      result.truncated === false &&
      !result.pagination &&
      result.rows.length < (result.effectiveMaxRows ?? 2);
    const evidence: OperationReconciliation = {
      id: this.services.crypto.randomId(),
      operationId: prepared.id,
      fingerprint: prepared.fingerprint,
      sourceId: prepared.sourceId,
      publicationId: prepared.publicationId,
      classification:
        complete && result.rows.length === 1 ? "aplicacao_verificada" : "inconclusiva",
      complete,
      rows: result.rows.length,
      observedAt: this.services.now().toISOString(),
      queryHash: this.services.crypto.sha256Hex(canonicalJson(query)),
    };
    await lease.revalidate();
    await this.gateway.verifyCapabilitiesAndPolicy(authority.source, command);
    await this.store.transaction(identity, async (tx) => {
      await tx.assertAuthorized(identity);
      const current = await this.require(tx, identity, reference);
      await tx.assertAuthority(current);
      this.sameAuthority(current, authority.authorizationHash);
      // A journal receipt may have arrived during this read. Never overwrite it.
      if (
        current.state === "resultado_desconhecido" &&
        current.reconciliation?.classification !== "aplicacao_verificada"
      ) {
        await tx.recordReconciliation(current, evidence);
        if (evidence.classification === "aplicacao_verificada")
          await tx.invalidatePhysicalSource(identity.personaId, current.sourceId);
      }
      await tx.assertAuthorized(identity);
    });
    await lease.revalidate();
    return this.store.transaction(identity, async (tx) => {
      await tx.assertAuthorized(identity);
      const current = await this.require(tx, identity, reference);
      await tx.assertAuthority(current);
      return this.summary(current);
    });
  }

  private async require(
    tx: SqlOperationStoreTransaction,
    identity: ConsumerIdentity,
    reference: z.infer<typeof operationReferenceSchema>,
  ) {
    const current = await tx.find(identity.personaId, reference.operationId);
    if (
      current?.tokenId !== identity.tokenId ||
      canonicalJson(current.identity.grant ?? null) !== canonicalJson(identity.grant ?? null)
    )
      throw new PersonaV2Error(
        "AUTHORIZATION_DENIED",
        "Operação indisponível para este consumidor.",
      );
    if (current.fingerprint !== reference.fingerprint)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Conteúdo preparado divergente.");
    return current;
  }
  private sameAuthority(operation: StoredSqlOperation, hash: string) {
    if (operation.authorizationHash !== hash)
      throw new PersonaV2Error(
        "STALE_AUTHORIZATION",
        "Publicação, fonte ou permissões mudaram; prepare novamente.",
      );
  }
  private summary(operation: StoredSqlOperation): OperationSummary {
    return {
      operationId: operation.id,
      publicationId: operation.publicationId,
      sourceId: operation.sourceId,
      fingerprint: operation.fingerprint,
      state: operation.state,
      requireHumanApproval: operation.requireHumanApproval,
      expiresAt: operation.expiresAt,
      version: operation.version,
      receipt: operation.receipt,
      ...(operation.retention ? { retention: operation.retention } : {}),
      reconciliation: operation.reconciliation ?? null,
    };
  }
}
