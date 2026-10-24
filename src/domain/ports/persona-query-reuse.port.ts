export interface PhysicalQueryFence {
  revision: string;
  writePending: boolean;
}
/** Optimization only. Each caller must authorize before lookup and before delivery. */
export interface PersonaQueryReusePort {
  run<T>(
    material: string,
    deadline: number,
    produce: () => Promise<T>,
  ): Promise<{ value: T; kind: "fresh" | "cache" | "singleflight" }>;
}
/** Opaque keys and encrypted values only; the namespace never overlaps legacy storage. */
export interface PersonaQueryReuseStore {
  get(key: string): Promise<string | null>;
  claim(key: string, owner: string): Promise<boolean>;
  publish(key: string, owner: string, value: string, ttlMs: number): Promise<boolean>;
  release(key: string, owner: string): Promise<void>;
}
