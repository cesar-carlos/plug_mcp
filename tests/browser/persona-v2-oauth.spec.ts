import { test, expect } from "@playwright/test";
import { createServer, request as httpsRequest, type Server } from "node:https";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { testConfig } from "../../src/config/env.js";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { PostgresPersonaRepository } from "../../src/infrastructure/persistence/persona-v2/repository.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { CimdClient, readCimdHttps } from "../../src/infrastructure/oauth/cimd-client.js";
import { toolJson } from "../helpers/mcp-rpc.js";
import type { AdministrativePermission } from "../../src/domain/persona-v2/model.js";

const cert = await readFile(new URL("../fixtures/tls/test-cert.pem", import.meta.url));
const key = await readFile(new URL("../fixtures/tls/test-key.pem", import.meta.url));
const crypto = new NodeCryptoAdapter("02".repeat(32));
const verifier = "p".repeat(43);
const name = `oauth_browser_${randomUUID().replaceAll("-", "")}_test`;
const url = new URL(personaV2TestDatabaseUrl());
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
url.pathname = `/${name}`;
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const db = new pg.Pool({ connectionString: url.toString() });
let runtime: Awaited<ReturnType<typeof composePersonaV2>> | undefined;
let server: Server, consumer: Server;
let origin: string, clientId: string, redirectUri: string, manual: string, personaId: string;
let metadataHits = 0;
let delegatedAdministrative: AdministrativePermission[] = ["gerenciar_fontes"];
const listen = async (server: Server) => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `https://localhost:${(server.address() as AddressInfo).port}`;
};
const post = (path: string, body: Record<string, unknown>, token?: string) =>
  new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const oauth = path.startsWith("/oauth/");
    const data = oauth
      ? new URLSearchParams(body as Record<string, string>).toString()
      : JSON.stringify(body);
    const req = httpsRequest(
      `${origin}${path}`,
      {
        ca: cert,
        method: "POST",
        headers: {
          "Content-Type": oauth ? "application/x-www-form-urlencoded" : "application/json",
          "Content-Length": Buffer.byteLength(data),
          Accept: "application/json, text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        const parts: Buffer[] = [];
        res.on("data", (p: Buffer) => parts.push(p));
        res.on("error", reject);
        res.on("end", () => {
          try {
            const raw = Buffer.concat(parts).toString("utf8");
            const json =
              raw
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trim())
                .at(-1) ?? raw;
            resolve({
              status: res.statusCode!,
              body: JSON.parse(json) as Record<string, unknown>,
            });
          } catch (error) {
            reject(error instanceof Error ? error : new Error("Resposta inválida da fixture."));
          }
        });
      },
    );
    req.on("error", reject);
    req.end(data);
  });
const begin = () =>
  `${origin}/oauth/persona-v2/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", resource: `${origin}/mcp/chatgpt`, scope: "se7e:persona", code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url"), state: "browser-fixture" }).toString()}`;
test.beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  await applyPersonaMigrations(url.toString());
  server = createServer({ cert, key }, (req, res) => {
    if (runtime) {
      runtime.app(req, res);
    } else {
      res.writeHead(503).end();
    }
  });
  origin = await listen(server);
  consumer = createServer({ cert, key }, (req, res) => {
    if (req.url === "/client.json") {
      metadataHits++;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          client_id: clientId,
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: "none",
        }),
      );
    } else {
      // Callback deliberately neither logs nor persists the authorization code.
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><html lang="pt-BR"><title>Cliente de teste</title><p>Retorno recebido.</p></html>',
      );
    }
  });
  const consumerOrigin = await listen(consumer);
  clientId = `${consumerOrigin}/client.json`;
  redirectUri = `${consumerOrigin}/callback`;
  const allowed = { [clientId]: [redirectUri] };
  // Public DNS classification is synthetic; TLS, certificate validation and HTTP are native.
  const client = new CimdClient(allowed, {
    resolve: async () => [{ address: "8.8.8.8", family: 4 }],
    read: (target, _address, signal) =>
      readCimdHttps(target, { address: "127.0.0.1", family: 4 }, signal, cert),
  });
  runtime = await composePersonaV2(
    testConfig({
      PUBLIC_BASE_URL: origin,
      DATABASE_URL: url.toString(),
      MCP_ENCRYPTION_KEY: "02".repeat(32),
      PERSONA_V2_OAUTH_ENABLED: true,
      PERSONA_V2_OAUTH_CLIENTS: allowed,
    }),
    {
      oauthClient: client,
      delegationHub: {
        create: async (_jwt, input) => {
          delegatedAdministrative = [...input.administrative];
          return {
            ...input,
            id: "ad3587d0-06ce-4dd9-a949-dc069b995738",
            clientId: "browser-owner",
            credential: "pdv2_" + "d".repeat(43),
            expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
          };
        },
        verify: async (_credential, input) => ({
          ...input,
          administrative: delegatedAdministrative,
          id: "ad3587d0-06ce-4dd9-a949-dc069b995738",
          clientId: "browser-owner",
          active: true,
          expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        }),
        revoke: async () => {
          return;
        },
      },
      sourceVerifier: {
        verify: async () => ({
          database: "fixture",
          dialect: "mssql",
          identityHash: "f".repeat(64),
          verifiedAt: new Date().toISOString(),
        }),
      },
      ownerAuth: {
        hubOrigin: "https://hub.fixture.test",
        login: async () => ({ accessToken: "browser-admin-jwt" }),
        profile: async () => ({ clientId: "browser-owner", active: true }),
      },
    },
  );
  manual = crypto.randomToken(32);
  personaId = randomUUID();
  const repository = new PostgresPersonaRepository(db);
  await repository.transaction({ personaIds: [], tokenIds: [] }, async (tx) => {
    const owner = await tx.owner("https://hub.fixture.test", "browser-owner");
    await tx.createPersona({
      id: personaId,
      ownerId: owner.id,
      name: "Persona sem bases",
      specialty: "Contas",
      instructions: "Use dados publicados.",
      active: true,
      authorizationVersion: 1,
    });
    const permissions = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
    await tx.issueToken(
      {
        id: randomUUID(),
        personaId,
        tokenHash: crypto.sha256Hex(manual),
        authorizationVersion: 1,
        permissions,
        delegation: permissions,
        expiresAt: null,
        revokedAt: null,
      },
      "Browser fixture",
    );
  });
});
test.afterAll(async () => {
  for (const listener of [server, consumer]) {
    if (listener) {
      listener.closeAllConnections();
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
  }
  await runtime?.close();
  await db.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
});
test("consentimento HTTPS real, persona vazia e revogação pelo MCP", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(begin());
  const tokenInput = page.getByLabel("Token da persona");
  await expect(tokenInput).toHaveAttribute("type", "password");
  await tokenInput.fill(manual);
  await tokenInput.press("Tab");
  await page.getByRole("button", { name: "Revisar conexão" }).press("Enter");
  await expect(page.getByText("Persona sem bases", { exact: true })).toBeVisible();
  expect(await page.content()).not.toContain(manual);
  const cookies = await page.context().cookies(origin);
  expect(cookies.find((c) => c.name === "__Host-persona_oauth_v2")).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
  });
  await page.getByRole("button", { name: "Confirmar conexão" }).click();
  await page.waitForURL(`${redirectUri}?**`);
  const callback = new URL(page.url());
  expect(callback.searchParams.get("iss")).toBe(origin);
  expect(callback.searchParams.get("state")).toBe("browser-fixture");
  const exchanged = await post("/oauth/persona-v2/token", {
    grant_type: "authorization_code",
    code: callback.searchParams.get("code")!,
    client_id: clientId,
    redirect_uri: redirectUri,
    resource: `${origin}/mcp/chatgpt`,
    code_verifier: verifier,
  });
  expect(exchanged.status).toBe(200);
  const bearer = exchanged.body.access_token as string;
  const call = (name: string, args: Record<string, unknown> = {}) =>
    post(
      "/mcp/chatgpt",
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
      bearer,
    );
  const profile = await call("get_profile");
  expect(toolJson(profile.body).id).toBe(crypto.sha256Hex(`se7e:persona:profile:v2:${personaId}`));
  expect(profile.body.result).toHaveProperty("structuredContent.id");
  const revoked = await call("revogar_conexao_chatgpt", { confirmadoPeloUsuario: true });
  expect(toolJson(revoked.body)).toMatchObject({ terminal: true, otherConnectionsRevoked: false });
  expect((await call("get_profile")).status).toBe(401);
  expect(metadataHits).toBeGreaterThan(0);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});
test("cancelar não cria concessão nem deixa cookie; token inválido não é refletido", async ({
  page,
}) => {
  await page.goto(begin());
  await page.getByLabel("Token da persona").fill("invalid-secret-fixture");
  await page.getByRole("button", { name: "Revisar conexão" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await page.content()).not.toContain("invalid-secret-fixture");
  await page.goto(begin());
  await page.getByLabel("Token da persona").fill(manual);
  await page.getByRole("button", { name: "Revisar conexão" }).click();
  const before = await db.query(
    "SELECT count(*)::int AS count FROM oauth_concessao_v2 WHERE persona_id=$1",
    [personaId],
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.waitForURL(`${redirectUri}?**`);
  expect(new URL(page.url()).searchParams.get("error")).toBe("access_denied");
  expect(
    (
      await db.query("SELECT count(*)::int AS count FROM oauth_concessao_v2 WHERE persona_id=$1", [
        personaId,
      ])
    ).rows,
  ).toEqual(before.rows);
  expect(
    (await page.context().cookies(origin)).some((c) => c.name === "__Host-persona_oauth_v2"),
  ).toBe(false);
});

test("console mostra endereço OAuth vigente e copia sem Bearer", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await page.goto(`${origin}/app/`);
  await page.getByLabel("E-mail", { exact: true }).fill("owner@fixture.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("combobox", { name: "Persona", exact: true }).selectOption(personaId);
  await expect(page.getByRole("button", { name: "Sair", exact: true })).toBeEnabled();
  await page
    .getByRole("navigation", { name: "Áreas do console" })
    .getByRole("link", { name: "Tokens e conexões", exact: true })
    .click();
  await page.getByRole("tab", { name: "Conectar no ChatGPT", exact: true }).click();
  const region = page.getByRole("tabpanel", { name: "Conexão ChatGPT", exact: true });
  await expect(region).toContainText(`${origin}/mcp/chatgpt`);
  await region.getByRole("button", { name: "Copiar endereço OAuth sem token" }).click();
  await expect(region.getByRole("status")).toContainText("sem token");
  const copied = await page.evaluate(() =>
    (navigator as unknown as { clipboard: { readText(): Promise<string> } }).clipboard.readText(),
  );
  expect(JSON.parse(copied)).toMatchObject({ url: `${origin}/mcp/chatgpt`, scope: "se7e:persona" });
  expect(copied).not.toContain(manual);
});

test("delegação no console, consentimento administrativo e setup de uso único no navegador", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/app/`);
  await page.getByLabel("E-mail", { exact: true }).fill("owner@fixture.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("combobox", { name: "Persona", exact: true }).selectOption(personaId);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Áreas do console" })
    .getByRole("link", { name: "Tokens e conexões", exact: true })
    .click();
  await page.getByRole("tab", { name: "Conexões e delegação", exact: true }).click();
  const delegationPanel = page.getByRole("region", { name: "Delegação administrativa" });
  await delegationPanel.getByLabel("Iniciar cadastro e rotação de bases no navegador").check();
  await delegationPanel.getByLabel("Treinar skills nas bases selecionadas").check();
  await delegationPanel.getByLabel("Revisar, publicar e suspender skills").check();
  await page.getByRole("button", { name: "Criar delegação por 30 dias", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Confirmar delegação?" })
    .getByRole("button", { name: "Confirmar delegação", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "Delegação administrativa" })).toContainText(
    "Configurada localmente",
  );
  const administrative = crypto.randomToken(32),
    repository = new PostgresPersonaRepository(db, crypto);
  await repository.transaction({ personaIds: [personaId], tokenIds: [] }, async (tx) => {
    const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
    await tx.issueToken(
      {
        id: randomUUID(),
        personaId,
        tokenHash: crypto.sha256Hex(administrative),
        authorizationVersion: 1,
        permissions: {
          ...empty,
          administrative: ["gerenciar_fontes", "treinar", "publicar", "gerenciar_tokens"],
        },
        delegation: empty,
        expiresAt: null,
        revokedAt: null,
      },
      "Setup browser fixture",
    );
  });
  await page.goto(begin());
  await page.getByLabel("Token da persona").fill(administrative);
  await page.getByRole("button", { name: "Revisar conexão" }).click();
  await page.getByText(/^Administração: selecione somente as permissões desejadas ·/).click();
  await expect(
    page.locator('input[name="administrative"][value="gerenciar_fontes"]'),
  ).not.toBeChecked();
  await expect(page.locator('input[name="administrative"][value="treinar"]')).not.toBeChecked();
  await page.locator('input[name="administrative"][value="gerenciar_fontes"]').check();
  await page.locator('input[name="administrative"][value="treinar"]').check();
  await expect(page.locator('input[name="administrative"][value="gerenciar_tokens"]')).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Confirmar conexão" }).click();
  await page.waitForURL(`${redirectUri}?**`);
  const exchanged = await post("/oauth/persona-v2/token", {
    grant_type: "authorization_code",
    code: new URL(page.url()).searchParams.get("code")!,
    client_id: clientId,
    redirect_uri: redirectUri,
    resource: `${origin}/mcp/chatgpt`,
    code_verifier: verifier,
  });
  expect(exchanged.status).toBe(200);
  const bearer = exchanged.body.access_token as string;
  const discovered = await post(
    "/mcp/chatgpt",
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    bearer,
  );
  const tools = (discovered.body.result as { tools: { name: string }[] }).tools.map((t) => t.name);
  expect(tools).toContain("criar_rascunho_skill");
  expect(tools).not.toContain("publicar_skill");
  expect(tools).not.toContain("editar_token_delegado");
  const started = await post(
    "/mcp/chatgpt",
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "iniciar_cadastro_fonte", arguments: {} },
    },
    bearer,
  );
  const setupUrl = toolJson(started.body).url as string;
  expect(setupUrl).toMatch(/\/app\/setup\/.+#/);
  await page.goto(setupUrl);
  await expect(page).toHaveURL(setupUrl.split("#")[0]!);
  await page.getByLabel("E-mail do responsável", { exact: true }).fill("owner@fixture.test");
  await page.getByLabel("Senha do responsável", { exact: true }).fill("fixture-password");
  for (const [label, value] of Object.entries({
    Nome: "Base isolada",
    Finalidade: "Homologação",
    Ambiente: "fixture",
    AGENT_ID: randomUUID(),
    CLIENT_EMAIL: "source@fixture.test",
    CLIENT_PASSWORD: "fixture-source-password",
    CLIENT_TOKEN: "fixture-source-token",
  })) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  const responsePromise = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/app/setup/"),
  );
  await page.getByRole("button", { name: "Cadastrar base", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page.getByRole("status")).toContainText("Configuração concluída");
  expect(await page.content()).not.toContain("fixture-source-password");
  expect((await db.query("SELECT id FROM fonte WHERE persona_id=$1", [personaId])).rowCount).toBe(
    1,
  );
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await page.goto("about:blank");
  await page.goto(setupUrl);
  await expect(page.getByRole("alert")).toContainText("Configuração não concluída");
});

for (const action of ["rotate", "issue"] as const) {
  test(`setup ${action} mostra segredo somente no POST e descarta ao sair`, async ({ page }) => {
    const repo = new PostgresPersonaRepository(db, crypto);
    const ownPersona = randomUUID(),
      tokenId = randomUUID(),
      oldBearer = crypto.randomToken(32);
    delegatedAdministrative = ["gerenciar_tokens"];
    await repo.transaction({ personaIds: [], tokenIds: [] }, async (tx) => {
      const owner = await tx.owner("https://hub.fixture.test", "browser-owner");
      await tx.createPersona({
        id: ownPersona,
        ownerId: owner.id,
        name: "Rotação isolada",
        specialty: "Fixture",
        instructions: "Fixture",
        active: true,
        authorizationVersion: 1,
      });
      const permissions = {
        sourceIds: [],
        skills: [],
        externalOperationIds: [],
        administrative: ["gerenciar_tokens" as const],
      };
      await tx.issueToken(
        {
          id: tokenId,
          personaId: ownPersona,
          tokenHash: crypto.sha256Hex(oldBearer),
          authorizationVersion: 1,
          permissions,
          delegation: permissions,
          expiresAt: null,
          revokedAt: null,
        },
        "Rotação browser",
      );
      await tx.security.saveDelegation(
        {
          personaId: ownPersona,
          ownerId: owner.id,
          hubId: "ad3587d0-06ce-4dd9-a949-dc069b995738",
          administrative: ["gerenciar_tokens"],
          credentialEnc: crypto.encrypt("pdv2_" + "d".repeat(43)),
          expiresAt: new Date(Date.now() + 86400000),
          version: 1,
          revokedAt: null,
        },
        0,
      );
    });
    const started = await post(
      "/mcp",
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name:
            action === "issue" ? "iniciar_emissao_token_persona" : "iniciar_rotacao_token_persona",
          arguments:
            action === "issue"
              ? {
                  name: "Consumidor navegador",
                  expiresAt: new Date(Date.now() + 600000).toISOString(),
                  permissions: {
                    sourceIds: [],
                    skills: [],
                    externalOperationIds: [],
                    administrative: [],
                  },
                  delegation: {
                    sourceIds: [],
                    skills: [],
                    externalOperationIds: [],
                    administrative: [],
                  },
                }
              : {},
        },
      },
      oldBearer,
    );
    const setupUrl = toolJson(started.body).url as string;
    await page.goto(setupUrl);
    await expect(page).toHaveURL(setupUrl.split("#")[0]!);
    await expect(page.getByLabel("CLIENT_PASSWORD", { exact: true })).toHaveCount(0);
    await page.getByLabel("E-mail do responsável", { exact: true }).fill("owner@fixture.test");
    await page.getByLabel("Senha do responsável", { exact: true }).fill("fixture-password");
    await page
      .getByLabel(
        action === "issue"
          ? "Confirmo a emissão com estas concessões e validade."
          : "Confirmo a rotação do token e a revogação das conexões derivadas.",
      )
      .check();
    if (action === "issue") {
      await expect(
        page.getByText("Consumidor: Consumidor navegador", { exact: true }),
      ).toBeVisible();
    }
    await page
      .getByRole("button", {
        name: action === "issue" ? "Emitir token" : "Rotacionar token",
        exact: true,
      })
      .click();
    const secret = page.getByLabel("Novo token", { exact: true });
    await expect(secret).toHaveAttribute("type", "password");
    const replacement = await secret.inputValue();
    expect(await repo.authentication(crypto.sha256Hex(replacement))).not.toBeNull();
    if (action === "issue") {
      expect(await repo.authentication(crypto.sha256Hex(oldBearer))).not.toBeNull();
    } else {
      expect(await repo.authentication(crypto.sha256Hex(oldBearer))).toBeNull();
    }
    await page.getByRole("button", { name: "Revelar por 10 segundos" }).click();
    await expect(secret).toHaveAttribute("type", "text");
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    await page.goto("about:blank");
    await page.goto(setupUrl);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("Novo token", { exact: true })).toHaveCount(0);
  });
}

test("setup de integração cadastra API key e rotaciona para Basic sem expor segredos", async ({
  page,
}) => {
  const repo = new PostgresPersonaRepository(db, crypto);
  const ownPersona = randomUUID(),
    tokenId = randomUUID(),
    bearer = crypto.randomToken(32);
  delegatedAdministrative = ["gerenciar_integracoes"];
  await repo.transaction({ personaIds: [], tokenIds: [] }, async (tx) => {
    const owner = await tx.owner("https://hub.fixture.test", "browser-owner");
    await tx.createPersona({
      id: ownPersona,
      ownerId: owner.id,
      name: "Integração",
      specialty: "Fixture",
      instructions: "Fixture",
      active: true,
      authorizationVersion: 1,
    });
    const permissions = {
      sourceIds: [],
      skills: [],
      externalOperationIds: [],
      administrative: ["gerenciar_integracoes" as const],
    };
    await tx.issueToken(
      {
        id: tokenId,
        personaId: ownPersona,
        tokenHash: crypto.sha256Hex(bearer),
        authorizationVersion: 1,
        permissions,
        delegation: permissions,
        expiresAt: null,
        revokedAt: null,
      },
      "Integração browser",
    );
    await tx.security.saveDelegation(
      {
        personaId: ownPersona,
        ownerId: owner.id,
        hubId: "ad3587d0-06ce-4dd9-a949-dc069b995738",
        administrative: ["gerenciar_integracoes"],
        credentialEnc: crypto.encrypt("pdv2_" + "d".repeat(43)),
        expiresAt: new Date(Date.now() + 86400000),
        version: 1,
        revokedAt: null,
      },
      0,
    );
  });
  const start = async (name: string, args: object) =>
    toolJson(
      (
        await post(
          "/mcp",
          { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
          bearer,
        )
      ).body,
    ).url as string;
  const setupUrl = await start("iniciar_cadastro_integracao", {});
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(setupUrl);
  await page.getByLabel("E-mail do responsável", { exact: true }).fill("owner@fixture.test");
  await page.getByLabel("Senha do responsável", { exact: true }).fill("fixture-password");
  await page.getByLabel("Nome da integração", { exact: true }).fill("API de fixture");
  await page.getByLabel("Tipo", { exact: true }).selectOption("mcp_http");
  await page
    .getByLabel("Destino HTTPS público (sem query ou credenciais)", { exact: true })
    .fill("https://api.example.com/mcp");
  await page.getByLabel("Autenticação", { exact: true }).selectOption("api_key");
  await expect(page.getByLabel("Bearer da integração", { exact: true })).toBeDisabled();
  await page.getByLabel("Nome do header", { exact: true }).fill("X-Api-Key");
  await page.getByLabel("API key", { exact: true }).fill("browser-api-key-fixture");
  await page.getByLabel("Confirmo salvar esta credencial e manter a integração inativa.").check();
  await page.getByRole("button", { name: "Salvar credencial", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Credencial salva");
  expect(await page.content()).not.toContain("browser-api-key-fixture");
  const integration = (await db.query("SELECT * FROM integracao WHERE persona_id=$1", [ownPersona]))
    .rows[0]!;
  expect(integration.ativa).toBe(false);
  expect(JSON.parse(crypto.decrypt(integration.credencial_enc)).credential.credentialType).toBe(
    "api_key",
  );
  const rotation = await start("iniciar_rotacao_credenciais_integracao", {
    integrationId: integration.id,
    expectedVersion: 1,
  });
  await page.goto(rotation);
  await expect(
    page.getByText("Destino fixado: https://api.example.com/mcp", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Nome da integração", { exact: true })).toHaveCount(0);
  await page.getByLabel("E-mail do responsável", { exact: true }).fill("owner@fixture.test");
  await page.getByLabel("Senha do responsável", { exact: true }).fill("fixture-password");
  await page.getByLabel("Autenticação", { exact: true }).selectOption("basic");
  await page.getByLabel("Usuário técnico", { exact: true }).fill("fixture-user");
  await page.getByLabel("Senha técnica", { exact: true }).fill("browser-basic-fixture");
  await page.getByLabel("Confirmo salvar esta credencial e manter a integração inativa.").check();
  await page.getByRole("button", { name: "Salvar credencial", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Versão: 2");
  expect(await page.content()).not.toContain("browser-basic-fixture");
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await page.goto("about:blank");
  await page.goto(rotation);
  await expect(page.getByRole("alert")).toBeVisible();
});
