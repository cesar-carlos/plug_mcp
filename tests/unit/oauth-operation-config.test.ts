import { describe, expect, it } from "vitest";
import { testConfig } from "../../src/config/env.js";
import { MemoryRateLimitStore } from "../../src/infrastructure/http/rate-limit.js";
import { RedisRateLimitStore } from "../../src/infrastructure/http/redis-rate-limit.store.js";

describe("operação OAuth", () => {
  it("exige HTTPS/PostgreSQL e permite preparar discovery com allowlists vazias", () => {
    expect(testConfig().CHATGPT_OAUTH_ENABLED).toBe(false);
    const input = {
      CHATGPT_OAUTH_ENABLED: true,
      PUBLIC_BASE_URL: "https://synthetic.example.test",
    };
    expect(testConfig(input).CHATGPT_OAUTH_ACCESS_IDS).toEqual([]);
    expect(() =>
      testConfig({ ...input, PUBLIC_BASE_URL: "http://synthetic.example.test" }),
    ).toThrow("HTTPS");
    expect(() =>
      testConfig({ ...input, DATABASE_URL: "sqlite://synthetic", NODE_ENV: "production" }),
    ).toThrow("PostgreSQL");
    expect(() => testConfig({ ...input, DATABASE_URL: undefined, NODE_ENV: "production" })).toThrow(
      "PostgreSQL",
    );
    expect(() =>
      testConfig({
        ...input,
        CHATGPT_OAUTH_CLIENTS: {
          "https://synthetic-client.test": ["https://user:password@synthetic-client.test/callback"],
        },
      }),
    ).toThrow();
  });
  it("falha Redis preserva quota local já consumida e não reinicia limites", async () => {
    let outage = false;
    const client = {
      eval: () =>
        outage ? Promise.reject(new Error("synthetic outage")) : Promise.resolve([1, 10000]),
    };
    const store = new RedisRateLimitStore(client, new MemoryRateLimitStore());
    const key = "mcp:grant:synthetic-stable-grant";
    expect((await store.hit(key, 10000, 2)).allowed).toBe(true);
    outage = true;
    expect((await store.hit(key, 10000, 2)).allowed).toBe(true);
    expect((await store.hit(key, 10000, 2)).allowed).toBe(false);
  });
});
