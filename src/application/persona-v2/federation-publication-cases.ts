import { federationPublicationCaseSchema } from "../../domain/persona-v2/federation-training.js";
export { federationPublicationCaseSchema } from "../../domain/persona-v2/federation-training.js";
import type {
  PersonaRepositoryPort,
  PersonaTransaction,
} from "../../domain/ports/persona-v2.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { Source } from "../../domain/persona-v2/model.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import {
  canonicalJson,
  type QueryPackage,
  type CatalogPublication,
} from "../../domain/persona-v2/catalog.js";
import type { DataRow } from "../../domain/persona-v2/federation.js";
import type { PublicationFixtureSeed } from "../../domain/persona-v2/publication-fixture.js";
import type { PublicationRunEvidence } from "../../domain/persona-v2/publication-run.js";
import { compileFederationTraining, assertFederationContract } from "./federation-training.js";
import { ExecuteFederation } from "./federation.js";
import { federationFieldUses } from "./federation-field-uses.js";
import { caseRowsEqual } from "./publication-case-values.js";
import type { FederationQueryContext, SourceQueryResponse } from "./source-query.js";
import { sharedQueryKnowledgeCurrent } from "./shared-query-adoption.js";

export interface FederationPublicationFixture {
  readonly supportsStructureGuard: true;
  evidence(source: Source): PublicationRunEvidence["sources"][number];
  prepareFederation(
    source: Source,
    seeds: readonly PublicationFixtureSeed[],
    tables: readonly string[],
  ): Promise<void>;
  finishFederation(terminal: boolean): Promise<void>;
  readQuery(
    pkg: QueryPackage,
    source: Source,
    sql: string,
    params: Readonly<Record<string, string | number | boolean | null>>,
    revalidate: () => Promise<void>,
    internal: FederationQueryContext,
  ): Promise<SourceQueryResponse>;
}

/** Operator only. Seeds and business SQL never run while holding MCP transaction locks. */
export async function runFederationPublicationCases(
  repository: PersonaRepositoryPort,
  personaId: string,
  skillId: string,
  crypto: CryptoPort,
  fixtures: ReadonlyMap<string, FederationPublicationFixture>,
  now: () => Date = () => new Date(),
): Promise<{
  approved: boolean;
  revision: number;
  packageHash: string;
  results: { id: string; passed: boolean }[];
  scope: string;
}> {
  const locks = { personaIds: [personaId], tokenIds: [] };
  const capture = async (tx: PersonaTransaction) => {
    const persona = await tx.findPersona(personaId);
    const draft = await tx.catalog.find(personaId, skillId);
    if (!persona?.active || draft?.kind !== "cruzamento")
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Persona ou cruzamento indisponível.");
    const pkg = await compileFederationTraining(tx, personaId, draft.name, draft.training, crypto);
    const cases = await tx.catalog.cases(personaId, skillId);
    const sources = (await tx.listSources(personaId)).filter((s) =>
      pkg.dependencies.some((d) => d.sourceId === s.id),
    );
    const dependencies: CatalogPublication<QueryPackage>[] = [];
    const catalogs = new Set<string>();
    for (const ref of pkg.dependencies) {
      const publication = await tx.catalog.publication(personaId, ref.publicationId);
      if (publication?.package.format === "persona-query-v2" && publication.package.sharedKnowledge)
        catalogs.add(publication.package.sharedKnowledge.catalogId);
    }
    for (const id of [...catalogs].sort()) await tx.knowledge?.catalog(id, persona.ownerId);
    for (const ref of pkg.dependencies) {
      const publication = await tx.catalog.publication(personaId, ref.publicationId);
      if (
        publication?.package.format !== "persona-query-v2" ||
        !(await sharedQueryKnowledgeCurrent(tx, persona.ownerId, publication.package))
      )
        throw new PersonaV2Error("STALE_AUTHORIZATION", "Dependência de consulta indisponível.");
      dependencies.push({ ...publication, package: publication.package });
    }
    if (!cases.some((c) => c.required))
      throw new PersonaV2Error("INCOMPLETE_INPUT", "Runner exige casos obrigatórios.");
    for (const source of sources) {
      const fixture = fixtures.get(source.id);
      if (fixture?.supportsStructureGuard !== true)
        throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Fixture com guarda real ausente.");
      fixture.evidence(source);
    }
    if (
      new Set(sources.map((s) => fixtures.get(s.id)!.evidence(s).fixtureIdentityHash)).size !==
      sources.length
    )
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Cada fonte do caso exige fixture física independente.",
      );
    const packageHash = crypto.sha256Hex(canonicalJson(pkg));
    const casesHash = crypto.sha256Hex(canonicalJson(cases));
    return {
      draft,
      pkg,
      cases,
      sources,
      dependencies,
      packageHash,
      casesHash,
      fence: crypto.sha256Hex(canonicalJson({ persona, sources, draft, dependencies })),
    };
  };
  const runId = crypto.randomId();
  const startedAt = now().toISOString();
  const evidence = (
    s: Awaited<ReturnType<typeof capture>>,
    complete = false,
  ): PublicationRunEvidence => ({
    version: 1,
    runId,
    startedAt,
    ...(complete ? { completedAt: now().toISOString() } : {}),
    scope: "isolated-federation-transport",
    sources: s.sources.map((source) => fixtures.get(source.id)!.evidence(source)),
    dependencies: s.dependencies.map((p) => ({ publicationId: p.id, hash: p.hash })),
  });
  const snapshot = await repository.transaction(locks, async (tx) => {
    const s = await capture(tx);
    await tx.catalog.saveReport(
      personaId,
      skillId,
      s.draft.revision,
      s.packageHash,
      s.casesHash,
      false,
      s.cases.map((c) => ({ id: c.id, passed: false })),
      "persona-generic-federation-fixtures-v1",
      evidence(s),
    );
    return structuredClone(s);
  });
  const revalidate = async () =>
    repository.transaction(locks, async (tx) => {
      const s = await capture(tx);
      if (
        s.fence !== snapshot.fence ||
        s.packageHash !== snapshot.packageHash ||
        s.casesHash !== snapshot.casesHash
      )
        throw new PersonaV2Error(
          "STALE_AUTHORIZATION",
          "Treinamento, casos, fontes ou dependências mudaram durante a rodada.",
        );
    });
  const results: { id: string; passed: boolean }[] = [];
  for (const test of snapshot.cases) {
    const content = federationPublicationCaseSchema.parse(test.content);
    const plan = content.input.plan;
    assertFederationContract(snapshot.pkg, plan);
    if (
      new Set(content.input.sources.map((s) => s.sourceId)).size !== snapshot.sources.length ||
      content.input.sources.length !== snapshot.sources.length ||
      content.input.sources.some((s) => !snapshot.sources.some((t) => t.id === s.sourceId))
    )
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Sementes devem corresponder a todas as fontes utilizadas.",
      );
    const prepared: FederationPublicationFixture[] = [];
    let terminal = false;
    let passed: boolean;
    let executing = false;
    const checks: (() => Promise<void>)[] = [];
    try {
      for (const source of snapshot.sources) {
        await revalidate();
        const fixture = fixtures.get(source.id)!;
        const tables = snapshot.dependencies
          .filter((p) => p.package.sourceId === source.id)
          .flatMap((p) => p.package.scope.tabelas);
        await fixture.prepareFederation(
          source,
          content.input.sources.find((s) => s.sourceId === source.id)!.fixtures,
          tables,
        );
        prepared.push(fixture);
      }
      const uses = federationFieldUses(snapshot.pkg.steps);
      executing = true;
      const result = await new ExecuteFederation({
        authorize: async () => {
          await revalidate();
          for (const check of checks) await check();
        },
        query: async (step, { signal }) => {
          const p = snapshot.dependencies.find((d) => d.id === step.publicationId)!;
          const source = snapshot.sources.find((s) => s.id === step.sourceId)!;
          const columns = snapshot.pkg.steps
            .filter((s) => s.kind === "local")
            .find((s) => s.id === step.id)!.columns;
          const response = await fixtures
            .get(source.id)!
            .readQuery(p.package, source, step.sql, step.params, revalidate, {
              publicationId: p.id,
              hash: p.hash,
              columns,
              signal,
              outputUses: uses[step.id],
              retainRevalidation: (check) => checks.push(check),
            });
          return {
            columns: response.columns ?? [],
            rows: (response.rows ?? []) as readonly DataRow[],
            truncated: !response.completeness.complete,
            publicationHash: p.hash,
            readAt: response.provenance.readAt,
          };
        },
      }).execute(plan, snapshot.pkg.budget);
      terminal = true;
      passed =
        !("errorCode" in content.expected) &&
        result.totalRows === content.expected.totalRows &&
        canonicalJson(result.columns) ===
          canonicalJson(content.expected.columns.map((c) => c.name)) &&
        caseRowsEqual(
          result.rows,
          content.expected.rows,
          content.expected.columns,
          content.expected.ordered,
        );
    } catch (error) {
      // Only deterministic application refusals can be expected; transport/identity/authority failures abort.
      if (
        !executing ||
        !(error instanceof PersonaV2Error) ||
        !["INVALID_PLAN", "INCOMPLETE_INPUT", "BUDGET_EXCEEDED"].includes(error.code)
      )
        throw error;
      terminal = true;
      passed = "errorCode" in content.expected && content.expected.errorCode === error.code;
    } finally {
      await Promise.all(prepared.map((f) => f.finishFederation(terminal)));
    }
    results.push({ id: test.id, passed });
  }
  await revalidate();
  return repository.transaction(locks, async (tx) => {
    const current = await capture(tx);
    if (
      current.fence !== snapshot.fence ||
      current.packageHash !== snapshot.packageHash ||
      current.casesHash !== snapshot.casesHash
    )
      throw new PersonaV2Error("STALE_AUTHORIZATION", "Rodada obsoleta; execute novamente.");
    const approved =
      current.cases
        .filter((c) => c.required)
        .every((c) => results.find((r) => r.id === c.id)?.passed) &&
      current.cases.some(
        (c) =>
          c.required && !("errorCode" in federationPublicationCaseSchema.parse(c.content).expected),
      );
    await tx.catalog.saveReport(
      personaId,
      skillId,
      current.draft.revision,
      current.packageHash,
      current.casesHash,
      approved,
      results,
      "persona-generic-federation-fixtures-v1",
      evidence(current, true),
    );
    return {
      approved,
      revision: current.draft.revision,
      packageHash: current.packageHash,
      results,
      scope: "isolated-federation-transport",
    };
  });
}
