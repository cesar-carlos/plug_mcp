import express from "express";
import request from "supertest";
import { expect, it, vi } from "vitest";
import { registerPersonaOAuthRoutes as register } from "../../../src/infrastructure/http/persona-v2-oauth.js";

it("correlaciona falhas temporárias sem expor credenciais nem pedir reconexão", async () => {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  const fail = async () => {
    throw Error("private-fixture");
  };
  const warn = vi.fn();
  register(
    app,
    {
      policy: { issuer: "https://example.test", resource: "https://example.test/mcp" },
      begin: fail,
      token: fail,
    } as unknown as Parameters<typeof register>[1],
    {} as Parameters<typeof register>[2],
    undefined,
    { warn } as unknown as NonNullable<Parameters<typeof register>[4]>,
  );
  const html = await request(app)
    .get("/oauth/persona-v2/authorize")
    .set("Host", "example.test")
    .expect(503);
  expect(html.text).toContain(html.headers["x-support-id"]);
  expect(html.text).not.toMatch(/reinicie|reconect|private-fixture/i);
  const token = await request(app)
    .post("/oauth/persona-v2/token")
    .set("Host", "example.test")
    .type("form")
    .send({ grant_type: "refresh_token", refresh_token: "private-fixture" })
    .expect(503);
  expect(token.body).toEqual({ error: "temporarily_unavailable" });
  expect(warn).toHaveBeenCalledWith(
    "persona-v2 oauth failed",
    expect.objectContaining({ supportId: token.headers["x-support-id"], stage: "refresh" }),
  );
  expect(JSON.stringify(warn.mock.calls)).not.toContain("private-fixture");
});
