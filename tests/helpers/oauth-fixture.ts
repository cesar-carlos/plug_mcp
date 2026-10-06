import { createHash, randomUUID } from "node:crypto";
import { ChatGptOAuth } from "../../src/application/use-cases/chatgpt-oauth.js";
import { MemoryOAuthStore } from "../../src/infrastructure/persistence/oauth-store.js";
import { InMemoryAcessoRepository } from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";

export const oauthFixture = async () => {
  const crypto = new NodeCryptoAdapter(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );
  const accesses = new InMemoryAcessoRepository();
  const manual = crypto.randomToken(32);
  const acesso = await accesses.create({
    usuarioId: randomUUID(),
    agentId: randomUUID(),
    dialeto: "postgres",
    nomeAmigavel: "Financeiro",
    clientTokenEnc: "encrypted",
    clientTokenHash: "client-hash",
    tokenHash: crypto.sha256Hex(manual),
    tokenExpiresAt: null,
    statusAcesso: "approved",
  });
  const clientId = "https://chatgpt.com/oauth/client.json",
    redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect";
  const policy = {
    issuer: "https://mcp.example.test",
    resource: "https://mcp.example.test/mcp/chatgpt",
    accesses: [acesso.id],
    clients: { [clientId]: [redirectUri] },
  };
  let now = Date.now();
  const store = new MemoryOAuthStore(accesses);
  const verifier = crypto.randomToken(32);
  const hash = (value: string) => createHash("sha256").update(value).digest("base64url");
  const oauth = new ChatGptOAuth(
    store,
    crypto,
    accesses,
    { validate: async () => undefined },
    policy,
    hash,
    () => now,
  );
  const params = {
    client_id: clientId,
    redirect_uri: redirectUri,
    resource: policy.resource,
    scope: "se7e:access",
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: hash(verifier),
    state: "opaque-client-state",
  };
  const authorize = async () => {
    const start = await oauth.begin(params);
    const consent = await oauth.authenticate(start.transaction.id, start.nonce, start.csrf, manual);
    const redirect = new URL(
      await oauth.consent(start.transaction.id, start.nonce, consent.csrf, true),
    );
    return {
      ...params,
      code: redirect.searchParams.get("code")!,
      code_verifier: verifier,
      grant_type: "authorization_code",
    };
  };
  return {
    accesses,
    acesso,
    manual,
    crypto,
    store,
    oauth,
    policy,
    params,
    verifier,
    authorize,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
};
