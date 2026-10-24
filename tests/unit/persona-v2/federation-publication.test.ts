import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  compileFederationTraining,
  assertFederationContract,
  federationTrainingSchema,
  federationRequestSchema,
} from "../../../src/application/persona-v2/federation-training.js";
import {
  compileQueryTraining,
  sourceFingerprint,
} from "../../../src/application/persona-v2/query-training.js";
import { runFederationCases } from "../../../src/application/persona-v2/federation-cases.js";
import { PersonaPublishedFederation } from "../../../src/application/persona-v2/published-federation.js";
import { canonicalJson, type CatalogPublication } from "../../../src/domain/persona-v2/catalog.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import type { PersonaTransaction } from "../../../src/domain/ports/persona-v2.port.js";
import type { PersonaSourceQueries } from "../../../src/application/persona-v2/source-query.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";
import {
  federationTraining,
  federationPlan,
  federationCase,
} from "../../helpers/persona-v2-federation.js";

const crypto = new NodeCryptoAdapter("a".repeat(64));
const fixture = () => {
  const sources = [
    { ...trainingSource },
    {
      ...trainingSource,
      id: randomUUID(),
      credentialId: randomUUID(),
      physicalSourceId: randomUUID(),
    },
  ];
  const publications: CatalogPublication[] = sources.map((source) => {
    const pkg = compileQueryTraining(queryTraining(source.id), source, crypto);
    return {
      id: randomUUID(),
      personaId: source.personaId,
      skillId: randomUUID(),
      revision: 1,
      package: pkg,
      hash: crypto.sha256Hex(canonicalJson(pkg)),
      sourceVersion: source.authorizationVersion,
      sourceFingerprint: sourceFingerprint(source, crypto),
      suspendedAt: null,
    };
  });
  const refs = sources.map((s, i) => ({ id: s.id, publicationId: publications[i]!.id }));
  const training = federationTraining(refs);
  const skillId = randomUUID();
  const draft = {
    id: skillId,
    personaId: trainingSource.personaId,
    slug: "cross",
    kind: "cruzamento",
    name: "Cruzamento",
    revision: 2,
    training,
    activePublicationId: null,
  };
  const cases = [{ id: randomUUID(), required: true, content: federationCase(refs) }];
  const saveReport = vi.fn(() => Promise.resolve());
  const tx = {
    listSources: async () => sources,
    catalog: {
      publication: vi.fn(
        async (_persona: string, id: string) => publications.find((p) => p.id === id) ?? null,
      ),
      find: vi.fn(async (_persona: string, id: string) =>
        id === skillId
          ? draft
          : (publications
              .filter((p) => p.skillId === id)
              .map((p) => ({ activePublicationId: p.id }))[0] ?? null),
      ),
      cases: async () => cases,
      saveReport,
    },
  } as unknown as PersonaTransaction;
  return {
    sources,
    publications,
    refs,
    training,
    draft,
    cases,
    saveReport,
    tx,
    compile: () =>
      compileFederationTraining(tx, trainingSource.personaId, draft.name, training, crypto),
  };
};

it("publicação fixa múltiplas fontes, dependências exatas e capability própria", async () => {
  const f = fixture(),
    pkg = await f.compile();
  expect(pkg.dependencies.map((d) => d.publicationId)).toEqual(f.publications.map((p) => p.id));
  expect(pkg.requiredCapabilities[0]).toMatch(/^federation-contract:[a-f0-9]{64}$/);
  assertFederationContract(pkg, federationPlan(f.refs, randomUUID()));
  f.training.semantics.currency = "USD; não converter automaticamente";
  expect((await f.compile()).requiredCapabilities).not.toEqual(pkg.requiredCapabilities);
});
it.each(["suspension", "source", "credential", "hash", "publication"])(
  "dependência alterada bloqueia compilação: %s",
  async (kind) => {
    const f = fixture();
    if (kind === "suspension") Object.assign(f.publications[0]!, { suspendedAt: new Date() });
    if (kind === "source") f.sources[0]!.active = false;
    if (kind === "credential") f.sources[0]!.credentialVersion++;
    if (kind === "hash") Object.assign(f.publications[0]!, { hash: "tampered" });
    if (kind === "publication")
      Object.assign(f.training.steps[0]!, { publicationId: randomUUID() });
    await expect(f.compile()).rejects.toMatchObject({ code: "STALE_AUTHORIZATION" });
  },
);
it.each(["key", "column", "order", "output", "source-count"])(
  "compilador verifica estrutura sem executar SQL: %s",
  async (kind) => {
    const f = fixture();
    const join = f.training.steps.find((s) => s.kind === "join")!;
    if (kind === "key") join.keys[0]!.left = "absent";
    if (kind === "column") join.columns[0]!.column = "absent";
    if (kind === "order") f.training.steps.reverse();
    if (kind === "output") f.training.output = "absent";
    if (kind === "source-count") f.training.steps[1] = f.training.steps[0]!;
    await expect(f.compile()).rejects.toMatchObject({ code: "INVALID_PLAN" });
  },
);
it("contrato rejeita qualquer mudança da combinação e não aceita scripts", async () => {
  const f = fixture(),
    pkg = await f.compile(),
    plan = federationPlan(f.refs, randomUUID());
  expect(() => federationRequestSchema.parse({ plan, script: "return data" })).toThrow();
  const altered = structuredClone(plan);
  Object.assign(altered.steps[2]!, { cardinality: "one_to_many" });
  expect(() => assertFederationContract(pkg, altered)).toThrow("combinação publicada");
  expect(() =>
    federationTrainingSchema.parse({ ...f.training, budget: { rowsPerSource: 5001 } }),
  ).toThrow();
});
it("runner separado grava relatório ligado a pacote/revisão/casos, sem payload de teste", async () => {
  const f = fixture();
  const report = await runFederationCases(f.tx, trainingSource.personaId, f.draft.id, crypto);
  expect(report.approved).toBe(true);
  expect(report.scope).toBe("synthetic-combination-only");
  expect(f.saveReport).toHaveBeenCalledWith(
    trainingSource.personaId,
    f.draft.id,
    2,
    report.packageHash,
    crypto.sha256Hex(canonicalJson(f.cases)),
    true,
    [{ id: f.cases[0]!.id, passed: true }],
  );
});
it.each(["expected", "missing-fixture", "duplicate-fixture", "invalid-plan", "truncated"])(
  "runner não aprova caso obrigatório incorreto: %s",
  async (kind) => {
    const f = fixture(),
      content = f.cases[0]!.content;
    if (kind === "expected") content.expected.totalRows = 999;
    if (kind === "missing-fixture") content.input.fixtures.pop();
    if (kind === "duplicate-fixture") content.input.fixtures[1] = content.input.fixtures[0]!;
    if (kind === "invalid-plan") Object.assign(content.input.plan.steps[2]!, { join: "inner" });
    if (kind === "truncated") content.input.fixtures[0]!.truncated = true;
    expect(
      (await runFederationCases(f.tx, trainingSource.personaId, f.draft.id, crypto)).approved,
    ).toBe(false);
  },
);
it("runner aceita erro esperado de cardinalidade, mantendo caso positivo obrigatório", async () => {
  const f = fixture(),
    negative = structuredClone(f.cases[0]!);
  negative.id = randomUUID();
  negative.content.input.fixtures[1]!.rows.push({
    ...negative.content.input.fixtures[1]!.rows[0]!,
  });
  Object.assign(negative, {
    content: { ...negative.content, expected: { errorCode: "INVALID_PLAN" } },
  });
  f.cases.push(negative);
  expect(
    (await runFederationCases(f.tx, trainingSource.personaId, f.draft.id, crypto)).approved,
  ).toBe(true);
});
it.each(["dml", "secret", "projection", "parameter"])(
  "runner recusa SQL de fixture inválido antes da combinação: %s",
  async (kind) => {
    const f = fixture();
    const local = f.cases[0]!.content.input.plan.steps[0]!;
    if (kind === "dml") Object.assign(local, { sql: "DELETE FROM orders WHERE id > :minimum" });
    if (kind === "secret")
      Object.assign(local, {
        sql: "SELECT p.id,p.secret AS amount FROM orders p WHERE p.id > :minimum",
      });
    if (kind === "projection")
      Object.assign(local, {
        sql: "SELECT p.id,p.amount AS changed FROM orders p WHERE p.id > :minimum",
      });
    if (kind === "parameter") Object.assign(local, { params: { minimum: "not-a-number" } });
    expect(
      (await runFederationCases(f.tx, trainingSource.personaId, f.draft.id, crypto)).approved,
    ).toBe(false);
  },
);
it("prazo inclui a primeira autorização e impede dispatch depois de expirar", async () => {
  const f = fixture(),
    pkg = await f.compile();
  const publication = {
    ...f.publications[0]!,
    id: randomUUID(),
    package: pkg,
    executionBudget: pkg.budget,
  };
  const catalog = {
    federation: vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return publication;
    }),
  };
  const run = vi.fn<PersonaSourceQueries["run"]>();
  await expect(
    new PersonaPublishedFederation(catalog, { run }).run(
      {
        personaId: trainingSource.personaId,
        tokenId: randomUUID(),
        tokenVersion: 1,
        personaVersion: 1,
      },
      { plan: federationPlan(f.refs, publication.id), budget: { timeoutMs: 1 } },
    ),
  ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(run).not.toHaveBeenCalled();
});
it.each(["active", "before-second", "before-delivery"] as const)(
  "orquestrador revalida fonte já lida (%s) sem entregar após revogação",
  async (phase) => {
    const f = fixture(),
      pkg = await f.compile(),
      publicationId = randomUUID();
    const publication = {
      ...f.publications[0]!,
      id: publicationId,
      skillId: f.draft.id,
      package: pkg,
      executionBudget: pkg.budget,
    };
    const sequence: string[] = [];
    const catalog = {
      federation: vi.fn(async () => {
        sequence.push("catalog");
        return publication;
      }),
    };
    const run = vi.fn<PersonaSourceQueries["run"]>(
      async (_identity, query, _validation, internal) => {
        sequence.push("query");
        internal!.retainRevalidation(async () => {
          sequence.push("lease");
          const queries = sequence.filter((item) => item === "query").length;
          if (
            query.fonteId === f.refs[0]!.id &&
            ((phase === "before-second" && queries === 1) ||
              (phase === "before-delivery" && queries === 2))
          ) {
            throw new Error("Fonte já consultada foi revogada.");
          }
        });
        const source = f.refs.find((s) => s.id === query.fonteId)!;
        const dep = pkg.dependencies.find((d) => d.sourceId === source.id)!;
        return {
          fonteId: source.id,
          columns: ["id", "amount"],
          rows: [{ id: 1, amount: "1.25" }],
          completeness: { complete: true, truncated: false },
          provenance: {
            sourceId: source.id,
            dialect: "postgres" as const,
            readAt: new Date().toISOString(),
            publications: [{ id: dep.publicationId, hash: dep.hash }],
          },
        };
      },
    );
    const execution = new PersonaPublishedFederation(catalog, { run }).run(
      {
        personaId: trainingSource.personaId,
        tokenId: randomUUID(),
        tokenVersion: 1,
        personaVersion: 1,
      },
      { plan: federationPlan(f.refs, publicationId) },
    );
    if (phase !== "active") {
      await expect(execution).rejects.toThrow("Fonte já consultada foi revogada.");
      expect(run).toHaveBeenCalledTimes(phase === "before-second" ? 1 : 2);
      expect(sequence.at(-1)).toBe("lease");
      return;
    }
    const result = await execution;
    expect(result).toMatchObject({
      rows: [{ id: 1, amount_a: "1.25", amount_b: "1.25" }],
      complete: true,
    });
    expect(sequence.slice(-4)).toEqual(["lease", "lease", "catalog", "catalog"]);
    expect(run.mock.calls[0]![3]).toMatchObject({
      publicationId: pkg.dependencies[0]!.publicationId,
      hash: pkg.dependencies[0]!.hash,
      columns: ["id", "amount"],
    });
  },
);
