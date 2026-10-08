import { describe, expect, it } from "vitest";
import { mesclarSqlDrafts } from "./sql-draft";

describe("mesclarSqlDrafts", () => {
  it("atualiza só a skill gravada e preserva o texto das outras", () => {
    const previous = [
      { id: "a", sqlModelo: "SELECT 1", sql: "SELECT 1", confirmado: false },
      { id: "b", sqlModelo: "SELECT 2", sql: "SELECT 2 editado", confirmado: true },
    ];
    const rows = [
      { id: "a", sqlModelo: "SELECT 1 novo" },
      { id: "b", sqlModelo: "SELECT 2" },
    ];
    const merged = mesclarSqlDrafts(rows, previous, "a");
    expect(merged[0]).toMatchObject({ sql: "SELECT 1 novo", confirmado: false });
    expect(merged[1]).toMatchObject({
      sql: "SELECT 2 editado",
      confirmado: true,
      original: "SELECT 2",
    });
  });
});
