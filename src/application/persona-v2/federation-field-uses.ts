import type { FederationPackage } from "../../domain/persona-v2/catalog.js";
import type { FieldUse } from "../../domain/persona-v2/field-use.js";

/** Tracks local output lineage through the declarative combination, including renamed fields. */
export function federationFieldUses(
  steps: FederationPackage["steps"],
): Record<string, Record<string, FieldUse[]>> {
  interface Origin {
    step: string;
    column: string;
  }
  const lineage = new Map<string, Record<string, Origin[]>>();
  const required: Record<string, Record<string, FieldUse[]>> = {};
  const fields = (step: string) => lineage.get(step) ?? {};
  const origins = (step: string, column: string) => fields(step)[column] ?? [];
  const use = (items: Origin[], purpose: FieldUse) => {
    for (const item of items) {
      const uses = ((required[item.step] ??= {})[item.column] ??= []);
      if (!uses.includes(purpose)) uses.push(purpose);
    }
  };
  for (const step of steps) {
    let output: Record<string, Origin[]>;
    switch (step.kind) {
      case "local":
        output = Object.fromEntries(
          step.columns.map((column) => [column, [{ step: step.id, column }]]),
        );
        break;
      case "join":
        for (const key of step.keys) {
          use(origins(step.left, key.left), "join");
          use(origins(step.right, key.right), "join");
        }
        output = Object.fromEntries(
          step.columns.map((c) => [
            c.as,
            origins(c.side === "left" ? step.left : step.right, c.column),
          ]),
        );
        break;
      case "project":
        output = Object.fromEntries(step.columns.map((c) => [c.as, origins(step.input, c.column)]));
        break;
      case "union":
        output = Object.fromEntries(
          Object.keys(fields(step.inputs[0]!)).map((column) => [
            column,
            step.inputs.flatMap((input) => origins(input, column)),
          ]),
        );
        break;
      case "aggregate":
        output = Object.fromEntries(
          step.dimensions.map((column) => [column, origins(step.input, column)]),
        );
        for (const column of step.dimensions) use(origins(step.input, column), "agrupamento");
        for (const measure of step.measures) {
          const items = measure.column
            ? origins(step.input, measure.column)
            : Object.values(fields(step.input)).flat();
          use(items, "agrupamento");
          output[measure.as] = items;
        }
        break;
      case "sort":
        output = fields(step.input);
        for (const order of step.order) use(origins(step.input, order.column), "ordenacao");
        break;
    }
    lineage.set(step.id, output);
  }
  return required;
}
