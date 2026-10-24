import type { PersonaQueryReuseStore } from "../../domain/ports/persona-query-reuse.port.js";

export interface PersonaQueryRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { NX: true; PX: number }): Promise<unknown>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}
/** Lease outlives the maximum query deadline. No expired-lease takeover by followers. */
export class PersonaRedisQueryStore implements PersonaQueryReuseStore {
  constructor(private readonly redis: PersonaQueryRedis) {}
  get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }
  async claim(key: string, owner: string): Promise<boolean> {
    return (await this.redis.set(`${key}:flight`, owner, { NX: true, PX: 120000 })) === "OK";
  }
  async publish(key: string, owner: string, value: string, ttlMs: number): Promise<boolean> {
    return (
      (await this.redis.eval(
        "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3]) redis.call('DEL',KEYS[1]) return 1",
        { keys: [`${key}:flight`, key], arguments: [owner, value, String(ttlMs)] },
      )) === 1
    );
  }
  async release(key: string, owner: string): Promise<void> {
    await this.redis.eval(
      "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
      { keys: [`${key}:flight`], arguments: [owner] },
    );
  }
}
