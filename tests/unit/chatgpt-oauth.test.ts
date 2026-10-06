import { describe, expect, it, vi } from "vitest";
import { oauthFixture } from "../helpers/oauth-fixture.js";
import { sessionContext } from "../../src/application/session-context.js";
import { queryCacheKey } from "../../src/application/use-cases/shared/query-cache-key.js";
import { createToolRunner, errorResult } from "../../src/infrastructure/mcp/tool-result.js";
import { testConfig } from "../../src/config/env.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";

describe("delegação OAuth ChatGPT", () => {
  it("indisponibilidade da persistência não é classificada como token inválido", async () => {
    const f = await oauthFixture(),
      tokens = await f.oauth.exchange(await f.authorize());
    const outage = new Error("synthetic database unavailable");
    const source = vi.spyOn(f.accesses, "findById").mockRejectedValue(outage);
    await expect(f.oauth.resolve(tokens.access_token)).rejects.toBe(outage);
    source.mockRestore();
    const transaction = f.store.transaction.bind(f.store);
    vi.spyOn(f.store, "transaction").mockImplementation((aid, gid, operation) =>
      transaction(aid, gid, (tx) => operation({ ...tx, source: () => Promise.reject(outage) })),
    );
    await expect(
      f.oauth.refresh({ client_id: f.params.client_id, refresh_token: tokens.refresh_token }),
    ).rejects.toBe(outage);
    expect((await f.store.list("grant"))[0]?.revokedAt).toBeUndefined();
  });
  it("mantém Bearer original, limita a um acesso e guarda somente hashes", async () => {
    const f = await oauthFixture(),
      params = await f.authorize(),
      tokens = await f.oauth.exchange(params);
    const auth = await f.oauth.resolve(tokens.access_token);
    expect(auth).toMatchObject({
      kind: "oauth",
      acessoId: f.acesso.id,
      usuarioId: f.acesso.usuarioId,
    });
    expect((await f.accesses.findByTokenHash(f.crypto.sha256Hex(f.manual)))?.id).toBe(f.acesso.id);
    const saved = JSON.stringify(await f.store.list("grant"));
    for (const secret of [f.manual, params.code, tokens.access_token, tokens.refresh_token])
      expect(saved).not.toContain(secret);
    expect(tokens.expires_in).toBe(900);
  });
  it.each(["manual", "rotated", "revoked", "expired", "outside"])(
    "recusa autenticação inválida: %s",
    async (mode) => {
      const f = await oauthFixture(),
        start = await f.oauth.begin(f.params);
      if (mode === "rotated") await f.accesses.updateTokenHash(f.acesso.id, "new-hash");
      if (mode === "revoked") await f.accesses.updateStatus(f.acesso.id, "revoked");
      if (mode === "expired")
        await f.accesses.updateTokenHash(f.acesso.id, f.acesso.tokenHash, new Date(0));
      if (mode === "outside") f.policy.accesses.length = 0;
      await expect(
        f.oauth.authenticate(
          start.transaction.id,
          start.nonce,
          start.csrf,
          mode === "manual" ? "wrong" : f.manual,
        ),
      ).rejects.toMatchObject({ code: "access_denied" });
    },
  );
  it("nonce e CSRF não podem ser substituídos ou reutilizados", async () => {
    const f = await oauthFixture(),
      start = await f.oauth.begin(f.params);
    await expect(
      f.oauth.authenticate(start.transaction.id, "wrong", start.csrf, f.manual),
    ).rejects.toMatchObject({ code: "invalid_request" });
    const auth = await f.oauth.authenticate(
      start.transaction.id,
      start.nonce,
      start.csrf,
      f.manual,
    );
    await expect(
      f.oauth.consent(start.transaction.id, start.nonce, start.csrf, true),
    ).rejects.toMatchObject({ code: "invalid_request" });
    const location = new URL(
      await f.oauth.consent(start.transaction.id, start.nonce, auth.csrf, false),
    );
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("iss")).toBe(f.policy.issuer);
    await expect(
      f.oauth.consent(start.transaction.id, start.nonce, auth.csrf, true),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
  it("expira navegador e código sem emitir credenciais", async () => {
    const f = await oauthFixture(),
      start = await f.oauth.begin(f.params);
    f.advance(900_001);
    await expect(
      f.oauth.authenticate(start.transaction.id, start.nonce, start.csrf, f.manual),
    ).rejects.toMatchObject({ code: "invalid_request" });
    const code = await f.authorize();
    f.advance(60_001);
    await expect(f.oauth.exchange(code)).rejects.toMatchObject({ code: "invalid_grant" });
    expect(await f.store.list("grant")).toHaveLength(0);
  });
  it.each([
    "client_id",
    "redirect_uri",
    "resource",
    "scope",
    "code_challenge",
    "code_challenge_method",
    "response_type",
  ])("valida %s no início", async (key) => {
    const f = await oauthFixture();
    await expect(f.oauth.begin({ ...f.params, [key]: "wrong" })).rejects.toBeInstanceOf(Error);
  });
  it.each(["client_id", "redirect_uri", "resource", "code_verifier"])(
    "troca incorreta de %s não revoga outra concessão",
    async (key) => {
      const f = await oauthFixture(),
        code = await f.authorize(),
        tokens = await f.oauth.exchange(code);
      await expect(f.oauth.exchange({ ...code, [key]: "wrong" })).rejects.toMatchObject({
        code: "invalid_grant",
      });
      expect(await f.oauth.resolve(tokens.access_token)).not.toBeNull();
    },
  );
  it("resgate concorrente de código emite uma vez e detecta replay vinculado", async () => {
    const f = await oauthFixture(),
      params = await f.authorize();
    const results = await Promise.allSettled([f.oauth.exchange(params), f.oauth.exchange(params)]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    const success = results.find((row) => row.status === "fulfilled");
    expect(success?.status).toBe("fulfilled");
    if (success?.status === "fulfilled")
      expect(await f.oauth.resolve(success.value.access_token)).toBeNull();
  });
  it("refresh mantém concessão e replay revoga toda família", async () => {
    const f = await oauthFixture(),
      tokens = await f.oauth.exchange(await f.authorize()),
      auth = await f.oauth.resolve(tokens.access_token);
    const params = { client_id: f.params.client_id, refresh_token: tokens.refresh_token };
    const next = await f.oauth.refresh(params);
    expect(await f.oauth.resolve(next.access_token)).toMatchObject({
      grantId: auth?.kind === "oauth" ? auth.grantId : "",
    });
    await expect(f.oauth.refresh(params)).rejects.toMatchObject({ code: "invalid_grant" });
    expect(await f.oauth.resolve(next.access_token)).toBeNull();
    expect(await f.oauth.resolve(tokens.access_token)).toBeNull();
  });
  it("refresh concorrente e validade absoluta são fechados", async () => {
    const f = await oauthFixture(),
      tokens = await f.oauth.exchange(await f.authorize());
    const params = { client_id: f.params.client_id, refresh_token: tokens.refresh_token };
    expect(
      (await Promise.allSettled([f.oauth.refresh(params), f.oauth.refresh(params)])).filter(
        (r) => r.status === "fulfilled",
      ),
    ).toHaveLength(1);
    const other = await f.oauth.exchange(await f.authorize());
    f.advance(30 * 86_400_000);
    await expect(
      f.oauth.refresh({ ...params, refresh_token: other.refresh_token }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });
  it("concessão nunca ultrapassa validade do token MCP", async () => {
    const f = await oauthFixture();
    await f.accesses.updateTokenHash(
      f.acesso.id,
      f.acesso.tokenHash,
      new Date(Date.now() + 30_000),
    );
    const tokens = await f.oauth.exchange(await f.authorize());
    expect(tokens.expires_in).toBeLessThanOrEqual(30);
    f.advance(31_000);
    expect(await f.oauth.resolve(tokens.access_token)).toBeNull();
  });
  it("rotação, retirada de allowlist e rollback invalidam concessões duravelmente", async () => {
    const f = await oauthFixture(),
      one = await f.oauth.exchange(await f.authorize()),
      pending = await f.authorize();
    f.policy.accesses.length = 0;
    await f.oauth.reconcile();
    f.policy.accesses.push(f.acesso.id);
    expect(await f.oauth.resolve(one.access_token)).toBeNull();
    await expect(f.oauth.exchange(pending)).rejects.toMatchObject({ code: "invalid_grant" });
    const next = await f.oauth.exchange(await f.authorize());
    await f.store.revokeAll(Date.now());
    expect(await f.oauth.resolve(next.access_token)).toBeNull();
    const rotated = await f.oauth.exchange(await f.authorize());
    await f.accesses.updateTokenHash(f.acesso.id, "new-version");
    expect(await f.oauth.resolve(rotated.access_token)).toBeNull();
  });
  it("revogar uma concessão preserva outra e não oferece oracle", async () => {
    const f = await oauthFixture(),
      one = await f.oauth.exchange(await f.authorize()),
      two = await f.oauth.exchange(await f.authorize());
    await f.oauth.revoke(one.refresh_token, f.params.client_id);
    await f.oauth.revoke("unknown", f.params.client_id);
    expect(await f.oauth.resolve(one.access_token)).toBeNull();
    expect(await f.oauth.resolve(two.access_token)).not.toBeNull();
  });
  it("cache/singleflight isola concessões e mantém a chave no refresh", async () => {
    const f = await oauthFixture(),
      one = await f.oauth.exchange(await f.authorize()),
      two = await f.oauth.exchange(await f.authorize());
    const auth1 = await f.oauth.resolve(one.access_token),
      auth2 = await f.oauth.resolve(two.access_token);
    const key = () =>
      queryCacheKey({
        usuarioId: f.acesso.usuarioId,
        acessoId: f.acesso.id,
        clientTokenHash: "hub",
        agentId: f.acesso.agentId,
        skillIds: [],
        skillVersoes: [],
        sql: "SELECT 1",
        params: {},
        maxRows: 5,
        timezone: null,
      });
    expect(sessionContext.run({ auth: auth1 ?? undefined }, key)).not.toBe(
      sessionContext.run({ auth: auth2 ?? undefined }, key),
    );
    const next = await f.oauth.refresh({
      client_id: f.params.client_id,
      refresh_token: one.refresh_token,
    });
    expect(sessionContext.run({ auth: auth1 ?? undefined }, key)).toBe(
      sessionContext.run({ auth: (await f.oauth.resolve(next.access_token)) ?? undefined }, key),
    );
  });
  it("revogação durante execução bloqueia entrega e erro hub não pede OAuth", async () => {
    const f = await oauthFixture(),
      token = await f.oauth.exchange(await f.authorize()),
      auth = await f.oauth.resolve(token.access_token);
    if (auth?.kind !== "oauth") throw new Error("missing identity");
    await sessionContext.run({ auth, authorize: () => f.oauth.assert(auth) }, async () => {
      const result = await createToolRunner(testConfig(), new SilentTestLogger())(
        "query",
        async () => {
          await f.oauth.revokeGrant(auth.grantId);
          return { secretData: "never-delivered" };
        },
      );
      expect(JSON.stringify(result)).not.toContain("never-delivered");
      expect(result._meta).toHaveProperty("mcp/www_authenticate");
      expect(errorResult(DomainError.unauthenticated(), testConfig())._meta).toBeUndefined();
    });
  });
});
