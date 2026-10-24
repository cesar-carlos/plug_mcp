import type { ExternalDiscoveryTransport } from "../../domain/ports/external-discovery.port.js";
import { z } from "zod";
import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type {
  AdministrativeActor,
  AdministrativeContext,
  PersonaAdministrativeAuthorization,
} from "./administrative-authorization.js";
import {
  externalContractSchema,
  validateExternalValues,
  type ExternalPackage,
  type ExternalPublication,
  type ExternalTransport,
  type ExternalConnection,
  type ExternalActionTransport,
} from "../../domain/persona-v2/external-contract.js";
import {
  PersonaV2Error,
  type ConsumerIdentity,
  type AuthorizationSnapshot,
} from "../../domain/persona-v2/model.js";
import type { IntegrationReference } from "../../domain/persona-v2/integration-credential.js";
import type { QueryLimits } from "../../domain/persona-v2/execution-limits.js";
import { assertConsumer, authorizePublication } from "../../domain/persona-v2/authorization.js";
import { canonicalJson, type TrainingCase } from "../../domain/persona-v2/catalog.js";
import { queryLimits, queryLimitsSchema } from "../../domain/persona-v2/execution-limits.js";
import {
  publicationReviewPlan,
  confirmPublicationReview,
  createPublicationCalendar,
} from "./review-publication.js";
import { evaluateExternalCases, externalCaseContentSchema } from "./external-publication-cases.js";
import {
  externalRunManifestSchema,
  type ExternalFixtureControl,
  type ExternalRun,
  type ExternalRunResult,
  type ExternalTestDetails,
  type ExternalDraftSummary,
  type ExternalDraftDetails,
  type ExternalPublicationPreview,
} from "../../domain/persona-v2/external-run.js";
import { publicationReview } from "./publication-review.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import {
  importOpenApi,
  importMcpTools,
  type ExternalImportResult,
} from "../../domain/persona-v2/external-import.js";
const denied = () =>
  new PersonaV2Error("AUTHORIZATION_DENIED", "Integração ou publicação indisponível.");
export const externalDraftCreateSchema = z.strictObject({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(100),
  name: z.string().min(1).max(200),
  contract: z.json(),
  expectedConnection: z
    .strictObject({
      id: z.uuid(),
      version: z.number().int().positive(),
      destination: z.string(),
    })
    .optional(),
});
export const externalDraftUpdateSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  contract: z.json(),
});
export const externalImportSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("openapi"),
    integrationId: z.uuid(),
    version: z.number().int().positive(),
    document: z.json(),
  }),
  z.strictObject({
    kind: z.literal("mcp"),
    integrationId: z.uuid(),
    version: z.number().int().positive(),
    confirmed: z.literal("discover"),
  }),
]);
export const externalCallSchema = z.strictObject({
  skillId: z.uuid(),
  input: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  limits: queryLimitsSchema.pick({ maxBytes: true, timeoutMs: true }).optional(),
});
export class PersonaExternalIntegrations {
  constructor(
    private readonly s: Pick<PersonaServices, "repository" | "crypto" | "now">,
    private readonly admin: Pick<PersonaAdministrativeAuthorization, "run">,
    private readonly transport: ExternalTransport,
    private readonly discovery?: ExternalDiscoveryTransport,
  ) {}
  private editorialAllowed(
    actor: AdministrativeActor,
    context: AdministrativeContext,
    id: string,
  ): boolean {
    if (typeof actor === "string") return true;
    if (!context.state) return false;
    return assertConsumer(actor, context.state, this.s.now()).every(
      (layer) => layer.managedIntegrationIds?.includes(id) === true,
    );
  }
  private async assertEditorialDraft(
    tx: PersonaTransaction,
    actor: AdministrativeActor,
    context: AdministrativeContext,
    personaId: string,
    skillId: string,
  ): Promise<void> {
    const draft = await tx.catalog.find(personaId, skillId);
    if (
      draft?.kind !== "acao_externa" ||
      !this.editorialAllowed(
        actor,
        context,
        externalContractSchema.parse(draft.training).integrationId,
      )
    )
      throw denied();
  }
  async importCandidates(
    session: AdministrativeActor,
    personaId: string,
    raw: unknown,
  ): Promise<ExternalImportResult> {
    const input = externalImportSchema.parse(raw);
    const connection = await this.admin.run(
      session,
      personaId,
      "gerenciar_integracoes",
      async (tx, ctx) => {
        if (!this.editorialAllowed(session, ctx, input.integrationId)) throw denied();
        const value = await tx.external!.connection(personaId, input.integrationId);
        if (
          value?.version !== input.version ||
          value.kind !== (input.kind === "mcp" ? "mcp_http" : "rest")
        )
          throw denied();
        return value;
      },
    );
    const check = () =>
      this.admin.run(session, personaId, "gerenciar_integracoes", async (tx, ctx) => {
        if (!this.editorialAllowed(session, ctx, input.integrationId)) throw denied();
        const current = await tx.external!.connection(personaId, input.integrationId);
        if (
          current?.version !== connection.version ||
          current.destination !== connection.destination ||
          current.kind !== connection.kind ||
          current.active !== connection.active
        )
          throw denied();
      });
    let candidates;
    if (input.kind === "openapi") {
      const text = JSON.stringify(input.document);
      if (!text || new TextEncoder().encode(text).length > 524288)
        throw new PersonaV2Error("INVALID_PLAN", "Documento acima de 512 KiB.");
      this.assertEditorialSecrets(input.document);
      candidates = importOpenApi(input.document);
    } else {
      if (!this.discovery)
        throw new PersonaV2Error(
          "CAPABILITY_UNAVAILABLE",
          "Descoberta indisponível nesta composição.",
        );
      const catalog = await this.discovery.discover(connection, AbortSignal.timeout(15000), check);
      if (!catalog.complete)
        throw new PersonaV2Error(
          "CAPABILITY_UNAVAILABLE",
          "Catálogo MCP incompleto; nenhuma proposta habilitada.",
        );
      candidates = importMcpTools(catalog);
      this.assertEditorialSecrets(candidates);
    }
    await check();
    return {
      connection: {
        id: connection.id,
        version: connection.version,
        destination: connection.destination,
      },
      candidates,
      warnings: [
        "Somente proposta em memória. Revise finalidade, classificação, efeitos e conciliação; salvar cria apenas rascunho.",
        "Destino e credencial vêm da integração selecionada. Descrições remotas não são instruções ou autorização.",
      ],
    };
  }
  async create(
    session: AdministrativeActor,
    personaId: string,
    raw: unknown,
  ): Promise<{ skillId: string; operationId: string }> {
    const input = externalDraftCreateSchema.parse(raw);
    const contract = externalContractSchema.parse({
      ...z.record(z.string(), z.json()).parse(input.contract),
      operationId: this.s.crypto.randomId(),
    });
    this.assertEditorialSecrets({ name: input.name, contract });
    return this.admin.run(session, personaId, "gerenciar_integracoes", async (tx, ctx) => {
      if (!this.editorialAllowed(session, ctx, contract.integrationId)) throw denied();
      const connection = await tx.external?.connection(personaId, contract.integrationId);
      if (connection?.kind !== contract.transport.kind) throw denied();
      if (
        input.expectedConnection &&
        (input.expectedConnection.id !== contract.integrationId ||
          input.expectedConnection.version !== connection.version ||
          input.expectedConnection.destination !== connection.destination)
      )
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "Integração mudou; descarte a proposta e importe novamente.",
        );
      const id = this.s.crypto.randomId();
      await tx.catalog.create({
        id,
        personaId,
        slug: input.slug,
        name: input.name,
        kind: "acao_externa",
        revision: 1,
        training: contract,
        activePublicationId: null,
      });
      return { skillId: id, operationId: contract.operationId };
    });
  }
  private assertEditorialSecrets(value: unknown): void {
    if (pareceSegredoEmTexto(canonicalJson(value))) {
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Contrato contém segredo; credenciais entram somente no setup do navegador.",
      );
    }
  }
  async connections(
    session: AdministrativeActor,
    personaId: string,
  ): Promise<readonly (IntegrationReference & { active: boolean })[]> {
    return this.admin.run(session, personaId, "gerenciar_integracoes", async (tx, ctx) =>
      (await tx.external!.connections(personaId)).filter((c) =>
        this.editorialAllowed(session, ctx, c.id),
      ),
    );
  }
  async detail(
    session: AdministrativeActor,
    personaId: string,
    skillId: string,
  ): Promise<ExternalDraftDetails> {
    return this.admin.run(session, personaId, "treinar", async (tx, ctx) => {
      await this.assertEditorialDraft(tx, session, ctx, personaId, skillId);
      const draft = await tx.catalog.find(personaId, skillId);
      if (draft?.kind !== "acao_externa") {
        throw denied();
      }
      return {
        skillId,
        slug: draft.slug,
        name: draft.name,
        revision: draft.revision,
        contract: externalContractSchema.parse(draft.training),
        published: draft.activePublicationId !== null,
        publication: await tx.external!.publication(personaId, skillId),
      };
    });
  }
  async update(
    session: AdministrativeActor,
    personaId: string,
    skillId: string,
    raw: unknown,
  ): Promise<{ revision: number }> {
    const input = externalDraftUpdateSchema.parse(raw);
    this.assertEditorialSecrets(input);
    return this.admin.run(session, personaId, "gerenciar_integracoes", async (tx, ctx) => {
      await this.assertEditorialDraft(tx, session, ctx, personaId, skillId);
      const draft = await tx.catalog.find(personaId, skillId);
      if (draft?.kind !== "acao_externa") {
        throw denied();
      }
      if (draft.activePublicationId || draft.revision !== input.expectedRevision) {
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "Rascunho mudou ou já foi publicado. Preserve sua edição; contrato publicado exige nova skill/operação.",
        );
      }
      const previous = externalContractSchema.parse(draft.training);
      const contract = externalContractSchema.parse(input.contract);
      if (!this.editorialAllowed(session, ctx, contract.integrationId)) throw denied();
      if (contract.operationId !== previous.operationId) {
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Identidade da operação é atribuída pelo servidor e não pode ser alterada.",
        );
      }
      const connection = await tx.external!.connection(personaId, contract.integrationId);
      if (connection?.kind !== contract.transport.kind) {
        throw denied();
      }
      await tx.catalog.update(
        { ...draft, name: input.name, training: contract, revision: draft.revision + 1 },
        input.expectedRevision,
      );
      return { revision: draft.revision + 1 };
    });
  }
  private async compile(
    tx: PersonaTransaction,
    personaId: string,
    skillId: string,
    requireReport: boolean,
    requireCases = true,
  ) {
    const draft = await tx.catalog.find(personaId, skillId);
    if (draft?.kind !== "acao_externa") throw denied();
    const training = externalContractSchema.parse(draft.training);
    const connection = await tx.external?.connection(personaId, training.integrationId);
    if (connection?.kind !== training.transport.kind) throw denied();
    const pkg: ExternalPackage = {
      format: "persona-external-v2",
      name: draft.name,
      training,
      destination: connection.destination,
      credentialVersion: connection.version,
      requiredCapabilities: [
        `external-contract:${this.s.crypto.sha256Hex(canonicalJson(training))}`,
      ],
    };
    const hash = this.s.crypto.sha256Hex(canonicalJson(pkg));
    const cases = await tx.catalog.cases(personaId, skillId),
      casesHash = this.s.crypto.sha256Hex(canonicalJson(cases));
    if (cases.length > 256)
      throw new PersonaV2Error("INVALID_PLAN", "Máximo de 256 casos por skill externa.");
    if (requireCases && !cases.some((c) => c.required))
      throw new PersonaV2Error(
        "INCOMPLETE_INPUT",
        "Integração exige casos obrigatórios do runner isolado.",
      );
    if (
      requireReport &&
      !(await tx.catalog.approvedReport(personaId, skillId, draft.revision, hash, casesHash))
    )
      throw new PersonaV2Error("INCOMPLETE_INPUT", "Relatório atual do runner obrigatório.");
    return { draft, pkg, hash, cases, casesHash, connection };
  }
  async drafts(
    session: AdministrativeActor,
    personaId: string,
  ): Promise<readonly ExternalDraftSummary[]> {
    return this.admin.run(session, personaId, "treinar", async (tx, ctx) =>
      (await tx.catalog.list(personaId))
        .filter(
          (d) =>
            d.kind === "acao_externa" &&
            this.editorialAllowed(
              session,
              ctx,
              externalContractSchema.parse(d.training).integrationId,
            ),
        )
        .map((d) => ({
          skillId: d.id,
          name: d.name,
          revision: d.revision,
          effect: externalContractSchema.parse(d.training).effect,
          publicationId: d.activePublicationId,
        })),
    );
  }
  async tests(
    session: AdministrativeActor,
    personaId: string,
    skillId: string,
    afterId?: string,
  ): Promise<ExternalTestDetails> {
    if (afterId) z.uuid().parse(afterId);
    return this.admin.run(session, personaId, "treinar", async (tx, ctx) => {
      const granted =
        typeof session === "string"
          ? undefined
          : await this.authorizeEditorialCases(tx, session, ctx, skillId);
      const c = await this.compile(tx, personaId, skillId, false, false);
      if (granted && granted.publication.hash !== c.hash) throw denied();
      const rows = await tx.external!.reports(personaId, skillId, afterId);
      return {
        skillId,
        name: c.draft.name,
        revision: c.draft.revision,
        packageHash: c.hash,
        casesHash: c.casesHash,
        contract: c.pkg.training,
        cases: c.cases,
        ownerId: (await tx.findPersona(personaId))!.ownerId,
        requiredApproved: await tx.catalog.approvedReport(
          personaId,
          skillId,
          c.draft.revision,
          c.hash,
          c.casesHash,
        ),
        reports: rows.slice(0, 50).map((r) => ({
          ...r,
          current:
            r.revision === c.draft.revision &&
            r.packageHash === c.hash &&
            r.casesHash === c.casesHash,
        })),
        nextCursor: rows.length > 50 ? rows[49]!.id : null,
      };
    });
  }
  async changeCase(
    session: AdministrativeActor,
    personaId: string,
    skillId: string,
    raw: unknown,
  ): Promise<{ case: TrainingCase; revision: number }> {
    const input = z
      .strictObject({
        expectedRevision: z.number().int().positive(),
        id: z.uuid().optional(),
        remove: z.boolean().optional(),
        required: z.boolean(),
        content: externalCaseContentSchema,
      })
      .parse(raw);
    if (pareceSegredoEmTexto(canonicalJson(input.content)))
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Caso contém segredo; utilize somente dados sintéticos.",
      );
    return this.admin.run(session, personaId, "treinar", async (tx, ctx) => {
      const granted =
        typeof session === "string"
          ? undefined
          : await this.authorizeEditorialCases(tx, session, ctx, skillId);
      const c = await this.compile(tx, personaId, skillId, false, false);
      if (granted && granted.publication.hash !== c.hash) throw denied();
      if (c.draft.revision !== input.expectedRevision)
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "Rascunho mudou; recarregue sem perder sua edição.",
        );
      validateExternalValues(c.pkg.training.input, input.content.input);
      validateExternalValues(c.pkg.training.output, input.content.expected);
      const test = {
        id: input.id ?? this.s.crypto.randomId(),
        required: input.required,
        content: input.content,
      };
      if (input.id) {
        await tx.external!.changeCase(personaId, skillId, test, input.remove === true);
      } else {
        if (input.remove || c.cases.length >= 256)
          throw new PersonaV2Error("INVALID_PLAN", "Cadastro de caso indisponível.");
        await tx.catalog.saveCase(personaId, skillId, test);
      }
      return { case: test, revision: c.draft.revision + 1 };
    });
  }
  private async authorizeEditorialCases(
    tx: PersonaTransaction,
    actor: ConsumerIdentity,
    context: AdministrativeContext,
    skillId: string,
  ) {
    const draft = await tx.catalog.find(actor.personaId, skillId);
    if (draft?.kind !== "acao_externa") throw denied();
    // Published contracts retain their exact execution grant requirements.
    if (draft.activePublicationId) return this.authorizeInTransaction(tx, actor, skillId, true);
    await this.assertEditorialDraft(tx, actor, context, actor.personaId, skillId);
    return undefined;
  }
  /** Local operator only: never registered as an HTTP/MCP execution endpoint. */
  async runOperatorFixtureCases(
    raw: unknown,
    transport: ExternalTransport & ExternalActionTransport,
    control: ExternalFixtureControl,
  ): Promise<ExternalRunResult> {
    const manifest = externalRunManifestSchema.parse(raw);
    const captureInTransaction = async (tx: PersonaTransaction, allowEmpty = false) => {
      const persona = await tx.findPersona(manifest.personaId);
      if (!persona?.active || persona.ownerId !== manifest.ownerId) throw denied();
      const c = await this.compile(tx, manifest.personaId, manifest.skillId, false, !allowEmpty);
      const fixture = await tx.external?.connection(
        manifest.personaId,
        manifest.fixtureIntegrationId,
      );
      if (
        c.draft.revision !== manifest.revision ||
        c.hash !== manifest.packageHash ||
        c.casesHash !== manifest.casesHash ||
        !fixture ||
        fixture.id === c.pkg.training.integrationId ||
        fixture.version !== manifest.fixtureCredentialVersion ||
        fixture.kind !== c.pkg.training.transport.kind ||
        this.s.crypto.sha256Hex(fixture.destination) !== manifest.fixtureDestinationHash ||
        canonicalJson(fixture.credential) === canonicalJson(c.connection.credential) ||
        new URL(fixture.destination).hostname === new URL(c.pkg.destination).hostname
      )
        throw denied();
      return { ...c, fixture };
    };
    const capture = () =>
      this.s.repository.transaction(
        { personaIds: [manifest.personaId], tokenIds: [] },
        captureInTransaction,
      );
    const candidate = await capture();
    const run: ExternalRun = {
      runId: manifest.runId,
      state: "running",
      manifest,
      fixtureOriginHash: this.s.crypto.sha256Hex(new URL(candidate.fixture.destination).origin),
    };
    await this.s.repository.transaction(
      { personaIds: [manifest.personaId], tokenIds: [] },
      async (tx) => {
        // Capture again under the same locks as the preventive report and unique claim.
        await captureInTransaction(tx);
        await tx.external!.startRun(run);
      },
    );
    let results: { id: string; passed: boolean }[] = [],
      uncertain: boolean,
      cleaned = false,
      verified = false;
    try {
      const check = async () => {
        await capture();
        await control.verify(candidate.fixture, manifest, AbortSignal.timeout(3000));
        verified = true;
      };
      await check();
      const evaluated = await evaluateExternalCases(
        candidate.pkg,
        candidate.cases,
        candidate.fixture,
        transport,
        check,
      );
      results = evaluated.results;
      uncertain = evaluated.uncertain;
    } catch {
      uncertain = true;
    } finally {
      // Cleanup is attempted once on the originally claimed fixture, even if local authority changed.
      if (verified) {
        try {
          await control.cleanup(candidate.fixture, manifest, AbortSignal.timeout(3000));
          cleaned = true;
        } catch {
          uncertain = true;
        }
      }
    }
    let current = true;
    try {
      await capture();
    } catch {
      current = false;
    }
    const approved =
      current &&
      cleaned &&
      !uncertain &&
      results.length === candidate.cases.length &&
      results.every((r) => r.passed);
    const final: ExternalRun = {
      ...run,
      state: uncertain ? "unknown" : approved ? "passed" : "failed",
    };
    await this.s.repository.transaction(
      { personaIds: [manifest.personaId], tokenIds: [] },
      async (tx) => {
        let stillCurrent = true;
        try {
          await captureInTransaction(tx, true);
        } catch (e) {
          if (!(e instanceof PersonaV2Error || e instanceof z.ZodError)) throw e;
          stillCurrent = false;
        }
        await tx.external!.finishRun(
          { ...final, state: approved && !stillCurrent ? "failed" : final.state },
          approved && !!stillCurrent,
          results,
        );
        if (approved && !stillCurrent) current = false;
      },
    );
    return {
      runId: manifest.runId,
      approved: approved && current,
      state: approved && !current ? "failed" : final.state,
      revision: manifest.revision,
      packageHash: manifest.packageHash,
      casesHash: manifest.casesHash,
      results,
    };
  }
  async preview(
    session: AdministrativeActor,
    personaId: string,
    skillId: string,
    dueAt?: string,
  ): Promise<ExternalPublicationPreview> {
    return this.admin.run(session, personaId, "publicar", async (tx, ctx) => {
      await this.assertEditorialDraft(tx, session, ctx, personaId, skillId);
      const c = await this.compile(tx, personaId, skillId, true);
      const target = {
        kind: "privado" as const,
        draftId: skillId,
        personaId,
        catalogId: null,
        revision: c.draft.revision,
        hash: c.hash,
      };
      const plan = await publicationReviewPlan(
        tx.knowledgeMaintenance,
        target,
        ctx.ownerId,
        this.s.now(),
        dueAt,
        typeof session === "string",
      );
      const hash = this.s.crypto.sha256Hex(this.s.crypto.randomToken(32)),
        expiresAt = new Date(this.s.now().getTime() + 900000);
      await tx.catalog.savePreview({
        hash,
        personaId,
        skillId,
        ownerId: ctx.ownerId,
        administrativeContext: ctx.binding,
        revision: c.draft.revision,
        packageHash: c.hash,
        personaVersion: (await tx.findPersona(personaId))!.authorizationVersion,
        sourceFingerprint: c.hash,
        previousPublicationId: c.draft.activePublicationId,
        expiresAt,
        consumedAt: null,
      });
      await tx.knowledgeMaintenance!.bindReviewPlan(hash, plan);
      const previous = await tx.external!.publication(personaId, skillId);
      const previousCapabilities = previous?.package.requiredCapabilities ?? [];
      const sections = publicationReview(previous?.package ?? null, c.pkg);
      return {
        confirmationHash: hash,
        expiresAt,
        package: c.pkg,
        hash: c.hash,
        packageHash: c.hash,
        revision: c.draft.revision,
        reviewDueAt: plan.dueAt,
        warnings: [
          "Publicação não executa a ação nem amplia concessões. Aprovação de cada ação permanece separada.",
          "Contrato externo publicado exige nova skill/operação para alterações; não há republicação desta skill.",
        ],
        review: {
          previousRevision: previous?.revision ?? null,
          sections,
          cases: {
            total: c.cases.length,
            required: c.cases.filter((test) => test.required).length,
            requiredApproved: true,
          },
          impact: { total: 0, publications: [] },
          existingTokensExpanded: false,
        },
        diff: {
          previousPublicationId: previous?.id ?? null,
          previousPackageHash: previous?.hash ?? null,
          addedCapabilities: c.pkg.requiredCapabilities.filter(
            (cap) => !previousCapabilities.includes(cap),
          ),
          removedCapabilities: previousCapabilities.filter(
            (cap) => !c.pkg.requiredCapabilities.includes(cap),
          ),
          changedFields: sections.flatMap((section) =>
            section.changes.map((change) => change.path),
          ),
        },
      };
    });
  }
  async publish(
    session: AdministrativeActor,
    personaId: string,
    skillId: string,
    hash: string,
  ): Promise<ExternalPublication> {
    return this.admin.run(session, personaId, "publicar", async (tx, ctx) => {
      await this.assertEditorialDraft(tx, session, ctx, personaId, skillId);
      const c = await this.compile(tx, personaId, skillId, true),
        p = await tx.catalog.preview(personaId, skillId, hash);
      if (
        p?.ownerId !== ctx.ownerId ||
        (p.administrativeContext ?? null) !== ctx.binding ||
        p.consumedAt ||
        p.expiresAt <= this.s.now() ||
        p.revision !== c.draft.revision ||
        p.packageHash !== c.hash ||
        p.previousPublicationId !== c.draft.activePublicationId ||
        p.personaVersion !== (await tx.findPersona(personaId))!.authorizationVersion
      )
        throw new PersonaV2Error("OPERATION_CONFLICT", "Prévia alterada ou expirada.");
      if (c.draft.activePublicationId)
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "Crie nova skill/operação para publicar outro contrato; concessões não são herdadas.",
        );
      const plan = await confirmPublicationReview(
        tx.knowledgeMaintenance,
        {
          kind: "privado",
          draftId: skillId,
          personaId,
          catalogId: null,
          revision: c.draft.revision,
          hash: c.hash,
        },
        hash,
        this.s.now(),
      );
      const value: ExternalPublication = {
        id: this.s.crypto.randomId(),
        personaId,
        skillId,
        revision: c.draft.revision,
        hash: c.hash,
        package: c.pkg,
        suspendedAt: null,
      };
      await tx.external!.publish(value, hash, this.s.now());
      await createPublicationCalendar(
        tx.knowledgeMaintenance!,
        { kind: "privado", publicationId: value.id, hash: value.hash, personaId, catalogId: null },
        plan,
        this.s.now(),
      );
      return value;
    });
  }
  private authorized<T>(
    identity: ConsumerIdentity,
    action: (tx: PersonaTransaction) => Promise<T>,
  ): Promise<T> {
    return this.s.repository.transaction(
      { personaIds: [identity.personaId], tokenIds: [identity.tokenId] },
      async (tx) => {
        const state = await tx.authorization(identity);
        if (!state) throw denied();
        assertConsumer(identity, state, this.s.now());
        const result = await action(tx);
        const after = await tx.authorization(identity);
        if (!after) throw denied();
        assertConsumer(identity, after, this.s.now());
        return result;
      },
    );
  }
  async authorizeInTransaction(
    tx: PersonaTransaction,
    identity: ConsumerIdentity,
    skillId: string,
    allowApproval = false,
  ): Promise<{
    publication: ExternalPublication;
    connection: IntegrationReference & ExternalConnection & { active: boolean };
    limits: QueryLimits;
    state: AuthorizationSnapshot;
    requireHumanApproval: boolean;
  }> {
    const p = await tx.external?.publication(identity.personaId, skillId),
      state = await tx.authorization(identity);
    if (!p || !state) throw denied();
    const approval = authorizePublication(
      identity,
      state,
      {
        id: p.id,
        personaId: p.personaId,
        skillId: p.skillId,
        kind: "acao_externa",
        sourceIds: [],
        externalOperationIds: [p.package.training.operationId],
        requiredCapabilities: p.package.requiredCapabilities,
        effects: [],
        hash: p.hash,
        suspendedAt: p.suspendedAt,
        approval:
          p.package.training.effect === "acao"
            ? (p.package.training.approval ?? "human")
            : "automatic",
      },
      this.s.now(),
    );
    if (approval.requireHumanApproval && !allowApproval)
      throw new PersonaV2Error(
        "APPROVAL_REQUIRED",
        "Consumidor exige aprovação adicional; execução direta indisponível.",
      );
    const connection = await tx.external!.connection(
      identity.personaId,
      p.package.training.integrationId,
    );
    if (
      !connection?.active ||
      connection.version !== p.package.credentialVersion ||
      connection.destination !== p.package.destination ||
      connection.kind !== p.package.training.transport.kind
    )
      throw denied();
    const limits = queryLimits(
      { maxBytes: p.package.training.maxResponseBytes, timeoutMs: p.package.training.timeoutMs },
      ...assertConsumer(identity, state, this.s.now()).flatMap((permission) => [
        permission.queryLimits ?? {},
        permission.skills.find((grant) => grant.skillId === skillId)?.queryLimits ?? {},
        ...(p.package.training.effect === "acao"
          ? [
              { timeoutMs: permission.operationLimits?.timeoutMs },
              {
                timeoutMs: permission.skills.find((grant) => grant.skillId === skillId)
                  ?.operationLimits?.timeoutMs,
              },
            ]
          : []),
      ]),
    );
    return {
      publication: p,
      connection,
      limits,
      state,
      requireHumanApproval: approval.requireHumanApproval,
    };
  }
  async list(identity: ConsumerIdentity): Promise<
    readonly {
      skillId: string;
      publicationId: string;
      hash: string;
      name: string;
      contract: ExternalPackage["training"];
    }[]
  > {
    return this.authorized(identity, async (tx) => {
      const result = [];
      for (const draft of await tx.catalog.list(identity.personaId)) {
        if (draft.kind !== "acao_externa") continue;
        try {
          const { publication: p } = await this.authorizeInTransaction(
            tx,
            identity,
            draft.id,
            true,
          );
          result.push({
            skillId: p.skillId,
            publicationId: p.id,
            hash: p.hash,
            name: p.package.name,
            contract: p.package.training,
          });
        } catch (e) {
          if (!(e instanceof PersonaV2Error)) throw e;
        }
      }
      return result;
    });
  }
  async query(
    identity: ConsumerIdentity,
    raw: unknown,
  ): Promise<{
    data: unknown;
    publicationId: string;
    contractHash: string;
    integrationId: string;
    readAt: string;
    dataCompleteness: "not_asserted";
    untrusted: true;
    limits: { maxBytes: number; timeoutMs: number };
  }> {
    const input = externalCallSchema.parse(raw);
    const first = await this.authorized(identity, (tx) =>
      this.authorizeInTransaction(tx, identity, input.skillId),
    );
    const limits = queryLimits(first.limits, input.limits ?? {});
    if (first.publication.package.training.effect !== "consulta")
      throw new PersonaV2Error(
        "APPROVAL_REQUIRED",
        "Use preparação e execução próprias para ações externas.",
      );
    const contract = {
      ...first.publication.package.training,
      timeoutMs: limits.timeoutMs,
      maxResponseBytes: limits.maxBytes,
    };
    const values = validateExternalValues(contract.input, input.input);
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), contract.timeoutMs);
    timer.unref();
    const revalidate = async () => {
      const current = await this.authorized(identity, (tx) =>
        this.authorizeInTransaction(tx, identity, input.skillId),
      );
      if (
        controller.signal.aborted ||
        current.publication.hash !== first.publication.hash ||
        current.publication.id !== first.publication.id
      )
        throw denied();
    };
    try {
      const data = await this.transport.invoke(
        first.connection,
        contract,
        values,
        controller.signal,
        revalidate,
      );
      validateExternalValues(contract.output, data);
      await revalidate();
      const result = {
        data,
        publicationId: first.publication.id,
        contractHash: first.publication.hash,
        integrationId: contract.integrationId,
        readAt: this.s.now().toISOString(),
        dataCompleteness: "not_asserted" as const,
        untrusted: true as const,
        limits: { maxBytes: limits.maxBytes, timeoutMs: limits.timeoutMs },
      };
      if (Buffer.byteLength(JSON.stringify(result)) > limits.maxBytes)
        throw new PersonaV2Error("INVALID_PLAN", "Resposta excede o limite concedido.");
      await this.authorized(identity, async (tx) => {
        await this.authorizeInTransaction(tx, identity, input.skillId);
        if (controller.signal.aborted) throw denied();
        await tx.external!.record(identity.personaId, identity.tokenId, first.publication, true);
      });
      if (controller.signal.aborted) throw denied();
      return result;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  /** Operator-only runner; not exposed by HTTP or MCP. Always uses a separate fixture credential/destination. */
  async runFixtureCases(
    session: string,
    personaId: string,
    skillId: string,
    fixture: ExternalConnection,
    transport: ExternalTransport & Partial<ExternalActionTransport>,
  ): Promise<{ approved: boolean }> {
    const candidate = await this.admin.run(session, personaId, "publicar", async (tx) => {
      const current = await this.compile(tx, personaId, skillId, false);
      if (fixture.destination === current.pkg.destination)
        throw new PersonaV2Error("INVALID_PLAN", "Fixture deve usar destino isolado.");
      // A crash or loss of authority during a new run cannot preserve an earlier approval.
      await tx.catalog.saveReport(
        personaId,
        skillId,
        current.draft.revision,
        current.hash,
        current.casesHash,
        false,
        [],
        "persona-external-fixtures-v1",
      );
      return current;
    });
    const { results } = await evaluateExternalCases(
      candidate.pkg,
      candidate.cases,
      fixture,
      transport,
      () => Promise.resolve(),
    );
    return this.admin.run(session, personaId, "publicar", async (tx) => {
      const current = await this.compile(tx, personaId, skillId, false);
      if (
        current.hash !== candidate.hash ||
        current.casesHash !== candidate.casesHash ||
        current.draft.revision !== candidate.draft.revision
      )
        throw new PersonaV2Error("OPERATION_CONFLICT", "Caso ou contrato alterado durante runner.");
      const approved = results.every((r) => r.passed);
      await tx.catalog.saveReport(
        personaId,
        skillId,
        current.draft.revision,
        current.hash,
        current.casesHash,
        approved,
        results,
        "persona-external-fixtures-v1",
      );
      return { approved };
    });
  }
}
