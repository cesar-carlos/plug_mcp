import { expect, it, vi } from "vitest";
import { BridgePublicationCaseExecutor } from "../../../src/infrastructure/plug-server/bridge-publication-cases.js";
import { compileQueryTraining } from "../../../src/application/persona-v2/query-training.js";
import {
  queryPublicationCaseSchema,
  type QueryPublicationCase,
} from "../../../src/domain/persona-v2/publication-fixture.js";
import { federationPublicationCaseSchema } from "../../../src/domain/persona-v2/federation-training.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import type { SourceQueryLease } from "../../../src/domain/ports/source-query.port.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";
import { trainingTopic } from "../../../src/application/persona-v2/training-topics.js";
import { PERSONA_V2_INSTRUCTIONS } from "../../../src/application/persona-v2/runtime-instructions.js";

const sql =
  "SELECT TOP 10 p.id, p.amount FROM orders p WHERE p.id > :minimum ORDER BY p.amount DESC, p.id";
it("orienta declaração explícita sem prometer total, aprovação ou extensão a cruzamentos", () => {
  expect(PERSONA_V2_INSTRUCTIONS).toContain(
    "TOP N usa expected.completeness explícita; leia knowledge",
  );
  const guidance = String(trainingTopic("knowledge").guidance);
  expect(guidance).toContain('expected.completeness:{mode:"sql_limit",maxRows:N}');
  expect(guidance).toContain("A resposta pública continua parcial");
  expect(guidance).toContain("Não aplique o opt-in a cruzamentos");
  expect(guidance).toContain("Só o runner isolado pode aprovar transporte íntegro");
});
function fixture(count = 10) {
  const source = {
    ...trainingSource,
    dialect: "mssql" as const,
    database: "se7e_persona_0123456789ab_test",
  };
  const pkg = compileQueryTraining(
    { ...queryTraining(), dialect: source.dialect },
    source,
    new NodeCryptoAdapter("a".repeat(64)),
  );
  // Equal amounts require the explicit id tie-breaker; order remains part of the assertion.
  const rows = Array.from({ length: count }, (_, n) => ({ id: n + 1, amount: "42.50" }));
  const execute = vi.fn<SourceQueryLease["execute"]>(async () => ({
    columns: ["id", "amount"],
    rows,
    truncated: false,
    effectiveMaxRows: 101,
  }));
  const revalidate = vi.fn(async () => undefined);
  const control = { prepare: vi.fn(async () => undefined), clear: vi.fn(async () => undefined) };
  const adapter = new BridgePublicationCaseExecutor(
    source,
    [
      {
        table: "orders",
        columns: [
          { name: "id", type: "integer" },
          { name: "amount", type: "decimal" },
        ],
        primaryKey: ["id"],
      },
    ],
    control,
    { authorize: vi.fn(async () => ({ execute, revalidate })) },
    { verifyCapabilitiesAndPolicy: vi.fn(), execute: vi.fn(), get: vi.fn(), cancel: vi.fn() },
    { runId: source.database, agentId: source.agentId, identityHash: source.identityHash! },
  );
  const content = {
    name: "Ranking sintético com desempate",
    input: {
      sql,
      params: { minimum: 0 },
      fixtures: [{ table: "orders", generated: [], rows: [] }],
    },
    expected: {
      completeness: { mode: "sql_limit", maxRows: 10 },
      ordered: true,
      columns: [
        { name: "id", type: "integer" },
        { name: "amount", type: "decimal" },
      ],
      rows: rows.map((row) => ({
        id: { type: "integer", value: String(row.id) },
        amount: { type: "decimal", value: row.amount },
      })),
    },
  };
  const test = content as QueryPublicationCase;
  return {
    adapter,
    source,
    pkg,
    rows,
    content,
    test,
    execute,
    revalidate,
    control,
    run: () => adapter.evaluateQuery(pkg, source, test),
  };
}

it.each([0, 10])("aprova TOP 10 explícito com %s linhas e transporte íntegro", async (count) => {
  const f = fixture(count);
  expect(await f.run()).toBe(true);
  expect(f.execute).toHaveBeenCalledOnce();
  expect(f.control.clear).toHaveBeenCalledOnce();
  expect(f.revalidate).toHaveBeenCalled();
});
it("preserva resposta pública parcial e exige opt-in do caso", async () => {
  const f = fixture();
  const response = await f.adapter.readQuery(f.pkg, f.source, sql, { minimum: 0 });
  expect(response.completeness).toEqual({ complete: false, truncated: true });
  expect(Object.keys(response).sort()).toEqual([
    "columns",
    "completeness",
    "fonteId",
    "limits",
    "provenance",
    "rows",
  ]);
  Reflect.deleteProperty(f.test.expected, "completeness");
  expect(await f.run()).toBe(false);
});
it.each([true, undefined])("não aprova truncamento ou sinal ausente: %s", async (truncated) => {
  const f = fixture();
  f.execute.mockResolvedValue({
    columns: ["id", "amount"],
    rows: f.rows,
    ...(truncated === undefined ? {} : { truncated }),
    effectiveMaxRows: 101,
  });
  expect(await f.run()).toBe(false);
});
it.each([10, 5])(
  "não aprova teto do transporte %s menor ou igual ao TOP",
  async (effectiveMaxRows) => {
    const f = fixture(0);
    f.execute.mockResolvedValue({
      columns: ["id", "amount"],
      rows: [],
      truncated: false,
      effectiveMaxRows,
    });
    expect(await f.run()).toBe(false);
  },
);
it.each([
  sql.replace("TOP 10", "TOP 11"),
  sql.replace("TOP 10", ""),
  sql.replace("TOP 10", "TOP 10 PERCENT"),
  sql.replace("TOP 10", "TOP 10 WITH TIES"),
  sql + " OFFSET 1 ROWS",
  sql.replace(" ORDER BY p.amount DESC, p.id", ""),
  "WITH subset AS (SELECT TOP 5 p.id, p.amount FROM orders p WHERE p.id > :minimum ORDER BY p.id) SELECT TOP 10 s.id, s.amount FROM subset s ORDER BY s.id",
])("recusa limite/ordem incompatível antes de executar: %s", async (alternate) => {
  const f = fixture();
  f.test.input.sql = alternate;
  await expect(f.run()).rejects.toMatchObject({ code: "INVALID_PLAN" });
  expect(f.execute).not.toHaveBeenCalled();
  expect(f.control.prepare).not.toHaveBeenCalled();
});
it.each(["missing", "order", "extra"])("não aprova dados divergentes: %s", async (kind) => {
  const f = fixture();
  const rows =
    kind === "missing"
      ? f.rows.slice(1)
      : kind === "order"
        ? [...f.rows].reverse()
        : [...f.rows, { id: 11, amount: "42.50" }];
  f.execute.mockResolvedValue({
    columns: ["id", "amount"],
    rows,
    truncated: false,
    effectiveMaxRows: 101,
  });
  expect(await f.run()).toBe(false);
});
it("recusa revogação depois da leitura sem aprovar ou reenviar", async () => {
  const f = fixture();
  f.revalidate.mockRejectedValue(new Error("revoked"));
  await expect(f.run()).rejects.toThrow("revoked");
  expect(f.execute).toHaveBeenCalledOnce();
});
it("não infere prova de transporte de uma resposta pública forjada", async () => {
  const f = fixture(0);
  const result = await f.adapter.readQuery(f.pkg, f.source, sql, { minimum: 0 });
  vi.spyOn(f.adapter, "readQuery").mockResolvedValue(structuredClone(result));
  expect(await f.run()).toBe(false);
  expect(f.execute).toHaveBeenCalledOnce();
});
it("paginação inesperada não aprova ranking", async () => {
  const f = fixture(0);
  f.execute.mockResolvedValue({
    columns: ["id", "amount"],
    rows: [],
    truncated: false,
    pagination: { page: 1, pageSize: 10, hasNextPage: false, hasPreviousPage: false },
  });
  await expect(f.run()).rejects.toMatchObject({ code: "INCOMPLETE_INPUT" });
  expect(f.execute).toHaveBeenCalledOnce();
});
it("outro dialeto não ganha suporte a TOP por usar o parser compartilhado", async () => {
  const f = fixture();
  await expect(
    f.adapter.evaluateQuery(f.pkg, { ...f.source, dialect: "sybase" }, f.test),
  ).rejects.toMatchObject({ code: "INVALID_PLAN" });
  expect(f.control.prepare).not.toHaveBeenCalled();
});
it("caso completo explícito conserva a recusa de TOP", async () => {
  const f = fixture();
  f.test.expected.completeness = { mode: "complete" };
  expect(await f.run()).toBe(false);
});
it("contrato preserva opt-in na releitura sem ampliar o padrão", () => {
  const f = fixture();
  expect(queryPublicationCaseSchema.parse(f.content).expected).toEqual(f.content.expected);
  Reflect.deleteProperty(f.content.expected, "completeness");
  expect(queryPublicationCaseSchema.parse(f.content).expected).not.toHaveProperty("completeness");
});
it.each([0, 101, 1.5])("contrato recusa teto inválido %s", (maxRows) => {
  const f = fixture();
  f.content.expected.completeness.maxRows = maxRows;
  expect(queryPublicationCaseSchema.safeParse(f.content).success).toBe(false);
});
it("contrato exige ordem e no máximo as linhas declaradas", () => {
  const f = fixture();
  f.content.expected.ordered = false;
  expect(queryPublicationCaseSchema.safeParse(f.content).success).toBe(false);
  f.content.expected.ordered = true;
  f.content.expected.completeness.maxRows = 9;
  expect(queryPublicationCaseSchema.safeParse(f.content).success).toBe(false);
});
it("cruzamentos não herdam a opção de resultado parcial", () => {
  const expected = fixture().content.expected;
  expect(
    federationPublicationCaseSchema.shape.expected.safeParse({ ...expected, totalRows: 10 })
      .success,
  ).toBe(false);
});
