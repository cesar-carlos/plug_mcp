import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import pg from "pg";
import { z } from "zod";
import { parseEscopoSkill } from "../../src/domain/entities/escopo.js";
import { validarSqlNoEscopo } from "../../src/application/use-cases/shared/validar-escopo.js";
import { exigirFiltroEscopoPadrao } from "../../src/application/use-cases/shared/escopo-filtro.js";
import { assertFanoutSeguro } from "../../src/application/use-cases/shared/assert-fanout.js";

const fixtureSchema = z.object({
  version: z.literal(1),
  synthetic: z.literal(true),
  dialect: z.literal("postgres"),
  cases: z.array(
    z.object({
      id: z.string(),
      group: z.string(),
      question: z.string(),
      package: z.unknown(),
      data: z.array(
        z.object({
          id: z.number(),
          empresa: z.string(),
          data: z.string(),
          categoria: z.string(),
          valor: z.number().nullable(),
          quantidade: z.number(),
        }),
      ),
      params: z.record(z.string(), z.union([z.string(), z.number()])),
      sql: z.string(),
      expectedDecision: z.string(),
      expectedRows: z.array(z.record(z.string(), z.number())).nullable(),
    }),
  ),
});
const fixture = fixtureSchema.parse(
  JSON.parse(
    readFileSync(new URL("../fixtures/evaluation/scenarios.v1.json", import.meta.url), "utf8"),
  ),
);
export const decision = (scenario: (typeof fixture.cases)[number]) => {
  const scope = parseEscopoSkill(scenario.package);
  const ast = validarSqlNoEscopo(scenario.sql, "postgres", scope);
  assertFanoutSeguro(ast, scope);
  exigirFiltroEscopoPadrao({
    sql: scenario.sql,
    dialeto: "postgres",
    escopoPadrao: {
      empresa: "A",
      bindings: [{ tabela: "fato", coluna: "empresa", param: "empresa" }],
    },
    colunasDasTabelas: scope.colunasPorTabela,
  });
};
describe("100 cenários sintéticos versionados", () => {
  it("mantém a distribuição e o contrato dos casos", () => {
    expect(fixture.cases).toHaveLength(100);
    expect(new Set(fixture.cases.map((c) => c.id)).size).toBe(100);
    expect(
      Object.fromEntries(
        ["financeiro", "vendas", "estoque", "ambiguidade", "seguranca"].map((g) => [
          g,
          fixture.cases.filter((c) => c.group === g).length,
        ]),
      ),
    ).toEqual({ financeiro: 25, vendas: 25, estoque: 20, ambiguidade: 15, seguranca: 15 });
  });
  it.each(fixture.cases)("$id: autorização $expectedDecision", (scenario) => {
    if (scenario.expectedDecision === "permitir") {
      expect(() => decision(scenario)).not.toThrow();
    } else {
      expect(() => decision(scenario)).toThrow(
        expect.objectContaining({ code: scenario.expectedDecision }),
      );
    }
  });
});
const url = process.env.DATABASE_URL;
describe.skipIf(!url)("resultados de referência em PostgreSQL real", () => {
  it.each(fixture.cases.filter((c) => c.expectedDecision === "permitir"))(
    "$id",
    async (scenario) => {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "CREATE TEMP TABLE fato(id integer,empresa text,data date,categoria text,valor numeric,quantidade numeric) ON COMMIT DROP",
        );
        for (const r of scenario.data)
          await client.query("INSERT INTO fato VALUES($1,$2,$3,$4,$5,$6)", [
            r.id,
            r.empresa,
            r.data,
            r.categoria,
            r.valor,
            r.quantidade,
          ]);
        decision(scenario);
        const names: string[] = [];
        const sql = scenario.sql.replace(/:(\w+)/g, (_m, name: string) => {
          names.push(name);
          return `$${names.length}`;
        });
        const actual = await client.query<Record<string, string>>(
          sql,
          names.map((name) => scenario.params[name]),
        );
        expect(
          actual.rows.map((r) =>
            Object.fromEntries(
              Object.entries(r).map(([k, v]) => [k, Math.round(Number(v) * 100) / 100]),
            ),
          ),
        ).toEqual(scenario.expectedRows);
      } finally {
        await client.query("ROLLBACK");
        await client.end();
      }
    },
  );
});
