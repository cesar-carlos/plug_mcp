import { expect, it, vi } from "vitest";
import { assertPersonaDatabase } from "../../../src/infrastructure/persistence/persona-v2/migrate.js";
import type pg from "pg";

it.each([
  { tables: ["acesso"] },
  { tables: ["usuario_mcp", "_mcp_migrations"] },
  { tables: ["unrelated"] },
  { tables: ["mcp_schema_generation", "acesso"] },
])("banco legado/estranho recusado antes de DDL: %j", async ({ tables }) => {
  const query = vi.fn(async (_sql: string) => ({
    rows: tables.map((tablename) => ({ tablename })),
  }));
  await expect(assertPersonaDatabase({ query } as unknown as pg.Client)).rejects.toThrow(
    "sem alteração",
  );
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0]![0]).toMatch(/^SELECT /);
});
