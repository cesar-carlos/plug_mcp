import { describe, expect, it } from "vitest";
import request from "supertest";
import { testConfig } from "../../src/config/env.js";
import { compose } from "../../src/composition/compose.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";

describe("Origin e token MCP", () => {
  it("Origin fora da lista devolve 403", async () => {
    const plug = new FakePlugServer();
    const { app, close } = await compose(
      testConfig({ MCP_ALLOWED_ORIGINS: "https://ok.example" }),
      { plug },
    );
    try {
      const res = await request(app)
        .post("/mcp")
        .set("Origin", "https://evil.example")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: "origin_not_allowed" });
    } finally {
      await close();
    }
  });
});
