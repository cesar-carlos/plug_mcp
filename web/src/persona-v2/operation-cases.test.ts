import { describe, expect, it } from "vitest";
import type { DatasetCompositionSeeds } from "../../../src/domain/persona-v2/dataset-composition";
import type { DirectOperationDatasetSeeds } from "../../../src/domain/persona-v2/direct-operation-dataset";
import type { OperationDatasetSeeds } from "../../../src/domain/persona-v2/operation-dataset";
import { emptyOperation } from "./operation-editor";
import {
  applyOperationCaseDataset,
  cloneOperationCase,
  emptyOperationCase,
  isOperationCaseDirty,
  operationCaseExpectedKind,
  operationCaseExpectedResult,
  operationCaseFingerprint,
  operationCaseParameterType,
  writeOperationCaseOperationId,
  writeOperationCaseStepSql,
} from "./operation-cases";

const hash = "a".repeat(64);
const catalogId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";
const template = { id: "33333333-3333-4333-8333-333333333333", version: 2, hash };
const dataset = {
  id: "44444444-4444-4444-8444-444444444444",
  version: 3,
  hash,
  name: "Pedidos sintéticos",
};
const fixtures = [{ table: "orders", generated: ["id"], rows: [] }];

describe("regras dos casos da operação SQL", () => {
  it("abre caso vazio com parâmetros da operação, sem executar nem aprovar", () => {
    const training = emptyOperation();
    training.parameters = [
      { name: "id", type: "integer", nullable: false, meaning: "Pedido" },
      { name: "flag", type: "boolean", nullable: false, meaning: "Flag" },
    ];
    expect(emptyOperationCase(training)).toEqual({
      name: "",
      input: {
        parameters: {
          id: { type: "integer", value: "" },
          flag: { type: "boolean", value: false },
        },
        fixtures: [],
      },
      expected: { affectedRows: 1, tables: [] },
    });
  });

  it("marca edição pelo fingerprint ou confirmação de remoção", () => {
    const current = emptyOperationCase(emptyOperation());
    const fingerprint = operationCaseFingerprint(true, current);
    expect(
      isOperationCaseDirty({
        current,
        fingerprint,
        saved: fingerprint,
        removeConfirmed: false,
      }),
    ).toBe(false);
    expect(
      isOperationCaseDirty({
        current,
        fingerprint,
        saved: "other",
        removeConfirmed: false,
      }),
    ).toBe(true);
    expect(
      isOperationCaseDirty({
        current: undefined,
        fingerprint,
        saved: fingerprint,
        removeConfirmed: true,
      }),
    ).toBe(true);
    expect(operationCaseFingerprint(true, current)).not.toBe(
      operationCaseFingerprint(false, current),
    );
  });

  it("preserva tipo declarado do parâmetro e SQL opcional por etapa", () => {
    const training = emptyOperation();
    training.parameters = [{ name: "id", type: "integer", nullable: true, meaning: "Pedido" }];
    expect(operationCaseParameterType(training, "id", { type: "null", value: null })).toBe(
      "integer",
    );
    expect(operationCaseParameterType(training, "missing", { type: "null", value: null })).toBe(
      "string",
    );
    const current = emptyOperationCase(training);
    writeOperationCaseOperationId(current, "55555555-5555-4555-8555-555555555555");
    writeOperationCaseStepSql(current, "change", "UPDATE orders SET amount = 1");
    expect(current.input.operationId).toBe("55555555-5555-4555-8555-555555555555");
    expect(current.input.sqlByStep).toEqual({ change: "UPDATE orders SET amount = 1" });
    writeOperationCaseOperationId(current, "");
    writeOperationCaseStepSql(current, "change", "");
    expect(current.input.operationId).toBeUndefined();
    expect(current.input.sqlByStep).toEqual({});
  });

  it("troca o resultado esperado sem herdar estado anterior", () => {
    expect(operationCaseExpectedResult("success")).toEqual({ affectedRows: 1, tables: [] });
    expect(operationCaseExpectedResult("NATIVE_FAILURE")).toEqual({ error: "NATIVE_FAILURE" });
    expect(operationCaseExpectedKind({ affectedRows: 2, tables: [] })).toBe("success");
    expect(operationCaseExpectedKind({ error: "INVALID_PLAN" })).toBe("INVALID_PLAN");
  });

  it("copia sementes editoriais para a edição local sem marcar execução", () => {
    const current = cloneOperationCase(emptyOperationCase(emptyOperation()));
    const origin = {
      format: "operation-direct-dataset-case-origin-v1" as const,
      catalogId,
      sourceId,
      sourceVersion: 1,
      dialect: "postgres" as const,
      template,
      dataset: { id: dataset.id, version: dataset.version, hash },
      sourceSeedsHash: hash,
      caseSeedsHash: hash,
      modified: false,
    };
    const direct: DirectOperationDatasetSeeds = {
      revision: 4,
      sourceId,
      catalogId,
      template,
      dataset,
      fixtures,
      origin,
      executable: false,
      technicalApproval: false,
    };
    applyOperationCaseDataset(current, direct);
    expect(current.input.fixtures).toEqual(fixtures);
    expect(current.editorialOrigin).toEqual(origin);
    const queryOrigin = {
      ...origin,
      format: "operation-dataset-case-origin-v1" as const,
      querySkillId: "66666666-6666-4666-8666-666666666666",
      queryRevision: 2,
    };
    const fromQuery: OperationDatasetSeeds = {
      ...direct,
      origin: queryOrigin,
    };
    applyOperationCaseDataset(current, fromQuery);
    expect(current.editorialOrigin).toEqual(queryOrigin);
    const composition: DatasetCompositionSeeds = {
      revision: 4,
      sourceId,
      fixtures,
      origin: {
        format: "operation-dataset-composition-v1",
        sourceId,
        sourceVersion: 1,
        dialect: "postgres",
        materials: [
          {
            catalogId,
            dataset: { id: dataset.id, version: dataset.version, hash },
            template,
            sourceSeedsHash: hash,
          },
        ],
        sourceSeedsHash: hash,
        caseSeedsHash: hash,
        modified: false,
      },
      executable: false,
      technicalApproval: false,
    };
    applyOperationCaseDataset(current, composition);
    expect(current.editorialOrigin).toEqual(composition.origin);
    expect(direct.executable).toBe(false);
    expect(direct.technicalApproval).toBe(false);
  });
});
