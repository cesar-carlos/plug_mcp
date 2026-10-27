import { describe, expect, it } from "vitest";
import type { DatasetCaseOptions } from "../../../src/domain/persona-v2/dataset-case-options";
import type { DatasetCaseSeeds } from "../../../src/domain/persona-v2/dataset-case-seeds";
import type { QueryPublicationCase } from "../../../src/domain/persona-v2/publication-fixture";
import {
  applyQueryCaseSeeds,
  emptyQueryCaseExpectedColumn,
  emptyQueryCaseFixture,
  emptyQueryPublicationCase,
  queryCaseChosenDataset,
  queryCaseDatasetContextChanged,
  queryCaseDatasetKey,
  queryCaseDatasetMatches,
  queryCaseErrorMessage,
  queryCaseFingerprint,
  queryCaseOptionalSql,
  queryCaseParameterStatus,
} from "./query-case-editor";

const hash = "a".repeat(64);
const otherHash = "b".repeat(64);
const catalogId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";
const templateId = "33333333-3333-4333-8333-333333333333";
const datasetId = "44444444-4444-4444-8444-444444444444";
const otherDatasetId = "55555555-5555-4555-8555-555555555555";

const template = { id: templateId, version: 2, hash };
const dataset = { id: datasetId, version: 3, hash, name: "Pedidos sintéticos" };

function options(extra?: Partial<DatasetCaseOptions>): DatasetCaseOptions {
  return {
    revision: 4,
    sourceId,
    catalogId,
    template,
    datasets: [dataset],
    nextCursor: null,
    ...extra,
  };
}

function seeds(): DatasetCaseSeeds {
  return {
    revision: 4,
    sourceId,
    catalogId,
    template,
    dataset,
    fixtures: [{ table: "pedidos", generated: ["id"], rows: [] }],
    origin: {
      format: "dataset-case-origin-v1",
      catalogId,
      sourceId,
      sourceVersion: 1,
      dialect: "postgres",
      template,
      dataset: { id: datasetId, version: 3, hash },
      sourceSeedsHash: hash,
      caseSeedsHash: hash,
      modified: false,
    },
    executable: false,
    technicalApproval: false,
  };
}

describe("regras do editor de casos da consulta", () => {
  it("abre caso vazio sem herdar semente, execução ou aprovação", () => {
    expect(emptyQueryPublicationCase()).toEqual({
      name: "",
      input: { params: {}, fixtures: [] },
      expected: { columns: [], rows: [], ordered: true },
    });
    expect(emptyQueryCaseFixture("pedidos")).toEqual({ table: "pedidos", generated: [], rows: [] });
    expect(emptyQueryCaseExpectedColumn()).toEqual({ name: "", type: "string" });
  });

  it("identifica a versão escolhida sem adotar a mais recente", () => {
    const listed = options({
      datasets: [dataset, { id: otherDatasetId, version: 9, hash: otherHash, name: "Outro" }],
    });
    expect(queryCaseDatasetKey(dataset)).toBe(`${datasetId}:3`);
    expect(queryCaseChosenDataset(listed, `${datasetId}:3`)).toEqual({
      id: datasetId,
      version: 3,
      hash,
    });
    expect(queryCaseChosenDataset(listed, "")).toBeUndefined();
    expect(queryCaseChosenDataset(undefined, `${datasetId}:3`)).toBeUndefined();
  });

  it("detecta troca de contexto da lista e recusa dataset divergente", () => {
    const previous = options();
    expect(queryCaseDatasetContextChanged(previous, options({ revision: 5 }))).toBe(true);
    expect(queryCaseDatasetContextChanged(previous, options({ sourceId: otherDatasetId }))).toBe(
      true,
    );
    expect(queryCaseDatasetContextChanged(previous, options({ catalogId: otherDatasetId }))).toBe(
      true,
    );
    expect(
      queryCaseDatasetContextChanged(previous, options({ template: { ...template, version: 8 } })),
    ).toBe(true);
    expect(queryCaseDatasetContextChanged(previous, options())).toBe(false);
    expect(queryCaseDatasetMatches(seeds(), { id: datasetId, version: 3, hash })).toBe(true);
    expect(queryCaseDatasetMatches(seeds(), { id: datasetId, version: 3, hash: otherHash })).toBe(
      false,
    );
  });

  it("copia sementes para a edição local sem marcar execução", () => {
    const current: QueryPublicationCase = emptyQueryPublicationCase();
    const suggestion = seeds();
    applyQueryCaseSeeds(current, suggestion);
    expect(current.input.fixtures).toEqual(suggestion.fixtures);
    expect(current.editorialOrigin).toEqual(suggestion.origin);
    expect(suggestion.executable).toBe(false);
    expect(suggestion.technicalApproval).toBe(false);
  });

  it("distingue nulo, valor e omissão e conserva SQL opcional vazio", () => {
    expect(queryCaseParameterStatus({}, "empresa")).toBe("Omitido");
    expect(queryCaseParameterStatus({ empresa: null }, "empresa")).toBe("Nulo explícito");
    expect(queryCaseParameterStatus({ empresa: "7" }, "empresa")).toBe("Valor informado");
    expect(queryCaseOptionalSql("")).toBeUndefined();
    expect(queryCaseOptionalSql("SELECT 1")).toBe("SELECT 1");
    expect(queryCaseErrorMessage(new Error("lista recusada"), "fallback")).toBe("lista recusada");
    expect(queryCaseErrorMessage("x", "Não foi possível listar datasets.")).toBe(
      "Não foi possível listar datasets.",
    );
  });

  it("inclui o caso e a obrigatoriedade na impressão de alteração", () => {
    const current = emptyQueryPublicationCase();
    const required = queryCaseFingerprint(current, true);
    expect(required).not.toBe(queryCaseFingerprint(current, false));
    expect(required).not.toBe(queryCaseFingerprint(undefined, true));
    current.name = "Pedidos";
    expect(queryCaseFingerprint(current, true)).not.toBe(required);
  });
});
