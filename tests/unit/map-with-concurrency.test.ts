import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../../src/application/use-cases/shared/map-with-concurrency.js";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe("mapWithConcurrency", () => {
  it("preserva a ordem dos resultados", async () => {
    const out = await mapWithConcurrency([10, 20, 30], 2, async (value) => value * 2);
    expect(out).toEqual([20, 40, 60]);
  });

  it("não dispara mais workers que o limite", async () => {
    let inflight = 0;
    let maxInflight = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 4, async () => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await delay(20);
      inflight -= 1;
    });
    expect(maxInflight).toBe(4);
  });

  it("lista vazia não chama o mapper", async () => {
    let called = 0;
    const out = await mapWithConcurrency([], 4, async () => {
      called += 1;
      return 1;
    });
    expect(out).toEqual([]);
    expect(called).toBe(0);
  });
});
