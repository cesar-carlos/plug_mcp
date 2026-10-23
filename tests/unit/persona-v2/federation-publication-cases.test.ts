import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  runFederationPublicationCases,
  type FederationPublicationFixture,
} from "../../../src/application/persona-v2/federation-publication-cases.js";
import {
  compileQueryTraining,
  sourceFingerprint,
} from "../../../src/application/persona-v2/query-training.js";
import { canonicalJson } from "../../../src/domain/persona-v2/catalog.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import type {
  PersonaTransaction,
  PersonaRepositoryPort,
} from "../../../src/domain/ports/persona-v2.port.js";
import { PersonaV2Error } from "../../../src/domain/persona-v2/model.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";
import { federationTraining, federationPlan } from "../../helpers/persona-v2-federation.js";

const crypto = new NodeCryptoAdapter("a".repeat(64));
function fixture() {
  const sources = [0, 1].map(() => ({
    ...trainingSource,
    id: randomUUID(),
    identityHash: crypto.sha256Hex(randomUUID()),
  }));
  const publications = sources.map((source) => {
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
      suspendedAt: null as Date | null,
    };
  });
  const refs = sources.map((s, i) => ({ id: s.id, publicationId: publications[i]!.id }));
  const draft = {
    id: randomUUID(),
    kind: "cruzamento",
    name: "Caso",
    revision: 1,
    training: federationTraining(refs),
  };
  const scalar = (type: string, value: string) => ({ type, value });
  const cases = [
    {
      id: randomUUID(),
      required: true,
      content: {
        name: "Junção real na fixture",
        input: {
          plan: federationPlan(refs, randomUUID()),
          sources: sources.map((s) => ({
            sourceId: s.id,
            fixtures: [{ table: "orders", generated: [], rows: [] }],
          })),
        },
        expected: {
          columns: [
            { name: "id", type: "integer" },
            { name: "amount_a", type: "decimal" },
            { name: "amount_b", type: "decimal" },
          ],
          rows: [
            {
              id: scalar("integer", "1"),
              amount_a: scalar("decimal", "10.25"),
              amount_b: scalar("decimal", "20.50"),
            },
          ],
          ordered: true,
          totalRows: 1,
        },
      },
    },
  ];
  let locked = false;
  const saveReport = vi.fn<PersonaTransaction["catalog"]["saveReport"]>(async () =>
    Promise.resolve(),
  );
  const tx = {
    findPersona: async () => ({ active: true, ownerId: "owner", authorizationVersion: 1 }),
    listSources: async () => sources,
    catalog: {
      find: async (_p: string, id: string) =>
        id === draft.id
          ? draft
          : { activePublicationId: publications.find((p) => p.skillId === id)?.id },
      publication: async (_p: string, id: string) => publications.find((p) => p.id === id),
      cases: async () => cases,
      saveReport,
    },
  } as unknown as PersonaTransaction;
  const repository = {
    transaction: async (_locks: unknown, action: (tx: PersonaTransaction) => Promise<unknown>) => {
      expect(locked).toBe(false);
      locked = true;
      try {
        return await action(tx);
      } finally {
        locked = false;
      }
    },
  } as PersonaRepositoryPort;
  const fixtures = new Map(
    sources.map((source, i) => {
      const executor = {
        supportsStructureGuard: true as const,
        evidence: (s: typeof source) => ({
          sourceId: s.id,
          sourceVersion: s.authorizationVersion,
          credentialVersion: s.credentialVersion,
          sourceFingerprint: sourceFingerprint(s, crypto),
          dialect: s.dialect,
          identityHash: s.identityHash,
          fixtureSourceId: s.id,
          fixtureIdentityHash: s.identityHash,
          fixtureManifestHash: "a".repeat(64),
        }),
        prepareFederation: vi.fn(async () => {
          expect(locked).toBe(false);
          expect(saveReport.mock.calls.at(-1)?.[5]).toBe(false);
        }),
        finishFederation: vi.fn(async () => Promise.resolve()),
        readQuery: vi.fn<FederationPublicationFixture["readQuery"]>(
          async (_pkg, s, _sql, _params, check) => {
            expect(locked).toBe(false);
            await check();
            return {
              fonteId: s.id,
              columns: ["id", "amount"],
              rows: [{ id: 1, amount: i === 0 ? "10.25" : "20.50" }],
              completeness: { complete: true, truncated: false },
              provenance: {
                sourceId: s.id,
                dialect: s.dialect,
                readAt: new Date().toISOString(),
                publications: [],
              },
            };
          },
        ),
      };
      return [source.id, executor] as const;
    }),
  );
  return {
    sources,
    publications,
    cases,
    draft,
    fixtures,
    saveReport,
    run: () =>
      runFederationPublicationCases(
        repository,
        trainingSource.personaId,
        draft.id,
        crypto,
        fixtures,
      ),
  };
}
it("aprova após SELECTs fora dos locks, limpeza e revalidação; conserva proveniência", async () => {
  const f = fixture();
  expect((await f.run()).approved).toBe(true);
  expect(f.saveReport).toHaveBeenCalledTimes(2);
  const stored = f.saveReport.mock.calls.at(-1)!;
  expect(stored[7]).toBe("persona-generic-federation-fixtures-v1");
  expect(stored[8]).toMatchObject({
    scope: "isolated-federation-transport",
    dependencies: f.publications.map((p) => ({ publicationId: p.id, hash: p.hash })),
  });
  for (const executor of f.fixtures.values())
    expect(executor.finishFederation).toHaveBeenCalledWith(true);
});
it.each(["revision", "credential", "publication", "cases"])(
  "mudança de %s bloqueia aprovação",
  async (field) => {
    const f = fixture(),
      executor = [...f.fixtures.values()][0]!;
    const original = executor.readQuery.getMockImplementation()!;
    executor.readQuery.mockImplementation(async (...args) => {
      const result = await original(...args);
      if (field === "revision") f.draft.revision++;
      if (field === "credential") f.sources[0]!.credentialVersion++;
      if (field === "publication") f.publications[0]!.suspendedAt = new Date();
      if (field === "cases") f.cases[0]!.content.expected.totalRows++;
      return result;
    });
    await expect(f.run()).rejects.toMatchObject({ code: "STALE_AUTHORIZATION" });
    expect(f.saveReport).toHaveBeenCalledTimes(1);
  },
);
it("erro de transporte não é erro esperado nem permite limpar/repetir", async () => {
  const f = fixture();
  [...f.fixtures.values()][0]!.readQuery.mockRejectedValue(new Error("lost"));
  await expect(f.run()).rejects.toThrow("lost");
  expect(f.saveReport).toHaveBeenCalledTimes(1);
  for (const executor of f.fixtures.values())
    expect(executor.finishFederation).toHaveBeenCalledWith(false);
});
it("erro no preparo é definição inválida, nunca caso de recusa aprovado", async () => {
  const f = fixture();
  [...f.fixtures.values()][0]!.prepareFederation.mockRejectedValue(
    new PersonaV2Error("INVALID_PLAN", "bad seed"),
  );
  Object.assign(f.cases[0]!.content, { expected: { errorCode: "INVALID_PLAN" } });
  await expect(f.run()).rejects.toThrow("bad seed");
  expect(f.saveReport).toHaveBeenCalledTimes(1);
});
it("resultado truncado reprova e não presume total", async () => {
  const f = fixture(),
    executor = [...f.fixtures.values()][0]!;
  const original = executor.readQuery.getMockImplementation()!;
  executor.readQuery.mockImplementation(async (...args) => ({
    ...(await original(...args)),
    completeness: { complete: false, truncated: true },
  }));
  expect((await f.run()).approved).toBe(false);
});
it("limpeza falha impede aprovar mesmo que os dados coincidam", async () => {
  const f = fixture();
  [...f.fixtures.values()][0]!.finishFederation.mockRejectedValue(new Error("clear failed"));
  await expect(f.run()).rejects.toThrow("clear failed");
  expect(f.saveReport).toHaveBeenCalledTimes(1);
});
it("mesma fixture física não pode receber sementes independentes de duas fontes", async () => {
  const f = fixture(),
    executors = [...f.fixtures.values()];
  executors[1]!.evidence = (s) => ({
    ...executors[0]!.evidence(s),
    fixtureIdentityHash: f.sources[0]!.identityHash,
  });
  await expect(f.run()).rejects.toMatchObject({ code: "INVALID_PLAN" });
  expect(f.saveReport).not.toHaveBeenCalled();
});
