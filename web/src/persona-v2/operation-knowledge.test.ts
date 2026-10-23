import { describe, it, expect } from "vitest";
import { adoptOperationKnowledge } from "./operation-knowledge";
import type { KnowledgeSelection, Inspection } from "./knowledge-model";
import { operationTraining } from "../../../tests/helpers/persona-v2-operation";
import { structureContent } from "../../../tests/helpers/persona-v2-structure";
import { structureContentSchema } from "../../../src/domain/persona-v2/structure-content-schema";
function fixture() {
  const training = operationTraining();
  const content = structureContentSchema.parse(structureContent());
  content.tables[0].columns.push({
    name: "version",
    meaning: "Versão confirmada",
    logicalType: "integer",
    nullable: false,
    classification: "livre",
  });
  const selection: KnowledgeSelection = {
    catalogId: "catalog",
    standard: {
      id: "publication",
      patternId: "pattern",
      revision: 2,
      hash: "hash",
      suspendedAt: null,
      content,
    },
  };
  const inspection = {
    id: "proof",
    sourceId: training.sourceId,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  } as Inspection;
  return {
    training,
    selection,
    inspection,
    tables: ["orders"],
    fields: ["orders.id", "orders.version", "orders.amount"],
  };
}
const apply = (f: ReturnType<typeof fixture>) =>
  adoptOperationKnowledge(f.training, f.selection, f.inspection, f.tables, f.fields);
describe("adoção estrutural de operações", () => {
  it("preserva comandos, escrita, identidade, concorrência, parâmetros e limites; não altera origem", () => {
    const f = fixture(),
      original = JSON.stringify(f.training),
      result = apply(f);
    for (const key of [
      "steps",
      "parameters",
      "mode",
      "approval",
      "maxAffectedRows",
      "timeoutMs",
      "sourceId",
      "dialect",
      "reconciliation",
      "indirectEffects",
    ] as const)
      expect(result[key]).toEqual(f.training[key]);
    expect(result.tables[0].identity).toEqual(f.training.tables[0].identity);
    expect(result.tables[0].concurrency).toEqual(f.training.tables[0].concurrency);
    expect(result.tables[0].columns.map((c) => [c.name, c.type, c.writable])).toEqual(
      f.training.tables[0].columns.map((c) => [c.name, c.type, c.writable]),
    );
    expect(result.sharedKnowledge).toEqual({
      catalogId: "catalog",
      publicationId: "publication",
      evidenceId: "proof",
    });
    expect(result.tables[0].grain).toEqual(["id"]);
    expect(JSON.stringify(f.training)).toBe(original);
  });
  it("recusa outra fonte, expiração, prova inválida e publicação suspensa", () => {
    for (const change of ["source", "expired", "invalid", "suspended"]) {
      const f = fixture();
      if (change === "source") f.inspection.sourceId = "other";
      if (change === "expired") f.inspection.expiresAt = "2000-01-01T00:00:00.000Z";
      if (change === "invalid") f.inspection.expiresAt = "invalid";
      if (change === "suspended") f.selection.standard.suspendedAt = new Date().toISOString();
      expect(() => apply(f)).toThrow();
    }
  });
  it("não remove campos nem infere tipos, escrita ou novas tabelas", () => {
    const f = fixture();
    f.fields = ["orders.id"];
    expect(() => apply(f)).toThrow(/campos/);
    f.fields = ["orders.id", "orders.amount", "orders.version"];
    f.selection.standard.content.tables[0].columns[1].logicalType = "string";
    expect(() => apply(f)).toThrow(/não converte/);
    f.tables = [];
    expect(() => apply(f)).toThrow(/tabelas/);
  });
  it("não reclassifica dados pessoais para livres implicitamente", () => {
    const f = fixture();
    f.training.tables[0].columns[0].classification = "pessoal";
    expect(() => apply(f)).toThrow(/classificação livre/);
    delete f.training.tables[0].columns[0].classification;
    f.selection.standard.content.tables[0].columns[0].classification = "segredo";
    expect(() => apply(f)).toThrow(/classificação livre/);
  });
  it("fixa perfil e padrão exatos e rejeita perfil de outra versão", () => {
    const f = fixture();
    f.selection.profile = {
      id: "profile",
      publicationId: "profile-pub",
      catalogId: "catalog",
      physicalSourceId: "physical",
      identityHash: "identity",
      basePublicationId: "publication",
      baseHash: "hash",
      name: "Local",
      revision: 3,
      content: structuredClone(f.selection.standard.content),
      overrides: { tables: [], relationships: [] },
      hash: "profile-hash",
      suspended: false,
    };
    f.selection.profile.content.tables[0].meaning = "Significado local revisado";
    expect(apply(f).tables[0].meaning).toBe("Significado local revisado");
    expect(apply(f).sharedKnowledge?.profilePublicationId).toBe("profile-pub");
    f.selection.profile.basePublicationId = "another";
    expect(() => apply(f)).toThrow(/versão exata/);
  });
  it("preserva pares compostos e caminho N:N e recusa intermediárias ou elos ausentes", () => {
    const f = fixture();
    const base = f.selection.standard.content.tables[0];
    f.selection.standard.content.tables = ["a", "ab", "b"].map((id) => ({
      ...structuredClone(base),
      id,
      name: id,
      physicalNames: [{ dialect: "postgres", name: `public.${id}` }],
      columns: base.columns.slice(0, 2),
    }));
    f.training.tables = f.selection.standard.content.tables.map((t) => ({
      name: `public.${t.id}`,
      meaning: t.meaning,
      identity: ["id"],
      concurrency: [],
      columns: [
        { name: "id", type: "integer", meaning: "ID", writable: false },
        { name: "amount", type: "decimal", meaning: "Valor", writable: false },
      ],
    }));
    const edge = (id: string, from: string, to: string, cardinality: "1:N" | "N:1" | "N:N") => ({
      id,
      from,
      to,
      cardinality,
      join: "inner" as const,
      keys: [
        { from: "id", to: "id" },
        { from: "amount", to: "amount" },
      ],
      meaning: "Relação sintética",
      optional: false,
      via: [] as string[],
    });
    f.selection.standard.content.relationships = [
      edge("a_ab", "a", "ab", "1:N"),
      edge("ab_b", "ab", "b", "N:1"),
      { ...edge("a_b", "a", "b", "N:N"), via: ["ab"], path: ["a_ab", "ab_b"] },
    ];
    f.tables = ["a", "ab", "b"];
    f.fields = f.tables.flatMap((id) => [`${id}.id`, `${id}.amount`]);
    expect(apply(f).relationships?.[2]).toMatchObject({
      id: "a_b",
      from: "public.a",
      to: "public.b",
      via: ["public.ab"],
      path: ["a_ab", "ab_b"],
      keys: [
        { from: "id", to: "id" },
        { from: "amount", to: "amount" },
      ],
    });
    f.selection.standard.content.relationships.splice(0, 1);
    expect(() => apply(f)).toThrow(/relações diretas/);
    f.tables = ["a", "b"];
    f.training.tables.splice(1, 1);
    expect(() => apply(f)).toThrow(/intermediárias/);
  });
});
