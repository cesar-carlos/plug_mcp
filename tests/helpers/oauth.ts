import { randomBytes } from "node:crypto";
import request from "supertest";
import type { Express } from "express";
import { expect } from "vitest";
import { pkceChallengeFromVerifier } from "../../src/infrastructure/oauth/jwt.js";

export const oauthLoginAndToken = async (
  app: Express,
  email = "user@test.local",
  password = "password1",
): Promise<string> => {
  await request(app)
    .post("/oauth/signup")
    .type("form")
    .send({ email, password, next: "/" })
    .redirects(0);

  const agent = request.agent(app);
  await agent.post("/oauth/signup").type("form").send({ email, password, next: "/" });
  const login = await agent.post("/oauth/login").type("form").send({ email, password, next: "/" });
  expect(login.status).toBeLessThan(400);

  const redirectUri = "http://localhost/cb";
  const register = await request(app)
    .post("/oauth/register")
    .send({
      client_name: "test",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
    });
  const clientId = register.body.client_id as string;
  const verifier = randomBytes(32).toString("base64url");
  const challenge = pkceChallengeFromVerifier(verifier);

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

  const token = await request(app).post("/oauth/token").type("form").send({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  });
  return token.body.access_token as string;
};
