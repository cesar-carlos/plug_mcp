import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { canonicalJson } from "../../src/domain/persona-v2/catalog.js";
import {
  evaluationContextSchema,
  evaluationDiagnosticSchema,
  type EvaluationContext,
  type EvaluationDiagnostic,
  type EvaluationEvidence,
  type PersonaEvaluationCase,
} from "./persona-v2-contract.js";

const hash = (value: unknown): string =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
const data = (e?: EvaluationEvidence): boolean =>
  e?.status === "complete" || e?.status === "partial";
const bindingKey = (binding: NonNullable<EvaluationEvidence["bindings"]>[number]): string =>
  canonicalJson(binding);

/** Metadata only in memory. No parameters, fingerprints or responses enter the report. */
export class PersonaTurnEvidence {
  private valid = true;
  private readonly authority = new Map<string, string>();
  private previous?: {
    signature: string;
    lineage: string;
    page: number;
    pageSize: number;
    hasNextPage: boolean;
  };
  private readonly contexts: (EvaluationContext | undefined)[] = [];
  private readonly diagnostics: EvaluationDiagnostic[] = [];
  constructor(private readonly behavior: PersonaEvaluationCase["expected"]["behavior"]) {}

  capture(
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): (evidence?: EvaluationEvidence) => void {
    const authority = new Map(this.authority),
      previous = this.previous;
    const contextIndex = this.contexts.length;
    if (name === "consultar_dados") this.contexts.push(undefined);
    const request = structuredClone(args);
    return (e) => {
      if (name === "obter_skill" && e?.status === "complete" && e.authorityRevision) {
        for (const binding of e.bindings ?? [])
          this.authority.set(bindingKey(binding), e.authorityRevision);
      }
      if (name !== "consultar_dados" && name !== "validar_consulta") return;
      if (!data(e)) {
        if (this.behavior?.requireErrorDiagnostic) {
          const parsed = evaluationDiagnosticSchema.safeParse(e?.diagnostic);
          if (!parsed.success) this.valid = false;
          else this.diagnostics.push(parsed.data);
        }
        return;
      }
      if (name !== "consultar_dados" || !e) return;
      if (
        this.behavior?.requireAuthorityContinuity &&
        (!e.authorityRevision ||
          !e.bindings?.length ||
          e.bindings.some((binding) => authority.get(bindingKey(binding)) !== e.authorityRevision))
      )
        this.valid = false;
      if (this.behavior?.requireAnswerContext) {
        const parsed = evaluationContextSchema.safeParse(e.context);
        if (
          !parsed.success ||
          !isDeepStrictEqual(parsed.data.sources, e.sources) ||
          !isDeepStrictEqual(parsed.data.publications, e.publications) ||
          (e.status === "partial" && parsed.data.complete)
        )
          this.valid = false;
        else this.contexts[contextIndex] = parsed.data;
      }
      if (this.behavior?.requirePaginationConsistency) {
        const options = request.options;
        if (!options || typeof options !== "object" || Array.isArray(options)) {
          this.valid = false;
          return;
        }
        const { page, pageSize, ...limits } = options as Record<string, unknown>;
        const received = e.pagination;
        if (
          !received ||
          !Number.isSafeInteger(received.page) ||
          !Number.isSafeInteger(received.pageSize) ||
          received.pageSize < 1 ||
          received.page < 1 ||
          typeof received.hasNextPage !== "boolean" ||
          !Number.isSafeInteger(page) ||
          !Number.isSafeInteger(pageSize) ||
          typeof pageSize !== "number" ||
          pageSize < received.pageSize ||
          page !== received.page
        ) {
          this.valid = false;
          return;
        }
        const signature = hash({ ...request, options: limits });
        const lineage = hash({
          sources: e.sources,
          publications: e.publications,
          bindings: e.bindings ?? [],
          authorityRevision: e.authorityRevision ?? null,
        });
        if (
          !previous
            ? page !== 1
            : !previous.hasNextPage ||
              page !== previous.page + 1 ||
              pageSize !== previous.pageSize ||
              received.pageSize !== previous.pageSize ||
              signature !== previous.signature ||
              lineage !== previous.lineage
        )
          this.valid = false;
        this.previous = { signature, lineage, ...received };
      }
    };
  }

  matches(answer: {
    contexts?: readonly EvaluationContext[];
    diagnostics?: readonly EvaluationDiagnostic[];
  }): boolean {
    return (
      this.valid &&
      (!this.behavior?.requireAnswerContext ||
        (this.contexts.every(Boolean) && isDeepStrictEqual(answer.contexts, this.contexts))) &&
      (!this.behavior?.requireErrorDiagnostic ||
        (this.diagnostics.length > 0 && isDeepStrictEqual(answer.diagnostics, this.diagnostics)))
    );
  }
}
