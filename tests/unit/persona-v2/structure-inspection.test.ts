import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  sourceSchemaResultSchema,
  schemaInspectionSchema,
  expectedStructureSchema,
} from "../../../src/domain/persona-v2/source-schema.js";
import { compareStructureEvidence } from "../../../src/application/persona-v2/structure-compatibility.js";
import {
  adoptQueryKnowledge,
  sharedQueryKnowledgeCurrent,
} from "../../../src/application/persona-v2/shared-query-adoption.js";
import { canonicalJson } from "../../../src/domain/persona-v2/catalog.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { trainingSource, queryTraining } from "../../helpers/persona-v2-training.js";
import { structureContent } from "../../helpers/persona-v2-structure.js";
import type {
  PersonaServices,
  PersonaTransaction,
} from "../../../src/domain/ports/persona-v2.port.js";
const crypto = new NodeCryptoAdapter("a".repeat(64));
function fixture() {
  const source = { ...trainingSource, identityHash: "b".repeat(64) };
  const content = structureContent();
  const table = content.tables[0]!;
  const pattern = {
    ...content,
    examples: [],
    tables: [
      {
        ...table,
        physicalNames: [{ dialect: "postgres" as const, name: "public.orders" }],
        columns: table.columns.map((c) => ({
          ...c,
          nativeTypes: [
            { dialect: "postgres" as const, type: c.name === "id" ? "int4" : "numeric" },
          ],
        })),
      },
    ],
  };
  const training = {
    ...queryTraining(),
    tables: [
      {
        name: "public.orders",
        meaning: table.meaning,
        grain: ["id"],
        resourceType: "table" as const,
      },
    ],
    columns: table.columns.map((c) => ({
      table: "public.orders",
      name: c.name,
      meaning: c.meaning,
      classification: c.classification,
    })),
    relationships: [],
    rules: [...content.rules],
    sharedKnowledge: {
      catalogId: randomUUID(),
      publicationId: randomUUID(),
      evidenceId: randomUUID(),
    },
  };
  const evidence = sourceSchemaResultSchema.parse({
    contractVersion: 1,
    identity: {
      contractVersion: 1,
      database: source.database,
      dialect: "postgres",
      identityHash: source.identityHash,
      identityKind: "native",
      engineVersion: "fixture",
      verifiedAt: new Date().toISOString(),
    },
    observedAt: new Date().toISOString(),
    resources: [
      {
        resource: { schema: "public", name: "orders", type: "table" },
        status: "available",
        columns: [
          { name: "id", nativeType: "int4", ordinal: 1, nullable: false, size: 10, scale: 0 },
          {
            name: "amount",
            nativeType: "numeric",
            ordinal: 2,
            nullable: false,
            size: 18,
            scale: 2,
          },
        ],
        primaryKeys: [],
        foreignKeys: [],
        coverage: { columns: true, primaryKeys: true, foreignKeys: true, constraintStatus: false },
        limitations: ["constraint_status_unverified"],
      },
    ],
    metadataPage: { offset: 0, pageSize: 1, nextOffset: null },
  });
  const publication = {
    content: pattern,
    hash: crypto.sha256Hex(canonicalJson(pattern)),
    suspendedAt: null,
  };
  const stored = {
    sourceId: source.id,
    sourceVersion: source.authorizationVersion,
    credentialVersion: source.credentialVersion,
    identityHash: source.identityHash,
    evidence,
    hash: crypto.sha256Hex(canonicalJson(evidence)),
    expiresAt: new Date(Date.now() + 900000),
  };
  const tx = {
    knowledge: {
      catalog: vi.fn(async () => ({ role: "reader" })),
      publication: vi.fn(async () => publication),
    },
    structureEvidence: vi.fn(async () => stored),
  } as unknown as PersonaTransaction;
  const services: Pick<PersonaServices, "crypto" | "now"> = { crypto, now: () => new Date() };
  return { source, training, pattern, evidence, publication, stored, tx, services };
}
it("recusa SQL arbitrário, escopo repetido e mais de quatro recursos por página", () => {
  const resource = { schema: "public", name: "orders", type: "table" };
  expect(
    schemaInspectionSchema.safeParse({ resources: [resource], sql: "SELECT * FROM orders" })
      .success,
  ).toBe(false);
  expect(schemaInspectionSchema.safeParse({ resources: [resource, resource] }).success).toBe(false);
  expect(schemaInspectionSchema.safeParse({ resources: [resource], pageSize: 5 }).success).toBe(
    false,
  );
});
it("compara somente fatos técnicos; não concede execução nem aprovação semântica", () => {
  const f = fixture();
  expect(compareStructureEvidence(f.pattern, f.evidence)).toMatchObject({
    status: "compatible",
    executionReady: false,
    semanticApproval: false,
    automaticAdoption: false,
  });
});
it("não transforma falta de cobertura ou nulabilidade em compatibilidade", () => {
  const f = fixture();
  f.evidence.resources[0]!.columns[0]!.nullable = null;
  expect(compareStructureEvidence(f.pattern, f.evidence).status).toBe("inconclusive");
  f.evidence.resources[0]!.coverage.columns = false;
  expect(compareStructureEvidence(f.pattern, f.evidence).issues[0]!.code).toBe(
    "RESOURCE_NOT_PROVEN",
  );
});
it("tipo divergente, coluna ausente e schema homônimo são distintos", () => {
  const f = fixture();
  f.evidence.resources[0]!.columns[0]!.nativeType = "text";
  expect(compareStructureEvidence(f.pattern, f.evidence).status).toBe("incompatible");
  f.evidence.resources[0]!.columns = [];
  expect(compareStructureEvidence(f.pattern, f.evidence).issues[0]!.code).toBe("COLUMN_MISSING");
  f.evidence.resources[0]!.resource.schema = "other";
  expect(compareStructureEvidence(f.pattern, f.evidence).status).toBe("inconclusive");
});
it("chave declarada não herda status enabled de um catálogo ODBC", () => {
  const f = fixture();
  const pattern = {
    ...f.pattern,
    tables: [
      {
        ...f.pattern.tables[0]!,
        keys: [{ id: "pk", kind: "primary" as const, columns: ["id"], status: "enabled" as const }],
      },
    ],
  };
  expect(compareStructureEvidence(pattern, f.evidence)).toMatchObject({
    status: "inconclusive",
    issues: [{ code: "CONSTRAINT_STATUS_NOT_PROVEN" }],
  });
});
it("chave composta deve corresponder à prova atual, habilitada e validada", () => {
  const f = fixture();
  const resource = f.evidence.resources[0]!;
  resource.coverage.constraintStatus = true;
  resource.primaryKeys = [{ name: "pk_fixture", columns: ["id", "amount"], status: "enabled" }];
  const pattern = {
    ...f.pattern,
    tables: [
      {
        ...f.pattern.tables[0]!,
        keys: [
          {
            id: "logical-key",
            kind: "primary" as const,
            columns: ["id", "amount"],
            status: "enabled" as const,
          },
        ],
      },
    ],
  };
  expect(compareStructureEvidence(pattern, f.evidence).status).toBe("compatible");
  for (const status of ["disabled", "unvalidated"] as const) {
    resource.primaryKeys[0]!.status = status;
    expect(compareStructureEvidence(pattern, f.evidence).status).toBe("incompatible");
  }
  resource.primaryKeys[0]!.status = "unknown";
  expect(compareStructureEvidence(pattern, f.evidence).status).toBe("inconclusive");
  resource.primaryKeys[0]!.status = "enabled";
  resource.primaryKeys[0]!.columns.reverse();
  expect(compareStructureEvidence(pattern, f.evidence).status).toBe("incompatible");
});
it("adoção fixa versão, hash, inspeção e somente colunas usadas", async () => {
  const f = fixture();
  const adopted = await adoptQueryKnowledge(f.tx, "owner", f.source, f.training, f.services);
  expect(adopted).toMatchObject({
    ...f.training.sharedKnowledge,
    publicationHash: f.publication.hash,
    evidenceHash: f.stored.hash,
  });
  expect(expectedStructureSchema.safeParse(adopted!.expectedStructure).success).toBe(true);
  expect(adopted!.expectedStructure.resources[0]!.columns[0]).not.toHaveProperty("ordinal");
});
it("adoção pessoal preserva classificação compartilhada e exige usos locais explícitos", async () => {
  const f = fixture();
  f.publication.content = {
    ...f.pattern,
    tables: f.pattern.tables.map((table) => ({
      ...table,
      columns: table.columns.map((column) =>
        column.name === "amount" ? { ...column, classification: "pessoal" as const } : column,
      ),
    })),
  };
  f.publication.hash = crypto.sha256Hex(canonicalJson(f.publication.content));
  const training = {
    ...f.training,
    columns: f.training.columns.map((column) =>
      column.name === "amount"
        ? {
            ...column,
            classification: "pessoal" as const,
            uses: ["projecao" as const],
            usePurpose: "Valores sintéticos autorizados",
          }
        : column,
    ),
  };
  const adopted = await adoptQueryKnowledge(f.tx, "owner", f.source, training, f.services);
  expect(
    adopted?.content.tables[0]?.columns.find((column) => column.name === "amount")?.classification,
  ).toBe("pessoal");
  await expect(
    adoptQueryKnowledge(
      f.tx,
      "owner",
      f.source,
      { ...training, columns: training.columns.map((column) => ({ ...column, uses: undefined })) },
      f.services,
    ),
  ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
});
it("uma chave de campos não utilizados não habilita nem bloqueia a consulta adotada", async () => {
  const f = fixture();
  const pattern = {
    ...f.pattern,
    tables: [
      {
        ...f.pattern.tables[0]!,
        keys: [
          {
            id: "unused",
            kind: "unique" as const,
            columns: ["amount"],
            status: "enabled" as const,
          },
        ],
      },
    ],
  };
  f.publication.content = pattern;
  f.publication.hash = crypto.sha256Hex(canonicalJson(pattern));
  f.training.columns = f.training.columns.filter((c) => c.name === "id");
  const adopted = await adoptQueryKnowledge(f.tx, "owner", f.source, f.training, f.services);
  expect(adopted!.expectedStructure.resources[0]!.columns.map((c) => c.name)).toEqual(["id"]);
  expect(adopted!.expectedStructure.resources[0]).not.toHaveProperty("constraints");
});
it.each(["expired", "source", "credential", "identity", "hash"])(
  "recusa evidência obsoleta: %s",
  async (mode) => {
    const f = fixture();
    if (mode === "expired") f.stored.expiresAt = new Date(0);
    if (mode === "source") f.stored.sourceVersion++;
    if (mode === "credential") f.stored.credentialVersion++;
    if (mode === "identity") f.stored.identityHash = "c".repeat(64);
    if (mode === "hash") f.stored.hash = "c".repeat(64);
    await expect(
      adoptQueryKnowledge(f.tx, "owner", f.source, f.training, f.services),
    ).rejects.toMatchObject({ code: "STALE_AUTHORIZATION" });
  },
);
it("conflito semântico exige revisão e não é resolvido pela ordem de composição", async () => {
  const f = fixture();
  f.training.columns[0]!.meaning = "Outro significado";
  await expect(
    adoptQueryKnowledge(f.tx, "owner", f.source, f.training, f.services),
  ).rejects.toMatchObject({ code: "INVALID_PLAN" });
});
it("revogação do catálogo bloqueia a referência sem afetar conhecimento privado", async () => {
  const f = fixture();
  const sharedKnowledge = await adoptQueryKnowledge(
    f.tx,
    "owner",
    f.source,
    f.training,
    f.services,
  );
  vi.mocked(f.tx.knowledge!.catalog).mockResolvedValue(null);
  expect(await sharedQueryKnowledgeCurrent(f.tx, "owner", { sharedKnowledge } as never)).toBe(
    false,
  );
  expect(await sharedQueryKnowledgeCurrent(f.tx, "owner", {} as never)).toBe(true);
});
