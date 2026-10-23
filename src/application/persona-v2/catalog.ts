import { z } from "zod";
import {
  readDatasetCaseSeeds,
  readDatasetCaseOptions,
  confirmedDatasetCaseOrigin,
} from "./dataset-case-seeds.js";
import {
  datasetCaseOriginSchema,
  datasetCaseBinding,
  datasetVersionReferenceSchema,
} from "../../domain/persona-v2/dataset-case-origin.js";
import {
  datasetCaseCursorSchema,
  type DatasetCaseOptions,
} from "../../domain/persona-v2/dataset-case-options.js";
import type { DatasetCaseOrigin } from "../../domain/persona-v2/dataset-case-origin.js";
import type { DatasetCaseSeeds } from "../../domain/persona-v2/dataset-case-seeds.js";
import { queryPublicationCaseSchema } from "../../domain/persona-v2/publication-fixture.js";
import { compileOperationPublication } from "./shared-operation-adoption.js";
import {
  decodeLibrary,
  templateReadSchema,
  templateDraftImportSchema,
  validateDataset,
  type LibraryPayload,
} from "./knowledge-library-schema.js";
import type {
  AdministrativeActor,
  AdministrativeContext,
  PersonaAdministrativeAuthorization,
} from "./administrative-authorization.js";
import type { AdministrativePermission } from "../../domain/persona-v2/model.js";
import { assertOperationCaseCoverage, operationCaseSchema } from "./operation-cases.js";
import type { PersonaAdministration } from "./administration.js";
import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import {
  canonicalJson,
  type CatalogPublication,
  type SkillDraft,
  type PublicationPreviewResult,
  type TrainingCase,
  type PublishedPackage,
  type OperationTestDetails,
} from "../../domain/persona-v2/catalog.js";
import { compileQueryTraining, queryTrainingSchema, sourceFingerprint } from "./query-training.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import { compileFederationTraining, federationTrainingSchema } from "./federation-training.js";
import { federationEditableCaseSchema } from "../../domain/persona-v2/federation-training.js";
import { compileOperationTraining, operationTrainingSchema } from "./operation-training.js";
import { publicationReview } from "./publication-review.js";
import { adoptQueryKnowledge } from "./shared-query-adoption.js";
import {
  publicationReviewPlan,
  confirmPublicationReview,
  createPublicationCalendar,
} from "./review-publication.js";

export const draftInputSchema = z.strictObject({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(100),
  kind: z.enum(["consulta", "cruzamento", "operacao_sql", "acao_externa"]),
  name: z.string().trim().min(1).max(200),
  training: z.json(),
});
export const caseInputSchema = z.strictObject({
  required: z.boolean(),
  content: z.strictObject({
    name: z.string().min(1).max(200),
    editorialOrigin: datasetCaseOriginSchema.optional(),
    input: z.json(),
    expected: z.json(),
  }),
});
export const editableSkillCaseSchema = caseInputSchema.extend({
  expectedRevision: z.number().int().positive(),
  id: z.uuid().optional(),
  remove: z.boolean().default(false),
});
export const sqlExampleInputSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  replace: z.boolean().default(false),
  example: queryTrainingSchema.shape.examples.unwrap().element,
});
export const deactivateSqlExampleSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  exampleId: queryTrainingSchema.shape.examples.unwrap().element.shape.id,
});

export interface EditorialTemplateRead {
  catalogId: string;
  templateId: string;
  version: number;
  hash: string;
  name: string;
  dialect: "postgres" | "mssql" | "sybase";
  executable: false;
  content: Extract<LibraryPayload, { kind: "template" }>["content"];
}

export class PersonaCatalog {
  constructor(
    private readonly services: PersonaServices,
    private readonly administration: PersonaAdministration,
    private readonly authorization?: PersonaAdministrativeAuthorization,
  ) {}

  private async owned<T>(
    sessionId: AdministrativeActor,
    personaId: string,
    action: (tx: PersonaTransaction, ownerId: string, context: AdministrativeContext) => Promise<T>,
    permission: AdministrativePermission = "treinar",
  ): Promise<T> {
    if (this.authorization)
      return this.authorization.run(sessionId, personaId, permission, (tx, context) =>
        action(tx, context.ownerId, context),
      );
    if (typeof sessionId !== "string")
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Delegação indisponível.");
    const session = await this.administration.validateSession(sessionId);
    return this.services.repository.transaction(
      { personaIds: [personaId], tokenIds: [] },
      async (tx) => {
        const persona = await tx.findPersona(personaId);
        if (!persona?.active || persona.ownerId !== session.owner.id) {
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Persona indisponível para este responsável.",
          );
        }
        await tx.setAdministrativeActor(session.owner.id);
        return action(tx, session.owner.id, { ownerId: session.owner.id, binding: null });
      },
      () => {
        if (session.expiresAt <= this.services.now()) {
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Sessão expirou antes da gravação.");
        }
        return Promise.resolve();
      },
    );
  }

  async list(sessionId: AdministrativeActor, personaId: string): Promise<readonly SkillDraft[]> {
    return this.owned(sessionId, personaId, async (tx, _owner, context) => {
      const drafts = await tx.catalog.list(personaId);
      const visible: SkillDraft[] = [];
      for (const draft of drafts)
        if (await this.visibleDraft(tx, draft, context)) visible.push(draft);
      return visible;
    });
  }

  async active(
    sessionId: AdministrativeActor,
    personaId: string,
    skillId: string,
  ): Promise<CatalogPublication<PublishedPackage> | null> {
    return this.owned(sessionId, personaId, async (tx, _owner, context) => {
      const draft = await this.requireDraft(tx, personaId, skillId, context);
      const publication = draft.activePublicationId
        ? await tx.catalog.publication(personaId, draft.activePublicationId)
        : null;
      if (
        publication &&
        !(await this.visibleDraft(
          tx,
          { kind: draft.kind, training: publication.package.training },
          context,
        ))
      )
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Publicação fora das fontes concedidas.");
      return publication?.suspendedAt ? null : publication;
    });
  }

  async create(
    sessionId: AdministrativeActor,
    personaId: string,
    raw: unknown,
  ): Promise<SkillDraft> {
    const input = draftInputSchema.parse(raw);
    this.assertNoSecrets(input);
    if (input.kind === "consulta") queryTrainingSchema.parse(input.training);
    if (input.kind === "cruzamento") federationTrainingSchema.parse(input.training);
    if (input.kind === "operacao_sql") operationTrainingSchema.parse(input.training);
    return this.owned(sessionId, personaId, async (tx, _owner, context) => {
      await this.assertDraftSources(tx, personaId, input.kind, input.training, context);
      const draft: SkillDraft = {
        id: this.services.crypto.randomId(),
        personaId,
        ...input,
        revision: 1,
        activePublicationId: null,
      };
      await tx.catalog.create(draft);
      return draft;
    });
  }

  async readTemplate(
    sessionId: AdministrativeActor,
    personaId: string,
    raw: unknown,
  ): Promise<EditorialTemplateRead> {
    const input = templateReadSchema.parse(raw);
    return this.owned(sessionId, personaId, async (tx, owner, context) => {
      const layers = context.state
        ? [
            context.state.token.permissions,
            ...(context.state.grant ? [context.state.grant.permissions] : []),
          ]
        : [];
      if (!layers.every((p) => p.sourceIds.includes(input.sourceId))) {
        throw new PersonaV2Error(
          "AUTHORIZATION_DENIED",
          "Fonte fora das concessões de treinamento.",
        );
      }
      const source = (await tx.listSources(personaId)).find(
        (s) => s.id === input.sourceId && s.active,
      );
      if (
        source?.authorizationVersion !== input.sourceVersion ||
        source.dialect !== input.dialect
      ) {
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "Fonte, versão ou dialeto mudou. Selecione novamente.",
        );
      }
      const catalog = await tx.knowledge?.catalog(input.catalogId, owner);
      if (!["administrator", "curator", "contributor"].includes(catalog?.role ?? "")) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Template editorial indisponível.");
      }
      const record = await tx.knowledge?.library?.get(
        input.catalogId,
        input.templateId,
        input.templateVersion,
      );
      if (record?.kind !== "template" || record.hash !== input.templateHash) {
        throw new PersonaV2Error("OPERATION_CONFLICT", "Versão exata do template indisponível.");
      }
      const payload = decodeLibrary(record, this.services.crypto);
      if (payload.kind !== "template")
        throw new PersonaV2Error("INVALID_PLAN", "Material não é template.");
      return {
        catalogId: input.catalogId,
        templateId: record.id,
        version: record.version,
        hash: record.hash,
        name: record.name,
        dialect: input.dialect,
        executable: false as const,
        content: {
          ...payload.content,
          examples: payload.content.examples
            .map((example) => ({
              ...example,
              variants: example.variants.filter((v) => v.dialect === input.dialect),
            }))
            .filter((example) => example.variants.length > 0),
        },
      };
    });
  }

  async createFromTemplate(
    sessionId: AdministrativeActor,
    personaId: string,
    raw: unknown,
  ): Promise<SkillDraft> {
    const input = templateDraftImportSchema.parse(raw);
    return this.owned(
      sessionId,
      personaId,
      async (tx, owner, context) => {
        // Check destination grants before looking up any editorial material.
        const layers = context.state
          ? [
              context.state.token.permissions,
              ...(context.state.grant ? [context.state.grant.permissions] : []),
            ]
          : [];
        if (!layers.every((p) => p.sourceIds.includes(input.sourceId))) {
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Fonte fora das concessões de treinamento.",
          );
        }
        const catalog = await tx.knowledge?.catalog(input.catalogId, owner);
        const library = tx.knowledge?.library;
        if (
          !library ||
          !["administrator", "curator", "contributor"].includes(catalog?.role ?? "")
        ) {
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Template editorial indisponível.");
        }
        const record = await library.get(input.catalogId, input.templateId, input.templateVersion);
        if (record?.kind !== "template" || record.hash !== input.templateHash) {
          throw new PersonaV2Error("OPERATION_CONFLICT", "Versão exata do template indisponível.");
        }
        const payload = decodeLibrary(record, this.services.crypto);
        if (payload.kind !== "template") {
          throw new PersonaV2Error("INVALID_PLAN", "Material não é template.");
        }
        const source = (await tx.listSources(personaId)).find(
          (s) => s.id === input.sourceId && s.active,
        );
        if (
          source?.authorizationVersion !== input.sourceVersion ||
          source.dialect !== input.dialect
        ) {
          throw new PersonaV2Error(
            "OPERATION_CONFLICT",
            "Fonte, versão ou dialeto mudou. Selecione novamente.",
          );
        }
        if (input.dataset) {
          const data = await library.get(input.catalogId, input.dataset.id, input.dataset.version);
          if (
            data?.kind !== "dataset" ||
            data.hash !== input.dataset.hash ||
            data.templateId !== record.id ||
            data.templateVersion !== record.version
          ) {
            throw new PersonaV2Error(
              "INVALID_PLAN",
              "Dataset não corresponde à versão do template.",
            );
          }
          const dataset = decodeLibrary(data, this.services.crypto);
          if (dataset.kind !== "dataset") {
            throw new PersonaV2Error("INVALID_PLAN", "Material não é dataset.");
          }
          validateDataset(dataset, payload);
        }
        const content = payload.content,
          example = content.examples.find((e) => e.id === input.exampleId),
          variant = example?.variants.find((v) => v.dialect === input.dialect);
        if (!example || !variant) {
          throw new PersonaV2Error(
            "INVALID_PLAN",
            "Escolha uma variante existente; SQL não é convertido entre motores.",
          );
        }
        const parameterSignature = (parameters: typeof variant.parameters) =>
          canonicalJson([...parameters].sort((a, b) => a.name.localeCompare(b.name)));
        const examples = [
          example,
          ...(input.additionalExampleIds ?? []).map((id) => {
            const additional = content.examples.find((e) => e.id === id);
            const additionalVariant = additional?.variants.find((v) => v.dialect === input.dialect);
            if (
              !additional ||
              !additionalVariant ||
              parameterSignature(additionalVariant.parameters) !==
                parameterSignature(variant.parameters)
            ) {
              throw new PersonaV2Error(
                "INVALID_PLAN",
                "Exemplo adicional sem variante compatível ou com parâmetros diferentes; crie outro rascunho.",
              );
            }
            return additional;
          }),
        ];
        const physical = (id: string) => {
          const t = content.tables.find((t) => t.id === id)!;
          return t.physicalNames.find((p) => p.dialect === input.dialect)?.name ?? t.name;
        };
        const training = queryTrainingSchema.parse({
          sourceId: source.id,
          dialect: source.dialect,
          purpose: example.purpose,
          sqlModel: variant.sql,
          parameters: variant.parameters,
          tables: content.tables.map((t) => ({
            name: physical(t.id),
            meaning: t.meaning,
            grain: t.grain,
            resourceType: t.resourceType,
          })),
          columns: content.tables.flatMap((t) =>
            t.columns.map((c) => ({
              table: physical(t.id),
              name: c.name,
              meaning: c.meaning,
              classification: c.classification,
            })),
          ),
          relationships: content.relationships.map((r) => ({
            id: r.id,
            ...(r.via.length ? { via: r.via.map(physical), path: r.path } : {}),
            from: physical(r.from),
            to: physical(r.to),
            keys: r.keys,
            join: r.join,
            cardinality: r.cardinality,
            meaning: r.meaning,
          })),
          rules: content.rules,
          examples: examples.map((e) => ({
            id: e.id,
            purpose: e.purpose,
            sql: e.variants.find((v) => v.dialect === input.dialect)!.sql,
            explanation: e.explanation,
            state: "candidate",
          })),
        });
        this.assertNoSecrets({ name: input.name, training });
        await this.assertDraftSources(tx, personaId, "consulta", training, context);
        const draft: SkillDraft = {
          id: this.services.crypto.randomId(),
          personaId,
          slug: input.slug,
          name: input.name,
          kind: "consulta",
          training,
          revision: 1,
          activePublicationId: null,
        };
        await tx.catalog.create(draft);
        await library.recordDraftOrigin({
          personaId,
          skillId: draft.id,
          catalogId: input.catalogId,
          templateId: record.id,
          templateVersion: record.version,
          sourceId: source.id,
          sourceVersion: source.authorizationVersion,
          dialect: source.dialect,
          datasetId: input.dataset?.id ?? null,
          datasetVersion: input.dataset?.version ?? null,
        });
        await tx.knowledge.audit(input.catalogId, owner, "template_rascunho_criado", draft.id);
        return draft;
      },
      "treinar",
    );
  }

  async update(
    sessionId: AdministrativeActor,
    personaId: string,
    skillId: string,
    raw: unknown,
  ): Promise<SkillDraft> {
    const input = z
      .strictObject({
        name: z.string().trim().min(1).max(200),
        training: z.json(),
        expectedRevision: z.number().int().positive(),
      })
      .parse(raw);
    this.assertNoSecrets(input);
    return this.owned(sessionId, personaId, async (tx, _owner, context) => {
      const draft = await this.requireDraft(tx, personaId, skillId, context);
      if (draft.kind === "consulta") queryTrainingSchema.parse(input.training);
      if (draft.kind === "cruzamento") federationTrainingSchema.parse(input.training);
      if (draft.kind === "operacao_sql") operationTrainingSchema.parse(input.training);
      await this.assertDraftSources(tx, personaId, draft.kind, input.training, context);
      const next = {
        ...draft,
        name: input.name,
        training: input.training,
        revision: input.expectedRevision + 1,
      };
      await tx.catalog.update(next, input.expectedRevision);
      return next;
    });
  }

  async addCase(
    sessionId: AdministrativeActor,
    personaId: string,
    skillId: string,
    raw: unknown,
  ): Promise<TrainingCase> {
    const input = caseInputSchema.parse(raw);
    this.assertNoSecrets(input);
    return this.owned(sessionId, personaId, async (tx, owner, context) => {
      const draft = await this.requireDraft(tx, personaId, skillId, context);
      if (draft.kind === "operacao_sql") operationCaseSchema.parse(input.content);
      const content = await this.confirmCaseOrigin(sessionId, tx, owner, draft, input.content);
      const test = { id: this.services.crypto.randomId(), ...input, content };
      await tx.catalog.saveCase(personaId, skillId, test);
      return test;
    });
  }

  async operationTests(
    actor: AdministrativeActor,
    personaId: string,
    skillId: string,
    after?: string,
  ): Promise<OperationTestDetails> {
    return this.skillTests(actor, personaId, skillId, "operacao_sql", after);
  }

  async queryTests(
    actor: AdministrativeActor,
    personaId: string,
    skillId: string,
    after?: string,
  ): Promise<OperationTestDetails> {
    return this.skillTests(actor, personaId, skillId, "consulta", after);
  }

  /** Dataset rows are browser-only editorial material, never consumer tool output. */
  async datasetCaseOptions(
    sessionId: string,
    personaId: string,
    skillId: string,
    raw: unknown,
  ): Promise<DatasetCaseOptions> {
    const input = z
      .strictObject({
        expectedRevision: z.number().int().positive(),
        after: datasetCaseCursorSchema.optional(),
      })
      .parse(raw);
    return this.owned(sessionId, personaId, async (tx, owner, context) => {
      const draft = await this.requireDraft(tx, personaId, skillId, context);
      if (draft.kind !== "consulta" || draft.revision !== input.expectedRevision) {
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "Selecione a revisão atual da consulta antes de listar datasets.",
        );
      }
      return readDatasetCaseOptions(tx, owner, draft, this.services.crypto, input.after);
    });
  }

  async datasetCaseSeeds(
    sessionId: string,
    personaId: string,
    skillId: string,
    raw: unknown,
  ): Promise<DatasetCaseSeeds> {
    const input = z
      .strictObject({
        expectedRevision: z.number().int().positive(),
        dataset: datasetVersionReferenceSchema.optional(),
      })
      .parse(raw);
    return this.owned(sessionId, personaId, async (tx, owner, context) => {
      const draft = await this.requireDraft(tx, personaId, skillId, context);
      if (draft.kind !== "consulta" || draft.revision !== input.expectedRevision) {
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "Selecione a revisão atual de uma consulta antes de carregar sementes.",
        );
      }
      return readDatasetCaseSeeds(tx, owner, draft, this.services.crypto, input.dataset);
    });
  }

  async federationTests(
    actor: AdministrativeActor,
    personaId: string,
    skillId: string,
    after?: string,
  ): Promise<OperationTestDetails> {
    return this.skillTests(actor, personaId, skillId, "cruzamento", after);
  }

  private async skillTests(
    actor: AdministrativeActor,
    personaId: string,
    skillId: string,
    kind: "consulta" | "operacao_sql" | "cruzamento",
    after?: string,
  ): Promise<OperationTestDetails> {
    if (after) z.uuid().parse(after);
    return this.owned(actor, personaId, async (tx, _owner, context) => {
      const draft = await this.requireDraft(tx, personaId, skillId, context);
      if (draft.kind !== kind) {
        throw new PersonaV2Error("INVALID_PLAN", "Selecione o tipo de skill correspondente.");
      }
      const cases = await tx.catalog.cases(personaId, skillId);
      const casesHash = this.services.crypto.sha256Hex(canonicalJson(cases));
      let packageHash: string | null = null;
      try {
        packageHash = (await this.compile(tx, personaId, skillId, context, false)).hash;
      } catch (error) {
        // Drafts with stale structural dependencies remain editable, never approved.
        if (!(error instanceof PersonaV2Error)) throw error;
      }
      const reports = await tx.catalog.reports(personaId, skillId, after);
      const current = (r: (typeof reports)[number]) =>
        r.revision === draft.revision && r.packageHash === packageHash && r.casesHash === casesHash;
      return {
        revision: draft.revision,
        packageHash,
        casesHash,
        cases,
        requiredApproved:
          packageHash !== null &&
          cases.some((c) => c.required) &&
          (await tx.catalog.approvedReport(
            personaId,
            skillId,
            draft.revision,
            packageHash,
            casesHash,
          )),
        reports: reports.slice(0, 20).map((r) => ({ ...r, current: current(r) })),
        nextCursor: reports.length > 20 ? reports[19]!.id : null,
      };
    });
  }

  async editOperationCase(
    actor: AdministrativeActor,
    personaId: string,
    skillId: string,
    raw: unknown,
  ): Promise<{ revision: number }> {
    return this.editSkillCase(actor, personaId, skillId, raw, "operacao_sql");
  }

  async editQueryCase(
    actor: AdministrativeActor,
    personaId: string,
    skillId: string,
    raw: unknown,
  ): Promise<{ revision: number }> {
    return this.editSkillCase(actor, personaId, skillId, raw, "consulta");
  }

  async editFederationCase(
    actor: AdministrativeActor,
    personaId: string,
    skillId: string,
    raw: unknown,
  ): Promise<{ revision: number }> {
    return this.editSkillCase(actor, personaId, skillId, raw, "cruzamento");
  }

  private async editSkillCase(
    actor: AdministrativeActor,
    personaId: string,
    skillId: string,
    raw: unknown,
    kind: "consulta" | "operacao_sql" | "cruzamento",
  ): Promise<{ revision: number }> {
    const input = editableSkillCaseSchema.parse(raw);
    this.assertNoSecrets(input);
    if (kind === "consulta") {
      queryPublicationCaseSchema.parse(input.content);
    } else if (kind === "cruzamento") {
      federationEditableCaseSchema.parse(input.content);
    } else {
      operationCaseSchema.parse(input.content);
    }
    return this.owned(actor, personaId, async (tx, owner, context) => {
      const draft = await this.requireDraft(tx, personaId, skillId, context);
      if (draft.kind !== kind) {
        throw new PersonaV2Error("INVALID_PLAN", "Selecione o tipo de skill correspondente.");
      }
      if (draft.revision !== input.expectedRevision)
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "Rascunho ou casos mudaram; preserve sua edição e recarregue.",
        );
      const previous =
        kind === "consulta" && input.id && !input.remove
          ? (await tx.catalog.cases(personaId, skillId)).find((test) => test.id === input.id)
          : undefined;
      const previousOrigin = previous
        ? queryPublicationCaseSchema.safeParse(previous.content)
        : undefined;
      const candidate = {
        ...input.content,
        ...(previousOrigin?.success &&
        previousOrigin.data.editorialOrigin &&
        !input.content.editorialOrigin
          ? { editorialOrigin: previousOrigin.data.editorialOrigin }
          : {}),
      };
      const content = input.remove
        ? input.content
        : await this.confirmCaseOrigin(
            actor,
            tx,
            owner,
            draft,
            candidate,
            previousOrigin?.success ? previousOrigin.data.editorialOrigin : undefined,
          );
      const test = {
        id: input.id ?? this.services.crypto.randomId(),
        required: input.required,
        content,
      };
      if (input.id) {
        await tx.catalog.update({ ...draft, revision: draft.revision + 1 }, draft.revision);
        await tx.catalog.changeCase(personaId, skillId, test, input.remove);
      } else {
        if (input.remove) throw new PersonaV2Error("INVALID_PLAN", "Escolha o caso a remover.");
        await tx.catalog.saveCase(personaId, skillId, test);
      }
      return { revision: draft.revision + 1 };
    });
  }

  private async confirmCaseOrigin(
    actor: AdministrativeActor,
    tx: PersonaTransaction,
    owner: string,
    draft: SkillDraft,
    content: z.infer<typeof caseInputSchema>["content"],
    previousOrigin?: DatasetCaseOrigin,
  ): Promise<z.infer<typeof caseInputSchema>["content"]> {
    if (!content.editorialOrigin) return content;
    if ((typeof actor !== "string" && !previousOrigin) || draft.kind !== "consulta") {
      throw new PersonaV2Error(
        "AUTHORIZATION_DENIED",
        "Nova origem de dataset exige revisão editorial no console Client.",
      );
    }
    if (
      typeof actor !== "string" &&
      previousOrigin &&
      canonicalJson(datasetCaseBinding(previousOrigin)) !==
        canonicalJson(datasetCaseBinding(content.editorialOrigin))
    ) {
      throw new PersonaV2Error(
        "AUTHORIZATION_DENIED",
        "Trocar a origem do caso exige escolha explícita no console Client.",
      );
    }
    const parsed = queryPublicationCaseSchema.parse(content);
    const current = await readDatasetCaseSeeds(
      tx,
      owner,
      draft,
      this.services.crypto,
      content.editorialOrigin.dataset,
    );
    return {
      ...content,
      editorialOrigin: confirmedDatasetCaseOrigin(
        content.editorialOrigin,
        current,
        parsed.input.fixtures,
        this.services.crypto,
      ),
    };
  }

  async registerSqlExample(
    actor: AdministrativeActor,
    personaId: string,
    skillId: string,
    raw: unknown,
  ): Promise<SkillDraft> {
    const input = sqlExampleInputSchema.parse(raw);
    this.assertNoSecrets(input);
    return this.owned(actor, personaId, async (tx, _owner, context) => {
      const draft = await this.requireDraft(tx, personaId, skillId, context);
      if (draft.kind !== "consulta")
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Exemplos SQL deste fluxo exigem skill de consulta.",
        );
      if (draft.revision !== input.expectedRevision)
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "Rascunho mudou; releia antes de enviar o exemplo.",
        );
      const training = queryTrainingSchema.parse(draft.training);
      const exists = training.examples?.some((e) => e.id === input.example.id) ?? false;
      if (exists !== input.replace)
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          input.replace
            ? "Exemplo a substituir não existe neste rascunho."
            : "Identificação de exemplo já existe; solicite substituição explícita.",
        );
      const nextTraining = queryTrainingSchema.parse({
        ...training,
        examples: input.replace
          ? training.examples!.map((e) =>
              e.id === input.example.id ? { ...input.example, state: "candidate" } : e,
            )
          : [...(training.examples ?? []), { ...input.example, state: "candidate" }],
      });
      await this.assertDraftSources(tx, personaId, draft.kind, nextTraining, context);
      const source = (await tx.listSources(personaId)).find((s) => s.id === nextTraining.sourceId);
      if (!source) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte indisponível.");
      compileQueryTraining(nextTraining, source, this.services.crypto);
      const next = { ...draft, training: nextTraining, revision: draft.revision + 1 };
      await tx.catalog.update(next, draft.revision);
      return next;
    });
  }

  async deactivateSqlExample(
    actor: AdministrativeActor,
    personaId: string,
    skillId: string,
    raw: unknown,
  ): Promise<SkillDraft> {
    const input = deactivateSqlExampleSchema.parse(raw);
    return this.owned(actor, personaId, async (tx, _owner, context) => {
      const draft = await this.requireDraft(tx, personaId, skillId, context);
      if (draft.kind !== "consulta") {
        throw new PersonaV2Error("INVALID_PLAN", "Inativação exige rascunho de consulta.");
      }
      if (draft.revision !== input.expectedRevision) {
        throw new PersonaV2Error("OPERATION_CONFLICT", "Rascunho mudou; releia antes de inativar.");
      }
      const training = queryTrainingSchema.parse(draft.training);
      const example = training.examples?.find((e) => e.id === input.exampleId);
      if (!example || example.state === "inactive" || example.state === "replaced") {
        throw new PersonaV2Error("OPERATION_CONFLICT", "Exemplo ausente, inativo ou substituído.");
      }
      const nextTraining = queryTrainingSchema.parse({
        ...training,
        examples: training.examples!.map((e) =>
          e.id === input.exampleId ? { ...e, state: "inactive" } : e,
        ),
      });
      await this.assertDraftSources(tx, personaId, draft.kind, nextTraining, context);
      const next = { ...draft, training: nextTraining, revision: draft.revision + 1 };
      await tx.catalog.update(next, draft.revision);
      return next;
    });
  }

  async preview(
    sessionId: AdministrativeActor,
    personaId: string,
    skillId: string,
    reviewDueAt?: unknown,
  ): Promise<PublicationPreviewResult> {
    return this.owned(
      sessionId,
      personaId,
      async (tx, ownerId, context) => {
        const prepared = await this.compile(tx, personaId, skillId, context);
        const reviewPlan = await publicationReviewPlan(
          tx.knowledgeMaintenance,
          {
            kind: "privado",
            draftId: skillId,
            personaId,
            catalogId: null,
            revision: prepared.draft.revision,
            hash: prepared.hash,
          },
          ownerId,
          this.services.now(),
          reviewDueAt,
          typeof sessionId === "string",
        );
        const previous = prepared.draft.activePublicationId
          ? await tx.catalog.publication(personaId, prepared.draft.activePublicationId)
          : null;
        if (
          previous &&
          !(await this.visibleDraft(
            tx,
            { kind: prepared.draft.kind, training: previous.package.training },
            context,
          ))
        )
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Revisão anterior fora das fontes concedidas.",
          );
        const expiresAt = new Date(this.services.now().getTime() + 15 * 60 * 1000);
        const preview = {
          hash: this.services.crypto.sha256Hex(this.services.crypto.randomToken(32)),
          personaId,
          skillId,
          ownerId,
          administrativeContext: context.binding,
          revision: prepared.draft.revision,
          personaVersion: prepared.personaVersion,
          packageHash: prepared.hash,
          sourceFingerprint: prepared.sourceFingerprint,
          previousPublicationId: prepared.draft.activePublicationId,
          expiresAt,
          consumedAt: null,
        };
        await tx.catalog.savePreview(preview);
        await tx.knowledgeMaintenance!.bindReviewPlan(preview.hash, reviewPlan);
        const before = previous?.package.requiredCapabilities ?? [];
        return {
          confirmationHash: preview.hash,
          reviewDueAt: reviewPlan.dueAt,
          expiresAt,
          revision: preview.revision,
          packageHash: prepared.hash,
          package: prepared.package,
          warnings: prepared.warnings,
          review: {
            previousRevision: previous?.revision ?? null,
            sections: publicationReview(previous?.package ?? null, prepared.package),
            cases: {
              total: prepared.cases.length,
              required: prepared.cases.filter((c) => c.required).length,
              requiredApproved: prepared.cases.some((c) => c.required) ? true : null,
            },
            impact: previous
              ? await this.visibleImpact(tx, personaId, previous.id, context)
              : { total: 0, publications: [] },
            existingTokensExpanded: false,
          },
          diff: {
            previousPublicationId: preview.previousPublicationId,
            addedCapabilities: prepared.package.requiredCapabilities.filter(
              (c) => !before.includes(c),
            ),
            removedCapabilities: before.filter(
              (c) => !prepared.package.requiredCapabilities.includes(c),
            ),
            previousPackageHash: previous?.hash ?? null,
            changedFields: Object.keys(prepared.package).filter(
              (field) =>
                canonicalJson(previous?.package[field as keyof typeof prepared.package] ?? null) !==
                canonicalJson(prepared.package[field as keyof typeof prepared.package]),
            ),
          },
        };
      },
      "publicar",
    );
  }

  async setReviewDeadline(
    sessionId: string,
    personaId: string,
    skillId: string,
    raw: unknown,
  ): Promise<{ dueAt: string; version: number }> {
    const { dueAt } = z.strictObject({ dueAt: z.iso.datetime() }).parse(raw);
    return this.owned(
      sessionId,
      personaId,
      async (tx, owner, context) => {
        const p = await this.compile(tx, personaId, skillId, context);
        const plan = await publicationReviewPlan(
          tx.knowledgeMaintenance,
          {
            kind: "privado",
            draftId: skillId,
            personaId,
            catalogId: null,
            revision: p.draft.revision,
            hash: p.hash,
          },
          owner,
          this.services.now(),
          dueAt,
        );
        return { dueAt: plan.dueAt, version: plan.version };
      },
      "publicar",
    );
  }

  async publish(
    sessionId: AdministrativeActor,
    personaId: string,
    skillId: string,
    confirmationHash: string,
  ): Promise<CatalogPublication<PublishedPackage>> {
    z.string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(confirmationHash);
    return this.owned(
      sessionId,
      personaId,
      async (tx, ownerId, context) => {
        const preview = await tx.catalog.preview(personaId, skillId, confirmationHash);
        if (
          preview?.ownerId !== ownerId ||
          (preview.administrativeContext ?? null) !== context.binding ||
          preview.consumedAt ||
          preview.expiresAt <= this.services.now()
        ) {
          throw new PersonaV2Error(
            "OPERATION_CONFLICT",
            "Preview inexistente, expirado ou já utilizado.",
          );
        }
        const prepared = await this.compile(tx, personaId, skillId, context);
        if (
          prepared.package.format === "persona-query-v2" &&
          queryTrainingSchema
            .parse(prepared.package.training)
            .examples?.some((e) => e.state === "candidate")
        )
          throw new PersonaV2Error(
            "INVALID_PLAN",
            "Revise os exemplos candidatos antes de publicar: aprove, inative ou substitua cada um.",
          );
        if (
          preview.revision !== prepared.draft.revision ||
          preview.personaVersion !== prepared.personaVersion ||
          preview.packageHash !== prepared.hash ||
          preview.previousPublicationId !== prepared.draft.activePublicationId ||
          preview.sourceFingerprint !== prepared.sourceFingerprint
        ) {
          throw new PersonaV2Error(
            "OPERATION_CONFLICT",
            "Conteúdo ou dependência mudou; gere um novo preview.",
          );
        }
        const publication: CatalogPublication<PublishedPackage> = {
          id: this.services.crypto.randomId(),
          personaId,
          skillId,
          revision: prepared.draft.revision,
          package: prepared.package,
          hash: prepared.hash,
          sourceVersion: prepared.source.authorizationVersion,
          sourceFingerprint: prepared.sourceFingerprint,
          suspendedAt: null,
        };
        const reviewPlan = await confirmPublicationReview(
          tx.knowledgeMaintenance,
          {
            kind: "privado",
            draftId: skillId,
            personaId,
            catalogId: null,
            revision: prepared.draft.revision,
            hash: prepared.hash,
          },
          confirmationHash,
          this.services.now(),
        );
        await tx.catalog.publish(publication, confirmationHash, this.services.now());
        await createPublicationCalendar(
          tx.knowledgeMaintenance!,
          {
            kind: "privado",
            publicationId: publication.id,
            hash: publication.hash,
            personaId,
            catalogId: null,
          },
          reviewPlan,
          this.services.now(),
        );
        return publication;
      },
      "publicar",
    );
  }

  async suspend(sessionId: AdministrativeActor, personaId: string, skillId: string): Promise<void> {
    await this.owned(
      sessionId,
      personaId,
      async (tx, _owner, context) => {
        const draft = await this.requireDraft(tx, personaId, skillId, context);
        if (!draft.activePublicationId)
          throw new PersonaV2Error("INVALID_PLAN", "Skill sem publicação ativa.");
        await tx.catalog.suspend(personaId, draft.activePublicationId, "Suspensa pelo responsável");
      },
      "publicar",
    );
  }

  private async compile(
    tx: PersonaTransaction,
    personaId: string,
    skillId: string,
    context: AdministrativeContext,
    requireReports = true,
  ) {
    const draft = await this.requireDraft(tx, personaId, skillId, context);
    if (draft.kind === "acao_externa") {
      throw new PersonaV2Error(
        "CAPABILITY_UNAVAILABLE",
        "Publicação deste tipo aguarda seu validador, executor e testes obrigatórios.",
      );
    }
    const pkg: PublishedPackage =
      draft.kind === "cruzamento"
        ? await compileFederationTraining(
            tx,
            personaId,
            draft.name,
            draft.training,
            this.services.crypto,
          )
        : await (async () => {
            const training =
              draft.kind === "operacao_sql"
                ? operationTrainingSchema.parse(draft.training)
                : queryTrainingSchema.parse(draft.training);
            const source = (await tx.listSources(personaId)).find(
              (s) => s.id === training.sourceId,
            );
            if (!source?.active)
              throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte indisponível nesta persona.");
            if (draft.kind === "operacao_sql")
              return compileOperationPublication(
                tx,
                context.ownerId,
                source,
                training,
                this.services,
                draft.name,
              );
            const queryTraining = queryTrainingSchema.parse(training);
            return {
              ...compileQueryTraining(queryTraining, source, this.services.crypto),
              ...(queryTraining.sharedKnowledge
                ? {
                    sharedKnowledge: await adoptQueryKnowledge(
                      tx,
                      context.ownerId,
                      source,
                      queryTraining,
                      this.services,
                    ),
                  }
                : {}),
              name: draft.name,
            };
          })();
    const source = (await tx.listSources(personaId)).find(
      (s) =>
        s.id ===
        (pkg.format !== "persona-federation-v2" ? pkg.sourceId : pkg.dependencies[0]!.sourceId),
    );
    if (!source?.active)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte indisponível nesta persona.");
    const hash = this.services.crypto.sha256Hex(canonicalJson(pkg));
    const cases = await tx.catalog.cases(personaId, skillId);
    if (requireReports && pkg.format === "persona-sql-operation-v2")
      assertOperationCaseCoverage(pkg, cases);
    if (
      requireReports &&
      (draft.kind === "cruzamento" || draft.kind === "operacao_sql") &&
      !cases.some((t) => t.required)
    )
      throw new PersonaV2Error(
        "INCOMPLETE_INPUT",
        "Cruzamento e operação SQL exigem casos obrigatórios aprovados.",
      );
    if (
      requireReports &&
      cases.some((t) => t.required) &&
      !(await tx.catalog.approvedReport(
        personaId,
        skillId,
        draft.revision,
        hash,
        this.services.crypto.sha256Hex(canonicalJson(cases)),
      ))
    ) {
      throw new PersonaV2Error(
        "INCOMPLETE_INPUT",
        "Casos obrigatórios exigem relatório aprovado e atual do runner separado.",
      );
    }
    return {
      draft,
      cases,
      personaVersion: (await tx.findPersona(personaId))!.authorizationVersion,
      source,
      package: pkg,
      hash,
      sourceFingerprint:
        pkg.format !== "persona-federation-v2"
          ? sourceFingerprint(source, this.services.crypto)
          : this.services.crypto.sha256Hex(canonicalJson(pkg.dependencies)),
      warnings: [
        ...(cases.length === 0 ? ["SEM_CASOS_DE_TESTE"] : []),
        ...(pkg.format === "persona-query-v2" &&
        queryTrainingSchema.parse(pkg.training).examples?.some((e) => e.state === "candidate")
          ? ["EXEMPLOS_CANDIDATOS_EXIGEM_REVISAO"]
          : []),
      ],
    };
  }

  private async requireDraft(
    tx: PersonaTransaction,
    personaId: string,
    skillId: string,
    context: AdministrativeContext,
  ) {
    const draft = await tx.catalog.find(personaId, skillId);
    if (!draft || !(await this.visibleDraft(tx, draft, context)))
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Skill indisponível nesta persona.");
    return draft;
  }
  private async assertDraftSources(
    tx: PersonaTransaction,
    personaId: string,
    kind: string,
    training: unknown,
    context: AdministrativeContext,
  ) {
    if (!(await this.visibleDraft(tx, { kind, training }, context)))
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Treinamento excede as fontes concedidas.");
    if (kind === "cruzamento") {
      await compileFederationTraining(tx, personaId, "Rascunho", training, this.services.crypto);
      return;
    }
    if (kind !== "consulta" && kind !== "operacao_sql") return;
    const input =
      kind === "operacao_sql"
        ? operationTrainingSchema.parse(training)
        : queryTrainingSchema.parse(training);
    const source = (await tx.listSources(personaId)).find(
      (s) => s.id === input.sourceId && s.active,
    );
    if (!source) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte indisponível nesta persona.");
    }
    if (kind === "operacao_sql")
      compileOperationTraining(training, source, this.services.crypto, "Rascunho");
  }
  private async visibleDraft(
    tx: PersonaTransaction,
    draft: { kind: string; training: unknown },
    context: AdministrativeContext,
  ): Promise<boolean> {
    if (!context.state) return true;
    const layers = [
      context.state.token.permissions,
      ...(context.state.grant ? [context.state.grant.permissions] : []),
    ];
    if (draft.kind === "acao_externa") return false;
    if (draft.kind === "cruzamento") {
      const training = federationTrainingSchema.parse(draft.training);
      for (const step of training.steps)
        if (step.kind === "local") {
          if (!layers.every((p) => p.sourceIds.includes(step.sourceId))) return false;
          const publication = await tx.catalog.publication(
            context.state.persona.id,
            step.publicationId,
          );
          if (
            !publication ||
            !layers.every((p) => p.skills.some((g) => g.skillId === publication.skillId))
          )
            return false;
        }
      return true;
    }
    const training =
      draft.kind === "operacao_sql"
        ? operationTrainingSchema.parse(draft.training)
        : queryTrainingSchema.parse(draft.training);
    return layers.every((p) => p.sourceIds.includes(training.sourceId));
  }
  private async visibleImpact(
    tx: PersonaTransaction,
    personaId: string,
    publicationId: string,
    context: AdministrativeContext,
  ) {
    const impact = await tx.publicationImpact(personaId, publicationId);
    if (!context.state) return impact;
    const visible = [];
    for (const item of impact.publications) {
      const publication = await tx.catalog.publication(personaId, item.publicationId);
      if (
        publication &&
        (await this.visibleDraft(
          tx,
          { kind: item.kind, training: publication.package.training },
          context,
        ))
      )
        visible.push(item);
    }
    return { total: visible.length, publications: visible };
  }
  private assertNoSecrets(value: unknown): void {
    if (pareceSegredoEmTexto(canonicalJson(value))) {
      throw new PersonaV2Error("INVALID_PLAN", "Treinamento contém segredo; utilize o cofre.");
    }
  }
}
