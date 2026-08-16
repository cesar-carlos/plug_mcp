import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { compose } from "../../src/composition/compose.js";
import { testConfig } from "../../src/config/env.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { oauthLoginAndToken } from "../helpers/oauth.js";

describe("rate limit /mcp", () => {
  let close: () => Promise<void> = async () => undefined;

  afterAll(async () => {
    await close();
  });

  it("devolve 429 quando o teto de /mcp é atingido", async () => {
    const composed = await compose(testConfig({ MCP_RATE_LIMIT_MAX: 1 }), {
      plug: new FakePlugServer(),
    });
    close = composed.close;
    const token = await oauthLoginAndToken(composed.app);

    const first = await request(composed.app)
      .post("/mcp")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "rate-limit", version: "0.1.0" },
        },
      });
    expect(first.status).not.toBe(429);

    const second = await request(composed.app)
      .post("/mcp")
      .set("Authorization", `Bearer ${token}`)
      .send({ jsonrpc: "2.0", id: 2, method: "ping" });
    expect(second.status).toBe(429);
    expect(second.body).toMatchObject({ error: "rate_limited" });
    expect(second.headers["retry-after"]).toBeTruthy();
  });
});
