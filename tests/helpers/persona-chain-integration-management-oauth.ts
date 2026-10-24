import type { Express } from "express";
import { createHash, randomUUID } from "node:crypto";
import request from "supertest";
import { expect } from "vitest";
import { physicalOAuthClient, physicalOAuthRedirect } from "./persona-chain-physical-oauth.js";

/** Persistent consent and HTTP management; optional TLS discovery, no business effects. */
export async function exerciseIntegrationManagementOAuth(
  app: Express,
  bearer: string,
  integrationId: string,
  hiddenId: string,
  draftId?: string,
  discoveryId?: string,
): Promise<() => Promise<void>> {
  const root = "/oauth/persona-v2";
  const resource = "https://mcp.fixture.test/mcp/chatgpt";
  const hidden = (html: string, name: string) => {
    const value = new RegExp(`name="${name}" value="([^"]+)"`).exec(html)?.[1];
    expect(value).toBeTruthy();
    return value!;
  };
  const post = (path: string, body: object, cookie?: string) => {
    const req = request(app)
      .post(path)
      .set("Host", "mcp.fixture.test")
      .set("Origin", "https://mcp.fixture.test");
    if (cookie) req.set("Cookie", cookie);
    return req.type("form").send(body);
  };
  const connect = async (scope: string[], administrative: boolean) => {
    const verifier = createHash("sha256").update(randomUUID()).digest("base64url");
    const start = await request(app)
      .get(`${root}/authorize`)
      .set("Host", "mcp.fixture.test")
      .query({
        client_id: physicalOAuthClient,
        redirect_uri: physicalOAuthRedirect,
        response_type: "code",
        scope: "se7e:persona",
        resource,
        code_challenge_method: "S256",
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      });
    expect(start.status).toBe(200);
    const cookie = (start.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
    const transaction = hidden(start.text, "transaction");
    const review = await post(
      `${root}/authenticate`,
      {
        transaction,
        csrf: hidden(start.text, "csrf"),
        token: bearer,
      },
      cookie,
    );
    expect(review.status).toBe(200);
    expect(review.text).toContain(`value="${integrationId}"`);
    expect(review.text).not.toContain(`name="managedIntegrations" value="${hiddenId}"`);
    const consent = await post(
      `${root}/consent`,
      {
        transaction,
        csrf: hidden(review.text, "csrf"),
        confirmed: "yes",
        managedIntegrations: scope,
        ...(administrative
          ? {
              administrative: [
                "gerenciar_integracoes",
                ...(draftId ? ["treinar", "publicar"] : []),
              ],
            }
          : {}),
      },
      cookie,
    );
    expect(consent.status).toBe(303);
    const tokens = await post(`${root}/token`, {
      client_id: physicalOAuthClient,
      redirect_uri: physicalOAuthRedirect,
      grant_type: "authorization_code",
      resource,
      code: new URL(consent.headers.location!).searchParams.get("code"),
      code_verifier: verifier,
    });
    expect(tokens.status).toBe(200);
    return tokens.body.access_token as string;
  };
  const list = (token: string) =>
    request(app)
      .get("/api/consumer/oauth/administration/integracoes")
      .set("Host", "mcp.fixture.test")
      .set("Origin", "https://mcp.fixture.test")
      .set("Authorization", `Bearer ${token}`);
  const a = await connect([integrationId, hiddenId], true);
  const b = await connect([integrationId], true);
  const noScope = await connect([], true);
  const noPermission = await connect([integrationId], false);
  const listing = await list(a);
  expect({ status: listing.status, error: listing.body.error }).toMatchObject({ status: 200 });
  const visible = listing.body.integrations as { id: string }[];
  expect(visible.map((v) => v.id)).toEqual([integrationId]);
  expect((await list(noScope)).body.integrations).toEqual([]);
  expect((await list(noPermission)).status).toBe(403);
  const schema = {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  };
  const importDocument = (token: string, id = integrationId) =>
    request(app)
      .post("/api/consumer/oauth/administration/integracoes/importar")
      .set("Host", "mcp.fixture.test")
      .set("Origin", "https://mcp.fixture.test")
      .set("Authorization", `Bearer ${token}`)
      .send({
        kind: "openapi",
        integrationId: id,
        version: 1,
        document: {
          openapi: "3.1.0",
          paths: {
            "/lookup": {
              get: {
                responses: {
                  200: { description: "Fixture", content: { "application/json": { schema } } },
                },
              },
            },
          },
        },
      });
  const imported = await importDocument(b);
  expect(imported.status).toBe(200);
  expect(imported.body.connection.id).toBe(integrationId);
  expect(imported.body.candidates).toHaveLength(1);
  expect(imported.body.candidates[0].proposal.transport).toEqual({
    kind: "rest",
    method: "GET",
    path: "/lookup",
  });
  for (const token of [noScope, noPermission]) {
    const refused = await importDocument(token);
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("AUTHORIZATION_DENIED");
  }
  expect((await importDocument(b, hiddenId)).status).toBe(403);
  let checkDiscoveryRevoked = () => Promise.resolve();
  if (discoveryId) {
    const discover = (token: string) =>
      request(app)
        .post("/api/consumer/oauth/administration/integracoes/importar")
        .set("Host", "mcp.fixture.test")
        .set("Origin", "https://mcp.fixture.test")
        .set("Authorization", `Bearer ${token}`)
        .send({ kind: "mcp", integrationId: discoveryId, version: 1, confirmed: "discover" });
    const d = await connect([discoveryId], true);
    const e = await connect([discoveryId], true);
    const discovered = await discover(d);
    expect(discovered.status).toBe(200);
    expect(discovered.body.connection.id).toBe(discoveryId);
    expect(discovered.body.candidates).toHaveLength(2);
    expect((await discover(b)).status).toBe(403);
    expect((await discover(noPermission)).status).toBe(403);
    expect(
      (await post(`${root}/revoke`, { client_id: physicalOAuthClient, token: d })).status,
    ).toBe(200);
    expect((await discover(d)).status).toBe(403);
    expect((await discover(e)).status).toBe(200);
    checkDiscoveryRevoked = async () => {
      const denied = await discover(e);
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe("AUTHORIZATION_DENIED");
    };
  }
  const readDraft = (token: string) =>
    request(app)
      .get(`/api/consumer/oauth/administration/external-skills/${draftId}`)
      .set("Host", "mcp.fixture.test")
      .set("Origin", "https://mcp.fixture.test")
      .set("Authorization", `Bearer ${token}`);
  if (draftId) {
    const draft = await readDraft(b);
    expect(draft.status).toBe(200);
    expect(draft.body).toMatchObject({
      skillId: draftId,
      revision: 3,
      name: "Revisão persistente",
      published: false,
    });
    expect((await readDraft(noScope)).status).toBe(403);
    expect((await readDraft(noPermission)).status).toBe(403);
    const action = (token: string, suffix: string, body: object) =>
      request(app)
        .post(`/api/consumer/oauth/administration/external-skills/${draftId}/${suffix}`)
        .set("Host", "mcp.fixture.test")
        .set("Origin", "https://mcp.fixture.test")
        .set("Authorization", `Bearer ${token}`)
        .send(body);
    expect((await action(noScope, "preview", {})).status).toBe(403);
    expect((await action(noPermission, "preview", {})).status).toBe(403);
    const preview = await action(b, "preview", {});
    expect(preview.status).toBe(200);
    const confirmation = { confirmationHash: preview.body.confirmationHash };
    const other = await action(a, "publicar", confirmation);
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe("OPERATION_CONFLICT");
    const publication = await action(b, "publicar", confirmation);
    expect(publication.status).toBe(200);
    expect(publication.body.skillId).toBe(draftId);
    expect((await action(b, "publicar", confirmation)).status).toBe(409);
    expect((await readDraft(b)).body.published).toBe(true);
  }
  const review = await request(app)
    .get(`/api/consumer/oauth/administration/integracoes/${integrationId}/impacto`)
    .set("Host", "mcp.fixture.test")
    .set("Origin", "https://mcp.fixture.test")
    .set("Authorization", `Bearer ${b}`);
  expect(review.status).toBe(200);
  const input = {
    expectedVersion: review.body.connection.managementVersion,
    fingerprint: review.body.fingerprint,
    confirmed: true,
  };
  const recover = () =>
    request(app)
      .post(`/api/consumer/oauth/administration/integracoes/${integrationId}/recuperar`)
      .set("Host", "mcp.fixture.test")
      .set("Origin", "https://mcp.fixture.test")
      .set("Authorization", `Bearer ${b}`)
      .send(input);
  expect((await post(`${root}/revoke`, { client_id: physicalOAuthClient, token: a })).status).toBe(
    200,
  );
  const revoked = await list(a);
  expect(revoked.status).toBe(403);
  expect(revoked.body.error.code).toBe("AUTHORIZATION_DENIED");
  expect((await importDocument(a)).status).toBe(403);
  expect((await importDocument(b)).status).toBe(200);
  if (draftId) expect((await readDraft(a)).status).toBe(403);
  expect((await list(b)).status).toBe(200);
  return async () => {
    await checkDiscoveryRevoked();
    const deniedImport = await importDocument(b);
    expect(deniedImport.status).toBe(403);
    expect(deniedImport.body.error.code).toBe("AUTHORIZATION_DENIED");
    const deniedList = await list(b);
    expect(deniedList.status).toBe(403);
    expect(deniedList.body.error.code).toBe("AUTHORIZATION_DENIED");
    const deniedRecovery = await recover();
    expect(deniedRecovery.status).toBe(403);
    expect(deniedRecovery.body.error.code).toBe("AUTHORIZATION_DENIED");
    if (draftId) {
      const deniedDraft = await readDraft(b);
      expect(deniedDraft.status).toBe(403);
      expect(deniedDraft.body.error.code).toBe("AUTHORIZATION_DENIED");
    }
  };
}
