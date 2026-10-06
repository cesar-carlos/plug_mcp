import { POLITICA_CONSULTA_DEFAULT } from "../src/domain/entities/politica-consulta.js";
import { escopoVazio } from "../src/domain/entities/escopo.js";
import {
  PostgresAuthorizedUnitOfWork,
  authorizedRepositories,
} from "../src/infrastructure/persistence/authorized-unit-of-work.js";
import { createDrizzleRepositories } from "../src/infrastructure/persistence/drizzle/repositories.js";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import { loadConfig } from "../src/config/env.js";
import { applyMigrations } from "../src/infrastructure/persistence/migrate.js";
import { createDb } from "../src/infrastructure/persistence/drizzle/db.js";
import { DrizzleMcpSetupRepository } from "../src/infrastructure/persistence/drizzle/drizzle-cofre.js";
import { PostgresOAuthStore } from "../src/infrastructure/persistence/oauth-store.js";
import { ChatGptOAuth } from "../src/application/use-cases/chatgpt-oauth.js";
import { NodeCryptoAdapter } from "../src/infrastructure/crypto/node-crypto.adapter.js";
import { sessionContext } from "../src/application/session-context.js";
import { RotacionarTokenMcp } from "../src/application/use-cases/cofre.js";
import { SetupCodeStore } from "../src/infrastructure/http/setup-code-store.js";

const config = loadConfig();
if (config.NODE_ENV !== "test" || !config.DATABASE_URL || !process.argv.includes("--ci"))
  throw new Error("OAuth PostgreSQL: NODE_ENV=test, DATABASE_URL efêmera e --ci obrigatórios.");
const name = `se7e_mcp_oauth_ci_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const adminUrl = new URL(config.DATABASE_URL);
adminUrl.pathname = "/postgres";
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${name}`;
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
let pool: pg.Pool | undefined;
try {
  await admin.query(`CREATE DATABASE ${name}`);
  await applyMigrations({
    databaseUrl: databaseUrl.toString(),
    through: "0033_lacuna_recorrencia.sql",
  });
  const seed = new pg.Client({ connectionString: databaseUrl.toString() });
  await seed.connect();
  const uid = randomUUID(),
    aid = randomUUID();
  const crypto = new NodeCryptoAdapter(config.MCP_ENCRYPTION_KEY);
  const manual = crypto.randomToken(32);
  await seed.query(
    "INSERT INTO usuario_mcp(id,email_enc,email_hash,senha_enc) VALUES($1,'enc','oauth-ci','enc')",
    [uid],
  );
  await seed.query(
    "INSERT INTO acesso(id,usuario_id,agent_id,dialeto,nome_amigavel,client_token_enc,client_token_hash,token_hash,status_acesso) VALUES($1,$2,$3,'postgres','synthetic','enc','hub-hash',$4,'approved')",
    [aid, uid, randomUUID(), crypto.sha256Hex(manual)],
  );
  await seed.end();
  await applyMigrations({ databaseUrl: databaseUrl.toString() });
  await applyMigrations({ databaseUrl: databaseUrl.toString() });
  const clientId = "https://chatgpt.com/oauth/client.json",
    redirect = "https://chatgpt.com/connector_platform_oauth_redirect";
  const policy = {
    issuer: "https://mcp.example.test",
    resource: "https://mcp.example.test/mcp/chatgpt",
    accesses: [aid],
    clients: { [clientId]: [redirect] },
  };
  const persistence = createDb(databaseUrl.toString());
  pool = persistence.pool;
  const unit = new PostgresAuthorizedUnitOfWork(pool, policy, createDrizzleRepositories);
  const accesses = authorizedRepositories(createDrizzleRepositories(persistence.db), unit).acessos,
    store = new PostgresOAuthStore(pool);
  const verifier = crypto.randomToken(32),
    challenge = (v: string): string => createHash("sha256").update(v).digest("base64url");
  const oauth = new ChatGptOAuth(
    store,
    crypto,
    accesses,
    { validate: () => Promise.resolve() },
    policy,
    challenge,
  );
  const authorization = {
    client_id: clientId,
    redirect_uri: redirect,
    resource: policy.resource,
    scope: "se7e:access",
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: challenge(verifier),
  };
  const code = async (sourceToken = manual): Promise<Record<string, string>> => {
    const start = await oauth.begin(authorization),
      consent = await oauth.authenticate(
        start.transaction.id,
        start.nonce,
        start.csrf,
        sourceToken,
      );
    const location = new URL(
      await oauth.consent(start.transaction.id, start.nonce, consent.csrf, true),
    );
    return { ...authorization, code: location.searchParams.get("code")!, code_verifier: verifier };
  };
  assert.equal((await accesses.findByTokenHash(crypto.sha256Hex(manual)))?.id, aid);
  const authCode = await code();
  const exchanges = await Promise.allSettled([oauth.exchange(authCode), oauth.exchange(authCode)]);
  assert.equal(exchanges.filter((row) => row.status === "fulfilled").length, 1);
  const first = exchanges.find((row) => row.status === "fulfilled");
  if (first?.status === "fulfilled")
    assert.equal(await oauth.resolve(first.value.access_token), null);
  const tokens = await oauth.exchange(await code());
  const refreshed = await Promise.allSettled([
    oauth.refresh({ client_id: clientId, refresh_token: tokens.refresh_token }),
    oauth.refresh({ client_id: clientId, refresh_token: tokens.refresh_token }),
  ]);
  assert.equal(refreshed.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(await oauth.resolve(tokens.access_token), null);
  const mutationTokens = await oauth.exchange(await code()),
    identity = await oauth.resolve(mutationTokens.access_token);
  assert(identity?.kind === "oauth");
  await sessionContext.run({ auth: identity, authorize: () => oauth.assert(identity) }, () =>
    accesses.updatePersona(aid, "before", null),
  );
  // Revogação já confirmada impede alterações na unidade de trabalho PostgreSQL.
  await oauth.revokeGrant(identity.grantId);
  await assert.rejects(
    sessionContext.run({ auth: identity }, () => accesses.updatePersona(aid, "forbidden", null)),
    (error: unknown) => error instanceof Error && "stage" in error && error.stage === "oauth",
  );
  await assert.rejects(
    sessionContext.run({ auth: identity }, () =>
      unit.run(identity, async (r) => {
        await r.acessos.updatePersona(aid, "forbidden-tx", null);
      }),
    ),
    (error: unknown) => error instanceof Error && "stage" in error && error.stage === "oauth",
  );
  assert.equal((await accesses.findById(aid))?.nomePersona, "before");
  // Uma transação autorizada primeiro pode concluir; a revogação aguarda seu commit.
  const concurrent = await oauth.resolve((await oauth.exchange(await code())).access_token);
  assert(concurrent?.kind === "oauth");
  let release: () => void = () => undefined,
    entered: () => void = () => undefined;
  const barrier = new Promise<void>((resolve) => {
      release = resolve;
    }),
    inside = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const mutation = sessionContext.run({ auth: concurrent }, () =>
    unit.run(concurrent, async (r) => {
      entered();
      await barrier;
      await r.acessos.updatePersona(aid, "committed", null);
    }),
  );
  await inside;
  const revoke = oauth.revokeGrant(concurrent.grantId);
  release();
  await mutation;
  await revoke;
  assert.equal((await accesses.findById(aid))?.nomePersona, "committed");
  const businessAuth = await oauth.resolve((await oauth.exchange(await code())).access_token);
  assert(businessAuth?.kind === "oauth");
  await assert.rejects(
    unit.run(businessAuth, async (r) => {
      await r.acessos.updatePersona(aid, "rollback", null);
      await r.skills.create({
        acessoId: aid,
        slug: "rollback",
        nome: "Rollback",
        descricao: "synthetic",
        sqlModelo: "SELECT SUM(1) total",
        autorUsuarioId: uid,
      });
      throw new Error("controlled rollback");
    }),
    /controlled rollback/,
  );
  assert.equal((await accesses.findById(aid))?.nomePersona, "committed");
  const all = createDrizzleRepositories(persistence.db);
  assert.equal(await all.skills.findBySlug(aid, "rollback"), null);
  const draft = await all.skills.create({
    acessoId: aid,
    slug: "race",
    nome: "Race",
    descricao: "synthetic",
    sqlModelo: "SELECT SUM(1) total",
    autorUsuarioId: uid,
  });
  await all.skills.setStatus(draft.id, "validada");
  let publishEntered!: () => void, publishRelease!: () => void;
  const publishInside = new Promise<void>((r) => {
    publishEntered = r;
  });
  const publishBarrier = new Promise<void>((r) => {
    publishRelease = r;
  });
  const publication = unit.run(businessAuth, (r) =>
    r.publicacoes.publishAtomically({
      acessoId: aid,
      skillId: draft.id,
      expectedSkillVersion: draft.versao,
      expectedActiveId: null,
      expectedBaseHash: null,
      pacote: {
        slug: draft.slug,
        nome: draft.nome,
        descricao: draft.descricao,
        sqlModelo: draft.sqlModelo,
        params: [],
        escopo: escopoVazio(),
        pacoteVersao: 2,
      },
      pacoteHash: "synthetic-approved",
      politicaConsulta: POLITICA_CONSULTA_DEFAULT,
      autorUsuarioId: uid,
      validarTestesAtuais: async () => {
        publishEntered();
        await publishBarrier;
      },
    }),
  );
  await publishInside;
  const revokePublication = oauth.revokeGrant(businessAuth.grantId);
  publishRelease();
  await publication;
  await revokePublication;
  assert((await all.publicacoes.latest(aid, draft.id))?.pacoteHash === "synthetic-approved");
  await assert.rejects(
    unit.run(businessAuth, (r) => r.skills.update(draft.id, { descricao: "forbidden" })),
    (e: unknown) => e instanceof Error && "stage" in e && e.stage === "oauth",
  );
  const removeAid = randomUUID(),
    removeToken = crypto.randomToken(32);
  await pool.query(
    "INSERT INTO acesso(id,usuario_id,agent_id,dialeto,nome_amigavel,client_token_enc,client_token_hash,token_hash,status_acesso) VALUES($1,$2,$3,'postgres','remove','enc',$4,$5,'approved')",
    [removeAid, uid, randomUUID(), randomUUID(), crypto.sha256Hex(removeToken)],
  );
  policy.accesses.push(removeAid);
  const removeAuth = await oauth.resolve(
    (await oauth.exchange(await code(removeToken))).access_token,
  );
  assert(removeAuth?.kind === "oauth");
  const crossAuth = await oauth.resolve((await oauth.exchange(await code())).access_token);
  assert(crossAuth?.kind === "oauth");
  // Ambas as operações alteram o outro acesso. A categoria inteira é bloqueada em ordem de ID.
  await Promise.all([
    unit.run(crossAuth, (r) => r.acessos.updatePersona(removeAid, "cross-one", null), [removeAid]),
    unit.run(removeAuth, (r) => r.acessos.updatePersona(aid, "cross-two", null), [aid]),
  ]);
  assert.equal((await accesses.findById(removeAid))?.nomePersona, "cross-one");
  assert.equal((await accesses.findById(aid))?.nomePersona, "cross-two");
  await assert.rejects(
    unit.run(crossAuth, () => unit.run(crossAuth, async () => undefined, [removeAid])),
    /declarados antes/,
  );
  let removeEntered!: () => void, removeRelease!: () => void;
  const removeInside = new Promise<void>((r) => {
    removeEntered = r;
  });
  const removeBarrier = new Promise<void>((r) => {
    removeRelease = r;
  });
  const removal = unit.run(removeAuth, async (r) => {
    removeEntered();
    await removeBarrier;
    await r.acessos.deleteById(removeAid);
  });
  await removeInside;
  const revokeRemoval = oauth.revokeGrant(removeAuth.grantId);
  removeRelease();
  await removal;
  await revokeRemoval;
  assert.equal(await all.acessos.findById(removeAid), null);
  const sourceTokens = await oauth.exchange(await code());
  const pending = await code();
  await pool.query("UPDATE acesso SET token_hash=$2 WHERE id=$1", [
    aid,
    crypto.sha256Hex("synthetic-replacement"),
  ]);
  await pool.query("UPDATE acesso SET token_hash=$2 WHERE id=$1", [aid, crypto.sha256Hex(manual)]);
  assert.equal(await oauth.resolve(sourceTokens.access_token), null);
  await assert.rejects(oauth.exchange(pending));
  const rollbackTokens = await oauth.exchange(await code());
  await store.revokeAll(Date.now());
  assert.equal(await oauth.resolve(rollbackTokens.access_token), null);
  const rotateIdentity = await oauth.resolve((await oauth.exchange(await code())).access_token);
  assert(rotateIdentity?.kind === "oauth");
  const delivery = new SetupCodeStore();
  const rotate = new RotacionarTokenMcp(
    accesses,
    crypto,
    delivery,
    policy.issuer,
    0,
    new DrizzleMcpSetupRepository(persistence.db),
  );
  const rotated = await sessionContext.run(
    {
      usuarioId: uid,
      acessoId: aid,
      auth: rotateIdentity,
      authorize: () => oauth.assert(rotateIdentity),
    },
    () => rotate.execute(uid),
  );
  const replacement = delivery.consume(rotated.setupCode);
  assert(replacement);
  assert.equal((await accesses.findByTokenHash(crypto.sha256Hex(replacement)))?.id, aid);
  await assert.rejects(oauth.assert(rotateIdentity));
  process.stdout.write(
    "OAuth PostgreSQL: upgrade 0033, hashes, código/refresh concorrentes, unidade de trabalho explícita, rollback multirrepositório e corridas de publicação/remoção/rotação aprovados.\n",
  );
} finally {
  await pool?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
