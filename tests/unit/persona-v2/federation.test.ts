import { describe, expect, it, vi } from "vitest";
import {
  ExecuteFederation,
  federationBudget,
} from "../../../src/application/persona-v2/federation.js";
import type {
  DataRow,
  FederationPlan,
  LocalQueryResult,
} from "../../../src/domain/persona-v2/federation.js";

const results = (rows: readonly DataRow[], columns?: string[]): LocalQueryResult => ({
  rows,
  columns: columns ?? Object.keys(rows[0] ?? {}),
  truncated: false,
  publicationHash: "hash",
  readAt: "2026-10-10T12:00:00Z",
});
const plan: FederationPlan = {
  publicationId: "federated",
  steps: [
    {
      kind: "local",
      id: "a",
      sourceId: "A",
      publicationId: "pa",
      sql: "SELECT id,branch,name FROM synthetic",
      params: {},
    },
    {
      kind: "local",
      id: "b",
      sourceId: "B",
      publicationId: "pb",
      sql: "SELECT id,branch,total FROM synthetic",
      params: {},
    },
    {
      kind: "join",
      id: "join",
      left: "a",
      right: "b",
      join: "left",
      keys: [
        { left: "id", right: "id" },
        { left: "branch", right: "branch" },
      ],
      cardinality: "one_to_one",
      columns: [
        { side: "left", column: "name", as: "name" },
        { side: "right", column: "total", as: "total" },
      ],
    },
  ],
  output: "join",
  page: 1,
  pageSize: 10,
};
const fixture = (left: LocalQueryResult, right: LocalQueryResult) => {
  const authorize = vi.fn(async () => undefined);
  const query = vi.fn(async (step: { sourceId: string }) => (step.sourceId === "A" ? left : right));
  return { authorize, query, executor: new ExecuteFederation({ authorize, query }) };
};
describe("persona-v2 cruzamento determinístico", () => {
  it("recusa inteiro numérico sem precisão segura antes de comparar chaves", async () => {
    const f = fixture(
      results([{ id: 9007199254740992, branch: 1, name: "A" }]),
      results([{ id: Number("9007199254740993"), branch: 1, total: 1 }]),
    );
    await expect(f.executor.execute(plan)).rejects.toMatchObject({ code: "INVALID_PLAN" });
    expect(f.query).toHaveBeenCalledTimes(1);
  });
  it("preserva inteiros grandes textuais sem unir identificadores distintos", async () => {
    const f = fixture(
      results([{ id: "9007199254740992", branch: 1, name: "A" }]),
      results([{ id: "9007199254740993", branch: 1, total: 1 }]),
    );
    expect((await f.executor.execute(plan)).rows).toEqual([{ name: "A", total: null }]);
  });
  it("cruza chaves compostas e preserva ausência/nulls", async () => {
    const f = fixture(
      results([
        { id: 1, branch: 1, name: "match" },
        { id: 1, branch: 2, name: "other" },
        { id: null, branch: 1, name: "null" },
      ]),
      results([
        { id: 1, branch: 1, total: "0.10" },
        { id: null, branch: 1, total: "999" },
      ]),
    );
    const out = await f.executor.execute(plan);
    expect(out.rows).toEqual([
      { name: "match", total: "0.10" },
      { name: "other", total: null },
      { name: "null", total: null },
    ]);
    expect(out.provenance).toHaveLength(2);
    expect(out.complete).toBe(true);
    expect(f.authorize).toHaveBeenCalledTimes(4);
  });
  it("recusa fanout incompatível", async () => {
    const f = fixture(
      results([{ id: 1, branch: 1, name: "a" }]),
      results([
        { id: 1, branch: 1, total: 10 },
        { id: 1, branch: 1, total: 20 },
      ]),
    );
    await expect(f.executor.execute(plan)).rejects.toThrow("Cardinalidade");
  });
  it("não entrega agregação ou cruzamento truncado", async () => {
    const f = fixture(
      { ...results([{ id: 1, branch: 1, name: "a" }]), truncated: true },
      results([], ["id", "branch", "total"]),
    );
    await expect(f.executor.execute(plan)).rejects.toMatchObject({ code: "INCOMPLETE_INPUT" });
    expect(f.query).toHaveBeenCalledTimes(1);
  });
  it("soma decimais exatamente e pagina depois da combinação", async () => {
    const f = fixture(
      results([
        { group: "x", total: "0.10" },
        { group: "x", total: "0.20" },
        { group: "y", total: "999999999999999999.01" },
      ]),
      results([]),
    );
    const aggregate: FederationPlan = {
      ...plan,
      steps: [
        plan.steps[0]!,
        {
          kind: "aggregate",
          id: "agg",
          input: "a",
          dimensions: ["group"],
          measures: [{ operation: "sum", column: "total", as: "sum" }],
        },
      ],
      output: "agg",
      pageSize: 1,
      page: 2,
    };
    const result = await f.executor.execute(aggregate);
    expect(result.totalRows).toBe(2);
    expect(result.rows).toEqual([{ group: "y", sum: "999999999999999999.01" }]);
    expect((await f.executor.execute({ ...aggregate, page: 1 })).rows).toEqual([
      { group: "x", sum: "0.30" },
    ]);
  });
  it("limites de token e skill só reduzem o orçamento", () => {
    expect(federationBudget({ sources: 900, steps: 999 }, { sources: 2, steps: 3 })).toMatchObject({
      sources: 2,
      steps: 3,
      concurrency: 2,
    });
    expect(() => federationBudget({ sources: 0 })).toThrow();
  });
  it("limite por fonte acumula várias etapas", async () => {
    const f = fixture(results([{ id: 1 }]), results([{ id: 1 }]));
    await expect(
      f.executor.execute(
        { ...plan, steps: [plan.steps[0]!, { ...plan.steps[0]!, id: "a2" }], output: "a2" },
        federationBudget({ rowsPerSource: 1 }),
      ),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });
  it("nega entrega se a autorização foi revogada durante leitura", async () => {
    const f = fixture(
      results([{ id: 1, branch: 1, name: "a" }]),
      results([{ id: 1, branch: 1, total: 1 }]),
    );
    f.authorize
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => undefined)
      .mockRejectedValueOnce(new Error("revogada"));
    await expect(f.executor.execute(plan)).rejects.toThrow("revogada");
  });
  it("aborta gateway que não respeita timeout", async () => {
    const executor = new ExecuteFederation({
      authorize: async () => undefined,
      query: () => new Promise(() => undefined),
    });
    await expect(
      executor.execute(
        { ...plan, steps: [plan.steps[0]!], output: "a" },
        federationBudget({ timeoutMs: 5 }),
      ),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });
  it("não envia a próxima consulta quando a revalidação consome o prazo", async () => {
    const now = vi.spyOn(Date, "now");
    let clock = 1000;
    now.mockImplementation(() => clock);
    const f = fixture(results([{ id: 1 }]), results([{ id: 1 }]));
    let authorization = 0;
    f.authorize.mockImplementation(async () => {
      authorization++;
      // Timer callbacks can still be queued when the authority finishes.
      if (authorization === 3) clock += 100;
    });
    try {
      await expect(
        f.executor.execute(plan, federationBudget({ timeoutMs: 100 })),
      ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
      expect(f.query).toHaveBeenCalledTimes(1);
      expect(f.query.mock.calls[0]![0].sourceId).toBe("A");
    } finally {
      now.mockRestore();
    }
  });
  it("tempo total inclui autorização pendurada", async () => {
    const executor = new ExecuteFederation({
      authorize: () => new Promise(() => undefined),
      query: async () => results([]),
    });
    await expect(
      executor.execute(
        { ...plan, steps: [plan.steps[0]!], output: "a" },
        federationBudget({ timeoutMs: 5 }),
      ),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });
  it("ordena e calcula extremos decimais sem ordenação lexical", async () => {
    const f = fixture(
      results([{ total: "10.01" }, { total: "2.50" }, { total: "-100.00" }]),
      results([]),
    );
    const sorted: FederationPlan = {
      ...plan,
      steps: [
        plan.steps[0]!,
        {
          kind: "sort",
          id: "sort",
          input: "a",
          order: [{ column: "total", direction: "asc", nulls: "last", valueType: "decimal" }],
        },
      ],
      output: "sort",
    };
    expect((await f.executor.execute(sorted)).rows).toEqual([
      { total: "-100.00" },
      { total: "2.50" },
      { total: "10.01" },
    ]);
    expect(
      (
        await f.executor.execute({
          ...plan,
          steps: [
            plan.steps[0]!,
            {
              kind: "aggregate",
              id: "min",
              input: "a",
              dimensions: [],
              measures: [{ operation: "min", column: "total", as: "lowest", valueType: "decimal" }],
            },
          ],
          output: "min",
        })
      ).rows,
    ).toEqual([{ lowest: "-100.00" }]);
  });
  it("não trata silenciosamente chave textual como chave numérica", async () => {
    const f = fixture(
      results([{ id: 1, branch: 1, name: "A" }]),
      results([{ id: "1", branch: 1, total: 10 }]),
    );
    await expect(f.executor.execute(plan)).rejects.toThrow("tipos incompatíveis");
  });
  it("limita total retido e libera entradas sem consumidores futuros", async () => {
    const f = fixture(
      results([{ id: 1, branch: 1, name: "A" }]),
      results([{ id: 1, branch: 1, total: 10 }]),
    );
    await expect(
      f.executor.execute({ ...plan, pageSize: 1 }, federationBudget({ intermediateRows: 1 })),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(
      (
        await f.executor.execute(
          { ...plan, pageSize: 1 },
          federationBudget({ intermediateRows: 2 }),
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("recusa dependências futuras, schemas inconsistentes e memória excessiva", async () => {
    const f = fixture(results([{ id: 1, branch: 1, name: "a" }]), results([]));
    await expect(
      f.executor.execute({ ...plan, steps: [plan.steps[2]!, plan.steps[0]!, plan.steps[1]!] }),
    ).rejects.toThrow("Dependência");
    await expect(
      f.executor.execute(plan, federationBudget({ intermediateBytes: 10 })),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    const bad = fixture(results([{ id: 1 }], ["missing"]), results([]));
    await expect(
      bad.executor.execute({ ...plan, steps: [plan.steps[0]!], output: "a" }),
    ).rejects.toThrow("Coluna");
  });
});
