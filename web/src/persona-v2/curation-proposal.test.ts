import { describe, expect, it } from "vitest";
import {
  buildCurationProposalBody,
  curationChangePath,
  curationKindLabels,
  curationOriginLabel,
  curationStateLabels,
  curationStructuralItems,
  emptyCurationExample,
  publishedCurationBases,
} from "./curation-proposal";
import type { Content } from "./knowledge-model";

const table = {
  id: "pedido",
  name: "pedido",
  meaning: "Pedido",
  resourceType: "table" as const,
  grain: ["id"],
  physicalNames: [],
  columns: [
    {
      name: "id",
      meaning: "Identificador",
      logicalType: "string",
      nullable: false,
      classification: "livre" as const,
    },
  ],
};

describe("rótulos da curadoria", () => {
  it("traduz estado, tipo, origem e caminho sem inventar campos", () => {
    expect(curationStateLabels.pending).toBe("Pendente");
    expect(curationKindLabels.tabela).toBe("Tabela e campos");
    expect(curationOriginLabel("mcp")).toBe("Envio explícito pelo consumidor MCP");
    expect(curationOriginLabel("console")).toBe("Console autenticado");
    expect(curationChangePath("tables/columns/meaning")).toBe("Tabelas → Campos → Significado");
    expect(curationChangePath("desconhecido")).toBe("desconhecido");
  });
});

describe("montagem da proposta", () => {
  it("filtra bases publicadas e escolhe tabelas ou relacionamentos", () => {
    expect(
      publishedCurationBases([
        { id: "a", activePublicationId: "pub" },
        { id: "b", activePublicationId: null },
      ]),
    ).toEqual([{ id: "a", activePublicationId: "pub" }]);
    const content = {
      tables: [table],
      relationships: [{ id: "rel", meaning: "liga" }],
    } as unknown as Content;
    expect(curationStructuralItems("tabela", content)).toEqual([table]);
    expect(curationStructuralItems("relacionamento", content)).toHaveLength(1);
    expect(curationStructuralItems("tabela", undefined)).toEqual([]);
  });
  it("envia regra ou exemplo candidato com a publicação-base", () => {
    expect(
      buildCurationProposalBody({
        summary: "Regra de corte",
        kind: "regra",
        rule: "Não misturar bases",
        example: emptyCurationExample(),
        structuralItems: [],
        targetId: "",
        baseId: "11111111-1111-4111-8111-111111111111",
        physical: false,
        overrideCommon: false,
      }),
    ).toEqual({
      summary: "Regra de corte",
      change: { kind: "regra", value: "Não misturar bases" },
      basePublicationId: "11111111-1111-4111-8111-111111111111",
    });
    const example = emptyCurationExample();
    example.id = "corte";
    example.purpose = "Cortar";
    example.explanation = "Exemplo sintético";
    example.variants = [{ dialect: "postgres", sql: "SELECT 1", parameters: [] }];
    const body = buildCurationProposalBody({
      summary: "Exemplo SQL",
      kind: "exemplo_sql",
      rule: "",
      example,
      structuralItems: [],
      targetId: "",
      baseId: "11111111-1111-4111-8111-111111111111",
      physical: true,
      overrideCommon: true,
    });
    expect(body).toMatchObject({
      profilePublicationId: "11111111-1111-4111-8111-111111111111",
      overrideCommon: true,
      change: { kind: "exemplo_sql", value: { id: "corte", state: "candidate" } },
    });
  });
  it("recusa item estrutural ausente sem inventar definição", () => {
    expect(() =>
      buildCurationProposalBody({
        summary: "Tabela",
        kind: "tabela",
        rule: "",
        example: emptyCurationExample(),
        structuralItems: [],
        targetId: "ausente",
        baseId: "11111111-1111-4111-8111-111111111111",
        physical: false,
        overrideCommon: false,
      }),
    ).toThrow();
  });
});
