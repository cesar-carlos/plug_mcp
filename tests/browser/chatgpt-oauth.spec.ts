import { test, expect, type Page } from "@playwright/test";
import { createServer, request as httpsRequest, type Server } from "node:https";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { compose, type Composition } from "../../src/composition/compose.js";
import { loadConfig, testConfig } from "../../src/config/env.js";
import { applyMigrations } from "../../src/infrastructure/persistence/migrate.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";
import { completeBrowserSetup } from "../helpers/secure-setup.js";
import { sessionContext } from "../../src/application/session-context.js";

let composition: Composition, server: Server, admin: pg.Client, pool: pg.Pool;
let origin: string, callbackOrigin: string, databaseName: string, manual: string, accessId: string;
const client = "https://chatgpt.com/oauth/client.json",
  verifier = "v".repeat(43);
const cert = await readFile(new URL("../fixtures/tls/test-cert.pem", import.meta.url));
const key = await readFile(new URL("../fixtures/tls/test-key.pem", import.meta.url));
const authorization = () =>
  new URLSearchParams({
    response_type: "code",
    client_id: client,
    redirect_uri: `${callbackOrigin}/test-callback`,
    resource: `${origin}/mcp/chatgpt`,
    scope: "se7e:access",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: "synthetic-state",
  });
const api = (path: string, body?: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: Record<string, string>;
  }>((resolve, reject) => {
    const data = body
      ? path.startsWith("/oauth/")
        ? new URLSearchParams(body as Record<string, string>).toString()
        : JSON.stringify(body)
      : undefined;
    const req = httpsRequest(
      `${origin}${path}`,
      {
        ca: cert,
        method: data ? "POST" : "GET",
        headers: {
          ...(data
            ? {
                "Content-Type": path.startsWith("/oauth/")
                  ? "application/x-www-form-urlencoded"
                  : "application/json",
                "Content-Length": String(Buffer.byteLength(data)),
              }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const parts: Buffer[] = [];
        res.on("data", (p: Buffer) => parts.push(p));
        res.on("end", () => {
          const raw = Buffer.concat(parts).toString("utf8");
          const text =
            raw
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .at(-1) ?? raw;
          try {
            resolve({
              status: res.statusCode!,
              headers: res.headers,
              body:
                text && !res.headers["content-type"]?.includes("text/html") ? JSON.parse(text) : {},
            });
          } catch {
            reject(new Error("Resposta não JSON."));
          }
        });
      },
    );
    req.on("error", reject);
    req.end(data);
  });
const begin = async (page: Page) => {
  await page.goto(`${origin}/oauth/authorize?${authorization().toString()}`);
};
const authenticate = async (page: Page) => {
  await begin(page);
  await page.locator('input[name="token"]').fill(manual);
  const sent = page.waitForRequest((r) => r.url().endsWith("/oauth/authorize/authenticate"));
  await page.getByRole("button", { name: "Conferir acesso" }).click();
  expect((await (await sent).allHeaders()).origin).toBe(origin);
  await expect(page.getByText("Persona:")).toBeVisible();
};
const connect = async (page: Page) => {
  await authenticate(page);
  const response = page.waitForResponse((r) => r.url().endsWith("/oauth/authorize/consent"));
  await page.getByRole("button", { name: "Confirmar conexão" }).click();
  expect((await response).status()).toBe(303);
  await page.waitForURL(`${callbackOrigin}/test-callback?**`);
  const callback = new URL(page.url());
  expect(callback.searchParams.get("iss")).toBe(origin);
  expect(callback.searchParams.get("state")).toBe("synthetic-state");
  const exchanged = await api("/oauth/token", {
    grant_type: "authorization_code",
    client_id: client,
    redirect_uri: `${callbackOrigin}/test-callback`,
    resource: `${origin}/mcp/chatgpt`,
    code: callback.searchParams.get("code")!,
    code_verifier: verifier,
  });
  expect(exchanged.status).toBe(200);
  return exchanged.body as { access_token: string; refresh_token: string };
};
test.beforeAll(async () => {
  const environment = loadConfig();
  if (environment.NODE_ENV !== "test" || !environment.DATABASE_URL)
    throw new Error(
      "Browser requer NODE_ENV=test e DATABASE_URL de CI; cria banco efêmero próprio.",
    );
  databaseName = `se7e_browser_ci_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const adminUrl = new URL(environment.DATABASE_URL);
  adminUrl.pathname = "/postgres";
  admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${databaseName}`);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  await applyMigrations({ databaseUrl: databaseUrl.toString() });
  pool = new pg.Pool({ connectionString: databaseUrl.toString() });
  server = createServer({ cert, key }, (req, res) => composition.app(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `https://localhost:${(server.address() as AddressInfo).port}`;
  callbackOrigin = origin.replace("localhost", "127.0.0.1");
  const config = testConfig({
    DATABASE_URL: databaseUrl.toString(),
    REDIS_URL: "",
    PUBLIC_BASE_URL: origin,
    CHATGPT_OAUTH_ENABLED: true,
    CHATGPT_OAUTH_CLIENTS: { [client]: [`${callbackOrigin}/test-callback`] },
    MCP_BOOTSTRAP_RATE_LIMIT_MAX: 10000,
  });
  const plug = new FakePlugServer(),
    agentId = randomUUID();
  plug.approve(agentId);
  composition = await compose(config, {
    plug,
    logger: new SilentTestLogger(),
    oauthClient: { validate: async () => undefined },
  });
  composition.app.get("/test-callback", (req, res) => {
    // A callback nunca recebe o corpo do POST de credenciais/consentimento.
    expect(req.method).toBe("GET");
    expect(req.headers["content-length"]).toBeUndefined();
    expect(req.headers.referer).toBeUndefined();
    res.type("html").send("<p>Conexão concluída.</p>");
  });
  const registered = await composition.useCases.registrarAcesso.execute({
    email: "browser@example.test",
    senha: "synthetic-pass",
    agentId,
    clientToken: "synthetic-hub-token",
    dialeto: "postgres",
    nomeAmigavel: "Browser piloto",
  });
  accessId = registered.acessoId;
  config.CHATGPT_OAUTH_ACCESS_IDS.push(accessId);
  const setup = await sessionContext.run(
    { usuarioId: registered.usuarioId, acessoId: accessId },
    () => composition.useCases.setupOperations!.begin("rotacionar", registered.usuarioId),
  );
  const result = await completeBrowserSetup(
    composition.app,
    setup.setupUrl,
    { email: "browser@example.test", senha: "synthetic-pass" },
    origin,
  );
  if (!result.token) throw new Error("Token sintético indisponível.");
  manual = result.token;
});
test.afterAll(async () => {
  await composition?.close();
  if (server)
    await new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    });
  await pool?.end();
  if (admin) {
    if (databaseName) await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await admin.end();
  }
});

test("cookie, CSRF, nonce, consentimento e cancelamento em HTTPS", async ({ page, context }) => {
  await begin(page);
  const cookie = (await context.cookies()).find((c) => c.name === "__Host-se7e-oauth")!;
  expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: "Lax", path: "/" });
  expect(await page.evaluate("document.cookie")).not.toContain(cookie.value);
  expect(await page.locator('input[name="token"]').getAttribute("type")).toBe("password");
  await page.locator('input[name="csrf"]').evaluate((input: { value: string }) => {
    input.value = "invalid";
  });
  await page.locator('input[name="token"]').fill(manual);
  await page.getByRole("button", { name: "Conferir acesso" }).click();
  await expect(page.getByRole("button", { name: "Confirmar conexão" })).toHaveCount(0);
  await authenticate(page);
  expect(await page.content()).not.toContain(manual);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.waitForURL(`${callbackOrigin}/test-callback?**`);
  expect(new URL(page.url()).searchParams.get("error")).toBe("access_denied");
  expect((await context.cookies()).some((c) => c.name === "__Host-se7e-oauth")).toBe(false);
});

test("Origin, nonce e transação expirada bloqueiam o formulário", async ({ page, context }) => {
  await begin(page);
  const transaction = await page.locator('input[name="transaction"]').inputValue();
  const csrf = await page.locator('input[name="csrf"]').inputValue();
  const cookie = (await context.cookies()).find((c) => c.name === "__Host-se7e-oauth")!;
  const body = { transaction, csrf, token: manual };
  expect(
    (
      await api("/oauth/authorize/authenticate", body, {
        Origin: "https://other.test",
        Cookie: `${cookie.name}=${cookie.value}`,
      })
    ).status,
  ).toBe(403);
  await context.clearCookies();
  await page.locator('input[name="token"]').fill(manual);
  await page.getByRole("button", { name: "Conferir acesso" }).click();
  await expect(page.getByRole("button", { name: "Confirmar conexão" })).toHaveCount(0);
  await begin(page);
  const id = await page.locator('input[name="transaction"]').inputValue();
  await pool.query(
    "UPDATE oauth_transaction SET expires_at=now()-interval '1 second',data=jsonb_set(data,'{expiresAt}','0') WHERE id=$1",
    [id],
  );
  await page.locator('input[name="token"]').fill(manual);
  await page.getByRole("button", { name: "Conferir acesso" }).click();
  await expect(page.getByRole("button", { name: "Confirmar conexão" })).toHaveCount(0);
});

test("reenvio do consentimento e histórico não geram segundo código", async ({ page, context }) => {
  await authenticate(page);
  const transaction = await page.locator('input[name="transaction"]').inputValue(),
    csrf = await page.locator('input[name="csrf"]').inputValue();
  const cookie = (await context.cookies()).find((c) => c.name === "__Host-se7e-oauth")!;
  await page.getByRole("button", { name: "Confirmar conexão" }).click();
  await page.waitForURL(`${callbackOrigin}/test-callback?**`);
  expect(
    (
      await api(
        "/oauth/authorize/consent",
        { transaction, csrf, confirmed: "yes" },
        { Origin: origin, Cookie: `${cookie.name}=${cookie.value}` },
      )
    ).status,
  ).toBe(400);
  const historyError = await page.goBack().then(
    () => null,
    (error: unknown) => error,
  );
  if (historyError)
    expect(historyError).toMatchObject({ message: expect.stringContaining("ERR_CACHE_MISS") });
  expect(page.url()).not.toContain(manual);
  await page.close();
  const fresh = await context.newPage();
  await begin(fresh);
  await expect(fresh.locator('input[name="token"]')).toHaveValue("");
  expect(
    Number(
      (await pool.query("SELECT count(*) FROM oauth_code WHERE data->>'clientId'=$1", [client]))
        .rows[0].count,
    ),
  ).toBe(1);
});

test("refresh, replay, concessões distintas e Bearer legado", async ({ page }) => {
  const one = await connect(page),
    two = await connect(page);
  const initialize = async (token: string) =>
    api(
      "/mcp/chatgpt",
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "browser-test", version: "1" },
        },
      },
      { Authorization: `Bearer ${token}`, Accept: "application/json, text/event-stream" },
    );
  const init = await initialize(one.access_token);
  expect(init.status).toBe(200);
  const sid = String(init.headers["mcp-session-id"]);
  const profile = (token: string, session = sid) =>
    api(
      "/mcp/chatgpt",
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "get_profile", arguments: {} },
      },
      {
        Authorization: `Bearer ${token}`,
        "mcp-session-id": session,
        Accept: "application/json, text/event-stream",
      },
    );
  // SSE/JSON decoding is handled independently below by the existing integration suite; status proves session ownership.
  expect((await profile(two.access_token)).status).toBe(403);
  const refresh = await api("/oauth/token", {
    grant_type: "refresh_token",
    client_id: client,
    refresh_token: one.refresh_token,
  });
  expect(refresh.status).toBe(200);
  expect((await initialize(refresh.body.access_token!)).status).toBe(200);
  expect(
    (
      await api("/oauth/token", {
        grant_type: "refresh_token",
        client_id: client,
        refresh_token: one.refresh_token,
      })
    ).status,
  ).toBe(400);
  expect((await initialize(refresh.body.access_token!)).status).toBe(401);
  expect((await api("/oauth/revoke", { client_id: client, token: two.access_token })).status).toBe(
    200,
  );
  expect((await initialize(two.access_token)).status).toBe(401);
  expect(
    (
      await api(
        "/mcp",
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "legacy", version: "1" },
          },
        },
        { Authorization: `Bearer ${manual}`, Accept: "application/json, text/event-stream" },
      )
    ).status,
  ).toBe(200);
});
