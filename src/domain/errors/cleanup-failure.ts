/** Request-local marker only: preserve the original error type without storing cleanup payloads. */
const failures = new WeakSet<object>();
export function markCleanupFailure(error: unknown): unknown {
  const original =
    error !== null && typeof error === "object"
      ? error
      : new Error("Operation and cleanup failed.");
  failures.add(original);
  return original;
}
export const hasCleanupFailure = (error: unknown): boolean =>
  error !== null && typeof error === "object" && failures.has(error);
