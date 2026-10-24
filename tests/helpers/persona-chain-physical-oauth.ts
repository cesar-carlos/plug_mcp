import type { Express } from "express";
import { createHash, randomUUID } from "node:crypto";
import request from "supertest";
import { expect } from "vitest";
import { parseMcpPayload } from "./mcp-rpc.js";
import type { PersonaRepositoryPort } from "../../src/domain/ports/persona-v2.port.js";
import { exerciseExampleInactivation } from "./persona-chain-example-inactivation.js";

export const physicalOAuthClient = "https://client.fixture.test/client.json";
export const physicalOAuthRedirect = "https://client.fixture.test/callback";

/** HTTP OAuth with persistent grants and real hub authority; client metadata alone is a fixture. */
export async function exercisePhysicalOAuth(
  app: Express,
  bearer: string,
  sourceId: string,
  skillId: string,
  bearerIds: readonly string[],
  bearerCursor: string,
  editorial: { repository: PersonaRepositoryPort; personaId: string },
): Promise<void> {
  const origin = "https://mcp.fixture.test";
  const resource = `${origin}/mcp/chatgpt`;
  const root = "/oauth/persona-v2";
  const hidden = (html: string, name: string) => {
    const value = new RegExp(`name="${name}" value="([^"]+)"`).exec(html)?.[1];
    expect(value).toBeTruthy();
    return value!;
  };
  const post = (path: string, body: object, cookie?: string) => {
    const req = request(app).post(path).set("Host", "mcp.fixture.test").set("Origin", origin);
    if (cookie) req.set("Cookie", cookie);
    return req.type("form").send(body);
  };
  const connect = async (training = true, source = true) => {
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
    const consent = await post(
      `${root}/consent`,
      {
        transaction,
        csrf: hidden(review.text, "csrf"),
        confirmed: "yes",
        ...(source ? { sources: sourceId } : {}),
        skills: skillId,
        ...(training ? { administrative: "treinar" } : {}),
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
  const call = async (token: string, name: string, args: object, manual = false) => {
    const response = await request(app)
      .post(manual ? "/mcp" : "/mcp/chatgpt")
      .set("Host", "mcp.fixture.test")
      .set("Authorization", `Bearer ${token}`)
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "tools/call",
        params: { name, arguments: args },
      });
    if (response.status === 401) return { denied: true, value: response.body };
    expect(response.status).toBe(200);
    const payload = parseMcpPayload(response);
    if (payload.error) return { denied: true, value: payload.error };
    const result = payload.result as { isError?: boolean; content: { text: string }[] };
    return { denied: result.isError === true, value: JSON.parse(result.content[0]!.text) };
  };
  const list = (token: string, before?: string, manual = false) =>
    call(
      token,
      "listar_minhas_propostas_particularidade",
      { skillId, ...(before ? { before } : {}) },
      manual,
    );
  const a = await connect(),
    b = await connect(),
    limited = await connect(false),
    withoutSource = await connect(true, false);
  const ids: string[] = [];
  for (let index = 0; index < 21; index++) {
    const proposed = await call(a, "propor_particularidade_fisica", {
      skillId,
      summary: `Proposta OAuth A ${index}`,
      change: { kind: "regra", value: "Orientação explícita da conexão A" },
    });
    expect(proposed.denied).toBe(false);
    ids.push(proposed.value.proposalId);
  }
  const other = await call(b, "propor_particularidade_fisica", {
    skillId,
    summary: "Proposta OAuth B",
    change: { kind: "regra", value: "Orientação da conexão B" },
  });
  expect(other.denied).toBe(false);
  const first = await list(a);
  expect(first.denied).toBe(false);
  expect(first.value.proposals).toHaveLength(20);
  expect(first.value.nextCursor).toBeTruthy();
  const last = await list(a, first.value.nextCursor);
  expect(last.denied).toBe(false);
  expect(last.value.proposals).toHaveLength(1);
  expect(last.value.nextCursor).toBeNull();
  const rows = [...first.value.proposals, ...last.value.proposals];
  expect(rows.map((p) => p.proposalId).sort()).toEqual([...ids].sort());
  for (const row of rows)
    expect(Object.keys(row).sort()).toEqual(
      ["proposalId", "state", "version", "hash", "createdAt", "reviewedAt", "published"].sort(),
    );
  const otherList = await list(b);
  expect(otherList.denied).toBe(false);
  expect(
    Array.from(otherList.value.proposals as { proposalId: string }[], (p) => p.proposalId),
  ).toEqual([other.value.proposalId]);
  expect((await list(b, first.value.nextCursor)).denied).toBe(true);
  expect((await list(a, other.value.proposalId)).denied).toBe(true);
  expect((await list(a, bearerCursor)).denied).toBe(true);
  expect((await list(bearer, first.value.nextCursor, true)).denied).toBe(true);
  expect((await list(limited)).denied).toBe(true);
  expect((await list(limited, first.value.nextCursor)).denied).toBe(true);
  const own = { skillId, proposalId: ids[0], includeContent: true };
  expect((await call(a, "obter_proposta_particularidade", own)).denied).toBe(false);
  expect((await call(b, "obter_proposta_particularidade", own)).denied).toBe(true);
  const assertEditorialRevoked = await exerciseExampleInactivation(
    editorial.repository,
    editorial.personaId,
    skillId,
    (name, args) => call(a, name, args),
    {
      prefix: "oauth",
      deniedCalls: [limited, withoutSource].map((token) => (name, args) => call(token, name, args)),
    },
  );
  const revoked = await post(`${root}/revoke`, { client_id: physicalOAuthClient, token: a });
  expect(revoked.status).toBe(200);
  await assertEditorialRevoked();
  expect((await list(a)).denied).toBe(true);
  expect((await list(a, first.value.nextCursor)).denied).toBe(true);
  const surviving = await list(b);
  expect(surviving.denied).toBe(false);
  expect(surviving.value.proposals).toEqual(otherList.value.proposals);
  const manualFirst = await list(bearer, undefined, true);
  const manualLast = await list(bearer, manualFirst.value.nextCursor, true);
  expect(manualFirst.denied || manualLast.denied).toBe(false);
  expect(
    [...manualFirst.value.proposals, ...manualLast.value.proposals]
      .map((p: { proposalId: string }) => p.proposalId)
      .sort(),
  ).toEqual([...bearerIds].sort());
}
