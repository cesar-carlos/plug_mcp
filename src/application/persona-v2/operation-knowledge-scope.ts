import type { OperationPackage } from "../../domain/persona-v2/operation-training.js";

/** Declaring a training field does not grant its use in the published operation. */
export function operationKnowledgeTables(pkg: OperationPackage): readonly (Omit<
  OperationPackage["training"]["tables"][number],
  "identity"
> & {
  identity?: readonly string[];
})[] {
  const capabilities = new Set(pkg.requiredCapabilities);
  return pkg.training.tables.flatMap((table) => {
    const prefix = `source:${pkg.sourceId}:column:${table.name}.`;
    const columns = table.columns.filter(
      (column) =>
        capabilities.has(`${prefix}${column.name}:read`) ||
        capabilities.has(`${prefix}${column.name}:write`),
    );
    const used = ["select", "insert", "update", "delete"].some((effect) =>
      capabilities.has(`source:${pkg.sourceId}:table:${table.name}:${effect}`),
    );
    if (!used && columns.length === 0) {
      return [];
    }
    return [
      {
        ...table,
        columns,
        identity: table.identity.every((name) => columns.some((c) => c.name === name))
          ? table.identity
          : undefined,
      },
    ];
  });
}
