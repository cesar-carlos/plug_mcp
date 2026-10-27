import type { Training } from "./model";

export type QueryResourceType = NonNullable<Training["tables"][number]["resourceType"]>;
export type QueryExampleState = NonNullable<NonNullable<Training["examples"]>[number]["state"]>;

const QUERY_EXAMPLE_STATES: readonly QueryExampleState[] = [
  "candidate",
  "approved",
  "inactive",
  "replaced",
];

export function queryResourceType(value: string): QueryResourceType {
  return value === "view" ? "view" : "table";
}

export function queryExampleState(value: string): QueryExampleState {
  return QUERY_EXAMPLE_STATES.find((state) => state === value) ?? "approved";
}

export function queryRulesFromText(value: string): string[] {
  return value.split("\n").filter((line) => line.trim());
}

export function queryAttachmentMib(bytes: number): number {
  return bytes / 1048576;
}

export function queryAttachmentBytes(value: string): number {
  return Number(value) * 1048576;
}

export function queryAttachmentMinutes(ttlMs: number): number {
  return ttlMs / 60000;
}

export function queryAttachmentTtlMs(value: string): number {
  return Number(value) * 60000;
}

export function queryHasPendingName(names: readonly string[], current: string): boolean {
  return Boolean(current) && !names.includes(current);
}

export function queryColumnsForTable(
  columns: Training["columns"],
  table: string,
): Training["columns"] {
  return columns.filter((column) => column.table === table);
}

export function queryDiagramNodes(tables: Training["tables"]): { id: string; name: string }[] {
  return tables.map((item) => ({ id: item.name, name: item.name }));
}
