import { describe, expect, it } from "vitest";
import {
  applyStructureRelationshipOrigin,
  defaultStructureDialect,
  emptyStructureColumn,
  emptyStructureContent,
  emptyStructureExample,
  emptyStructureRelationship,
  emptyStructureTable,
  optionalStructureNumber,
  optionalStructureText,
  parseStructureContent,
  splitStructureList,
  splitStructureRules,
  structureEditorVisibility,
  structureExampleSqls,
  structureTableColumns,
} from "./structure-editor";

const validDraft = {
  system: "Fixture",
  label: "1",
  dialects: ["postgres"],
  tables: [
    {
      id: "orders",
      name: "orders",
      meaning: "Pedidos",
      resourceType: "table" as const,
      grain: ["id"],
      physicalNames: [{ dialect: "postgres" as const, name: "public.orders" }],
      columns: [
        {
          name: "id",
          meaning: "Chave",
          logicalType: "integer",
          nullable: false,
          classification: "livre" as const,
        },
      ],
    },
  ],
  relationships: [],
  examples: [
    {
      id: "lista",
      purpose: "Listar",
      explanation: "Exemplo",
      state: "inactive" as const,
      variants: [{ dialect: "postgres" as const, sql: "select 1", parameters: [] }],
    },
  ],
  rules: ["Valores em BRL"],
};

describe("rascunho estrutural", () => {
  it("começa vazio sem chaves, exemplos ou origem de banco", () => {
    expect(emptyStructureContent()).toEqual({
      system: "",
      label: "",
      dialects: [],
      tables: [],
      relationships: [],
      examples: [],
      rules: [],
    });
    expect(emptyStructureTable()).toEqual({
      id: "",
      name: "",
      meaning: "",
      resourceType: "table",
      grain: [],
      physicalNames: [],
      columns: [],
    });
    expect(emptyStructureColumn()).toEqual({
      name: "",
      meaning: "",
      logicalType: "",
      nullable: false,
      classification: "inferido",
    });
    expect(emptyStructureRelationship()).toMatchObject({
      join: "inner",
      cardinality: "N:1",
      optional: false,
      origin: "business",
      keys: [{ from: "", to: "" }],
      via: [],
      path: [],
    });
    expect(emptyStructureExample().state).toBe("inactive");
  });
});

describe("validação local do editor de estrutura", () => {
  it("separa listas por vírgula ou linha e preserva regras com espaços", () => {
    expect(splitStructureList("id, nome\nvalor,")).toEqual(["id", "nome", "valor"]);
    expect(splitStructureRules("  regra  \n\n  \noutra")).toEqual(["  regra  ", "outra"]);
  });
  it("omite número e texto vazios sem inventar valor", () => {
    expect(optionalStructureNumber("", Number.NaN)).toBeUndefined();
    expect(optionalStructureNumber("12", 12)).toBe(12);
    expect(optionalStructureText("")).toBeUndefined();
    expect(optionalStructureText("BRL")).toBe("BRL");
  });
  it("interpreta origem da relação e limpa constraint só no modo de negócio", () => {
    const relation = emptyStructureRelationship();
    applyStructureRelationshipOrigin(relation, "database");
    expect(relation.origin).toBe("database");
    expect(relation.constraintStatus).toBe("unknown");
    relation.constraintName = "fk_orders";
    relation.constraintStatus = "enabled";
    applyStructureRelationshipOrigin(relation, "database");
    expect(relation.constraintName).toBe("fk_orders");
    expect(relation.constraintStatus).toBe("enabled");
    applyStructureRelationshipOrigin(relation, "business");
    expect(relation.origin).toBe("business");
    expect(relation.constraintName).toBeUndefined();
    expect(relation.constraintStatus).toBeUndefined();
    applyStructureRelationshipOrigin(relation, "outro");
    expect(relation.origin).toBe("business");
  });
  it("recusa conteúdo fora do contrato sem converter ausência em erro", () => {
    expect(parseStructureContent(undefined)).toEqual({ content: undefined, invalid: false });
    expect(parseStructureContent({ system: "x" })).toEqual({ content: undefined, invalid: true });
    const parsed = parseStructureContent(validDraft);
    expect(parsed.invalid).toBe(false);
    expect(parsed.content?.system).toBe("Fixture");
    expect(parseStructureContent(emptyStructureContent()).invalid).toBe(true);
  });
  it("achata variantes SQL e localiza colunas da tabela escolhida", () => {
    expect(structureExampleSqls(validDraft.examples)).toEqual([
      { id: "lista", dialect: "postgres", sql: "select 1" },
    ]);
    expect(structureTableColumns(validDraft.tables, "orders").map((column) => column.name)).toEqual(
      ["id"],
    );
    expect(structureTableColumns(validDraft.tables, "ausente")).toEqual([]);
    expect(defaultStructureDialect([])).toBe("mssql");
    expect(defaultStructureDialect(["postgres"])).toBe("postgres");
  });
  it("mostra blocos completos só sem recorte de seção", () => {
    expect(structureEditorVisibility(undefined)).toEqual({
      identity: true,
      tables: true,
      relationships: true,
      library: true,
    });
    expect(structureEditorVisibility(["tables"])).toEqual({
      identity: false,
      tables: true,
      relationships: false,
      library: false,
    });
    expect(structureEditorVisibility(["relationships"])).toEqual({
      identity: false,
      tables: false,
      relationships: true,
      library: false,
    });
    expect(structureEditorVisibility([])).toEqual({
      identity: false,
      tables: false,
      relationships: false,
      library: false,
    });
  });
});
