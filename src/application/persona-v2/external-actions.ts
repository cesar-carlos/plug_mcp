import { z } from "zod";
import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { ConsumerIdentity } from "../../domain/persona-v2/model.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type {
  ExternalAction,
  ExternalActionPayload,
} from "../../domain/persona-v2/external-action.js";
import {
  externalPackageSchema,
  validateExternalValues,
  type ExternalActionTransport,
  type ExternalTransport,
} from "../../domain/persona-v2/external-contract.js";
import { assertConsumer } from "../../domain/persona-v2/authorization.js";
import {
  assertExecutableOperation,
  preparationExpiry,
  transitionOperation,
} from "../../domain/persona-v2/operation.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { queryLimits } from "../../domain/persona-v2/execution-limits.js";
import { operationReferenceSchema } from "./sql-operations.js";
import { externalCallSchema, type PersonaExternalIntegrations } from "./external-integrations.js";
import type { PersonaAdministration } from "./administration.js";
import {
  classifyExternalEvidence,
  type ExternalReconciliation,
} from "../../domain/persona-v2/external-reconciliation.js";

const payloadSchema = z.strictObject({
  version: z.literal(1),
  operationId: z.uuid(),
  personaId: z.uuid(),
  tokenId: z.uuid(),
  publicationId: z.uuid(),
  authorizationHash: z.string(),
  package: externalPackageSchema,
  input: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  limits: z.strictObject({
    maxBytes: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
  }),
});
const unavailable = () => new PersonaV2Error("AUTHORIZATION_DENIED", "Ação externa indisponível.");
export const externalPreparationSchema = externalCallSchema.extend({
  expectedPublicationId: z.uuid().optional(),
});
export interface ExternalActionSummary {
  operationId: string;
  skillId: string;
  publicationId: string;
  integrationId: string;
  fingerprint: string;
  state: ExternalAction["state"];
  requireHumanApproval: boolean;
  expiresAt: Date;
  version: number;
  receipt: ExternalAction["receipt"];
  reconciliation?: ExternalReconciliation | null;
  retention?: ExternalAction["retention"];
}
export interface ExternalActionReview extends ExternalActionSummary {
  name: string;
  contract: ExternalActionPayload["package"]["training"] | null;
  input: ExternalActionPayload["input"] | null;
  limits: ExternalActionPayload["limits"] | null;
}
export interface ExternalActionResult extends ExternalActionSummary {
  data: unknown;
  dataAvailability: "retained" | "purged" | "not_available";
  untrusted: true;
}
export class PersonaExternalActions {
  constructor(
    private readonly s: PersonaServices,
    private readonly admin: PersonaAdministration,
    private readonly integrations: PersonaExternalIntegrations,
    private readonly transport: ExternalActionTransport & ExternalTransport,
  ) {}
  private tx<T>(
    identity: ConsumerIdentity,
    fn: (tx: PersonaTransaction) => Promise<T>,
  ): Promise<T> {
    return this.s.repository.transaction(
      { personaIds: [identity.personaId], tokenIds: identity.tokenId ? [identity.tokenId] : [] },
      fn,
    );
  }
  private async authority(
    tx: PersonaTransaction,
    identity: ConsumerIdentity,
    skillId: string,
    hashIdentity = identity,
  ) {
    const a = await this.integrations.authorizeInTransaction(tx, identity, skillId, true);
    if (a.publication.package.training.effect !== "acao") throw unavailable();
    const hash = this.s.crypto.sha256Hex(
      canonicalJson({
        identity: hashIdentity,
        personaVersion: a.state.persona.authorizationVersion,
        tokenVersion: a.state.token.authorizationVersion,
        permissions: a.state.token.permissions,
        grant: a.state.grant ?? null,
        publicationId: a.publication.id,
        publicationHash: a.publication.hash,
        integrationId: a.connection.id,
        credentialVersion: a.connection.version,
      }),
    );
    return { ...a, authorizationHash: hash };
  }
  private async current(
    tx: PersonaTransaction,
    identity: ConsumerIdentity,
    reference: z.infer<typeof operationReferenceSchema>,
  ) {
    const a = await tx.external?.actions.find(identity.personaId, reference.operationId);
    if (a?.tokenId !== identity.tokenId || a.identity.grant?.id !== identity.grant?.id)
      throw unavailable();
    if (a.fingerprint !== reference.fingerprint)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Conteúdo da ação divergente.");
    const authority = await this.authority(tx, identity, a.skillId, a.identity);
    // Both the original preparation authority and the current caller must remain valid.
    const snapshot = await tx.authorization(identity);
    if (!snapshot) throw unavailable();
    assertConsumer(identity, snapshot, this.s.now());
    if (
      authority.authorizationHash !== a.authorizationHash ||
      authority.publication.id !== a.publicationId
    )
      throw new PersonaV2Error(
        "STALE_AUTHORIZATION",
        "Autoridade da preparação mudou; prepare novamente.",
      );
    return { action: a, authority };
  }
  private payload(a: ExternalAction): ExternalActionPayload {
    if (!a.payloadEnc) throw unavailable();
    const p = payloadSchema.parse(JSON.parse(this.s.crypto.decrypt(a.payloadEnc)));
    if (
      p.operationId !== a.id ||
      p.personaId !== a.personaId ||
      p.tokenId !== a.tokenId ||
      p.publicationId !== a.publicationId ||
      p.authorizationHash !== a.authorizationHash ||
      this.s.crypto.sha256Hex(canonicalJson(p)) !== a.fingerprint
    )
      throw new PersonaV2Error("OPERATION_CONFLICT", "Preparação cifrada incompatível.");
    validateExternalValues(p.package.training.input, p.input);
    return p;
  }
  private summary(a: ExternalAction) {
    return {
      operationId: a.id,
      skillId: a.skillId,
      publicationId: a.publicationId,
      integrationId: a.integrationId,
      fingerprint: a.fingerprint,
      state: a.state,
      requireHumanApproval: a.requireHumanApproval,
      expiresAt: a.expiresAt,
      version: a.version,
      receipt: a.receipt,
      ...(a.retention ? { retention: a.retention } : {}),
    };
  }
  async prepare(identity: ConsumerIdentity, raw: unknown): Promise<ExternalActionSummary> {
    const input = externalPreparationSchema.parse(raw);
    return this.tx(identity, async (tx) => {
      const a = await this.authority(tx, identity, input.skillId);
      if (input.expectedPublicationId && input.expectedPublicationId !== a.publication.id) {
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "A publicação mudou; revise o contrato vigente.",
        );
      }
      const limits = queryLimits(a.limits, input.limits ?? {}),
        id = this.s.crypto.randomId();
      const payload: ExternalActionPayload = {
        version: 1,
        operationId: id,
        personaId: identity.personaId,
        tokenId: identity.tokenId,
        publicationId: a.publication.id,
        authorizationHash: a.authorizationHash,
        package: a.publication.package,
        input: validateExternalValues(a.publication.package.training.input, input.input),
        limits: { maxBytes: limits.maxBytes, timeoutMs: limits.timeoutMs },
      };
      const deadlines = [
        preparationExpiry(this.s.now()).getTime(),
        a.state.token.expiresAt?.getTime() ?? Infinity,
        a.state.grant?.expiresAt.getTime() ?? Infinity,
        identity.grant?.expiresAt ?? Infinity,
      ];
      const operation: ExternalAction = {
        id,
        personaId: identity.personaId,
        tokenId: identity.tokenId,
        identity,
        skillId: input.skillId,
        integrationId: a.connection.id,
        publicationId: a.publication.id,
        authorizationHash: a.authorizationHash,
        fingerprint: this.s.crypto.sha256Hex(canonicalJson(payload)),
        state: a.requireHumanApproval ? "aprovacao_pendente" : "preparada",
        requireHumanApproval: a.requireHumanApproval,
        expiresAt: new Date(Math.min(...deadlines)),
        version: 1,
        payloadEnc: this.s.crypto.encrypt(canonicalJson(payload)),
        resultEnc: null,
        claimedAt: null,
        receipt: null,
      };
      await tx.external!.actions.insert(operation);
      await this.current(tx, identity, { operationId: id, fingerprint: operation.fingerprint });
      return this.summary(operation);
    });
  }
  private async owner<T>(
    sessionId: string,
    personaId: string,
    fn: (tx: PersonaTransaction, ownerId: string) => Promise<T>,
  ): Promise<T> {
    z.uuid().parse(personaId);
    const session = await this.admin.validateSession(sessionId);
    return this.s.repository.transaction({ personaIds: [personaId], tokenIds: [] }, async (tx) => {
      const p = await tx.findPersona(personaId);
      if (!p?.active || p.ownerId !== session.owner.id) throw unavailable();
      await tx.setAdministrativeActor(session.owner.id);
      const result = await fn(tx, session.owner.id);
      if (session.expiresAt <= this.s.now())
        throw new PersonaV2Error("ADMIN_SESSION_EXPIRED", "Sessão expirou.");
      return result;
    });
  }
  async approve(session: string, personaId: string, raw: unknown): Promise<ExternalActionSummary> {
    const reference = operationReferenceSchema.parse(raw);
    return this.owner(session, personaId, async (tx, ownerId) => {
      const stored = await tx.external?.actions.find(personaId, reference.operationId);
      if (!stored) throw unavailable();
      const { action } = await this.current(tx, stored.identity, reference);
      this.payload(action);
      if (action.state !== "aprovacao_pendente" || action.expiresAt <= this.s.now())
        throw new PersonaV2Error("OPERATION_EXPIRED", "Preparação ou aprovação indisponível.");
      await tx.external!.actions.approve(personaId, {
        operationId: action.id,
        ownerId,
        fingerprint: action.fingerprint,
        expiresAt: action.expiresAt,
      });
      const next = { ...action, ...transitionOperation(action, "aprovada") };
      await tx.external!.actions.save(next, action.version);
      await this.current(tx, stored.identity, reference);
      return this.summary(next);
    });
  }
  private async recover(tx: PersonaTransaction, a: ExternalAction): Promise<ExternalAction> {
    if (
      ["preparada", "aprovada", "aprovacao_pendente"].includes(a.state) &&
      a.expiresAt <= this.s.now()
    ) {
      const expired = { ...a, ...transitionOperation(a, "expirada") };
      await tx.external!.actions.save(expired, a.version);
      return expired;
    }
    if (a.state !== "executando" || !a.claimedAt) return a;
    const p = this.payload(a);
    if (a.claimedAt.getTime() + p.limits.timeoutMs + 5000 > this.s.now().getTime()) return a;
    const next = this.unknown(a);
    await tx.external!.actions.save(next, a.version);
    return next;
  }
  private unknown(a: ExternalAction): ExternalAction {
    return {
      ...a,
      ...transitionOperation(a, "resultado_desconhecido"),
      receipt: {
        operationId: a.id,
        fingerprint: a.fingerprint,
        state: "resultado_desconhecido",
        observedAt: this.s.now().toISOString(),
        responseHash: null,
        provesBusinessOutcome: false,
      },
    };
  }
  async list(
    session: string,
    personaId: string,
    afterId?: string,
  ): Promise<{ operations: readonly ExternalActionSummary[]; nextCursor: string | null }> {
    if (afterId) z.uuid().parse(afterId);
    return this.owner(session, personaId, async (tx) => {
      const rows = await tx.external!.actions.list(personaId, afterId);
      return {
        operations: rows.slice(0, 50).map((a) => this.summary(a)),
        nextCursor: rows.length > 50 ? rows[49]!.id : null,
      };
    });
  }
  async review(session: string, personaId: string, id: string): Promise<ExternalActionReview> {
    z.uuid().parse(id);
    return this.owner(session, personaId, async (tx) => {
      const stored = await tx.external!.actions.find(personaId, id);
      if (!stored) throw unavailable();
      const a = await this.recover(tx, stored),
        p = a.payloadEnc ? this.payload(a) : null;
      return {
        ...this.summary(a),
        name: p?.package.name ?? "Ação externa",
        contract: p?.package.training ?? null,
        input: p?.input ?? null,
        limits: p?.limits ?? null,
        reconciliation: await tx.external!.actions.latestReconciliation(personaId, a.id),
      };
    });
  }
  async get(identity: ConsumerIdentity, raw: unknown): Promise<ExternalActionResult> {
    const reference = operationReferenceSchema.parse(raw);
    return this.tx(identity, async (tx) => {
      const found = await this.current(tx, identity, reference),
        a = await this.recover(tx, found.action);
      const payload = a.payloadEnc ? this.payload(a) : null;
      let data: unknown = null;
      if (a.state === "concluida" && a.resultEnc) {
        const p = this.payload(a);
        const result = z
          .strictObject({ operationId: z.uuid(), fingerprint: z.string(), data: z.json() })
          .parse(JSON.parse(this.s.crypto.decrypt(a.resultEnc)));
        if (
          result.operationId !== a.id ||
          result.fingerprint !== a.fingerprint ||
          this.s.crypto.sha256Hex(canonicalJson(result.data)) !== a.receipt?.responseHash
        )
          throw unavailable();
        data = validateExternalValues(p.package.training.output, result.data);
      }
      await this.current(tx, identity, reference);
      const result = {
        ...this.summary(a),
        reconciliation: await tx.external!.actions.latestReconciliation(identity.personaId, a.id),
        data,
        dataAvailability: a.retention?.payloadPurgedAt
          ? ("purged" as const)
          : a.resultEnc
            ? ("retained" as const)
            : ("not_available" as const),
        untrusted: true as const,
      };
      const maxBytes = Math.min(
        found.authority.limits.maxBytes,
        payload?.limits.maxBytes ?? Infinity,
      );
      if (Buffer.byteLength(JSON.stringify(result)) > maxBytes)
        throw new PersonaV2Error("INVALID_PLAN", "Resposta da ação excede o limite concedido.");
      return result;
    });
  }
  async cancel(identity: ConsumerIdentity, raw: unknown): Promise<ExternalActionSummary> {
    const reference = operationReferenceSchema.parse(raw);
    return this.tx(identity, async (tx) => {
      const { action } = await this.current(tx, identity, reference);
      if (!["preparada", "aprovada", "aprovacao_pendente"].includes(action.state))
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "Ação enviada não pode ser cancelada ou revertida pelo MCP.",
        );
      const next = { ...action, ...transitionOperation(action, "cancelada") };
      await tx.external!.actions.save(next, action.version);
      return this.summary(next);
    });
  }
  async reconcile(identity: ConsumerIdentity, raw: unknown): Promise<ExternalReconciliation> {
    const reference = operationReferenceSchema.parse(raw);
    const inspect = (tx: PersonaTransaction) => this.current(tx, identity, reference);
    const first = await this.tx(identity, async (tx) => {
      const current = await inspect(tx);
      const action = await this.recover(tx, current.action);
      if (!["resultado_desconhecido", "concluida"].includes(action.state))
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "Conciliação exige envio terminado ou resultado desconhecido.",
        );
      const payload = this.payload(action),
        check = payload.package.training.reconciliationCheck;
      if (!check)
        throw new PersonaV2Error(
          "CAPABILITY_UNAVAILABLE",
          "Contrato publicado não possui consulta de conciliação; solicite análise manual, sem reenviar.",
        );
      const input = Object.fromEntries(
        Object.entries(check.bindings).map(([key, original]) => [key, payload.input[original]!]),
      );
      validateExternalValues(check.input, input);
      const limits = queryLimits(current.authority.limits, payload.limits);
      return { ...current, action, payload, check, input, limits };
    });
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), first.limits.timeoutMs);
    timer.unref();
    const evidence: ExternalReconciliation = {
      id: this.s.crypto.randomId(),
      operationId: reference.operationId,
      fingerprint: reference.fingerprint,
      publicationId: first.action.publicationId,
      contractHash: first.authority.publication.hash,
      observedAt: this.s.now().toISOString(),
      status: "inconclusive",
      reason: "provider_unavailable",
      responseHash: null,
      permitsRetry: false,
    };
    const revalidate = async () => {
      if (controller.signal.aborted) throw unavailable();
      await this.tx(identity, inspect);
    };
    try {
      let observed = evidence;
      try {
        const data = validateExternalValues(
          first.check.output,
          await this.transport.invoke(
            first.authority.connection,
            {
              operationId: first.payload.package.training.operationId,
              integrationId: first.action.integrationId,
              purpose: first.check.guarantee,
              effect: "consulta",
              transport: first.check.transport,
              input: first.check.input,
              output: first.check.output,
              timeoutMs: first.limits.timeoutMs,
              maxResponseBytes: first.limits.maxBytes,
            },
            first.input,
            controller.signal,
            revalidate,
          ),
        );
        if (
          Buffer.byteLength(canonicalJson(data)) > first.limits.maxBytes ||
          controller.signal.aborted
        )
          throw unavailable();
        observed = {
          ...evidence,
          ...classifyExternalEvidence(first.check, first.payload.input, data),
          observedAt: this.s.now().toISOString(),
          responseHash: this.s.crypto.sha256Hex(canonicalJson(data)),
        };
      } catch {
        // Failed reads are inconclusive, never proof of absence or a reason to replay the effect.
        observed = { ...evidence, observedAt: this.s.now().toISOString() };
      }
      return await this.tx(identity, async (tx) => {
        await inspect(tx);
        if (Buffer.byteLength(canonicalJson(observed)) > first.limits.maxBytes) throw unavailable();
        await tx.external!.actions.recordReconciliation(identity.personaId, observed);
        await inspect(tx);
        return observed;
      });
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  async execute(identity: ConsumerIdentity, raw: unknown): Promise<ExternalActionResult> {
    const reference = operationReferenceSchema.parse(raw);
    const initial = await this.tx(identity, async (tx) => {
      const a = await this.current(tx, identity, reference);
      assertExecutableOperation(
        a.action,
        reference.fingerprint,
        await tx.external!.actions.approval(identity.personaId, a.action.id),
        a.authority.state.persona.ownerId,
        this.s.now(),
      );
      return { ...a, payload: this.payload(a.action) };
    });
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), initial.payload.limits.timeoutMs);
    timer.unref();
    let claimed = false;
    const beforeDispatch = async () => {
      if (controller.signal.aborted) throw unavailable();
      await this.tx(identity, async (tx) => {
        const { action, authority } = await this.current(tx, identity, reference);
        assertExecutableOperation(
          action,
          reference.fingerprint,
          await tx.external!.actions.approval(identity.personaId, action.id),
          authority.state.persona.ownerId,
          this.s.now(),
        );
      });
    };
    const beforeEffect = async () => {
      await this.tx(identity, async (tx) => {
        const { action, authority } = await this.current(tx, identity, reference);
        assertExecutableOperation(
          action,
          reference.fingerprint,
          await tx.external!.actions.approval(identity.personaId, action.id),
          authority.state.persona.ownerId,
          this.s.now(),
        );
        if (controller.signal.aborted) throw unavailable();
        await tx.external!.actions.save(
          { ...action, ...transitionOperation(action, "executando"), claimedAt: this.s.now() },
          action.version,
        );
      });
      claimed = true;
    };
    try {
      const p = initial.payload;
      const data = validateExternalValues(
        p.package.training.output,
        await this.transport.executeAction(
          initial.authority.connection,
          {
            ...p.package.training,
            timeoutMs: p.limits.timeoutMs,
            maxResponseBytes: p.limits.maxBytes,
          },
          p.input,
          controller.signal,
          beforeDispatch,
          beforeEffect,
        ),
      );
      if (!claimed)
        throw new PersonaV2Error("OPERATION_CONFLICT", "Transporte não confirmou o claim durável.");
      if (controller.signal.aborted || Buffer.byteLength(canonicalJson(data)) > p.limits.maxBytes)
        throw unavailable();
      // Evidence is journaled even after revocation; this never authorizes its delivery.
      await this.tx(identity, async (tx) => {
        const a = await tx.external!.actions.find(identity.personaId, reference.operationId);
        if (a?.fingerprint !== reference.fingerprint || a.state !== "executando")
          throw unavailable();
        await tx.external!.actions.save(
          {
            ...a,
            ...transitionOperation(a, "concluida"),
            resultEnc: this.s.crypto.encrypt(
              canonicalJson({ operationId: a.id, fingerprint: a.fingerprint, data }),
            ),
            receipt: {
              operationId: a.id,
              fingerprint: a.fingerprint,
              state: "concluida",
              observedAt: this.s.now().toISOString(),
              responseHash: this.s.crypto.sha256Hex(canonicalJson(data)),
              provesBusinessOutcome: false,
            },
          },
          a.version,
        );
      });
      const result = await this.get(identity, reference);
      if (controller.signal.aborted) throw unavailable();
      return result;
    } catch (error) {
      if (claimed)
        await this.tx(identity, async (tx) => {
          const a = await tx.external!.actions.find(identity.personaId, reference.operationId);
          if (a?.state === "executando" && a.fingerprint === reference.fingerprint)
            await tx.external!.actions.save(this.unknown(a), a.version);
        });
      if (error instanceof PersonaV2Error) throw error;
      throw new PersonaV2Error(
        "CAPABILITY_UNAVAILABLE",
        "Confirmação externa indisponível; consulte o estado sem repetir o envio.",
      );
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
}
