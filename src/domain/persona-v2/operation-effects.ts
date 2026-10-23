import type { OperationPackage } from "./operation-training.js";

/** Required effects of the exact published SQL contract, not a permission grant. */
export function requiredOperationEffects(
  pkg: Pick<OperationPackage, "training" | "dialect" | "sharedKnowledge">,
): ("select" | "insert" | "update" | "delete")[] {
  return [
    ...new Set([
      ...pkg.training.steps.map((step) => step.effect),
      ...(pkg.dialect === "sybase" &&
      pkg.training.steps.some((step) => step.effect !== "select" && step.outputs.length)
        ? ["select" as const]
        : []),
      ...(pkg.training.reconciliationQuery ? ["select" as const] : []),
      ...(pkg.sharedKnowledge ? ["select" as const] : []),
    ]),
  ];
}
