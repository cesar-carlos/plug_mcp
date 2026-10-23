import type { Express } from "express";
import { createHash, randomUUID } from "node:crypto";
import request from "supertest";
import { expect } from "vitest";
import { parseMcpPayload } from "./mcp-rpc.js";
import { physicalOAuthClient, physicalOAuthRedirect } from "./persona-chain-physical-oauth.js";

/** HTTP consent/PKCE with persisted grants; reading needs no administrative consent. */
export async function exerciseKnowledgeHistoryOAuth(
  app: Express,
  bearer: string,
  sourceId: string,
  oldSkill: string,
  newSkill: string,
  revokeOriginator: () => Promise<void>,
  paginated?: { skillIds: string[]; expectedOrder: string[] },
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
  const connect = async (skills: string[], source = true) => {
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
        skills,
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
  if (paginated) {
    const a = await connect(paginated.skillIds);
    const b = await connect(paginated.skillIds);
    const limited = await connect([oldSkill]);
    const withoutSource = await connect(paginated.skillIds, false);
    const list = (token: string, cursor?: string) =>
      call(token, "listar_historico_conhecimento", {
        skillId: oldSkill,
        ...(cursor ? { afterSkillId: cursor } : {}),
      });
    const first = await list(a);
    expect(first.denied).toBe(false);
    expect(first.value.versions).toHaveLength(20);
    const cursor = first.value.nextCursor as string;
    expect(cursor).toBeTruthy();
    const last = await list(a, cursor);
    expect(last.denied).toBe(false);
    expect(last.value.versions).toHaveLength(2);
    expect(last.value.nextCursor).toBeNull();
    const rows = [...first.value.versions, ...last.value.versions] as { skillId: string }[];
    expect(rows.map((v) => v.skillId)).toEqual(paginated.expectedOrder);
    expect(new Set(rows.map((v) => v.skillId)).size).toBe(22);
    expect((await list(b, cursor)).value).toEqual(last.value);
    expect((await list(limited, cursor)).denied).toBe(true);
    expect((await list(withoutSource, cursor)).denied).toBe(true);
    const input = { fromSkillId: oldSkill, toSkillId: newSkill };
    const compared = await call(a, "comparar_conhecimento", input);
    expect(compared.denied).toBe(false);
    expect(compared.value.grantsExecution).toBe(false);
    expect(compared.value.changes).toContainEqual({ section: "label", before: "v1", after: "v2" });
    const reverse = await call(a, "comparar_conhecimento", {
      fromSkillId: newSkill,
      toSkillId: oldSkill,
    });
    expect(reverse.denied).toBe(false);
    expect(reverse.value.changes).toEqual(
      (compared.value.changes as { section: string; before: unknown; after: unknown }[]).map(
        ({ section, before, after }) => ({ section, before: after, after: before }),
      ),
    );
    expect((await call(limited, "comparar_conhecimento", input)).denied).toBe(true);
    expect((await call(withoutSource, "comparar_conhecimento", input)).denied).toBe(true);
    expect(
      (await post(`${root}/revoke`, { client_id: physicalOAuthClient, token: a })).status,
    ).toBe(200);
    expect((await list(a, cursor)).denied).toBe(true);
    expect((await call(a, "comparar_conhecimento", input)).denied).toBe(true);
    expect((await list(b, cursor)).value).toEqual(last.value);
    expect((await call(bearer, "comparar_conhecimento", input, true)).value).toEqual(
      compared.value,
    );
    await revokeOriginator();
    expect((await list(b, cursor)).denied).toBe(true);
    expect((await list(limited)).denied).toBe(true);
    expect((await call(b, "comparar_conhecimento", input)).denied).toBe(true);
    expect((await call(bearer, "comparar_conhecimento", input, true)).denied).toBe(true);
    return;
  }
  const a = await connect([oldSkill, newSkill]);
  const b = await connect([oldSkill, newSkill]);
  const limited = await connect([oldSkill]);
  const withoutSource = await connect([oldSkill, newSkill], false);
  const list = (token: string, skillId = oldSkill, afterSkillId?: string, manual = false) =>
    call(
      token,
      "listar_historico_conhecimento",
      { skillId, ...(afterSkillId ? { afterSkillId } : {}) },
      manual,
    );
  const first = await list(a);
  expect(first.denied).toBe(false);
  expect(Array.from(first.value.versions as { skillId: string }[], (v) => v.skillId)).toEqual([
    newSkill,
    oldSkill,
  ]);
  expect(first.value.catalogBrowsing).toBe(false);
  expect(JSON.stringify(first.value)).not.toContain("sqlModel");
  const continuation = await list(a, oldSkill, newSkill);
  expect(continuation.denied).toBe(false);
  expect(
    Array.from(continuation.value.versions as { skillId: string }[], (v) => v.skillId),
  ).toEqual([oldSkill]);
  const restricted = await list(limited);
  expect(restricted.denied).toBe(false);
  expect(Array.from(restricted.value.versions as { skillId: string }[], (v) => v.skillId)).toEqual([
    oldSkill,
  ]);
  expect((await list(limited, newSkill)).denied).toBe(true);
  expect((await list(limited, oldSkill, newSkill)).denied).toBe(true);
  expect((await list(withoutSource)).denied).toBe(true);
  expect((await list(a, randomUUID())).denied).toBe(true);
  const compare = (token: string, fromSkillId = oldSkill, toSkillId = newSkill, manual = false) =>
    call(token, "comparar_conhecimento", { fromSkillId, toSkillId }, manual);
  const comparison = await compare(a);
  expect(comparison.denied).toBe(false);
  expect(comparison.value.from.skillId).toBe(oldSkill);
  expect(comparison.value.to.skillId).toBe(newSkill);
  expect(comparison.value.from.publicationId).toBe(first.value.versions[1].publicationId);
  expect(comparison.value.to.publicationId).toBe(first.value.versions[0].publicationId);
  expect(comparison.value.catalogBrowsing).toBe(false);
  expect(comparison.value.grantsExecution).toBe(false);
  interface Change {
    section: string;
    before: unknown;
    after: unknown;
  }
  const changes = comparison.value.changes as Change[];
  expect(changes.some((change) => change.section === "label")).toBe(true);
  const reverse = await compare(a, newSkill, oldSkill);
  expect(reverse.denied).toBe(false);
  expect(reverse.value.changes).toEqual(
    changes.map(({ section, before, after }) => ({
      section,
      before: after,
      after: before,
    })),
  );
  expect((await compare(a, oldSkill, oldSkill)).value.changes).toEqual([]);
  expect((await compare(limited)).denied).toBe(true);
  expect((await compare(limited, newSkill, oldSkill)).denied).toBe(true);
  expect((await compare(withoutSource)).denied).toBe(true);
  expect((await compare(a, oldSkill, randomUUID())).denied).toBe(true);
  expect((await compare(b)).value).toEqual(comparison.value);
  expect((await compare(bearer, oldSkill, newSkill, true)).value).toEqual(comparison.value);
  // History is authorized shared metadata, not a connection-owned proposal.
  expect((await list(b)).value).toEqual(first.value);
  const revoked = await post(`${root}/revoke`, { client_id: physicalOAuthClient, token: a });
  expect(revoked.status).toBe(200);
  expect((await compare(a)).denied).toBe(true);
  expect((await compare(b)).value).toEqual(comparison.value);
  expect((await compare(bearer, oldSkill, newSkill, true)).value).toEqual(comparison.value);
  expect((await list(a)).denied).toBe(true);
  expect((await list(a, oldSkill, newSkill)).denied).toBe(true);
  expect((await list(b)).value).toEqual(first.value);
  expect((await list(bearer, oldSkill, undefined, true)).value).toEqual(first.value);
  await revokeOriginator();
  expect((await compare(b)).denied).toBe(true);
  expect((await compare(limited, oldSkill, oldSkill)).denied).toBe(true);
  expect((await compare(bearer, oldSkill, newSkill, true)).denied).toBe(true);
  expect((await list(b)).denied).toBe(true);
  expect((await list(b, oldSkill, newSkill)).denied).toBe(true);
  expect((await list(limited)).denied).toBe(true);
  expect((await list(bearer, oldSkill, undefined, true)).denied).toBe(true);
}
