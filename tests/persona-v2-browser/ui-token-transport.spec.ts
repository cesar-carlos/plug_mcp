import { expect, test } from "@playwright/test";
import { createServer, request as httpRequest, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { createPersonaAdministrationApp } from "../../src/infrastructure/http/persona-v2-admin.js";
import type { PersonaAdministration } from "../../src/application/persona-v2/administration.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";
import { TOKEN_JSON_BYTES } from "../../src/domain/persona-v2/admin-request-limits.js";

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture sem porta local");
  return address.port;
}
async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

// Real browser, forwarding proxy and HTTP parsers/CSRF; synthetic application services only.
// This is not evidence for the deployed Nginx, PostgreSQL or production authority.
test("tamanho, delegação, recusa e recuperação pelo navegador/proxy/HTTP", async ({ page }) => {
  const personaId = randomUUID(),
    skillId = randomUUID(),
    sourceId = randomUUID();
  const path = `/api/admin/personas/${personaId}/tokens`;
  const logger = new SilentTestLogger();
  let backendPort = 0,
    proxyLimit = Number.MAX_SAFE_INTEGER,
    issued = 0,
    attempts = 0;
  const proxy = createServer((req, res) => {
    if (req.method === "POST" && req.url === path) attempts++;
    if (Number(req.headers["content-length"] ?? 0) > proxyLimit) {
      req.resume();
      res.writeHead(413, { "Content-Type": "text/html" }).end("<html>proxy limit</html>");
      return;
    }
    const upstream = httpRequest(
      {
        hostname: "127.0.0.1",
        port: backendPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502).end();
    });
    req.pipe(upstream);
  });
  const port = await listen(proxy);
  const origin = `http://127.0.0.1:${port}`;
  const administration = {
    login: async () => ({ sessionId: "a".repeat(43), expiresAt: new Date(Date.now() + 600000) }),
    listTokens: async () => [],
    issueToken: async () => {
      issued++;
      return { tokenId: randomUUID(), bearer: "synthetic-fixture-token" };
    },
  } as unknown as PersonaAdministration;
  const backend = createServer(
    createPersonaAdministrationApp({
      administration,
      crypto: new NodeCryptoAdapter("a".repeat(64)),
      publicBaseUrl: origin,
      ready: async () => true,
      logger,
    }),
  );
  try {
    backendPort = await listen(backend);
    const publication = {
      id: randomUUID(),
      revision: 1,
      suspendedAt: null,
      hash: "synthetic",
      package: {
        format: "persona-query-v2",
        name: "Consulta sintética",
        sourceId,
        requiredCapabilities: [
          "field-use:fixture:dbo.pedidos.total:projecao",
          "field-use:fixture:dbo.pedidos.total:filtro",
          ...Array.from({ length: 1400 }, (_, i) => `cap-${i}-${"a".repeat(390)}`),
        ],
      },
    };
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/admin/login" || url.pathname === path) return route.continue();
      let json: unknown = {};
      if (url.pathname === "/api/admin/personas")
        json = {
          personas: [
            {
              id: personaId,
              name: "Fixture transporte",
              specialty: "Testes",
              active: true,
              instructions: "",
              authorizationVersion: 1,
            },
          ],
        };
      else if (url.pathname.endsWith("/fontes")) json = { fontes: [] };
      else if (url.pathname.endsWith("/skills"))
        json = {
          skills: [
            {
              id: skillId,
              name: "Consulta sintética",
              kind: "consulta",
              activePublicationId: publication.id,
            },
          ],
        };
      else if (url.pathname.endsWith("/publicacao")) json = { publication };
      else if (url.pathname.endsWith("/progresso"))
        json = { steps: [], checkedAt: new Date().toISOString() };
      else if (url.pathname.endsWith("/catalogos")) json = { catalogs: [] };
      await route.fulfill({ json });
    });
    await page.goto(`${origin}/app`);
    await page.getByLabel("E-mail", { exact: true }).fill("synthetic@example.com");
    await page.getByLabel("Senha", { exact: true }).fill("synthetic");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByRole("combobox", { name: /^Persona/ }).selectOption(personaId);
    await page.getByRole("link", { name: "Tokens e conexões", exact: true }).click();
    await page.getByRole("tab", { name: "Novo token", exact: true }).click();
    const form = page.getByRole("form", { name: "Emitir token", exact: true });
    const name = form.getByLabel("Nome do consumidor", { exact: true });
    await name.fill("Acesso sintético");
    await form.getByLabel("Consulta sintética · revisão 1", { exact: true }).check();
    const field = form.getByText("dbo.pedidos.total · exibir · filtrar", { exact: true });
    const search = form.getByRole("searchbox", { name: "Buscar consultas e operações" });
    await search.fill("inexistente");
    await expect(form.getByText(/Nenhuma capacidade corresponde aos filtros/)).toBeVisible();
    await form.getByRole("button", { name: "Limpar busca e filtro" }).click();
    await form
      .getByRole("combobox", { name: "Mostrar capacidades" })
      .selectOption({ label: "Selecionadas" });
    await search.fill("consulta sintetica");
    await expect(form.getByLabel("Consulta sintética · revisão 1", { exact: true })).toBeChecked();
    await form.getByRole("button", { name: "Limpar busca e filtro" }).click();
    await expect(form.getByLabel("Resumo da emissão")).toContainText(
      "1 consulta(s) e operação(ões)",
    );
    expect(attempts).toBe(0);
    await expect(field).toBeHidden();
    await form.getByRole("button", { name: "Expandir campos", exact: true }).click();
    await expect(field).toBeVisible();
    await form.getByRole("button", { name: "Recolher campos", exact: true }).click();
    await expect(field).toBeHidden();
    const section = form.locator("summary").filter({ hasText: "Consultas e operações ·" });
    await section.focus();
    await section.press("Enter");
    await expect(form.getByLabel("Consulta sintética · revisão 1", { exact: true })).toBeHidden();
    await section.press("Enter");
    await expect(form.getByLabel("Consulta sintética · revisão 1", { exact: true })).toBeChecked();
    expect(attempts).toBe(0);
    await page.screenshot({ path: "test-results/token-form-collapsed.png", fullPage: true });
    await form.locator("summary").filter({ hasText: "Administração e delegação" }).click();
    const meter = form.getByRole("region", { name: "Tamanho das permissões" });
    await expect(meter).toContainText("Delegação:");
    const delegate = form.getByLabel(
      "Permitir delegar as concessões selecionadas a outros tokens",
      { exact: true },
    );
    await delegate.check();
    await expect(meter.getByRole("alert")).toContainText("ultrapassa");
    await expect(form.getByRole("button", { name: "Emitir token restrito" })).toBeDisabled();
    await name.press("Enter");
    expect(attempts).toBe(0);
    expect(issued).toBe(0);
    await expect(name).toHaveValue("Acesso sintético");
    await delegate.uncheck();
    await form.getByRole("button", { name: "Emitir token restrito" }).click();
    await expect.poll(() => issued).toBe(1);
    expect(attempts).toBe(1);

    await expect(page.getByRole("tab", { name: "Copiar e usar token" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("#access-connect")).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "Token gerado — copie e guarde agora" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Token para conectar o cliente ou testar", { exact: true }),
    ).toHaveAttribute("type", "password");
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("denied");
          },
        },
      }),
    );
    await page.getByRole("button", { name: "Copiar token", exact: true }).click();
    await expect(page.getByText(/Não foi possível copiar automaticamente/)).toBeVisible();
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => undefined },
      }),
    );
    await page.getByRole("button", { name: "Copiar token", exact: true }).click();
    await expect(
      page.getByText("Token copiado. Guarde-o em um local seguro antes de sair."),
    ).toBeVisible();
    await page.screenshot({ path: "test-results/token-copy-flow.png", fullPage: true });
    await page.locator("summary").filter({ hasText: "Remover token desta página" }).click();
    await page.getByRole("button", { name: "Ocultar e descartar token" }).click();
    await expect(page.getByText("Nenhum token disponível para copiar nesta sessão.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar token", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Ir para tokens cadastrados" }).click();
    await expect(page.getByRole("tab", { name: "Tokens cadastrados" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // A caller bypassing the UI is still refused before application issuance.
    const rejected = await page.evaluate(
      async ({ path, limit }) => {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload: "a".repeat(limit) }),
        });
        return { status: response.status, requestId: response.headers.get("x-request-id") };
      },
      { path, limit: TOKEN_JSON_BYTES },
    );
    expect(rejected.status).toBe(413);
    expect(issued).toBe(1);
    expect(
      logger.warnings.some(
        (entry) =>
          entry.fields?.requestId === rejected.requestId &&
          entry.message === "admin request too large",
      ),
    ).toBe(true);

    // A proxy with a smaller limit returns HTML; the UI keeps the draft without retry.
    proxyLimit = 100;
    await page.getByRole("tab", { name: "Novo token", exact: true }).click();
    await name.fill("Preservado após proxy");
    await form
      .getByLabel("Administrar tokens dentro dos limites de delegação", { exact: true })
      .check();
    await form.getByRole("button", { name: "Emitir token restrito" }).click();
    await expect(
      page.getByText(/O servidor recusou a solicitação por excesso de tamanho/),
    ).toBeVisible();
    await expect(name).toHaveValue("Preservado após proxy");
    expect(attempts).toBe(3);
    expect(issued).toBe(1);
  } finally {
    await close(backend);
    await close(proxy);
  }
});
