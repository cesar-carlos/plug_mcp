import { expect, it, vi } from "vitest";
import {
  campoQueryTables,
  campoQueryProfileSchema,
} from "../../../scripts/homologation/campo-query-fixtures.js";
import { BridgePublicationCaseExecutor } from "../../../src/infrastructure/plug-server/bridge-publication-cases.js";
import { fixtureSeedsSchema } from "../../../src/domain/persona-v2/publication-fixture.js";
import { trainingSource } from "../../helpers/persona-v2-training.js";
import type { SourceQueryGatewayPort } from "../../../src/domain/ports/source-query.port.js";
import type { SqlOperationGatewayPort } from "../../../src/domain/ports/persona-v2.port.js";

const excluded = new Set([
  "nomeproduto",
  "codlocalarmazenagem",
  "precounitario",
  "valorunitarioliquido",
  "geracomissao",
  "movimentaestoque",
]);
const minimal = campoQueryTables("itens-detalhados")
  .slice(0, 3)
  .map((t) => ({ ...t, columns: t.columns.filter((c) => !excluded.has(c.name)) }));
const seeds = fixtureSeedsSchema.parse(
  minimal.map((t) => ({
    table: t.table,
    rows: [
      Object.fromEntries(
        t.columns.map((c) => [
          c.name,
          t.primaryKey.includes(c.name)
            ? { type: c.type, value: c.type === "string" ? "01" : "1" }
            : { type: "null", value: null },
        ]),
      ),
    ],
  })),
);
const source = {
  ...trainingSource,
  dialect: "mssql" as const,
  database: "se7e_persona_0123456789ab_test",
};
function executor(tables: unknown) {
  const control = {
    prepare: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
  };
  const runner = new BridgePublicationCaseExecutor(
    source,
    tables,
    control,
    {} as SourceQueryGatewayPort,
    {} as SqlOperationGatewayPort,
    { runId: source.database, agentId: source.agentId, identityHash: source.identityHash! },
  );
  return { runner, control };
}
it("reproduz recusa de três sementes contra manifesto amplo sem enviar prepare", async () => {
  const { runner, control } = executor(campoQueryTables("itens-detalhados"));
  await expect(
    runner.prepareFederation(
      source,
      seeds,
      minimal.map((t) => t.table),
    ),
  ).rejects.toMatchObject({ code: "INVALID_PLAN" });
  expect(control.prepare).not.toHaveBeenCalled();
});
it("perfil mínimo aceita estrutura exata e continua recusando tabela ou célula omitida", async () => {
  const profile = campoQueryProfileSchema.parse("itens-resumos");
  const tables = campoQueryTables(profile);
  expect(tables).toEqual(minimal);
  expect(tables.map((t) => [t.table, t.columns.length])).toEqual([
    ["dbo.itemprodutovendido", 23],
    ["dbo.produtovendido", 6],
    ["dbo.tipooperacaosaida", 3],
  ]);
  expect(tables[0]!.columns.map((c) => c.name).sort()).toEqual(
    [
      "codempresa",
      "codproduto",
      "codprodutovendido",
      "codpromocao",
      "codtabelapreco",
      "codunidademedida",
      "customedio",
      "custoreposicao",
      "custovenda",
      "itemprodutovendido",
      "pontoequilibrio",
      "quantidade",
      "valoracrescimo",
      "valorcofins",
      "valorcsll",
      "valorcustofixo",
      "valordesconto",
      "valoricms",
      "valoripi",
      "valoriss",
      "valoritem",
      "valorpis",
      "valorsimples",
    ].sort(),
  );
  const { runner, control } = executor(tables);
  await runner.prepareFederation(
    source,
    seeds,
    minimal.map((t) => t.table),
  );
  expect(control.prepare).toHaveBeenCalledExactlyOnceWith(source, seeds);
  control.prepare.mockClear();
  await expect(
    runner.prepareFederation(
      source,
      seeds.slice(0, 2),
      minimal.map((t) => t.table),
    ),
  ).rejects.toMatchObject({ code: "INVALID_PLAN" });
  const incomplete = structuredClone(seeds);
  delete incomplete[0]!.rows[0]!.valorpis;
  await expect(
    runner.prepareFederation(
      source,
      incomplete,
      minimal.map((t) => t.table),
    ),
  ).rejects.toMatchObject({ code: "INVALID_PLAN" });
  expect(control.prepare).not.toHaveBeenCalled();
});
