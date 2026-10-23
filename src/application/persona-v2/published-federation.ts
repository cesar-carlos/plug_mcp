import type { ConsumerIdentity } from "../../domain/persona-v2/model.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { DataRow } from "../../domain/persona-v2/federation.js";
import type { FederationResult } from "../../domain/persona-v2/federation.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import type { PersonaConsumerCatalog } from "./consumer-catalog.js";
import type { PersonaSourceQueries } from "./source-query.js";
import { ExecuteFederation, federationBudget } from "./federation.js";
import { assertFederationContract, federationRequestSchema } from "./federation-training.js";
import { federationFieldUses } from "./federation-field-uses.js";
type FederationResponse =
  | (FederationResult & { publicationId: string; hash: string; page: number; pageSize: number })
  | {
      valid: true;
      semanticApproval: false;
      publicationId: string;
      hash: string;
      columns: readonly string[];
      provenance: FederationResult["provenance"];
    };

/** Every local stage uses the same SQL, source fences and hub gates as consultar_dados. */
export class PersonaPublishedFederation {
  constructor(
    private readonly catalog: Pick<PersonaConsumerCatalog, "federation">,
    private readonly queries: Pick<PersonaSourceQueries, "run">,
  ) {}

  async run(
    identity: ConsumerIdentity,
    raw: unknown,
    validation = false,
  ): Promise<FederationResponse> {
    const input = federationRequestSchema.parse(raw);
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.execute(identity, input, validation, started),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new PersonaV2Error("BUDGET_EXCEEDED", "Prazo do cruzamento excedido.")),
            input.budget?.timeoutMs ?? 60000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async execute(
    identity: ConsumerIdentity,
    input: ReturnType<typeof federationRequestSchema.parse>,
    validation: boolean,
    started: number,
  ): Promise<FederationResponse> {
    const publication = await this.catalog.federation(identity, input.plan.publicationId);
    const pkg = publication.package;
    assertFederationContract(pkg, input.plan);
    const fieldUses = federationFieldUses(pkg.steps);
    const budget = federationBudget(pkg.budget, publication.executionBudget, input.budget ?? {});
    const checks: (() => Promise<void>)[] = [];
    const deadline = started + budget.timeoutMs;
    if (Date.now() >= deadline)
      throw new PersonaV2Error("BUDGET_EXCEEDED", "Prazo do cruzamento excedido.");
    const result = await new ExecuteFederation({
      authorize: async (_plan, signal) => {
        for (const check of checks) await check();
        const current = await this.catalog.federation(identity, publication.id);
        if (
          signal?.aborted ||
          current.hash !== publication.hash ||
          canonicalJson(current.executionBudget) !== canonicalJson(publication.executionBudget)
        )
          throw new PersonaV2Error("STALE_AUTHORIZATION", "Cruzamento mudou durante execução.");
      },
      query: async (step, { maxRows, signal }) => {
        const dependency = pkg.dependencies.find((d) => d.publicationId === step.publicationId)!;
        const expected = pkg.steps
          .filter((s) => s.kind === "local")
          .find((s) => s.id === step.id)!.columns;
        const response = await this.queries.run(
          identity,
          {
            fonteId: step.sourceId,
            skillIds: [dependency.skillId],
            sql: step.sql,
            params: { ...step.params },
            options: { maxRows, timeoutMs: Math.max(1, deadline - Date.now()) },
          },
          validation,
          {
            publicationId: dependency.publicationId,
            hash: dependency.hash,
            columns: expected,
            outputUses: fieldUses[step.id],
            signal,
            retainRevalidation: (check) => checks.push(check),
          },
        );
        const columns =
          response.columns ??
          pkg.steps.filter((s) => s.kind === "local").find((s) => s.id === step.id)!.columns;
        if (
          !validation &&
          (columns.length !== expected.length ||
            columns.some((c, i) => c.toLowerCase() !== expected[i]))
        )
          throw new PersonaV2Error(
            "INVALID_PLAN",
            "Projeção local difere do contrato de cruzamento.",
          );
        const rows = (response.rows ?? []).map(
          (row) => Object.fromEntries(expected.map((c, i) => [c, row[columns[i]!]])) as DataRow,
        );
        return {
          rows,
          columns: expected,
          truncated: !response.completeness.complete,
          publicationHash: dependency.hash,
          readAt: response.provenance.readAt,
        };
      },
    }).execute(input.plan, { ...budget, timeoutMs: Math.max(1, deadline - Date.now()) });
    await this.catalog.federation(identity, publication.id, {
      validation,
      durationMs: Date.now() - started,
      rows: result.totalRows,
      steps: input.plan.steps.length,
    });
    if (Date.now() >= deadline)
      throw new PersonaV2Error("BUDGET_EXCEEDED", "Prazo do cruzamento excedido.");
    return validation
      ? {
          valid: true,
          semanticApproval: false,
          publicationId: publication.id,
          hash: publication.hash,
          columns: result.columns,
          provenance: result.provenance,
        }
      : {
          ...result,
          publicationId: publication.id,
          hash: publication.hash,
          page: input.plan.page,
          pageSize: input.plan.pageSize,
        };
  }
}
