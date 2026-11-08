import { expect, it, vi } from "vitest";
import {
  QueryTimings,
  type QueryTimingReport,
} from "../../../src/application/persona-v2/query-timings.js";

it("mede fases com relógio monotônico sem copiar valores e isola chamadas concorrentes", async () => {
  let tick = 0;
  const reports: QueryTimingReport[] = [];
  const timings = new QueryTimings(
    100,
    (report) => reports.push(report),
    () => ++tick,
  );
  const values = await Promise.all([
    timings.run(async () => {
      await timings.measure("catalog", async () => "private SQL");
      return timings.sync("serialization", () => "private result");
    }),
    timings.run(() => timings.measure("hub", async () => "private token")),
  ]);
  expect(values).toEqual(["private result", "private token"]);
  expect(reports).toHaveLength(2);
  expect(reports.reduce((sum, r) => sum + r.phases.catalog.calls, 0)).toBe(1);
  expect(reports.reduce((sum, r) => sum + r.phases.hub.calls, 0)).toBe(1);
  expect(reports.every((r) => r.totalMs > 0 && r.outcome === "success")).toBe(true);
  expect(JSON.stringify(reports)).not.toContain("private");
});

it("amostragem desligada não emite; falha do observador não substitui resultado ou erro", async () => {
  const emit = vi.fn();
  expect(await new QueryTimings(0, emit).run(async () => 3)).toBe(3);
  expect(emit).not.toHaveBeenCalled();
  expect(await new QueryTimings(10, emit, undefined, () => 0.99).run(async () => 4)).toBe(4);
  expect(emit).not.toHaveBeenCalled();
  const failure = new Error("private");
  const observed = vi.fn(() => {
    throw Error("logger unavailable");
  });
  const timings = new QueryTimings(100, observed);
  await expect(
    timings.run(() =>
      timings.measure("authorization", async () => {
        throw failure;
      }),
    ),
  ).rejects.toBe(failure);
  expect(observed).toHaveBeenCalledWith(
    expect.objectContaining({
      outcome: "failure",
      phases: expect.objectContaining({ authorization: expect.objectContaining({ calls: 1 }) }),
    }),
  );
  expect(await timings.run(async () => 5)).toBe(5);
});
