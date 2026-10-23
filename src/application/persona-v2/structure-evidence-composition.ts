import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import {
  schemaInspectionSchema,
  sourceSchemaResultSchema,
  storedStructureEvidenceSchema,
  type StructureEvidenceRecord,
  type SchemaInspection,
  type StoredStructureEvidence,
} from "../../domain/persona-v2/source-schema.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";

export type EvidencePage = StructureEvidenceRecord & { id: string };
export type EvidenceComposition =
  | { status: "inconclusive"; issues: string[] }
  | {
      status: "composed";
      evidence: StoredStructureEvidence;
      scope: SchemaInspection;
      expiresAt: Date;
    };
const inconclusive = (code: string): EvidenceComposition => ({
  status: "inconclusive",
  issues: [code],
});

/** Combines observations, never grants SQL, asserts semantics or manufactures missing metadata. */
export function composeStructureEvidence(
  pages: readonly EvidencePage[],
  crypto: CryptoPort,
): EvidenceComposition {
  if (
    pages.length < 2 ||
    pages.length > 16 ||
    new Set(pages.map((p) => p.id)).size !== pages.length
  ) {
    return inconclusive("INVALID_PAGE_SET");
  }
  if (pages.some((p) => p.evidence.composition)) {
    return inconclusive("NESTED_COMPOSITION");
  }
  if (
    pages.some(
      (p) =>
        !schemaInspectionSchema.safeParse(p.scope).success ||
        !sourceSchemaResultSchema.safeParse(p.evidence).success ||
        crypto.sha256Hex(canonicalJson(p.evidence)) !== p.hash,
    )
  ) {
    return inconclusive("INVALID_PAGE_PROOF");
  }
  const ordered = [...pages].sort((a, b) => a.scope.offset - b.scope.offset);
  const first = ordered[0]!;
  const identity = (p: EvidencePage) => {
    const { verifiedAt: _time, ...stable } = p.evidence.identity;
    return canonicalJson(stable);
  };
  if (
    ordered.some(
      (p) =>
        p.sourceId !== first.sourceId ||
        p.sourceVersion !== first.sourceVersion ||
        p.credentialVersion !== first.credentialVersion ||
        p.identityHash !== first.identityHash ||
        identity(p) !== identity(first),
    )
  ) {
    return inconclusive("PAGE_IDENTITY_OR_VERSION_CONFLICT");
  }
  const resources = first.scope.resources;
  if (ordered.some((p) => canonicalJson(p.scope.resources) !== canonicalJson(resources))) {
    return inconclusive("PAGE_SCOPE_CONFLICT");
  }
  let next = 0;
  for (const page of ordered) {
    if (page.scope.offset !== next) {
      return inconclusive(page.scope.offset < next ? "PAGES_OVERLAP" : "PAGES_GAP");
    }
    const observed = page.evidence;
    const slice = resources.slice(next, next + page.scope.pageSize);
    next += slice.length;
    if (
      canonicalJson(observed.resources.map((r) => r.resource)) !== canonicalJson(slice) ||
      observed.metadataPage.offset !== page.scope.offset ||
      observed.metadataPage.pageSize !== page.scope.pageSize ||
      observed.metadataPage.nextOffset !== (next < resources.length ? next : null)
    ) {
      return inconclusive("PAGE_CONTENT_CONFLICT");
    }
  }
  if (next !== resources.length) {
    return inconclusive("PAGES_GAP");
  }
  const latest = ordered.reduce((a, b) =>
    Date.parse(a.evidence.observedAt) >= Date.parse(b.evidence.observedAt) ? a : b,
  );
  const evidence = storedStructureEvidenceSchema.parse({
    ...latest.evidence,
    resources: ordered.flatMap((p) => p.evidence.resources),
    metadataPage: { offset: 0, pageSize: resources.length, nextOffset: null },
    composition: {
      version: 1,
      scopeHash: crypto.sha256Hex(canonicalJson(resources)),
      pages: ordered.map((p) => ({
        id: p.id,
        hash: p.hash,
        offset: p.scope.offset,
        pageSize: p.scope.pageSize,
        observedAt: p.evidence.observedAt,
      })),
    },
  });
  return {
    status: "composed",
    evidence,
    scope: { resources, offset: 0, pageSize: 4 },
    expiresAt: new Date(Math.min(...pages.map((p) => p.expiresAt.getTime()))),
  };
}
