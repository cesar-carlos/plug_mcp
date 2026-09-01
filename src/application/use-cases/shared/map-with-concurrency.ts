/**
 * Executa `mapper` sobre `items` com no máximo `concurrency` promessas in-flight.
 * Preserva a ordem dos resultados. O caller isola falha no mapper (allSettled).
 */
export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<readonly R[]> => {
  if (items.length === 0) {
    return [];
  }
  const results: R[] = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  const workers = Array.from({ length: workerCount }, async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      const item = items[index];
      if (item === undefined) {
        return;
      }
      results[index] = await mapper(item, index);
    }
  });
  await Promise.all(workers);
  return results;
};
