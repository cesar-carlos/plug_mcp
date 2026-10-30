import { expect, it } from "vitest";
import { compileQueryTraining } from "../../../src/application/persona-v2/query-training.js";
import { publicationKnowledgeDocuments } from "../../../src/application/persona-v2/knowledge-documents.js";
import {
  queryKnowledgeGraph,
  knowledgeEdgesWithExposedPaths,
} from "../../../src/application/persona-v2/knowledge-graph.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { canonicalJson, type CatalogPublication } from "../../../src/domain/persona-v2/catalog.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";
import { structureContent } from "../../helpers/persona-v2-structure.js";
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge.js";
import { operationKnowledgeGraph } from "../../../src/application/persona-v2/knowledge-graph.js";
import { operationTraining } from "../../helpers/persona-v2-operation.js";
import { compileOperationTraining } from "../../../src/application/persona-v2/operation-training.js";
const crypto = new NodeCryptoAdapter("a".repeat(64));
const fixture = (): CatalogPublication => {
  const training = {
    ...queryTraining(),
    examples: [
      {
        id: "approved",
        purpose: "Faturamento revisado",
        explanation: "Somente valor confirmado",
        sql: queryTraining().sqlModel,
        state: "approved",
      },
      {
        id: "inactive",
        purpose: "Inativo não buscar",
        explanation: "Não retornar",
        sql: queryTraining().sqlModel,
        state: "inactive",
      },
      {
        id: "candidate",
        purpose: "Candidato não buscar",
        explanation: "Não retornar",
        sql: queryTraining().sqlModel,
        state: "candidate",
      },
    ],
    columns: [
      ...queryTraining().columns,
      { table: "orders", name: "secret", meaning: "Conceito sigiloso", classification: "segredo" },
    ],
  };
  const pkg = compileQueryTraining(training, trainingSource, crypto);
  return {
    id: "66666666-6666-4666-8666-666666666666",
    personaId: trainingSource.personaId,
    skillId: "77777777-7777-4777-8777-777777777777",
    revision: 1,
    package: pkg,
    hash: crypto.sha256Hex(canonicalJson(pkg)),
    sourceVersion: 1,
    sourceFingerprint: pkg.sourceFingerprint,
    suspendedAt: null,
  };
};
it("índice inclui significado, regras e exemplos aprovados, sem SQL, valores ou campos recusados", () => {
  const publication = fixture(),
    documents = publicationKnowledgeDocuments(publication);
  expect(documents.some((d) => d.text.includes("faturamento revisado"))).toBe(true);
  expect(documents.some((d) => d.kind === "rule" && d.text.includes("brl"))).toBe(true);
  expect(documents.some((d) => d.kind === "column" && d.text.includes("valor em reais"))).toBe(
    true,
  );
  expect(JSON.stringify(documents)).not.toMatch(/SELECT|sigiloso|secret|Inativo|Candidato/);
  expect(
    documents.every(
      (d) => d.origin.publicationId === publication.id && d.origin.hash === publication.hash,
    ),
  ).toBe(true);
});
it("recupera termos comerciais revisados na publicação sem indexar SQL ou inventar sinônimos", () => {
  const publication = fixture();
  const pkg = compileQueryTraining(
    {
      ...queryTraining(),
      semantics: {
        version: 1,
        synonyms: ["Receita operacional", "Vendas líquidas"],
        metrics: [],
      },
    },
    trainingSource,
    crypto,
  );
  const documents = publicationKnowledgeDocuments({ ...publication, package: pkg });
  expect(documents.some((d) => d.text.includes("receita operacional"))).toBe(true);
  expect(documents.some((d) => d.text.includes("vendas liquidas"))).toBe(true);
  expect(documents.some((d) => d.text.includes("lucro"))).toBe(false);
  expect(JSON.stringify(documents)).not.toContain("SELECT");
});
it("schema e fonte qualificam todos os nós; campo não livre não aparece", () => {
  const publication = fixture();
  const graph = queryKnowledgeGraph(publication);
  expect(graph.nodes).toHaveLength(3);
  expect(
    graph.nodes.every(
      (n) => n.sourceId === trainingSource.id && n.schema === null && n.table === "orders",
    ),
  ).toBe(true);
  expect(JSON.stringify(graph)).not.toContain("secret");
});
it("grão não expõe identificadores de campos fora do recorte", () => {
  const publication = fixture();
  const training = queryTraining();
  const restricted = {
    ...publication,
    package: {
      ...publication.package,
      training: { ...training, tables: training.tables.map((t) => ({ ...t, grain: ["secret"] })) },
    },
  };
  expect(
    queryKnowledgeGraph(restricted).nodes.find((n) => n.kind === "table")?.grain,
  ).toBeUndefined();
  expect(JSON.stringify(publicationKnowledgeDocuments(restricted))).not.toContain("secret");
});
it("chaves compostas preservam ordem e opcionalidade não declarada permanece desconhecida", () => {
  const publication = fixture(),
    training = queryTraining();
  const tables = ["dbo.orders", "dbo.items"].map((name) => ({
    name,
    meaning: name,
    grain: ["tenant", "id"],
  }));
  const columns = tables.flatMap((t) =>
    ["tenant", "id"].map((name) => ({
      table: t.name,
      name,
      meaning: name,
      classification: "livre" as const,
    })),
  );
  const keys = [
    { from: "tenant", to: "tenant" },
    { from: "id", to: "id" },
  ];
  const next = {
    ...publication,
    package: {
      ...publication.package,
      scope: {
        ...publication.package.scope,
        colunasPorTabela: Object.fromEntries(tables.map((t) => [t.name, ["tenant", "id"]])),
      },
      training: {
        ...training,
        tables,
        columns,
        relationships: [
          {
            from: "dbo.items",
            to: "dbo.orders",
            keys,
            meaning: "Itens do pedido",
            join: "left",
            cardinality: "N:1",
          },
        ],
      },
    },
  };
  const graph = queryKnowledgeGraph(next);
  expect(graph.edges[0]).toMatchObject({ keys, optional: null, cardinality: "N:1", join: "left" });
  expect(graph.nodes.every((n) => n.schema === "dbo")).toBe(true);
});
it("proveniência distingue definição do padrão de campo alterado pelo perfil", () => {
  const publication = fixture(),
    base = structureContent();
  const content: StructureContent = {
    ...base,
    tables: base.tables.map((t) => ({
      ...t,
      columns: t.columns.map((c) =>
        c.name === "amount" ? { ...c, meaning: "Receita particular" } : c,
      ),
    })),
  };
  const training = {
    ...queryTraining(),
    tables: content.tables.map((t) => ({ name: t.name, meaning: t.meaning, grain: t.grain })),
    columns: content.tables.flatMap((t) =>
      t.columns.map((c) => ({
        table: t.name,
        name: c.name,
        meaning: c.meaning,
        classification: c.classification,
      })),
    ),
  };
  const adopted = {
    ...publication,
    package: {
      ...publication.package,
      training,
      sharedKnowledge: {
        catalogId: "88888888-8888-4888-8888-888888888888",
        publicationId: "99999999-9999-4999-8999-999999999999",
        publicationHash: "b".repeat(64),
        profilePublicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        profileHash: "c".repeat(64),
        evidenceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        evidenceHash: "d".repeat(64),
        content,
        expectedStructure: { version: 1 as const, resources: [] },
      },
    },
  };
  const documents = publicationKnowledgeDocuments(adopted, base);
  expect(documents.find((d) => d.column === "id")?.origin.kind).toBe("padrao");
  expect(documents.find((d) => d.column === "amount")?.origin.kind).toBe("perfil");
  expect(
    queryKnowledgeGraph(adopted, base).nodes.find((n) => n.column === "amount")?.origin
      .publicationId,
  ).toBe(adopted.package.sharedKnowledge.profilePublicationId);
});
it("N:N conserva intermediária e caminho completo; caminho fora do snapshot é omitido", () => {
  const publication = fixture(),
    template = structureContent().tables[0]!;
  const content: StructureContent = {
    ...structureContent(),
    examples: [],
    tables: ["a", "ab", "b"].map((id) => ({
      ...template,
      id,
      name: id,
      columns: [template.columns[0]!],
    })),
    relationships: [
      {
        id: "a_join",
        from: "a",
        to: "ab",
        keys: [{ from: "id", to: "id" }],
        join: "left",
        cardinality: "1:N",
        optional: true,
        meaning: "Associação A",
        via: [],
      },
      {
        id: "join_b",
        from: "ab",
        to: "b",
        keys: [{ from: "id", to: "id" }],
        join: "left",
        cardinality: "N:1",
        optional: false,
        meaning: "Associação B",
        via: [],
      },
      {
        id: "a_b",
        from: "a",
        to: "b",
        keys: [{ from: "id", to: "id" }],
        join: "left",
        cardinality: "N:N",
        optional: true,
        meaning: "Associação N:N",
        via: ["ab"],
        path: ["a_join", "join_b"],
      },
    ],
  };
  const training = {
    ...queryTraining(),
    tables: content.tables.map((t) => ({ name: t.name, grain: ["id"], meaning: t.meaning })),
    columns: content.tables.map((t) => ({
      table: t.name,
      name: "id",
      meaning: "Identificador",
      classification: "livre",
    })),
    relationships: content.relationships.map((r) => ({
      id: r.id,
      via: r.via,
      path: r.path,
      from: r.from,
      to: r.to,
      keys: r.keys,
      join: r.join,
      cardinality: r.cardinality,
      meaning: r.meaning,
    })),
  };
  const adopted = {
    ...publication,
    package: {
      ...publication.package,
      scope: {
        ...publication.package.scope,
        colunasPorTabela: { a: ["id"], ab: ["id"], b: ["id"] },
      },
      training,
      sharedKnowledge: {
        catalogId: "88888888-8888-4888-8888-888888888888",
        publicationId: "99999999-9999-4999-8999-999999999999",
        publicationHash: "b".repeat(64),
        evidenceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        evidenceHash: "d".repeat(64),
        content,
        expectedStructure: { version: 1 as const, resources: [] },
      },
    },
  };
  const graph = queryKnowledgeGraph(adopted, content);
  expect(graph.edges).toHaveLength(3);
  expect(graph.edges.find((e) => e.cardinality === "N:N")).toMatchObject({
    via: [`table:${trainingSource.id}:ab`],
    path: [`relationship:${publication.id}:a_join`, `relationship:${publication.id}:join_b`],
    optional: true,
  });
  const privateGraph = queryKnowledgeGraph({
    ...adopted,
    package: { ...adopted.package, sharedKnowledge: undefined },
  });
  expect(privateGraph.edges.find((e) => e.cardinality === "N:N")).toMatchObject({
    via: [`table:${trainingSource.id}:ab`],
    path: [`relationship:${publication.id}:a_join`, `relationship:${publication.id}:join_b`],
  });
  const incomplete = {
    ...adopted,
    package: {
      ...adopted.package,
      training: { ...training, relationships: training.relationships.slice(1) },
    },
  };
  expect(queryKnowledgeGraph(incomplete, content).edges.some((e) => e.cardinality === "N:N")).toBe(
    false,
  );
  expect(queryKnowledgeGraph(incomplete, content).omittedRelationships).toBe(1);
  const withoutFirstPath = graph.edges.filter((e) => !e.id.endsWith(":a_join"));
  expect(
    knowledgeEdgesWithExposedPaths(withoutFirstPath).some((e) => e.cardinality === "N:N"),
  ).toBe(false);
});
it("operação mostra somente as tabelas/colunas do contrato, sem inferir relacionamento", () => {
  const training = operationTraining();
  training.tables[0]!.columns.push({
    name: "unused",
    type: "string",
    writable: false,
    meaning: "Conceito fora do contrato",
  });
  const publication = fixture(),
    pkg = compileOperationTraining(training, trainingSource, crypto, "Operação sintética");
  const graph = operationKnowledgeGraph({ ...publication, package: pkg });
  expect(graph.nodes.filter((n) => n.kind === "column")).toHaveLength(
    pkg.training.tables[0]!.columns.length - 1,
  );
  expect(JSON.stringify(graph)).not.toMatch(/unused|fora do contrato/);
  expect(
    JSON.stringify(publicationKnowledgeDocuments({ ...publication, package: pkg })),
  ).not.toMatch(/unused|fora do contrato/);
  expect(graph.edges).toEqual([]);
  expect(
    graph.nodes.every(
      (n) => n.origin.kind === "privado" && n.origin.publicationId === publication.id,
    ),
  ).toBe(true);
});
