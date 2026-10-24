/** Run every cleanup step without hiding the failure that triggered cleanup. */
export async function cleanupFixture(
  steps: readonly (() => Promise<unknown>)[],
  primary?: { error: unknown },
): Promise<void> {
  const failures: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      [...(primary ? [primary.error] : []), ...failures],
      "Fixture cleanup failed; original failure, when present, is first.",
    );
}
