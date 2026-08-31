import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  hintsFromGrafoColunas,
  normalizeColumnsMetadata,
} from "../../src/application/use-cases/shared/columns-metadata.js";

const columnMetadataItemSchema = z.object({
  name: z.string(),
  type: z.string().nullable().optional(),
  nullable: z.boolean().nullable().optional(),
});

describe("normalizeColumnsMetadata", () => {
  it("aceita item só com name no contrato Zod do outputSchema", () => {
    expect(columnMetadataItemSchema.parse({ name: "SaldoReceber" })).toEqual({
      name: "SaldoReceber",
    });
  });

  it("preenche type e nullable com null quando o hub omite", () => {
    expect(normalizeColumnsMetadata(["SaldoReceber"], [{ name: "SaldoReceber" }])).toEqual([
      { name: "SaldoReceber", type: null, nullable: null },
    ]);
  });

  it("prefere hub e cai no grafo", () => {
    const hints = hintsFromGrafoColunas([
      { nome: "SaldoReceber", tipo: "numeric", nullable: false },
    ]);
    expect(normalizeColumnsMetadata(["SaldoReceber"], [{ name: "SaldoReceber" }], hints)).toEqual([
      { name: "SaldoReceber", type: "numeric", nullable: false },
    ]);
    expect(
      normalizeColumnsMetadata(
        ["SaldoReceber"],
        [{ name: "SaldoReceber", type: "decimal", nullable: true }],
        hints,
      ),
    ).toEqual([{ name: "SaldoReceber", type: "decimal", nullable: true }]);
  });
});
