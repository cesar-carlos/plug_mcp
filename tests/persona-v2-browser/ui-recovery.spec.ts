import { expect, test, type Page } from "@playwright/test";

// Browser regressions for UI state only. All API responses and mutations are synthetic.
async function fixture(page: Page) {
  const permissions = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const tokens = ["A", "B"].map((name, i) => ({
    id: `token-${i}`,
    name,
    expiresAt: null,
    revokedAt: null as string | null,
    authorizationVersion: 1,
    permissions,
    delegation: permissions,
  }));
  const state = {
    tokens,
    oauthFails: true,
    tokensFail: false,
    expired: false,
    revocations: [] as string[],
    holdRevocation: undefined as Promise<void> | undefined,
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    let status = 200;
    if (path === "/api/admin/login")
      json = { csrfToken: "fixture", expiresAt: new Date(Date.now() + 3600000).toISOString() };
    else if (path === "/api/admin/personas")
      json = {
        personas: [
          {
            id: "ui-persona",
            name: "UI fixture",
            specialty: "Review",
            instructions: "",
            active: true,
            authorizationVersion: 1,
          },
          {
            id: "second-persona",
            name: "Segunda persona",
            specialty: "Review",
            instructions: "",
            active: true,
            authorizationVersion: 1,
          },
        ],
      };
    else if (path.endsWith("/fontes")) json = { fontes: [] };
    else if (path.endsWith("/skills")) json = { skills: [] };
    else if (path.endsWith("/catalogos")) json = { catalogs: [] };
    else if (path.endsWith("/progresso"))
      json = {
        checkedAt: new Date().toISOString(),
        currentAvailabilityVerified: false,
        lastQueryAt: null,
        steps: [
          {
            id: "source",
            label: "Conectar fonte",
            state: "pendente",
            reason: "Cadastre uma fonte para começar.",
            area: "sources",
            action: "Abrir bases",
          },
        ],
      };
    else if (path.endsWith("/delegation"))
      json = { version: 1, active: false, expiresAt: null, administrative: [] };
    else if (path.endsWith("/oauth")) {
      status = state.oauthFails ? 503 : 200;
      json = state.oauthFails ? { error: { code: "UNAVAILABLE" } } : { enabled: false };
    } else if (path.endsWith("/tokens")) {
      status = state.expired ? 401 : state.tokensFail ? 503 : 200;
      json = state.expired
        ? { error: { code: "ADMIN_SESSION_EXPIRED", message: "Entre novamente." } }
        : state.tokensFail
          ? { error: { code: "UNAVAILABLE", message: "Lista indisponível na fixture." } }
          : { tokens };
    } else if (path.endsWith("/revogar")) {
      state.revocations.push(path);
      await state.holdRevocation;
      tokens.find((token) => path.includes(token.id))!.revokedAt = new Date().toISOString();
    }
    await route.fulfill({ status, json });
  });
  await page.goto("/app");
  await page.getByLabel("E-mail", { exact: true }).fill("review@fixture.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("combobox", { name: /^Persona/ }).selectOption("ui-persona");
  await expect(
    page.getByRole("button", { name: "Sair", exact: true, includeHidden: true }),
  ).toBeEnabled();
  return state;
}

test("atalhos e filtros de acesso preservam a edição e levam o foco ao destino", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("link", { name: "Tokens e conexões", exact: true }).click();
  await page.getByRole("button", { name: "Editar A", exact: true }).click();
  const form = page.getByRole("form", { name: "Editar token", exact: true });
  await expect(form.getByRole("heading", { name: "Editar A", exact: true })).toBeFocused();
  const name = form.getByLabel("Nome do consumidor", { exact: true });
  await name.fill("Edição preservada");
  const sections = page.getByRole("tablist", { name: "Seções de tokens e conexões", exact: true });
  await sections.getByRole("tab", { name: "Usar e testar", exact: true }).click();
  await expect(page.locator("#access-connect")).toBeFocused();
  await sections.getByRole("tab", { name: "Tokens cadastrados", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Gerenciar tokens", exact: true })).toBeFocused();
  await expect(name).toHaveValue("Edição preservada");
  await page.getByLabel("Buscar tokens", { exact: true }).fill("inexistente");
  await expect(page.getByRole("button", { name: "Editar A", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(page.getByRole("button", { name: "Editar A", exact: true })).toBeVisible();
  await expect(name).toHaveValue("Edição preservada");
});

test("revogar B preserva a edição não salva de A e a proteção de navegação", async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole("link", { name: "Tokens e conexões", exact: true }).click();
  await page.getByRole("button", { name: "Editar A", exact: true }).click();
  const name = page
    .getByRole("form", { name: "Editar token", exact: true })
    .getByLabel("Nome do consumidor", { exact: true });
  await name.fill("Edição preservada");
  await page.getByRole("button", { name: "Revogar B", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar revogação", exact: true })
    .click();
  await expect(page.getByText("Token revogado.", { exact: true })).toBeVisible();
  await expect(name).toHaveValue("Edição preservada");
  expect(state.revocations).toEqual(["/api/admin/personas/ui-persona/tokens/token-1/revogar"]);
  await page.getByRole("link", { name: "Personas", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(name).toHaveValue("Edição preservada");
});

test("validação obrigatória aparece junto ao campo e corrige sem apagar o formulário", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("link", { name: "Personas", exact: true }).click();
  await page.getByText("Criar uma persona", { exact: true }).click();
  const form = page.getByRole("form", { name: "Criar persona", exact: true });
  const name = form.getByLabel("Nome", { exact: true });
  await name.fill("Persona preservada");
  await form.getByRole("button", { name: "Criar persona", exact: true }).click();
  const specialty = form.getByLabel("Especialidade", { exact: true });
  await expect(specialty).toHaveAttribute("aria-invalid", "true");
  await expect(specialty).toBeFocused();
  await expect(form.getByText("Preencha este campo obrigatório.", { exact: true })).toBeVisible();
  await expect(name).toHaveValue("Persona preservada");
  await specialty.fill("Atendimento");
  await expect(form.locator(".field-error")).toHaveCount(0);
  await expect(specialty).not.toHaveAttribute("aria-invalid", "true");
});

test("resposta lenta mantém feedback e não permite segunda revogação", async ({ page }) => {
  const state = await fixture(page);
  let release!: () => void;
  state.holdRevocation = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.getByRole("link", { name: "Tokens e conexões", exact: true }).click();

  const revoke = page.getByRole("button", { name: "Revogar B", exact: true });
  await revoke.click();
  await expect(page.getByRole("dialog")).toContainText("conexões OAuth derivadas");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar revogação", exact: true })
    .click();
  try {
    await expect(revoke).toBeDisabled();
    await expect(page.getByText(/Processando solicitação/)).toBeVisible();
    await revoke.dispatchEvent("click");
    await revoke.dispatchEvent("click");
    await expect.poll(() => state.revocations.length).toBe(1);
  } finally {
    release();
  }
  await expect(page.getByText("Token revogado.", { exact: true })).toBeVisible();
});

test("sessão expirada durante leitura remove a área autenticada", async ({ page }) => {
  const state = await fixture(page);
  state.expired = true;
  await page.getByRole("link", { name: "Tokens e conexões", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "Gerenciar tokens", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");
  await expect(
    page.getByText("Sua sessão expirou. Entre novamente.", { exact: true }),
  ).toBeVisible();
});

test("falha ao salvar conserva a edição do token", async ({ page }) => {
  await fixture(page);
  await page.route("**/tokens/token-0/editar", (route) =>
    route.fulfill({
      status: 409,
      json: { error: { code: "CONFLICT", message: "Cadastro mudou; confira a versão." } },
    }),
  );
  await page.getByRole("link", { name: "Tokens e conexões", exact: true }).click();
  await page.getByRole("button", { name: "Editar A", exact: true }).click();
  const form = page.getByRole("form", { name: "Editar token", exact: true });
  const name = form.getByLabel("Nome do consumidor", { exact: true });
  await name.fill("Alteração preservada após erro");
  await form.getByRole("button", { name: "Salvar token", exact: true }).click();
  await expect(page.getByText("Cadastro mudou; confira a versão.", { exact: true })).toBeVisible();
  await expect(name).toHaveValue("Alteração preservada após erro");
  await expect(form.getByRole("button", { name: "Salvar token", exact: true })).toBeEnabled();
});

test("roteiro destaca o próximo passo e ignora resposta da persona anterior", async ({ page }) => {
  await fixture(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route("**/personas/ui-persona/progresso", async (route) => {
    started = true;
    await held;
    await route.fulfill({
      json: {
        checkedAt: new Date().toISOString(),
        steps: [
          {
            id: "old",
            label: "Resposta antiga",
            state: "pendente",
            reason: "Não deve aparecer",
            area: "sources",
            action: "Antigo",
          },
        ],
      },
    });
  });
  await page.getByRole("link", { name: "Visão geral", exact: true }).click();
  await page.getByRole("button", { name: "Atualizar roteiro", exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await expect(page.getByText("Conferindo os próximos passos…", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: /^Persona/ }).selectOption("second-persona");
  const next = page
    .getByRole("region", { name: "Roteiro da persona", exact: true })
    .getByRole("complementary", { name: "Próximo passo recomendado", exact: true });
  await expect(
    next.getByRole("link", { name: "Continuar: Abrir bases", exact: true }),
  ).toBeVisible();
  release();
  // Let a new read settle after delivering the discarded response.
  await page.getByRole("button", { name: "Atualizar roteiro", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Roteiro da persona", exact: true }),
  ).toHaveAttribute("aria-busy", "false");
  await expect(page.getByText("Resposta antiga", { exact: false })).toHaveCount(0);
});

test("diálogo preserva foco e console cabe em tela de celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  // On narrow screens navigation remains explicitly expandable.
  await page.locator(".mobile-menu").click();
  await page.getByRole("link", { name: "Tokens e conexões", exact: true }).click();
  await page.getByRole("button", { name: "Editar A", exact: true }).click();
  await page
    .getByRole("form", { name: "Editar token", exact: true })
    .getByLabel("Nome do consumidor", { exact: true })
    .fill("Alterado");
  await page.locator(".mobile-menu").click();
  const link = page.getByRole("link", { name: "Personas", exact: true });
  await link.click();
  await expect(page.getByRole("button", { name: "Continuar editando", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(link).toBeFocused();
  expect(
    await page.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
  ).toBe(true);
});

test("falha OAuth termina carregamento e permite nova tentativa explícita", async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole("link", { name: "Tokens e conexões", exact: true }).click();
  await page.getByRole("tab", { name: "Conectar no ChatGPT", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Conexão ChatGPT", exact: true });
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(panel).toHaveAttribute("aria-busy", "false");
  await expect(
    panel.getByText("Conferindo disponibilidade do OAuth…", { exact: true }),
  ).toHaveCount(0);
  state.oauthFails = false;
  await panel.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(panel.getByText(/OAuth indisponível neste ambiente/)).toBeVisible();
  await expect(panel.getByRole("alert")).toHaveCount(0);
});

test("falha de listagem não afirma ausência e recuperação mostra tokens existentes", async ({
  page,
}) => {
  const state = await fixture(page);
  state.tokensFail = true;
  await page.getByRole("link", { name: "Tokens e conexões", exact: true }).click();
  await expect(page.getByText("Lista indisponível na fixture.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Nenhum token emitido para esta persona/)).toHaveCount(0);
  state.tokensFail = false;
  await page.getByRole("button", { name: "Atualizar lista de tokens", exact: true }).click();
  await expect(page.getByRole("button", { name: "Editar A", exact: true })).toBeVisible();
});

test("buscas preservam a persona selecionada e a edição de token fora dos resultados", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("searchbox", { name: "Buscar personas", exact: true }).fill("segunda");
  const persona = page.getByRole("combobox", { name: /^Persona/ });
  await expect(persona).toHaveValue("ui-persona");
  await expect(persona.getByRole("option", { name: "Segunda persona", exact: true })).toHaveCount(
    1,
  );
  await page.getByRole("link", { name: "Tokens e conexões", exact: true }).click();
  await page.getByRole("button", { name: "Editar A", exact: true }).click();
  const name = page
    .getByRole("form", { name: "Editar token", exact: true })
    .getByLabel("Nome do consumidor", { exact: true });
  await name.fill("Não descartar");
  const search = page.getByRole("searchbox", { name: "Buscar tokens", exact: true });
  await search.fill("B");
  await expect(page.getByRole("button", { name: "Editar A", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Editar B", exact: true })).toBeVisible();
  await expect(name).toHaveValue("Não descartar");
  await page
    .getByRole("combobox", { name: "Situação dos tokens", exact: true })
    .selectOption("revogados");
  await expect(page.getByText(/Nenhum token corresponde aos filtros/)).toBeVisible();
  await page
    .getByRole("combobox", { name: "Situação dos tokens", exact: true })
    .selectOption("todos");
  await page.getByRole("button", { name: "Limpar buscar tokens", exact: true }).click();
  await expect(page.getByRole("button", { name: "Editar A", exact: true })).toBeVisible();
  await expect(name).toHaveValue("Não descartar");
});

test("catálogo é carregado sob demanda e falha de download é explicada", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.route("**/assets/SharedKnowledgePanel-*.js", (route) => route.abort());
  await fixture(page);
  expect(requests.some((url) => /SharedKnowledgePanel-.*\.js/.test(url))).toBe(false);
  await page.getByRole("link", { name: "Catálogo compartilhado", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Não foi possível carregar esta área" }),
  ).toBeVisible();
  expect(requests.some((url) => /SharedKnowledgePanel-.*\.js/.test(url))).toBe(true);
});

test("conteúdo tem acesso por teclado, semântica acessível e reflow a 200%", async ({ page }) => {
  // 640 CSS px represent a 1280 px viewport at 200% browser zoom; also enlarge text.
  await page.setViewportSize({ width: 640, height: 450 });
  await fixture(page);
  await page.evaluate("document.documentElement.style.fontSize = '200%'");
  const skip = page.getByRole("link", { name: "Pular para o conteúdo", exact: true });
  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#console-content")).toBeFocused();
  await expect(page).toHaveTitle("Personas — Se7e");
  await expect(page.getByRole("combobox", { name: /^Persona/ })).toHaveAccessibleName("Persona");
  await page.getByText("Ajuda: entenda os termos", { exact: true }).click();
  await expect(page.getByText("O token é uma chave de acesso.", { exact: false })).toBeVisible();
  expect(
    await page.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
  ).toBe(true);
  // A wider fallback font must not turn enlarged navigation/header text into
  // horizontal scrolling on Linux runners with different installed fonts.
  await page.evaluate("document.documentElement.style.fontFamily = 'monospace'");
  expect(
    await page.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
  ).toBe(true);
  await page.getByRole("link", { name: "Bases", exact: true }).click();
  await expect(page).toHaveTitle("Bases — Se7e");
  await expect(page.getByText(/Nenhuma base conectada/)).toBeVisible();
});

test("emissão sob demanda preserva rascunho e resume permissões", async ({ page }) => {
  await fixture(page);
  await page.getByRole("link", { name: "Tokens e conexões", exact: true }).click();
  const form = page.getByRole("form", { name: "Emitir token", exact: true });
  await expect(form).toBeHidden();
  await page.getByRole("tab", { name: "Novo token", exact: true }).click();
  await form.getByLabel("Nome do consumidor", { exact: true }).fill("Novo consumidor");
  await form
    .getByLabel("Administrar tokens dentro dos limites de delegação", { exact: true })
    .check();
  const summary = form.getByRole("region", { name: "Resumo das permissões" });
  await expect(summary).toContainText("Administrar tokens dentro dos limites de delegação");
  await expect(summary).toContainText("Nenhuma base selecionada");
  await page.getByRole("button", { name: "Recolher formulário", exact: true }).click();
  await expect(form).toBeHidden();
  await page.getByRole("tab", { name: "Novo token", exact: true }).click();
  await expect(form.getByLabel("Nome do consumidor", { exact: true })).toHaveValue(
    "Novo consumidor",
  );
});

test("validade tem filtros próprios e cancelar confirmação preserva o token", async ({ page }) => {
  const state = await fixture(page);
  Object.assign(state.tokens[0]!, { expiresAt: new Date(Date.now() + 86400000).toISOString() });
  Object.assign(state.tokens[1]!, { expiresAt: new Date(Date.now() - 86400000).toISOString() });
  await page.getByRole("link", { name: "Tokens e conexões", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Situação dos tokens", exact: true })
    .selectOption("vence_em_breve");
  await expect(page.getByRole("button", { name: "Editar A", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar B", exact: true })).toHaveCount(0);
  const revoke = page.getByRole("button", { name: "Revogar A", exact: true });
  await revoke.click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(revoke).toBeFocused();
  expect(state.revocations).toHaveLength(0);
  await page
    .getByRole("combobox", { name: "Situação dos tokens", exact: true })
    .selectOption("expirado");
  await expect(page.getByRole("button", { name: "Editar B", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar A", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Editar B", exact: true }).click();
  await page.getByRole("button", { name: "Gerar novo token", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("invalidados imediatamente");
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("form", { name: "Editar token", exact: true })).toBeVisible();
});

test("conexão destaca cliente e token e mantém identificadores nos detalhes", async ({ page }) => {
  await fixture(page);
  await page.route("**/oauth-connections", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "connection-fixture",
            tokenId: "token-0",
            tokenName: "Token financeiro",
            clientId: "https://chatgpt.com/connector/client.json",
            createdAt: null,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            revokedAt: null,
            state: "vigente_localmente",
            permissions: {
              sourceIds: [],
              skills: [],
              externalOperationIds: [],
              administrative: [],
            },
            fingerprint: "fixture",
          },
        ],
        nextCursor: null,
        remoteAuthority: "nao_verificado",
      },
    }),
  );
  await page.getByRole("link", { name: "Tokens e conexões", exact: true }).click();
  await page.getByRole("tab", { name: "Conexões e delegação", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Conexões OAuth da persona", exact: true });
  await panel.getByRole("button", { name: "Atualizar conexões OAuth", exact: true }).click();
  await expect(panel.getByText("chatgpt.com", { exact: true })).toBeVisible();
  await expect(panel.getByText("Token financeiro", { exact: true })).toBeVisible();
  await expect(panel.getByText("ID da conexão: connection-fixture", { exact: true })).toBeHidden();
  await panel.getByText("Identificação da conexão", { exact: true }).click();
  await expect(panel.getByText("ID da conexão: connection-fixture", { exact: true })).toBeVisible();
  await panel
    .getByRole("button", { name: "Revisar revogação connection-fixture", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Confirmar revogação da conexão", exact: true }),
  ).toBeDisabled();
});
