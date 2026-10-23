import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import type { StructureContent } from "../../domain/persona-v2/shared-knowledge.js";

export interface StructureChange {
  readonly kind: "added" | "removed" | "changed";
  readonly path: string;
}

/** Compares definitions only; it never decides compatibility or adopts a version. */
export const compareStructureContent = (
  before: StructureContent,
  after: StructureContent,
): readonly StructureChange[] => {
  const changes: StructureChange[] = [];
  const keyedArrays: Readonly<Record<string, string>> = {
    tables: "id",
    columns: "name",
    physicalNames: "dialect",
    relationships: "id",
    examples: "id",
    variants: "dialect",
    parameters: "name",
    nativeTypes: "dialect",
  };
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const visit = (previous: unknown, next: unknown, path: string): void => {
    if (canonicalJson(previous ?? null) === canonicalJson(next ?? null)) return;
    const key = keyedArrays[path.split("/").at(-1)!];
    if (Array.isArray(previous) && Array.isArray(next) && key) {
      const index = (values: readonly unknown[]): Map<string, unknown> =>
        new Map(values.map((value) => [String((value as Record<string, unknown>)[key]), value]));
      const left = index(previous),
        right = index(next);
      for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
        visit(left.get(id), right.get(id), `${path}/${id}`);
      }
    } else if (object(previous) && object(next)) {
      for (const field of [...new Set([...Object.keys(previous), ...Object.keys(next)])].sort()) {
        visit(previous[field], next[field], path ? `${path}/${field}` : field);
      }
    } else {
      changes.push({
        kind: previous === undefined ? "added" : next === undefined ? "removed" : "changed",
        path,
      });
    }
  };
  visit(before, after, "");
  return changes;
};
