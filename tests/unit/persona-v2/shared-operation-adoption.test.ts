import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import {
  compileOperationPublication,
  sharedOperationKnowledgeCurrent,
} from "../../../src/application/persona-v2/shared-operation-adoption.js";
import {
  compileOperationCommand,
  compileOperationTraining,
} from "../../../src/application/persona-v2/operation-training.js";
import { canonicalJson } from "../../../src/domain/persona-v2/catalog.js";
import type { PersonaTransaction } from "../../../src/domain/ports/persona-v2.port.js";
import { structureContentSchema } from "../../../src/domain/persona-v2/structure-content-schema.js";
import { operationTraining, operationInput } from "../../helpers/persona-v2-operation.js";
import { trainingSource, sourceProof } from "../../helpers/persona-v2-training.js";
import type { StoredStructureEvidence } from "../../../src/domain/persona-v2/source-schema.js";
import type { PhysicalProfilePublication } from "../../../src/domain/persona-v2/physical-profile.js";
import { publishedProfileHash } from "../../../src/application/persona-v2/physical-profiles.js";
import { relationshipFixture } from "../../helpers/persona-v2-relationships.js";

function fixture() {
  const crypto = new NodeCryptoAdapter("ab".repeat(32));
  const now = () => new Date("2026-10-14T20:00:00Z");
  const source = { ...trainingSource };
  const training = operationTraining(source.id);
  training.tables[0]!.grain = ["id"];
  training.tables[0]!.columns.forEach((c) => {
    c.classification = "livre";
  });
  const native = (name: string) => (name === "amount" ? "numeric" : "int4");
  const content = structureContentSchema.parse({
    system: "Fixture de operação, não Data7",
    label: "v1",
    dialects: ["postgres"],
    tables: training.tables.map((t) => ({
      id: "orders",
      name: t.name,
      meaning: t.meaning,
      grain: t.grain!,
      resourceType: "table",
      physicalNames: [],
      keys: [
        { id: "identity", kind: "primary", columns: ["id"], status: "enabled" },
        { id: "unused", kind: "unique", columns: ["amount"], status: "enabled" },
      ],
      columns: t.columns.map((c) => ({
        name: c.name,
        meaning: c.meaning,
        classification: "livre",
        nullable: false,
        logicalType: c.type,
        nativeTypes: [{ dialect: "postgres", type: native(c.name) }],
      })),
    })),
    relationships: [],
    examples: [],
    rules: [...training.rules],
  });
  const evidence: StoredStructureEvidence = {
    contractVersion: 1,
    identity: sourceProof(source),
    observedAt: now().toISOString(),
    resources: [
      {
        resource: { schema: null, name: "orders", type: "table" },
        status: "available",
        columns: training.tables[0]!.columns.map((c, index) => ({
          name: c.name,
          ordinal: index + 1,
          nativeType: native(c.name),
          nullable: false,
          size: null,
          scale: null,
        })),
        primaryKeys: [{ name: "orders_pkey", columns: ["id"], status: "enabled" }],
        uniqueKeys: [{ name: "unused", columns: ["amount"], status: "enabled" }],
        foreignKeys: [],
        coverage: {
          columns: true,
          primaryKeys: true,
          uniqueKeys: true,
          foreignKeys: true,
          constraintStatus: true,
        },
        limitations: [],
      },
    ],
    metadataPage: { offset: 0, pageSize: 1, nextOffset: null },
  };
  const selection = {
    catalogId: randomUUID(),
    publicationId: randomUUID(),
    evidenceId: randomUUID(),
  };
  training.sharedKnowledge = selection;
  let granted = true,
    suspended = false;
  let profile: PhysicalProfilePublication | null = null;
  const stored = {
    sourceId: source.id,
    sourceVersion: source.authorizationVersion,
    credentialVersion: source.credentialVersion,
    identityHash: source.identityHash,
    evidence,
    hash: "",
    expiresAt: new Date(now().getTime() + 60000),
  };
  const publication = {
    id: selection.publicationId,
    content,
    suspendedAt: null as Date | null,
    hash: "",
  };
  const tx = {
    knowledge: {
      catalog: async () => (granted ? {} : null),
      publication: async () => ({ ...publication, suspendedAt: suspended ? now() : null }),
    },
    structureEvidence: async () => stored,
    profiles: { publication: async () => profile },
  } as unknown as PersonaTransaction;
  const compile = () => {
    publication.hash = crypto.sha256Hex(canonicalJson(content));
    stored.hash = crypto.sha256Hex(canonicalJson(evidence));
    return compileOperationPublication(
      tx,
      "owner",
      source,
      training,
      { crypto, now },
      "Operação compartilhada",
    );
  };
  return {
    crypto,
    now,
    source,
    training,
    content,
    evidence,
    stored,
    publication,
    tx,
    compile,
    revoke: () => {
      granted = false;
    },
    suspend: () => {
      suspended = true;
    },
    setProfile: (value: PhysicalProfilePublication) => {
      profile = value;
    },
  };
}

describe("adoção explícita do conhecimento por operação SQL", () => {
  function withRelationships() {
    const f = fixture();
    const relation = relationshipFixture();
    for (const table of relation.content.tables) {
      table.keys = [{ id: "identity", kind: "primary", columns: table.grain, status: "enabled" }];
      f.training.tables.push({
        name: `public.${table.name}`,
        meaning: table.meaning,
        grain: table.grain,
        identity: table.grain,
        concurrency: [],
        columns: table.columns.map((c) => ({
          name: c.name,
          meaning: c.meaning,
          type: "integer",
          writable: false,
          classification: "livre",
        })),
      });
      const observed = relation.evidence.resources.find((r) => r.resource.name === table.name)!;
      observed.primaryKeys = [
        { name: `${table.name}_pkey`, columns: table.grain, status: "enabled" },
      ];
    }
    f.content.tables.push(...relation.content.tables);
    f.content.relationships = relation.content.relationships;
    f.training.relationships = relation.training.relationships;
    f.evidence.resources.push(...relation.evidence.resources);
    return f;
  }
  it("fixa FKs compostas na filha, caminho N:N e campos de tabelas apenas estruturais", async () => {
    const f = withRelationships();
    const pkg = await f.compile();
    const resources = pkg.sharedKnowledge!.expectedStructure.resources;
    expect(
      resources
        .find((r) => r.resource.name === "rel_link")!
        .constraints!.foreignKeys.map((k) => k.name),
    ).toEqual(["fk_rel_left", "fk_rel_right"]);
    expect(resources.find((r) => r.resource.name === "rel_left")!.constraints!.foreignKeys).toEqual(
      [],
    );
    expect(pkg.sharedKnowledge!.content.relationships.at(-1)!.path).toEqual([
      "left_links",
      "link_right",
    ]);
    expect(pkg.requiredCapabilities).toContain(
      `source:${f.source.id}:column:public.rel_link.right_id:read`,
    );
    expect(pkg.requiredCapabilities).not.toContain(
      `source:${f.source.id}:table:public.rel_link:update`,
    );
    expect(
      compileOperationCommand(pkg, f.source, randomUUID(), operationInput, f.crypto)
        .expectedStructure,
    ).toEqual(pkg.sharedKnowledge!.expectedStructure);
    const changed = {
      ...pkg,
      sharedKnowledge: {
        ...pkg.sharedKnowledge!,
        content: {
          ...pkg.sharedKnowledge!.content,
          relationships: pkg.sharedKnowledge!.content.relationships.slice(0, -1),
        },
      },
    };
    expect(await sharedOperationKnowledgeCurrent(f.tx, "owner", changed)).toBe(false);
  });
  it.each(["unknown", "disabled", "unvalidated"] as const)(
    "recusa FK %s sem substituir prova por declaração",
    async (status) => {
      const f = withRelationships();
      f.evidence.resources.find((r) => r.resource.name === "rel_link")!.foreignKeys[0]!.status =
        status;
      await expect(f.compile()).rejects.toThrow();
    },
  );
  it("exige e fixa unicidade da filha em relação 1:1", async () => {
    const f = withRelationships();
    f.training.relationships = [f.training.relationships![0]!];
    f.content.relationships = [f.content.relationships[0]!];
    f.training.relationships[0]!.cardinality = "1:1";
    f.content.relationships[0]!.cardinality = "1:1";
    await expect(f.compile()).rejects.toThrow("não comprovadas");
    const bridge = f.evidence.resources.find((r) => r.resource.name === "rel_link")!;
    bridge.uniqueKeys = [
      { name: "one_link", columns: ["tenant_id", "left_id"], status: "enabled" },
    ];
    const pkg = await f.compile();
    expect(
      pkg.sharedKnowledge!.expectedStructure.resources.find((r) => r.resource.name === "rel_link")!
        .constraints!.uniqueKeys,
    ).toEqual(bridge.uniqueKeys);
    bridge.foreignKeys = [];
    await expect(f.compile()).rejects.toThrow("não comprovadas");
  });
  it("recusa campo ausente, pares duplicados e caminho incompleto", async () => {
    const f = withRelationships();
    const relation = f.training.relationships![0]!;
    relation.keys.push(relation.keys[0]!);
    await expect(f.compile()).rejects.toThrow("sem duplicação");
    relation.keys.pop();
    relation.keys[0] = { from: "missing", to: "tenant_id" };
    await expect(f.compile()).rejects.toThrow("campos");
    relation.keys[0] = { from: "tenant_id", to: "tenant_id" };
    f.training.relationships!.at(-1)!.path = ["left_links"];
    await expect(f.compile()).rejects.toThrow("Caminho N:N");
  });
  it("fixa versões, hash, colunas e apenas as chaves declaradas da operação no pacote preparado", async () => {
    const f = fixture();
    const pkg = await f.compile();
    expect(pkg.sharedKnowledge!.expectedStructure.resources[0]!.constraints).toEqual({
      primaryKeys: f.evidence.resources[0]!.primaryKeys,
      uniqueKeys: [],
      foreignKeys: [],
    });
    expect(pkg.requiredCapabilities).toContain(`source:${f.source.id}:table:orders:select`);
    expect(pkg.requiredCapabilities.some((c) => c.startsWith("operation-knowledge:"))).toBe(true);
    const command = compileOperationCommand(pkg, f.source, randomUUID(), operationInput, f.crypto);
    expect(command.expectedStructure).toEqual(pkg.sharedKnowledge!.expectedStructure);
    expect(await sharedOperationKnowledgeCurrent(f.tx, "owner", pkg)).toBe(true);
    f.revoke();
    expect(await sharedOperationKnowledgeCurrent(f.tx, "owner", pkg)).toBe(false);
  });
  it("compilar treinamento isolado não permite preparar uma referência compartilhada sem adoção", () => {
    const f = fixture();
    const pkg = compileOperationTraining(f.training, f.source, f.crypto, "Sem adoção");
    expect(() =>
      compileOperationCommand(pkg, f.source, randomUUID(), operationInput, f.crypto),
    ).toThrow("pacote adotado");
  });
  it("não fixa campos ou tabelas declarados sem uso nem constraints sem dependência", async () => {
    const f = fixture();
    f.training.tables[0]!.columns.push({
      name: "unused",
      type: "string",
      writable: false,
      meaning: "Não utilizado",
      classification: "livre",
    });
    f.training.tables.push({
      name: "not_used",
      meaning: "Outra tabela",
      grain: ["id"],
      identity: ["id"],
      concurrency: [],
      columns: [
        { name: "id", type: "integer", writable: false, meaning: "ID", classification: "livre" },
      ],
    });
    const pkg = await f.compile();
    expect(pkg.sharedKnowledge!.expectedStructure.resources).toHaveLength(1);
    expect(pkg.sharedKnowledge!.content.tables[0]!.columns.some((c) => c.name === "unused")).toBe(
      false,
    );
    expect(
      pkg.requiredCapabilities.some((c) => c.includes("not_used") || c.includes("orders.unused")),
    ).toBe(false);
  });
  it("fixa particularidade da mesma identidade e bloqueia suspensão ou outra base", async () => {
    const f = fixture();
    const original = await f.compile();
    const content = structuredClone(f.content);
    content.tables[0]!.meaning = "Particularidade física revisada";
    f.training.tables[0]!.meaning = content.tables[0]!.meaning;
    const profile: PhysicalProfilePublication = {
      id: randomUUID(),
      publicationId: randomUUID(),
      catalogId: original.sharedKnowledge!.catalogId,
      physicalSourceId: f.source.physicalSourceId,
      identityHash: f.source.identityHash!,
      basePublicationId: original.sharedKnowledge!.publicationId,
      baseHash: original.sharedKnowledge!.publicationHash,
      name: "Perfil de fixture",
      revision: 1,
      content,
      overrides: { tables: ["orders"], relationships: [] },
      hash: "",
      suspended: false,
    };
    f.training.sharedKnowledge!.profilePublicationId = profile.publicationId;
    profile.hash = publishedProfileHash(profile, { crypto: f.crypto });
    f.setProfile(profile);
    const adopted = await f.compile();
    expect(adopted.sharedKnowledge!.profileHash).toBe(profile.hash);
    expect(adopted.sharedKnowledge!.content.tables[0]!.meaning).toBe(content.tables[0]!.meaning);
    profile.suspended = true;
    expect(await sharedOperationKnowledgeCurrent(f.tx, "owner", adopted)).toBe(false);
    profile.suspended = false;
    profile.physicalSourceId = randomUUID();
    await expect(f.compile()).rejects.toThrow("incompatível com esta base");
  });
  it("exige grão e classificação explícitos, sem inferir metadados comerciais", async () => {
    const f = fixture();
    delete f.training.tables[0]!.grain;
    await expect(f.compile()).rejects.toThrow("grão explícito");
    f.training.tables[0]!.grain = ["id"];
    delete f.training.tables[0]!.columns[0]!.classification;
    await expect(f.compile()).rejects.toThrow("classificação livre");
  });
  it("recusa enforcement desconhecido, chave não declarada e tipo lógico divergente", async () => {
    const f = fixture();
    f.evidence.resources[0]!.coverage.constraintStatus = false;
    await expect(f.compile()).rejects.toThrow("não comprovadas");
    f.evidence.resources[0]!.coverage.constraintStatus = true;
    f.evidence.resources[0]!.primaryKeys[0]!.status = "unknown";
    await expect(f.compile()).rejects.toThrow("não comprovadas");
    f.evidence.resources[0]!.primaryKeys[0]!.status = "enabled";
    f.content.tables[0]!.keys = [];
    await expect(f.compile()).rejects.toThrow("PK/UNIQUE");
    f.content.tables[0]!.keys = [
      { id: "identity", kind: "primary", columns: ["id"], status: "enabled" },
    ];
    f.content.tables[0]!.columns[0]!.logicalType = "string";
    await expect(f.compile()).rejects.toThrow("Tipo da operação");
  });
  it("recusa prova de outra base/versão, prova expirada, suspensão e referência adulterada", async () => {
    const f = fixture();
    f.stored.sourceVersion++;
    await expect(f.compile()).rejects.toThrow("Inspecione novamente");
    f.stored.sourceVersion--;
    f.stored.expiresAt = f.now();
    await expect(f.compile()).rejects.toThrow("Inspecione novamente");
    f.stored.expiresAt = new Date(f.now().getTime() + 60000);
    const pkg = await f.compile();
    expect(
      await sharedOperationKnowledgeCurrent(f.tx, "owner", {
        ...pkg,
        training: {
          ...pkg.training,
          sharedKnowledge: { ...pkg.training.sharedKnowledge!, evidenceId: randomUUID() },
        },
      }),
    ).toBe(false);
    f.suspend();
    expect(await sharedOperationKnowledgeCurrent(f.tx, "owner", pkg)).toBe(false);
    await expect(f.compile()).rejects.toThrow("indisponível");
  });
});
