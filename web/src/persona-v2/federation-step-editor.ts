import { stepColumns, type TrainingStep } from "./federation-editor";

export const federationStepLabels: { readonly [K in TrainingStep["kind"]]: string } = {
  local: "Consulta local",
  join: "Relacionar",
  union: "Unir linhas",
  project: "Projetar campos",
  aggregate: "Agregar",
  sort: "Ordenar",
};

export function nextFederationStepId(steps: readonly Pick<TrainingStep, "id">[]): string {
  let n = 1;
  while (steps.some((step) => step.id === `step_${n}`)) {
    n++;
  }
  return `step_${n}`;
}

export function moveFederationStep<T>(
  steps: readonly T[],
  index: number,
  offset: number,
): T[] | undefined {
  const next = [...steps];
  const target = index + offset;
  if (target < 0 || target >= next.length) {
    return undefined;
  }
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function federationColumnChoices(
  steps: readonly TrainingStep[],
  stepId: string,
  extras: readonly string[] = [],
): string[] {
  return [...new Set([...stepColumns(steps, stepId), ...extras])];
}
