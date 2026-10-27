/** Format a query cell for display without interpreting domain values. */
export function displayCell(value: unknown): string {
  return value == null
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value)
      : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : "Valor não exibível";
}

/** Split a comma-separated editorial list, ignoring empty fragments. */
export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
