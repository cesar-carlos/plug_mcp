export interface HitBusca<T> {
  readonly item: T;
  readonly rank: number;
}

export const clampRankFts = (rank: number): number => {
  if (!Number.isFinite(rank) || rank <= 0) {
    return 0;
  }
  return Math.min(rank, 0.999);
};

export const rankFromTermScore = (score: number, termCount: number): number => {
  if (termCount <= 0 || score <= 0) {
    return 0;
  }
  return Math.min(score / termCount, 0.999);
};
