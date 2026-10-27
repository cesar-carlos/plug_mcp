import type { OperationCase } from "../../../src/application/persona-v2/operation-cases";
import {
  datasetCompositionSeedsSchema,
  type DatasetCompositionSeeds,
} from "../../../src/domain/persona-v2/dataset-composition";
import {
  directOperationDatasetSeedsSchema,
  type DirectOperationDatasetSeeds,
} from "../../../src/domain/persona-v2/direct-operation-dataset";
import type { TypedScalar } from "../../../src/domain/persona-v2/operation";
import {
  operationDatasetSeedsSchema,
  type OperationDatasetSeeds,
} from "../../../src/domain/persona-v2/operation-dataset";
import { scalar, type OperationTraining } from "./operation-editor";

export type { OperationCase };
export type OperationCaseDatasetSeeds =
  OperationDatasetSeeds | DirectOperationDatasetSeeds | DatasetCompositionSeeds;
export type OperationCaseExpectedError = "INVALID_PLAN" | "NATIVE_FAILURE" | "ROW_CONDITION_FAILED";

export function emptyOperationCase(training: Pick<OperationTraining, "parameters">): OperationCase {
  return {
    name: "",
    input: {
      parameters: Object.fromEntries(
        training.parameters.map((parameter) => [parameter.name, scalar(parameter.type)]),
      ),
      fixtures: [],
    },
    expected: { affectedRows: 1, tables: [] },
  };
}

export function cloneOperationCase(content: unknown): OperationCase {
  return JSON.parse(JSON.stringify(content)) as OperationCase;
}

export function operationCaseFingerprint(
  required: boolean,
  content: OperationCase | undefined,
): string {
  return JSON.stringify({ required, content });
}

export function isOperationCaseDirty(input: {
  current: OperationCase | undefined;
  fingerprint: string;
  saved: string;
  removeConfirmed: boolean;
}): boolean {
  return (!!input.current && input.fingerprint !== input.saved) || input.removeConfirmed;
}

export function operationCaseParameterType(
  training: Pick<OperationTraining, "parameters">,
  name: string,
  value: TypedScalar,
): Exclude<TypedScalar["type"], "null"> {
  const declared = training.parameters.find((parameter) => parameter.name === name)?.type;
  return declared ?? (value.type === "null" ? "string" : value.type);
}

export function operationCaseExpectedKind(
  expected: OperationCase["expected"],
): "success" | OperationCaseExpectedError {
  return "error" in expected ? expected.error : "success";
}

export function operationCaseExpectedResult(kind: string): OperationCase["expected"] {
  return kind === "success"
    ? { affectedRows: 1, tables: [] }
    : { error: kind as OperationCaseExpectedError };
}

export function writeOperationCaseOperationId(current: OperationCase, value: string): void {
  current.input.operationId = value || undefined;
}

export function writeOperationCaseStepSql(
  current: OperationCase,
  stepId: string,
  value: string,
): void {
  current.input.sqlByStep ??= {};
  if (value) {
    current.input.sqlByStep[stepId] = value;
    return;
  }
  delete current.input.sqlByStep[stepId];
}

export function applyOperationCaseDataset(
  current: OperationCase,
  value: OperationCaseDatasetSeeds,
): void {
  if (value.origin.format === "operation-dataset-composition-v1") {
    const copy = datasetCompositionSeedsSchema.parse(value);
    if (copy.origin.format !== "operation-dataset-composition-v1") {
      return;
    }
    current.input.fixtures = copy.fixtures;
    current.editorialOrigin = copy.origin;
    return;
  }
  const copy =
    value.origin.format === "operation-direct-dataset-case-origin-v1"
      ? directOperationDatasetSeedsSchema.parse(value)
      : operationDatasetSeedsSchema.parse(value);
  current.input.fixtures = copy.fixtures;
  current.editorialOrigin = copy.origin;
}
