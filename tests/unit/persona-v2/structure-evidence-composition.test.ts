import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { canonicalJson } from "../../../src/domain/persona-v2/catalog.js";
import {
  sourceSchemaResultSchema,
  storedStructureEvidenceSchema,
} from "../../../src/domain/persona-v2/source-schema.js";
import {
  composeStructureEvidence,
  type EvidencePage,
} from "../../../src/application/persona-v2/structure-evidence-composition.js";
const crypto = new NodeCryptoAdapter("ab".repeat(32));
function fixture(): EvidencePage[] {
  const sourceId = randomUUID();
  const resources = Array.from({ length: 6 }, (_, i) => ({
    schema: "public",
    name: `table_${i}`,
    type: "table" as const,
  }));
  return [0, 2, 4].map((offset) => {
    const observedAt = new Date(Date.UTC(2026, 9, 14, 12, offset)).toISOString();
    const evidence = sourceSchemaResultSchema.parse({
      contractVersion: 1,
      observedAt,
      identity: {
        contractVersion: 1,
        database: "fixture",
        dialect: "postgres",
        identityKind: "native",
        identityHash: "a".repeat(64),
        engineVersion: "fixture",
        verifiedAt: observedAt,
      },
      resources: resources.slice(offset, offset + 2).map((resource) => ({
        resource,
        status: "available",
        columns: [
          {
            name: "id",
            nativeType: "int4",
            ordinal: 1,
            nullable: false,
            size: null,
            scale: null,
          },
        ],
        primaryKeys: [],
        foreignKeys: [],
        coverage: {
          columns: true,
          primaryKeys: false,
          foreignKeys: false,
          constraintStatus: false,
        },
        limitations: ["constraint_status_unverified"],
      })),
      metadataPage: { offset, pageSize: 2, nextOffset: offset === 4 ? null : offset + 2 },
    });
    return {
      id: randomUUID(),
      sourceId,
      sourceVersion: 1,
      credentialVersion: 1,
      identityHash: "a".repeat(64),
      scope: { resources, offset, pageSize: 2 },
      evidence,
      hash: crypto.sha256Hex(canonicalJson(evidence)),
      expiresAt: new Date(Date.UTC(2026, 9, 14, 12, 15 + offset)),
    };
  });
}
const rehash = (pages: EvidencePage[]) =>
  pages.forEach((p) => {
    p.hash = crypto.sha256Hex(canonicalJson(p.evidence));
  });

it("ordena páginas e conserva origem, escopo, seis recursos e menor validade sem ampliar RPC", () => {
  const pages = fixture(),
    r = composeStructureEvidence([...pages].reverse(), crypto);
  expect(r.status).toBe("composed");
  if (r.status !== "composed") throw new Error("Expected composed evidence");
  expect(r.evidence.resources.map((v) => v.resource.name)).toEqual(
    pages[0]!.scope.resources.map((v) => v.name),
  );
  expect(r.evidence.composition!.pages.map((p) => p.id)).toEqual(pages.map((p) => p.id));
  expect(r.expiresAt).toEqual(pages[0]!.expiresAt);
  expect(r.evidence.observedAt).toBe(pages[2]!.evidence.observedAt);
  expect(r.evidence.metadataPage.nextOffset).toBeNull();
  expect(storedStructureEvidenceSchema.safeParse(r.evidence).success).toBe(true);
  expect(sourceSchemaResultSchema.safeParse(r.evidence).success).toBe(false);
  expect(
    storedStructureEvidenceSchema.safeParse({ ...r.evidence, composition: undefined }).success,
  ).toBe(false);
});
it("lacunas, sobreposição e escopo conflitante não produzem prova composta", () => {
  const pages = fixture();
  expect(composeStructureEvidence([pages[0]!, pages[2]!], crypto)).toMatchObject({
    status: "inconclusive",
    issues: ["PAGES_GAP"],
  });
  expect(composeStructureEvidence(pages.slice(0, 2), crypto)).toMatchObject({
    issues: ["PAGES_GAP"],
  });
  const overlapping = structuredClone(pages);
  overlapping[1]!.scope.offset = 0;
  expect(composeStructureEvidence(overlapping, crypto)).toMatchObject({
    issues: ["PAGES_OVERLAP"],
  });
  const scope = structuredClone(pages);
  scope[1]!.scope = structuredClone(scope[1]!.scope);
  scope[1]!.scope.resources[0]!.name = "other";
  expect(composeStructureEvidence(scope, crypto)).toMatchObject({
    issues: ["PAGE_SCOPE_CONFLICT"],
  });
});
it.each(["sourceId", "sourceVersion", "credentialVersion", "identityHash"] as const)(
  "não combina %s divergente",
  (key) => {
    const pages = fixture();
    if (key === "sourceVersion" || key === "credentialVersion") pages[1]![key] = 2;
    else pages[1]![key] = randomUUID();
    expect(composeStructureEvidence(pages, crypto)).toMatchObject({
      issues: ["PAGE_IDENTITY_OR_VERSION_CONFLICT"],
    });
  },
);
it("recusa outra identidade nativa, alteração de conteúdo, hash adulterado e composição aninhada", () => {
  const identity = fixture();
  identity[1]!.evidence.identity.engineVersion = "other";
  rehash(identity);
  expect(composeStructureEvidence(identity, crypto)).toMatchObject({
    issues: ["PAGE_IDENTITY_OR_VERSION_CONFLICT"],
  });
  const changed = fixture();
  changed[1]!.evidence.resources[0]!.resource.name = "other";
  rehash(changed);
  expect(composeStructureEvidence(changed, crypto)).toMatchObject({
    issues: ["PAGE_CONTENT_CONFLICT"],
  });
  const hash = fixture();
  hash[0]!.hash = "b".repeat(64);
  expect(composeStructureEvidence(hash, crypto)).toMatchObject({ issues: ["INVALID_PAGE_PROOF"] });
  const nested = fixture(),
    result = composeStructureEvidence(nested, crypto);
  if (result.status !== "composed") throw new Error("Expected composed evidence");
  nested[0]!.evidence = result.evidence;
  rehash(nested);
  expect(composeStructureEvidence(nested, crypto)).toMatchObject({
    issues: ["NESTED_COMPOSITION"],
  });
  expect(composeStructureEvidence([hash[0]!, hash[0]!], crypto)).toMatchObject({
    issues: ["INVALID_PAGE_SET"],
  });
});
it("metadado indisponível e enforcement desconhecido continuam inconclusivos para adoção", () => {
  const pages = fixture();
  pages[0]!.evidence.resources[0]!.status = "not_authorized";
  pages[0]!.evidence.resources[0]!.coverage.columns = false;
  rehash(pages);
  const r = composeStructureEvidence(pages, crypto);
  if (r.status !== "composed") throw new Error("Expected composed envelope, not compatibility");
  expect(r.evidence.resources[0]!.status).toBe("not_authorized");
  expect(r.evidence.resources[0]!.coverage.columns).toBe(false);
  expect(r.evidence.resources.every((v) => !v.coverage.constraintStatus)).toBe(true);
});
