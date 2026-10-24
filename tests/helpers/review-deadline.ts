/** Explicit synthetic choice by fixture authors, never a product default. */
export const reviewDateFixture = (): string => new Date(Date.now() + 7 * 86400000).toISOString();
export function withReviewDeadline(path: string, body: object): object {
  return /\/(?:skills\/[^/]+|padroes\/[^/]+|perfis)\/preview$/.test(path)
    ? { reviewDueAt: reviewDateFixture(), ...body }
    : body;
}
