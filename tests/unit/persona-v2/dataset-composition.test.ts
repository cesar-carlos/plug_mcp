import { expect, it } from "vitest";
import {
  mergeDatasetFixtures,
  confirmDatasetComposition,
} from "../../../src/application/persona-v2/dataset-composition.js";
import {
  datasetCompositionSelectionSchema,
  type DatasetCompositionSeeds,
} from "../../../src/domain/persona-v2/dataset-composition.js";
import { createHash } from "node:crypto";
const crypto = { sha256Hex: (s: string) => createHash("sha256").update(s).digest("hex") };
const part = (value: string, contract = "template-v1:amount-decimal") => ({
  fixtures: [
    { table: "orders", generated: [], rows: [{ amount: { type: "decimal" as const, value } }] },
  ],
  contracts: { orders: contract },
});
it("concatena na ordem explícita sem deduplicar ou alterar partes", () => {
  const a = part("1.20"),
    b = part("1.20");
  const merged = mergeDatasetFixtures([a, b]);
  expect(merged[0]!.rows).toEqual([...a.fixtures[0]!.rows, ...b.fixtures[0]!.rows]);
  expect(a.fixtures[0]!.rows).toHaveLength(1);
});
it("recusa tabela homônima de outro template ou colunas incompatíveis", () => {
  expect(() => mergeDatasetFixtures([part("1.20"), part("2.30", "other-template")])).toThrow(
    /template/,
  );
  expect(() =>
    mergeDatasetFixtures([part("1.20"), part("2.30", "template-v1:amount-integer")]),
  ).toThrow(/colunas/);
});
it("recusa excesso de linhas em vez de truncar a combinação", () => {
  const seed = part("1.20");
  seed.fixtures[0]!.rows = Array.from({ length: 100 }, () => ({
    amount: { type: "decimal", value: "1.20" },
  }));
  expect(() => mergeDatasetFixtures([seed, part("2.30")])).toThrow(/100 linhas/);
});
it("recusa seleção duplicada e mais de quatro materiais", () => {
  const material = {
    catalogId: "11111111-1111-4111-8111-111111111111",
    dataset: { id: "22222222-2222-4222-8222-222222222222", version: 1, hash: "a".repeat(64) },
  };
  expect(
    datasetCompositionSelectionSchema.safeParse({ materials: [material, material] }).success,
  ).toBe(false);
  expect(
    datasetCompositionSelectionSchema.safeParse({
      materials: Array.from({ length: 5 }, (_, i) => ({
        ...material,
        dataset: { ...material.dataset, version: i + 1 },
      })),
    }).success,
  ).toBe(false);
});
it("confirma referências e recalcula status sem aceitar hashes alegados", () => {
  const refs = { id: "22222222-2222-4222-8222-222222222222", version: 1, hash: "a".repeat(64) };
  const fixtures = mergeDatasetFixtures([part("1.20")]);
  const current: DatasetCompositionSeeds = {
    revision: 1,
    sourceId: refs.id,
    fixtures,
    executable: false,
    technicalApproval: false,
    origin: {
      format: "operation-dataset-composition-v1",
      sourceId: refs.id,
      sourceVersion: 1,
      dialect: "postgres",
      materials: [
        { catalogId: refs.id, dataset: refs, template: refs, sourceSeedsHash: refs.hash },
      ],
      sourceSeedsHash: "b".repeat(64),
      caseSeedsHash: "b".repeat(64),
      modified: false,
    },
  };
  const confirmed = confirmDatasetComposition(
    { ...current.origin, caseSeedsHash: refs.hash, modified: false },
    current,
    fixtures,
    crypto,
  );
  expect(confirmed.modified).toBe(true);
  expect(confirmed.caseSeedsHash).not.toBe(refs.hash);
  expect(() =>
    confirmDatasetComposition({ ...current.origin, sourceVersion: 2 }, current, fixtures, crypto),
  ).toThrow(/mudou/);
});
