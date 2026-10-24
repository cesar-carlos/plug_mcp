import { operationTraining, operationInput } from "../../helpers/persona-v2-operation.js";
import { expect, it, vi } from "vitest";
import { runSqlPublicationCases } from "../../../src/application/persona-v2/publication-cases.js";
import {
  caseRowsEqual,
  caseValue,
} from "../../../src/application/persona-v2/publication-case-values.js";
import { fixtureTablesSchema } from "../../../src/domain/persona-v2/publication-fixture.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import type {
  PersonaRepositoryPort,
  PersonaTransaction,
} from "../../../src/domain/ports/persona-v2.port.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";

const crypto = new NodeCryptoAdapter("a".repeat(64));
function fixture() {
  const source = { ...trainingSource };
  const draft = { kind: "consulta", name: "Pedidos", revision: 1, training: queryTraining() };
  const content = {
    name: "Pedido",
    input: { params: { minimum: 0 }, fixtures: [{ table: "orders", generated: [], rows: [] }] },
    expected: { columns: [{ name: "id", type: "integer" }], rows: [], ordered: true },
  };
  const cases = [{ id: "required", required: true, content }];
  const saveReport = vi.fn<PersonaTransaction["catalog"]["saveReport"]>(async () =>
    Promise.resolve(),
  );
  const tx = {
    findPersona: async () => ({ active: true, ownerId: "owner" }),
    listSources: async () => [source],
    catalog: { find: async () => draft, cases: async () => cases, saveReport },
  } as unknown as PersonaTransaction;
  let locked = false;
  const repository = {
    transaction: async (_locks: unknown, action: (tx: PersonaTransaction) => Promise<unknown>) => {
      expect(locked).toBe(false);
      locked = true;
      try {
        return await action(tx);
      } finally {
        locked = false;
      }
    },
  } as unknown as PersonaRepositoryPort;
  const executor = {
    evaluate: vi.fn(async () => true),
    evaluateQuery: vi.fn(async () => {
      expect(locked).toBe(false);
      expect(saveReport.mock.calls.at(-1)?.[5]).toBe(false);
      return true;
    }),
  };
  return {
    source,
    draft,
    cases,
    saveReport,
    executor,
    run: () => runSqlPublicationCases(repository, source.personaId, "skill", crypto, executor),
  };
}

it("invalida aprovação antes de executar fora da transação e aprova após revalidação", async () => {
  const f = fixture();
  expect((await f.run()).approved).toBe(true);
  expect(f.saveReport).toHaveBeenCalledTimes(2);
  expect(f.saveReport.mock.calls.at(-1)?.[5]).toBe(true);
});
it("falha de execução não conserva relatório aprovado", async () => {
  const f = fixture();
  f.executor.evaluateQuery.mockRejectedValue(new Error("connection lost"));
  await expect(f.run()).rejects.toThrow("connection lost");
  expect(f.saveReport).toHaveBeenCalledTimes(1);
  expect(f.saveReport.mock.calls[0]?.[5]).toBe(false);
});
it.each(["revision", "credential", "cases"])(
  "mudança concorrente de %s recusa aprovação",
  async (field) => {
    const f = fixture();
    f.executor.evaluateQuery.mockImplementation(async () => {
      if (field === "revision") f.draft.revision++;
      if (field === "credential") f.source.credentialVersion++;
      if (field === "cases") f.cases[0]!.content.expected.ordered = false;
      return true;
    });
    await expect(f.run()).rejects.toMatchObject({ code: "STALE_AUTHORIZATION" });
    expect(f.saveReport).toHaveBeenCalledTimes(1);
  },
);
it("caso obrigatório reprovado bloqueia relatório", async () => {
  const f = fixture();
  f.executor.evaluateQuery.mockResolvedValue(false);
  expect((await f.run()).approved).toBe(false);
});
it("revogação entre casos impede o próximo dispatch", async () => {
  const f = fixture();
  f.cases.push({ ...structuredClone(f.cases[0]!), id: "second" });
  f.executor.evaluateQuery.mockImplementation(async () => {
    f.source.credentialVersion++;
    return true;
  });
  await expect(f.run()).rejects.toMatchObject({ code: "STALE_AUTHORIZATION" });
  expect(f.executor.evaluateQuery).toHaveBeenCalledTimes(1);
  expect(f.saveReport).toHaveBeenCalledTimes(1);
});
it("caso inválido deixa reprovação e não executa SQL", async () => {
  const f = fixture();
  f.cases[0]!.content.expected.columns = [];
  await expect(f.run()).rejects.toThrow();
  expect(f.executor.evaluateQuery).not.toHaveBeenCalled();
  expect(f.saveReport.mock.calls[0]?.[5]).toBe(false);
});
it("comparação conserva inteiros grandes, casas decimais e duplicatas", () => {
  expect(caseValue("9007199254740993", "integer")).toBe("9007199254740993");
  expect(() => caseValue(Number.MAX_SAFE_INTEGER + 1, "integer")).toThrow();
  expect(caseValue("000123.45000", "decimal")).toBe("123.45");
  expect(() => caseValue(0.1, "decimal")).toThrow();
  const columns = [{ name: "v", type: "string" }];
  const expected = [
    { v: { type: "string" as const, value: "ação" } },
    { v: { type: "string" as const, value: "ação" } },
  ];
  expect(caseRowsEqual([{ v: "ação" }, { v: "ação" }], expected, columns, false)).toBe(true);
  expect(caseRowsEqual([{ v: "ação" }], expected, columns, false)).toBe(false);
  expect(caseRowsEqual([{ v: "ação" }, { v: "outro" }], expected, columns, false)).toBe(false);
  expect(() => caseValue("2026-01-01T01:00:00Z", "date")).toThrow();
});
it.each(["x; DROP TABLE x", "se7e_source_identity", "public.x.y"])(
  "recusa declaração %s",
  (table) => {
    expect(() =>
      fixtureTablesSchema.parse([
        { table, columns: [{ name: "id", type: "integer" }], primaryKey: ["id"] },
      ]),
    ).toThrow();
  },
);

it("ID de operação fornecido no caso não pode reutilizar receipt antigo", async () => {
  const f = fixture();
  Object.assign(f.draft, { kind: "operacao_sql", training: operationTraining() });
  Object.assign(f.cases[0]!, {
    content: {
      name: "Reutilização recusada",
      input: {
        parameters: operationInput,
        operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        fixtures: [{ table: "orders", rows: [] }],
      },
      expected: { error: "INVALID_PLAN" },
    },
  });
  await expect(f.run()).rejects.toMatchObject({ code: "INCOMPLETE_INPUT" });
  expect(f.executor.evaluate).not.toHaveBeenCalled();
  expect(f.saveReport).toHaveBeenCalledTimes(1);
  expect(f.saveReport.mock.calls[0]?.[5]).toBe(false);
  expect(f.saveReport.mock.calls[0]?.[7]).toBe("persona-generic-sql-fixtures-v1");
});
