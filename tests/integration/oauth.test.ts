import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { compose } from "../../src/composition/compose.js";
import { testConfig } from "../../src/config/env.js";
import { pkceChallengeFromVerifier } from "../../src/infrastructure/oauth/jwt.js";
import { InMemoryOAuthStore } from "../../src/infrastructure/oauth/memory-oauth-store.js";
import { safeNext } from "../../src/infrastructure/oauth/oauth-router.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { oauthLoginAndToken } from "../helpers/oauth.js";

describe("OAuth 2.1", () => {
  it("DCR + authorization code + PKCE emite JWT", async () => {
    const { app, close } = await compose(testConfig(), { plug: new FakePlugServer() });
    try {
      const token = await oauthLoginAndToken(app, "oauth@test.local", "password1");
      expect(token.split(".")).toHaveLength(3);
      const unauth = await request(app)
        .post("/mcp")
        .send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
      expect(unauth.status).toBe(401);
      expect(unauth.headers["www-authenticate"]).toContain("Bearer");
    } finally {
      await close();
    }
  });

  it("client confidencial precisa do client_secret correto para trocar o code", async () => {
    const { app, close } = await compose(testConfig(), { plug: new FakePlugServer() });
    try {
      const agent = request.agent(app);
      await agent
        .post("/oauth/signup")
        .type("form")
        .send({ email: "confidential@test.local", password: "password1", next: "/" });

      const redirectUri = "http://localhost/cb";
      const register = await request(app)
        .post("/oauth/register")
        .send({
          client_name: "confidential-test",
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: "client_secret_post",
        });
      const clientId = register.body.client_id as string;
      const clientSecret = register.body.client_secret as string;
      expect(clientSecret).toBeTruthy();

      const verifier = randomBytes(32).toString("base64url");
      const challenge = pkceChallengeFromVerifier(verifier);

      const getCode = async (): Promise<string> => {
        const authorize = await agent.get("/oauth/authorize").query({
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: challenge,
          code_challenge_method: "S256",
          state: "s1",
        });
        const location = authorize.headers.location!;
        const code = new URL(location).searchParams.get("code");
        if (!code) throw new Error("no code");
        return code;
      };

      const withoutSecret = await request(app)
        .post("/oauth/token")
        .type("form")
        .send({
          grant_type: "authorization_code",
          code: await getCode(),
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: verifier,
        });
      expect(withoutSecret.status).toBe(401);

      const withWrongSecret = await request(app)
        .post("/oauth/token")
        .type("form")
        .send({
          grant_type: "authorization_code",
          code: await getCode(),
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: "wrong-secret",
          code_verifier: verifier,
        });
      expect(withWrongSecret.status).toBe(401);

      const withCorrectSecret = await request(app)
        .post("/oauth/token")
        .type("form")
        .send({
          grant_type: "authorization_code",
          code: await getCode(),
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
          code_verifier: verifier,
        });
      expect(withCorrectSecret.status).toBe(200);
      expect(withCorrectSecret.body.access_token).toBeTruthy();
    } finally {
      await close();
    }
  });

  it("rejeita open redirect em next=//evil.com após login", async () => {
    const { app, close } = await compose(testConfig(), { plug: new FakePlugServer() });
    try {
      const res = await request(app)
        .post("/oauth/signup")
        .type("form")
        .send({ email: "redirect@test.local", password: "password1", next: "//evil.com" })
        .redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/");
    } finally {
      await close();
    }
  });

  it("safeNext rejeita protocol-relative e scheme", () => {
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("/oauth/authorize?foo=1")).toBe("/oauth/authorize?foo=1");
  });

  it("consumeCode é de uso único mesmo com chamadas concorrentes", async () => {
    const store = new InMemoryOAuthStore();
    await store.saveCode({
      code: "once",
      clientId: "c1",
      accountId: "a1",
      redirectUri: "http://localhost/cb",
      codeChallenge: "ch",
      resource: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const [first, second] = await Promise.all([
      store.consumeCode("once"),
      store.consumeCode("once"),
    ]);
    const hits = [first, second].filter(Boolean);
    expect(hits).toHaveLength(1);
    expect(await store.consumeCode("once")).toBeNull();
  });
});
