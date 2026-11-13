import { afterEach, expect, it, vi } from "vitest";
import pg from "pg";
import { dropPersonaFixtureDatabase } from "../helpers/persona-fixture-cleanup.js";

const name = "knowledge_context_0123456789abcdef0123456789abcdef_test";
const admin = new pg.Pool({ connectionString: "postgres://unused:unused@127.0.0.1:1/postgres" });
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each(["knowledge_context", "interaction_error", "persona_operator"])(
  "aguarda conexões em fechamento da fixture %s sem forçá-las",
  async (prefix) => {
    const name = `${prefix}_0123456789abcdef0123456789abcdef_test`;
    vi.useFakeTimers();
    const query = vi.spyOn(admin, "query");
    query.mockResolvedValueOnce({ rows: [{ active: true }] } as never);
    query.mockResolvedValueOnce({ rows: [{ active: false }] } as never);
    query.mockResolvedValueOnce({ rows: [] } as never);
    const cleanup = dropPersonaFixtureDatabase(admin, name);
    await vi.advanceTimersByTimeAsync(10);
    await cleanup;
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0]![0]).toMatchObject({
      text: "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = $1) AS active",
      values: [name],
    });
    expect(query.mock.calls[2]).toEqual([`DROP DATABASE "${name}"`]);
  },
);

it("recusa conexão vazada no prazo limitado e nunca força a remoção", async () => {
  vi.useFakeTimers();
  const query = vi.spyOn(admin, "query").mockResolvedValue({ rows: [{ active: true }] } as never);
  const refused = expect(dropPersonaFixtureDatabase(admin, name)).rejects.toThrow(
    "Fixture connections did not close",
  );
  await vi.advanceTimersByTimeAsync(5000);
  await refused;
  expect(query.mock.calls.every(([sql]) => typeof sql !== "string")).toBe(true);
});

it("propaga falha de observação sem remover a base", async () => {
  const unavailable = new Error("Metadata connection unavailable");
  const query = vi.spyOn(admin, "query").mockRejectedValueOnce(unavailable);
  await expect(dropPersonaFixtureDatabase(admin, name)).rejects.toBe(unavailable);
  expect(query).toHaveBeenCalledTimes(1);
});

it("recusa nomes que não pertencem a essa família de fixtures antes de consultar", async () => {
  const query = vi.spyOn(admin, "query");
  await expect(dropPersonaFixtureDatabase(admin, "operational")).rejects.toThrow(
    "Invalid persona fixture name",
  );
  expect(query).not.toHaveBeenCalled();
});

it.each([{ rows: [] }, { rows: [{ active: "unknown" }] }])(
  "recusa observação inconclusiva %j sem remover a base",
  async ({ rows }) => {
    const query = vi.spyOn(admin, "query").mockResolvedValueOnce({ rows } as never);
    await expect(dropPersonaFixtureDatabase(admin, name)).rejects.toThrow(
      "Fixture connection state unavailable",
    );
    expect(query).toHaveBeenCalledTimes(1);
  },
);

it("propaga falha do DROP normal sem terminar conexões à força", async () => {
  const refused = new Error("Database is still being accessed");
  const query = vi.spyOn(admin, "query");
  query.mockResolvedValueOnce({ rows: [{ active: false }] } as never);
  query.mockRejectedValueOnce(refused);
  await expect(dropPersonaFixtureDatabase(admin, name)).rejects.toBe(refused);
  expect(query).toHaveBeenCalledTimes(2);
  expect(query.mock.calls[1]).toEqual([`DROP DATABASE "${name}"`]);
});
