import { test, expect, type Page, type Route } from "@playwright/test";

const skillId = "22222222-2222-4222-8222-222222222222";
const sql = "SELECT f.valor FROM fato f";
const candidate = {
  id: "33333333-3333-4333-8333-333333333333",
  pergunta: "Valores sintéticos",
  sql,
  skillIds: [skillId, "44444444-4444-4444-8444-444444444444"],
  status: "candidata",
};
const flow = { proximoPasso: "validar_skill", podeLiberar: false, passos: [] };
const draft = {
  id: skillId,
  nome: "Fato sintético",
  descricao: "Exemplo",
  slug: "fato",
  sqlModelo: sql,
  status: "rascunho",
  statusRascunho: "rascunho",
  params: [],
  fluxoTreino: flow,
};
interface Call {
  path: string;
  method: string;
  body: Record<string, unknown>;
}
const json = (route: Route, value: unknown, status = 200): Promise<void> =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });

async function mockConsole(page: Page): Promise<Call[]> {
  const calls: Call[] = [];
  await page.route("**/app/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    calls.push({ path, method: request.method(), body });
    if (path === "/app/api/acesso") {
      await json(route, {
        success: true,
        acessos: [
          {
            id: "synthetic-access",
            agentId: "11111111-1111-4111-8111-111111111111",
            nomeAmigavel: "Console sintético",
            nomePersona: "Administrador",
            dialeto: "postgres",
            statusAcesso: "ativo",
          },
        ],
      });
    } else if (path === "/app/api/skills") {
      await json(route, {
        success: true,
        skills: [
          draft,
          { ...draft, id: candidate.skillIds[1], status: "publicada", nome: "Outra skill" },
        ],
      });
    } else if (path === "/app/api/skills/modelos") {
      await json(route, {
        success: true,
        skills: [{ ...draft, motivoRevalidacao: null, faltas: [] }],
      });
    } else if (path === `/app/api/skills/${skillId}`) {
      await json(route, { success: true, skill: draft, fluxoTreino: flow });
    } else if (path === `/app/api/skills/${skillId}/publicar`) {
      await json(route, {
        success: true,
        confirmacaoPendente: true,
        confirmacaoHash: "publication-hash",
        resumoPublicacao: {
          nome: draft.nome,
          tabelas: ["fato"],
          colunas: ["valor"],
          publicacaoAtiva: false,
        },
        diff: { adicionadas: ["fato.valor"] },
        faltas: [],
      });
    } else if (path === "/app/api/consultas") {
      await json(route, { success: true, consultas: [candidate], total: 1 });
    } else if (path === `/app/api/consultas/${candidate.id}`) {
      await json(route, { success: true, consulta: candidate });
    } else if (path === "/app/api/consultas/salvar") {
      await json(
        route,
        body.confirmadoPeloUsuario
          ? { success: true, consulta: { ...candidate, status: "confirmada" } }
          : {
              success: true,
              consulta: candidate,
              confirmacaoPendente: true,
              confirmacaoHash: "candidate-hash",
            },
      );
    } else if (path.endsWith("/inativar")) {
      await json(route, {
        success: true,
        confirmacaoHash: "inactive-hash",
        confirmacaoPendente: true,
        preview: { consulta: candidate, motivo: body.motivo },
      });
    } else if (path === "/app/api/anotacoes") {
      await json(route, {
        success: true,
        anotacoes: [
          {
            id: "note-synthetic",
            tipo: "regra",
            titulo: "Regra sintética",
            texto: "Texto existente",
            fonteTipo: "documento",
            fonteReferencia: "Manual",
            responsavel: "Equipe",
            vigenteDe: "2026-10-08",
            revisarEm: "2026-11-01",
            periodoRevisaoDias: 30,
            status: "vigente",
            ativaAgora: true,
            revisao: { pendente: false, proximaEm: "2026-11-01", venceEm: null },
          },
        ],
      });
    } else if (path === "/app/api/grafo/tabelas") {
      await json(route, {
        success: true,
        tabelas: Array.from({ length: 75 }, (_, index) => ({ nome: `tabela_${index}` })),
      });
    } else if (path === "/app/api/grafo/conflitos") {
      await json(route, { success: true, conflitos: [] });
    } else if (path === "/app/api/alertas") {
      await json(route, { success: true, alertas: [], entregas: [] });
    } else if (path === "/app/api/lacunas") {
      await json(route, { success: true, lacunas: [] });
    } else {
      await json(route, { success: true });
    }
  });
  await page.goto("/app/conectar/colar");
  await page.getByLabel("Token MCP").fill("synthetic-browser-token");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Acesso desta persona" })).toBeVisible();
  return calls;
}
async function navigate(page: Page, path: string): Promise<void> {
  if (new URL(page.url()).pathname === `/app${path}`) {
    return;
  }
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) {
    await menu.click();
  }
  if (path === "/acesso/remover") {
    await page.locator(".nav details summary").click();
  }
  await page.locator(`a[href="/app${path}"]`).first().click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/app${path}`);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator(".page[aria-busy=true]")).toHaveCount(0);
  if (await page.locator(".mobile-header").isVisible()) {
    await expect(page.getByRole("button", { name: "Menu", exact: true })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  }
}
async function openSkill(page: Page): Promise<void> {
  await navigate(page, "/skills");
  await page.getByRole("link", { name: draft.nome, exact: true }).click();
  await expect(page.getByLabel("SQL modelo", { exact: true })).toHaveValue(sql);
}
async function openPublication(page: Page): Promise<void> {
  await page.route(`**/app/api/skills/${skillId}?**`, (route) =>
    json(route, {
      success: true,
      skill: draft,
      fluxoTreino: { ...flow, proximoPasso: "publicar_skill", podeLiberar: true },
    }),
  );
  await openSkill(page);
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revisão da publicação" })).toBeVisible();
}

test("salvamento concluído e validação recusada preservam o rascunho persistido", async ({
  page,
}) => {
  const calls = await mockConsole(page);
  await openSkill(page);
  await page
    .getByLabel("SQL modelo", { exact: true })
    .fill("SELECT f.valor FROM fato f WHERE f.valor > :valor");
  await page.getByLabel("Confirmo salvar estas alterações no rascunho").check();
  await page.route(`**/app/api/skills/${skillId}/validar`, (route) =>
    json(
      route,
      {
        success: false,
        code: "PARAM_REQUIRED",
        message: "Parâmetro pendente",
        hint: "Defina valor",
      },
      400,
    ),
  );
  await page.getByRole("button", { name: "Salvar e validar" }).last().click();
  await expect(page.getByRole("alert")).toContainText("Parâmetro pendente");
  await expect(page.getByText("O rascunho salvo foi preservado", { exact: false })).toBeVisible();
  await expect(page.getByLabel("SQL modelo", { exact: true })).toHaveValue(
    "SELECT f.valor FROM fato f WHERE f.valor > :valor",
  );
  expect(
    calls.filter((call) => call.path === `/app/api/skills/${skillId}` && call.method === "POST"),
  ).toHaveLength(1);
  await navigate(page, "/anotacoes");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("publicação obsoleta limpa hash e nova revisão exige nova confirmação", async ({ page }) => {
  await mockConsole(page);
  await openPublication(page);
  let confirmations = 0;
  await page.route(`**/app/api/skills/${skillId}/publicar`, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.confirmadoPeloUsuario) {
      confirmations += 1;
      await json(
        route,
        {
          success: false,
          code: "CONFIRMACAO_DESATUALIZADA",
          message: "Pacote alterado",
          hint: "Gere revisão nova",
        },
        400,
      );
    } else {
      await json(route, {
        success: true,
        confirmacaoPendente: true,
        confirmacaoHash: "new-publication-hash",
        resumoPublicacao: { nome: draft.nome },
      });
    }
  });
  await page.getByLabel("Confirmo publicar este pacote").check();
  await page.getByRole("button", { name: "Confirmar publicação" }).click();
  await expect(page.getByRole("alert")).toContainText("Pacote alterado");
  await expect(page.getByRole("button", { name: "Confirmar publicação" })).toBeDisabled();
  await page.getByRole("button", { name: "Gerar nova revisão" }).click();
  await expect(page.getByRole("heading", { name: "Revisão da publicação" })).toBeVisible();
  await expect(page.getByLabel("Confirmo publicar este pacote")).not.toBeChecked();
  expect(confirmations).toBe(1);
});

test("editar, salvar e validar em sequência; falha de salvamento preserva edição", async ({
  page,
}) => {
  const calls = await mockConsole(page);
  await openSkill(page);
  await page.getByLabel("SQL modelo", { exact: true }).fill("SELECT f.valor, f.id FROM fato f");
  await page.getByLabel("Confirmo salvar estas alterações no rascunho").check();
  await page.route(`**/app/api/skills/${skillId}`, async (route) => {
    if (route.request().method() === "POST") {
      await json(
        route,
        {
          success: false,
          code: "VALIDATION_ERROR",
          message: "Falha sintética ao salvar",
          hint: "Revise",
        },
        400,
      );
    } else {
      await route.fallback();
    }
  });
  await page.getByRole("button", { name: "Salvar e validar" }).last().click();
  await expect(page.getByRole("alert")).toContainText("Falha sintética ao salvar");
  expect(calls.filter((call) => call.path.endsWith("/validar"))).toHaveLength(0);
  await expect(page.getByLabel("SQL modelo", { exact: true })).toHaveValue(
    "SELECT f.valor, f.id FROM fato f",
  );
  await page.unroute(`**/app/api/skills/${skillId}`);
  await page.getByRole("button", { name: "Salvar e validar" }).last().click();
  await expect(page.locator(".action-status")).toContainText("Operação concluída");
  const mutations = calls.filter(
    (call) => call.method === "POST" && call.path.startsWith(`/app/api/skills/${skillId}`),
  );
  expect(mutations.map((call) => call.path)).toEqual([
    `/app/api/skills/${skillId}`,
    `/app/api/skills/${skillId}/validar`,
  ]);
  expect(mutations[0]?.body.sqlModelo).toBe("SELECT f.valor, f.id FROM fato f");
});

test("saída pendente e exclusão exigem ação humana, Escape devolve foco", async ({ page }) => {
  const calls = await mockConsole(page);
  await openSkill(page);
  await page.getByLabel("Nome", { exact: true }).fill("Edição local");
  await page.getByRole("link", { name: "Anotações", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Edição local");
  await page.getByRole("button", { name: "Remover skill", exact: true }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remover skill", exact: true })).toBeFocused();
  expect(calls.filter((call) => call.path.endsWith("/remover"))).toHaveLength(0);
  await page.getByRole("button", { name: "Remover skill", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remover skill" }).click();
  await expect(page.locator("main h1")).toHaveText("Skills");
  expect(calls.find((call) => call.path.endsWith("/remover"))?.body.confirmadoPeloUsuario).toBe(
    true,
  );
});

test("candidata é somente leitura; novo exemplo mantém múltiplas skills sem ID anterior", async ({
  page,
}) => {
  const calls = await mockConsole(page);
  await navigate(page, "/consultas");
  await page.getByRole("button", { name: /Valores sintéticos/ }).click();
  await page.getByRole("button", { name: "Revisar candidata", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Conteúdo efetivo para confirmação" }),
  ).toBeVisible();
  expect(calls.find((call) => call.path.endsWith("/consultas/salvar"))?.body).toEqual({
    consultaAprendidaId: candidate.id,
  });
  await page.getByRole("button", { name: "Cancelar revisão" }).click();
  await page.getByRole("button", { name: "Criar novo exemplo a partir deste" }).click();
  await page.getByLabel("Pergunta", { exact: true }).fill("Novo exemplo");
  await page.getByRole("button", { name: "Revisar novo exemplo" }).click();
  await expect(
    page.getByRole("heading", { name: "Conteúdo efetivo para confirmação" }),
  ).toBeVisible();
  const body = calls.filter((call) => call.path.endsWith("/consultas/salvar")).at(-1)?.body;
  expect(body).toEqual({ pergunta: "Novo exemplo", sql, skillIds: candidate.skillIds });
  await page.getByLabel("Pergunta", { exact: true }).fill("Outra pergunta");
  await expect(
    page.getByRole("heading", { name: "Conteúdo efetivo para confirmação" }),
  ).toHaveCount(0);
});

test("preview obsoleto exige nova revisão e não repete confirmação", async ({ page }) => {
  const calls = await mockConsole(page);
  await navigate(page, "/consultas");
  await page.getByRole("button", { name: /Valores sintéticos/ }).click();
  await page.getByRole("button", { name: "Revisar candidata", exact: true }).click();
  await page.route("**/app/api/consultas/salvar", async (route) => {
    calls.push({
      path: "/stale-confirmation",
      method: "POST",
      body: route.request().postDataJSON() as Record<string, unknown>,
    });
    await json(
      route,
      {
        success: false,
        code: "CONFIRMACAO_DESATUALIZADA",
        message: "Confirmação desatualizada",
        hint: "Gere nova revisão",
      },
      400,
    );
  });
  await page.getByLabel("Confirmo este exemplo no pacote atual").check();
  await page.getByRole("button", { name: "Confirmar candidata", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Gere nova revisão");
  await expect(page.getByRole("button", { name: "Confirmar candidata", exact: true })).toHaveCount(
    0,
  );
  expect(calls.filter((call) => call.path === "/stale-confirmation")).toHaveLength(1);
});

test("editar anotação carrega datas civis e preserva governança não alterada", async ({ page }) => {
  const calls = await mockConsole(page);
  await navigate(page, "/anotacoes");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByLabel("Vigente de", { exact: true })).toHaveValue("2026-10-08");
  await page.getByLabel("Texto", { exact: true }).fill("Texto revisto");
  await page.getByLabel("Confirmo atualizar esta anotação").check();
  await page.getByRole("button", { name: "Salvar anotação" }).click();
  await expect(page.getByLabel("Texto", { exact: true })).toHaveValue("");
  const mutation = calls.find(
    (call) => call.method === "POST" && call.path.endsWith("/note-synthetic"),
  );
  expect(mutation?.body.governanca).toEqual({});
  expect(mutation?.body.texto).toBe("Texto revisto");
});

test("pendência preserva skill no grafo, JOIN composto não assume INNER", async ({ page }) => {
  const calls = await mockConsole(page);
  await page.route(`**/app/api/skills/${skillId}?**`, (route) =>
    json(route, {
      success: true,
      skill: draft,
      fluxoTreino: { ...flow, proximoPasso: "confirmar_relacionamento" },
    }),
  );
  await openSkill(page);
  await page.locator(`a[href="/app/grafo?skillId=${skillId}"]`).click();
  await expect(page.getByLabel("Destino das confirmações")).toHaveValue(skillId);
  await page.getByLabel("Tabela origem", { exact: true }).fill("fato");
  await page.getByLabel("Tabela destino", { exact: true }).fill("dimensao");
  await page.getByLabel("Coluna origem", { exact: true }).fill("empresa");
  await page.getByLabel("Coluna destino", { exact: true }).fill("empresa");
  await page.getByRole("button", { name: "Adicionar par" }).click();
  await page.getByLabel("Coluna origem", { exact: true }).nth(1).fill("id");
  await page.getByLabel("Coluna destino", { exact: true }).nth(1).fill("id");
  await page.getByRole("combobox", { name: "Cardinalidade", exact: true }).selectOption("N:1");
  await page.getByLabel("Confirmo os pares, a cardinalidade e o tipo deste relacionamento").check();
  await expect(page.getByRole("button", { name: "Confirmar JOIN", exact: true })).toBeDisabled();
  await page.getByRole("combobox", { name: "Tipo de JOIN", exact: true }).selectOption("preservar");
  await page.getByRole("button", { name: "Confirmar JOIN", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Operação concluída");
  const body = calls.find(
    (call) => call.method === "POST" && call.path.endsWith("/relacionamento"),
  )?.body;
  expect(body).toMatchObject({
    skillId,
    cardinalidade: "N:1",
    pares: [
      { colunaOrigem: "empresa", colunaDestino: "empresa" },
      { colunaOrigem: "id", colunaDestino: "id" },
    ],
  });
  expect(body).not.toHaveProperty("tipoJoin");
  await expect(page.getByText("tabela_74", { exact: true })).toBeVisible();
});

test("clique duplo envia uma mutação; resposta antiga não reaparece após sair", async ({
  page,
}) => {
  const calls = await mockConsole(page);
  await openSkill(page);
  let release: () => void = () => {
    throw new Error("Validação não iniciada");
  };
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let count = 0;
  await page.route(`**/app/api/skills/${skillId}/validar`, async (route) => {
    count += 1;
    await barrier;
    await json(route, { success: true });
  });
  const button = page.getByRole("button", { name: "Validar rascunho", exact: true });
  await button.evaluate((element) => {
    const button = element as unknown as { click: () => void };
    button.click();
    button.click();
  });
  await expect(page.getByRole("status")).toContainText("Processando");
  expect(count).toBe(1);
  await page.getByRole("button", { name: "Sair desta sessão" }).click();
  release();
  await expect(page.locator("main h1")).toHaveText("Usar Token MCP");
  await expect(page.getByLabel("SQL modelo", { exact: true })).toHaveCount(0);
  expect(
    calls.filter((call) => call.method === "POST" && call.path.endsWith("/validar")),
  ).toHaveLength(0);
  expect(await page.evaluate(() => Object.keys(localStorage))).not.toContain("bearer");
});

const routes = [
  "/acesso",
  "/acesso/verificar",
  "/skills",
  "/anotacoes",
  "/consultas",
  "/treino",
  "/skills/sql",
  "/grafo",
  "/operacao",
  "/acesso/persona",
  "/acesso/escopo",
  "/acesso/dialeto",
  "/acesso/credenciais",
  "/acesso/token",
  "/conectar/outra",
  "/acesso/remover",
];
for (const theme of ["light", "dark"] as const) {
  for (const width of [390, 768, 1440]) {
    test(`telas e navegação ${theme} ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/app/conectar");
      await expect(page.locator("main h1")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("conectar.png"), fullPage: true });
      await page.goto("/app/conectar/colar");
      await expect(page.locator("main h1")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("colar.png"), fullPage: true });
      await mockConsole(page);
      for (const path of routes) {
        await navigate(page, path);
        await expect(page.getByRole("alert")).toHaveCount(0);
        expect(
          await page.evaluate(
            () =>
              (
                globalThis as unknown as {
                  document: { documentElement: { scrollWidth: number } };
                  innerWidth: number;
                }
              ).document.documentElement.scrollWidth <=
              (globalThis as unknown as { innerWidth: number }).innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`${path.replaceAll("/", "_")}.png`),
          fullPage: true,
        });
      }
      await navigate(page, "/skills");
      await page.getByRole("link", { name: "Nova skill", exact: true }).click();
      await expect(page.locator("main h1")).toHaveText("Nova skill");
      await page.screenshot({ path: testInfo.outputPath("skill-nova.png"), fullPage: true });
      await openSkill(page);
      await page.screenshot({ path: testInfo.outputPath("skill-editor.png"), fullPage: true });
      await openPublication(page);
      await page.screenshot({ path: testInfo.outputPath("skill-publicar.png"), fullPage: true });
      if (width < 860) {
        await page.getByRole("button", { name: "Menu", exact: true }).click();
        await expect(page.getByRole("button", { name: "Fechar", exact: true })).toHaveAttribute(
          "aria-expanded",
          "true",
        );
        const nav = await page.locator("#app-navigation").boundingBox();
        const main = await page.locator("main").boundingBox();
        expect(main!.y).toBeGreaterThanOrEqual(nav!.y + nav!.height);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeFocused();
      }
    });
  }
}
test("320px, zoom 200%, falha parcial e transporte não expõem conteúdo bruto", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockConsole(page);
  for (const path of ["/acesso", "/skills", "/grafo", "/consultas"]) {
    await navigate(page, path);
    await page.evaluate(() => {
      (
        globalThis as unknown as { document: { documentElement: { style: { zoom: string } } } }
      ).document.documentElement.style.zoom = "2";
    });
    expect(
      await page.evaluate(
        () =>
          (
            globalThis as unknown as {
              document: { documentElement: { scrollWidth: number } };
              innerWidth: number;
            }
          ).document.documentElement.scrollWidth <=
          (globalThis as unknown as { innerWidth: number }).innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      (
        globalThis as unknown as { document: { documentElement: { style: { zoom: string } } } }
      ).document.documentElement.style.zoom = "1";
    });
  }
  await page.route("**/app/api/auditoria", (route) =>
    route.fulfill({
      status: 502,
      contentType: "text/html",
      body: "<html>private proxy content</html>",
    }),
  );
  await navigate(page, "/operacao");
  await expect(page.getByRole("alert")).toContainText("resposta incompatível");
  await expect(page.getByRole("heading", { name: "Alertas", exact: true })).toBeVisible();
  await expect(page.getByText("private proxy content")).toHaveCount(0);
});

test("setup real com FakePlugServer: emissão e API isolada por acesso", async ({
  page,
}, testInfo) => {
  await page.goto("/app/conectar");
  await page.getByLabel("E-mail", { exact: true }).fill(`console-${Date.now()}@example.test`);
  await page.getByLabel("Senha do hub", { exact: true }).fill("synthetic-password");
  await page.getByRole("textbox", { name: /^Agente/ }).fill("11111111-1111-4111-8111-111111111111");
  await page.getByRole("combobox", { name: "Dialeto", exact: true }).selectOption("postgres");
  await page.getByLabel(/client_token/).fill(`synthetic-client-${Date.now()}`);
  await page.getByLabel("Confirmo esta operação no acesso informado").check();
  await page.getByRole("button", { name: "Conectar", exact: true }).click();
  await expect(page.getByRole("button", { name: /Copiar token/ })).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () =>
            (
              globalThis as unknown as {
                document: { documentElement: { scrollWidth: number } };
                innerWidth: number;
              }
            ).document.documentElement.scrollWidth <=
            (globalThis as unknown as { innerWidth: number }).innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`token-${theme}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.getByRole("link", { name: "Abrir manutenção", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Acesso desta persona");
  await navigate(page, "/consultas");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
