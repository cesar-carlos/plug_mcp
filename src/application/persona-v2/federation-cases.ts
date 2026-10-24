import { federationCaseSchema } from "../../domain/persona-v2/federation-training.js";
import type { PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { compileFederationTraining, assertFederationContract } from "./federation-training.js";
import { ExecuteFederation } from "./federation.js";
import { PersonaSourceQueries } from "./source-query.js";
import { queryLimits } from "../../domain/persona-v2/execution-limits.js";

/** Trusted operator runner only. No MCP/admin endpoint can mark a report approved.
 * Fixtures test combination semantics; they do not attest real SQL or consumer IA quality. */
export async function runFederationCases(
  tx: PersonaTransaction,
  personaId: string,
  skillId: string,
  crypto: CryptoPort,
): Promise<{
  approved: boolean;
  revision: number;
  packageHash: string;
  results: readonly { id: string; passed: boolean }[];
  scope: string;
}> {
  const draft = await tx.catalog.find(personaId, skillId);
  if (draft?.kind !== "cruzamento")
    throw new PersonaV2Error("INVALID_PLAN", "Runner exige rascunho de cruzamento.");
  const pkg = await compileFederationTraining(tx, personaId, draft.name, draft.training, crypto);
  const cases = await tx.catalog.cases(personaId, skillId);
  if (!cases.some((c) => c.required))
    throw new PersonaV2Error("INCOMPLETE_INPUT", "Cadastre casos obrigatórios antes do runner.");
  const results: { id: string; passed: boolean }[] = [];
  const sources = await tx.listSources(personaId);
  for (const test of cases) {
    let passed: boolean;
    try {
      const content = federationCaseSchema.parse(test.content);
      const plan = content.input.plan;
      // Contract/fixture mistakes are invalid test definitions, never expected execution errors.
      assertFederationContract(pkg, plan);
      const local = pkg.steps.filter((s) => s.kind === "local");
      if (
        content.input.fixtures.length !== local.length ||
        new Set(content.input.fixtures.map((f) => f.stepId)).size !== local.length ||
        local.some((s) => {
          const fixture = content.input.fixtures.find((f) => f.stepId === s.id);
          return !fixture || canonicalJson(fixture.columns) !== canonicalJson(s.columns);
        })
      )
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Fixtures devem corresponder a todas as etapas locais.",
        );
      // Reuse the actual read preflight with a zero-row fixture gateway. No hub call,
      // no report approval for DML, invalid parameters, fences or changed projections.
      for (const step of plan.steps) {
        if (step.kind !== "local") continue;
        const publication = await tx.catalog.publication(personaId, step.publicationId);
        if (publication?.package.format !== "persona-query-v2")
          throw new PersonaV2Error("INVALID_PLAN", "Dependência não é consulta.");
        const evidence = {
          executionLimits: queryLimits(publication.package.limits ?? {}),
          source: sources.find((s) => s.id === step.sourceId)!,
          publications: [{ ...publication, package: publication.package }],
        };
        const fixture = content.input.fixtures.find((f) => f.stepId === step.id)!;
        await new PersonaSourceQueries(
          {
            query: () => Promise.resolve(evidence),
            revalidateQuery: () => Promise.resolve(),
            sourceForVerification: () => Promise.resolve(evidence.source),
            suspendStructuralQuery: () => {
              throw new PersonaV2Error(
                "CAPABILITY_UNAVAILABLE",
                "Runner sintético não altera publicações por drift físico.",
              );
            },
          },
          {
            authorize: () =>
              Promise.resolve({
                revalidate: () => Promise.resolve(),
                execute: () =>
                  Promise.resolve({ columns: fixture.columns, rows: [], truncated: false }),
              }),
          },
        ).run(
          { personaId, tokenId: "trusted-runner", tokenVersion: 1, personaVersion: 1 },
          {
            fonteId: step.sourceId,
            skillIds: [publication.skillId],
            sql: step.sql,
            params: { ...step.params },
          },
          true,
        );
      }
      try {
        const result = await new ExecuteFederation({
          authorize: () => Promise.resolve(),
          query: (s) => {
            const fixture = content.input.fixtures.find((f) => f.stepId === s.id)!;
            return Promise.resolve({
              ...fixture,
              rows: fixture.rows,
              publicationHash: pkg.dependencies.find((d) => d.publicationId === s.publicationId)!
                .hash,
              readAt: new Date(0).toISOString(),
            });
          },
        }).execute(plan, pkg.budget);
        passed =
          !("errorCode" in content.expected) &&
          canonicalJson({
            rows: result.rows,
            columns: result.columns,
            totalRows: result.totalRows,
          }) === canonicalJson(content.expected);
      } catch (error) {
        passed =
          "errorCode" in content.expected &&
          error instanceof PersonaV2Error &&
          error.code === content.expected.errorCode;
      }
    } catch {
      passed = false;
    }
    results.push({ id: test.id, passed });
  }
  const approved = cases
    .filter((c) => c.required)
    .every((c) => results.find((r) => r.id === c.id)!.passed);
  const packageHash = crypto.sha256Hex(canonicalJson(pkg));
  await tx.catalog.saveReport(
    personaId,
    skillId,
    draft.revision,
    packageHash,
    crypto.sha256Hex(canonicalJson(cases)),
    approved,
    results,
  );
  return {
    approved,
    revision: draft.revision,
    packageHash,
    results,
    scope: "synthetic-combination-only",
  };
}
