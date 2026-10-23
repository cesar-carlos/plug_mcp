import { expect, it } from "vitest";
import { composePhysicalContent } from "../../../src/application/persona-v2/physical-profiles.js";
import { structureContent } from "../../helpers/persona-v2-structure.js";

it("particularidade exige substituição explícita e preserva classificações e regras", () => {
  const base = structureContent();
  const changed = {
    ...base,
    tables: base.tables.map((t) => ({ ...t, meaning: "Significado específico revisado" })),
  };
  expect(() => composePhysicalContent(base, changed, { tables: [], relationships: [] })).toThrow(
    /substituição/,
  );
  expect(() =>
    composePhysicalContent(base, changed, {
      tables: base.tables.map((t) => t.id),
      relationships: [],
    }),
  ).not.toThrow();
  expect(() =>
    composePhysicalContent(
      base,
      { ...changed, rules: [] },
      { tables: base.tables.map((t) => t.id), relationships: [] },
    ),
  ).toThrow();
  const protectedBase = {
    ...base,
    tables: base.tables.map((t) => ({
      ...t,
      columns: t.columns.map((c) => ({ ...c, classification: "segredo" as const })),
    })),
  };
  expect(() =>
    composePhysicalContent(protectedBase, changed, {
      tables: base.tables.map((t) => t.id),
      relationships: [],
    }),
  ).toThrow(/classificação/);
  expect(() =>
    composePhysicalContent(
      base,
      { ...base, tables: [] },
      { tables: base.tables.map((t) => t.id), relationships: [] },
    ),
  ).toThrow();
});
