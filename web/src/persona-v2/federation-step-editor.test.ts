import { expect, it } from "vitest";
import { newStep, stepColumns } from "./federation-editor";
import {
  federationColumnChoices,
  federationStepLabels,
  moveFederationStep,
  nextFederationStepId,
} from "./federation-step-editor";
import { federationTraining } from "../../../tests/helpers/persona-v2-federation";

const refs = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    publicationId: "22222222-2222-4222-8222-222222222222",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    publicationId: "44444444-4444-4444-8444-444444444444",
  },
];

it("rótulos cobrem cada tipo de etapa sem inventar SQL", () => {
  expect(Object.keys(federationStepLabels)).toEqual([
    "local",
    "join",
    "union",
    "project",
    "aggregate",
    "sort",
  ]);
  expect(federationStepLabels.local).toBe("Consulta local");
});

it("próximo identificador usa o menor step_n livre", () => {
  expect(nextFederationStepId([])).toBe("step_1");
  expect(nextFederationStepId([newStep("local", "step_1")])).toBe("step_2");
  expect(nextFederationStepId([newStep("join", "step_2")])).toBe("step_1");
});

it("mover etapa respeita os extremos e troca só a ordem local", () => {
  const steps = ["a", "b", "c"];
  expect(moveFederationStep(steps, 0, -1)).toBeUndefined();
  expect(moveFederationStep(steps, 2, 1)).toBeUndefined();
  expect(moveFederationStep(steps, 1, -1)).toEqual(["b", "a", "c"]);
  expect(steps).toEqual(["a", "b", "c"]);
});

it("escolhas de coluna preservam extras e não inferem etapa ausente", () => {
  const steps = federationTraining(refs).steps;
  expect(federationColumnChoices(steps, "a")).toEqual(stepColumns(steps, "a"));
  expect(federationColumnChoices(steps, "a", ["ghost"])).toEqual(["id", "amount", "ghost"]);
  expect(federationColumnChoices(steps, "absent", ["kept"])).toEqual(["kept"]);
});
