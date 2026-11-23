import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { normalizeStockFixtureAliases } from "../../scripts/homologation/stock-sql.js";
import { manualPublicationTables } from "../../scripts/homologation/manual-publication-tables.js";
import { executePublicationManifest } from "../../src/infrastructure/persistence/persona-v2/run-publication-cases.js";

const integer = (value: number) => ({ type: "integer", value: String(value) });
const decimal = (value: number) => ({ type: "decimal", value: String(value) });
const string = (value: string) => ({ type: "string", value });
const date = (value: string) => ({ type: "date", value });
const day = "2026-11-10";

export async function exerciseStockMovement(input: {
  engine: "mssql" | "sybase";
  directory: string;
  personaId: string;
  sourceId: string;
  sessionRoot: string;
  runId: string;
  hubUrl: string;
  config: Parameters<typeof executePublicationManifest>[1];
  post: (
    path: string,
    body: object,
  ) => Promise<{ status: number; body: { skill: { id: string }; error?: { code: string } } }>;
}) {
  const tables = manualPublicationTables(input.engine, false, undefined, "estoque-movimentos");
  const root = "/api/admin/personas/" + input.personaId + "/skills";
  const rows = Array.from({ length: 31 }, (_, i) => ({
    codempresa: integer(1),
    codmovimentacaoestoque: integer(i + 1),
    datamovimento: date(day),
    codlocalarmazenagem: integer((i % 2) + 1),
    codproduto: integer(1),
    quantidadeconvertida: decimal(i % 2 === 0 ? 2 : -1),
  }));
  const fixtures = [
    { table: "dbo.movimentacaoestoque", rows },
    {
      table: "dbo.localarmazenagem",
      rows: [
        { codlocalarmazenagem: integer(1), nome: string("A") },
        { codlocalarmazenagem: integer(2), nome: string("B") },
      ],
    },
    {
      table: "dbo.produto",
      rows: [
        {
          codproduto: integer(1),
          nome: string("Item"),
          codunidademedida: string("UN"),
          codgrupoproduto: { type: "null", value: null },
          codmarca: { type: "null", value: null },
        },
      ],
    },
    { table: "dbo.grupoproduto", rows: [] },
    { table: "dbo.marca", rows: [] },
  ];
  const totalNames = [
    "QuantidadeMovimentos",
    "QuantidadeEntradas",
    "QuantidadeSaidas",
    "MovimentoLiquido",
    "MovimentosZerados",
  ];
  const sums = (n: number, e: number, s: number) => [
    integer(n),
    decimal(e),
    decimal(s),
    decimal(e - s),
    integer(0),
  ];
  const cases = [
    {
      name: "por-dia",
      columns: ["codempresa", "DataMovimento", "codunidademedida", ...totalNames],
      expected: [[integer(1), date(day), string("UN"), ...sums(31, 32, 15)]],
    },
    {
      name: "por-produto",
      columns: ["codempresa", "codproduto", "NomeProduto", "codunidademedida", ...totalNames],
      expected: [[integer(1), integer(1), string("Item"), string("UN"), ...sums(31, 32, 15)]],
    },
    {
      name: "por-local",
      columns: [
        "codempresa",
        "codlocalarmazenagem",
        "NomeLocalArmazenagem",
        "codunidademedida",
        ...totalNames,
      ],
      expected: [
        [integer(1), integer(1), string("A"), string("UN"), ...sums(16, 32, 0)],
        [integer(1), integer(2), string("B"), string("UN"), ...sums(15, 0, 15)],
      ],
    },
    {
      name: "listagem",
      columns: [
        "codempresa",
        "codmovimentacaoestoque",
        "DataMovimento",
        "codlocalarmazenagem",
        "NomeLocalArmazenagem",
        "codproduto",
        "NomeProduto",
        "codunidademedida",
        "TipoMovimentoEstoque",
        "Quantidade",
      ],
      expected: rows.map((row, i) => [
        row.codempresa,
        row.codmovimentacaoestoque,
        date(day),
        row.codlocalarmazenagem,
        string(i % 2 === 0 ? "A" : "B"),
        row.codproduto,
        string("Item"),
        string("UN"),
        string(i % 2 === 0 ? "ENTRADA" : "SAIDA"),
        decimal(i % 2 === 0 ? 2 : 1),
      ]),
    },
  ];
  for (const test of cases) {
    const sqlModel = await readFile(
      join(input.directory, "movimento-estoque-" + test.name + ".sql"),
      "utf8",
    );
    const columns = test.columns.map((name) => name.toLowerCase());
    // Runner result keys are lowercase identifiers. Fold SQL identifiers only; literals stay intact.
    const normalizedSql = normalizeStockFixtureAliases(sqlModel, test.columns);
    // The SQL Anywhere path compares civil dates; the MSSQL path keeps its indexed end predicate.
    const dialectSql =
      input.engine === "sybase"
        ? normalizedSql.replace(
            /me\.datamovimento < DATEADD\(day, 1, CAST\(:datafim AS date\)\)/i,
            "CAST(me.datamovimento AS date) <= CAST(:datafim AS date)",
          )
        : normalizedSql;
    const created = await input.post(root, {
      name: "Movimento sintético " + test.name,
      slug: "movimento-fixture-" + test.name + "-" + input.engine,
      kind: "consulta",
      training: {
        sourceId: input.sourceId,
        dialect: input.engine,
        purpose: "Conferir os movimentos sintéticos.",
        sqlModel: dialectSql,
        rules: ["Quantidade por unidade."],
        tables: tables.map(({ table, primaryKey }) => ({
          name: table,
          meaning: table,
          grain: primaryKey,
        })),
        columns: tables.flatMap(({ table, columns }) =>
          columns.map(({ name }) => ({ table, name, meaning: name, classification: "livre" })),
        ),
        relationships: [
          ["dbo.movimentacaoestoque", "dbo.produto", "codproduto", "inner"],
          ["dbo.movimentacaoestoque", "dbo.localarmazenagem", "codlocalarmazenagem", "inner"],
          ["dbo.produto", "dbo.marca", "codmarca", "left"],
          ["dbo.produto", "dbo.grupoproduto", "codgrupoproduto", "left"],
        ].map(([from, to, key, join], i) => ({
          id: "rel_" + i,
          from,
          to,
          join,
          cardinality: "N:1",
          keys: [{ from: key, to: key }],
          meaning: "Vínculo sintético.",
        })),
        parameters: ["empresa", "datainicio", "datafim", "local", "produto"].map((name, i) => ({
          name,
          type: i === 1 || i === 2 ? "date" : "integer",
          required: i < 3,
          meaning: name,
        })),
      },
    });
    expect(created.status, JSON.stringify(created.body.error)).toBe(201);
    const skillId = created.body.skill.id;
    const added = await input.post(root + "/" + skillId + "/casos", {
      required: true,
      content: {
        name: "Cenário nativo " + test.name,
        input: {
          params: { empresa: 1, datainicio: day, datafim: day, local: null, produto: null },
          fixtures,
        },
        expected: {
          columns: columns.map((name, i) => ({ name, type: test.expected[0]![i]!.type })),
          rows: test.expected.map((r) =>
            Object.fromEntries(columns.map((name, i) => [name, r[i]])),
          ),
          ordered: true,
        },
      },
    });
    expect(added.status, JSON.stringify(added.body.error)).toBe(201);
    const runnerManifest = join(
      input.sessionRoot,
      "estoque-" + input.engine + "-" + test.name + ".json",
    );
    await writeFile(
      runnerManifest,
      JSON.stringify({
        version: 1,
        runId: input.runId,
        sessionRoot: input.sessionRoot,
        hubUrl: input.hubUrl,
        personaId: input.personaId,
        skillId,
        bindings: [{ sourceId: input.sourceId, fixtureSourceId: input.sourceId, tables }],
      }),
      { flag: "wx" },
    );
    const report = await executePublicationManifest(runnerManifest, input.config);
    expect(
      report.approved,
      input.engine + "/" + test.name + ": " + JSON.stringify(report.results),
    ).toBe(true);
  }
}
