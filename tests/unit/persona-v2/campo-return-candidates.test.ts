import { expect, it } from "vitest";
import { campoReturnCandidates } from "../../../scripts/homologation/campo-return-candidates.js";
import { campoReturnTables } from "../../../scripts/homologation/campo-return-fixtures.js";
import { queryPublicationCaseSchema } from "../../../src/domain/persona-v2/publication-fixture.js";
it("gera sete casos completos sem inferir resultados do SQL", () => {
  const cases = campoReturnCandidates();
  expect(Object.keys(cases)).toHaveLength(7);
  for (const test of Object.values(cases)) {
    expect(queryPublicationCaseSchema.safeParse(test).success).toBe(true);
    expect(test.input.sql).toBeUndefined();
    expect(test.expected.completeness).toEqual({ mode: "complete" });
    expect(test.input.fixtures.map((t) => t.table)).toEqual(
      campoReturnTables().map((t) => t.table),
    );
    test.input.fixtures.forEach((t, i) => {
      for (const row of t.rows)
        expect(Object.keys(row).sort()).toEqual(
          campoReturnTables()
            [i]!.columns.map((c) => c.name)
            .sort(),
        );
    });
  }
  for (const kind of ["dia", "filial", "produto"]) {
    expect(cases[kind + "_vazio"]!.expected.rows).toEqual([]);
    expect(cases[kind + "_vazio"]!.input.fixtures).toEqual(cases[kind]!.input.fixtures);
    expect(cases[kind + "_vazio"]!.input.params.datainicio).toBe("2031-01-01");
    const sum = cases[kind]!.expected.rows.reduce(
      (n, r) => n + Math.round(Number(r.valordevolvido!.value) * 100),
      0,
    );
    expect(sum).toBe(7100);
  }
  expect(cases.filial_restrita!.input.params.filial).toBe(3);
  expect(cases.filial_restrita!.expected.rows[0]!.valordevolvido!.value).toBe("37.00");
});
it("sementes preservam colisão entre empresas, itens repetidos por produto, nulos e fronteiras", () => {
  const c = campoReturnCandidates().dia!;
  const items = c.input.fixtures[0]!.rows,
    headers = c.input.fixtures[1]!.rows;
  expect(
    items
      .filter(
        (r) =>
          r.codempresa!.value === "1" &&
          r.coddevolucaovenda!.value === "1" &&
          r.codproduto!.value === "10",
      )
      .map((r) => r.itemdevolucaovenda!.value),
  ).toEqual(["01", "02"]);
  expect(
    headers.filter((r) => r.coddevolucaovenda!.value === "1").map((r) => r.codempresa!.value),
  ).toEqual(["1", "2"]);
  expect(headers.map((r) => r.data!.value)).toEqual(
    expect.arrayContaining([
      "2030-01-01T00:00:00.000Z",
      "2030-01-01T23:59:59.997Z",
      "2029-12-31T23:59:59.997Z",
      "2030-01-03T00:00:00.000Z",
    ]),
  );
  expect(headers.some((r) => r.status!.type === "null")).toBe(true);
  expect(headers.some((r) => r.codfilial!.type === "null")).toBe(true);
  expect(items.some((r) => r.codunidademedida!.type === "null")).toBe(true);
  expect(items.some((r) => r.codunidademedida!.value === "XX")).toBe(true);
  expect(
    campoReturnCandidates().produto!.expected.rows.map((r) => [
      r.codproduto!.value,
      r.codunidademedida!.value,
      r.quantidadedevolucoes!.value,
    ]),
  ).toEqual([
    ["10", "KG", "1"],
    ["10", "UN", "2"],
    ["20", "KG", "2"],
  ]);
});
