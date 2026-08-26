export interface QueryResultCachePort {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  deleteByPrefix(prefix: string): Promise<number>;
}
