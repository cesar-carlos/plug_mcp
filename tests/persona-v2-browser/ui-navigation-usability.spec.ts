import { expect, test } from "@playwright/test";

test("hierarquia, busca e guia recolhido preservam foco, diagnóstico e ausência de escritas", async ({
  page,
}, testInfo) => {
  const writes: string[] = [];
  let progressReads = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path.endsWith("/login"))
      json = { csrfToken: "fixture", expiresAt: new Date(Date.now() + 3600000).toISOString() };
    else if (route.request().method() !== "GET") writes.push(path);
    else if (path === "/api/admin/personas")
      json = {
        personas: [
          {
            id: "persona",
            name: "Persona sintética",
            specialty: "Testes",
            instructions: "",
            active: true,
            authorizationVersion: 1,
          },
        ],
      };
    else if (path.endsWith("/fontes"))
      json = {
        fontes: [1, 2].map((n) => ({
          id: `source-${n}`,
          name: `Base ${n}`,
          purpose: "Vendas",
          dialect: "mssql",
          database: `fixture_${n}`,
          environment: "teste",
          agentId: `agent-${n}`,
          active: true,
          authorizationVersion: 1,
        })),
      };
    else if (path.endsWith("/skills")) json = { skills: [] };
    else if (path.endsWith("/tokens")) json = { tokens: [] };
    else if (path.endsWith("/catalogos")) json = { catalogs: [] };
    else if (path.endsWith("/oauth")) json = { enabled: false };
    else if (path.endsWith("/progresso")) {
      progressReads++;
      await route.fulfill({
        status: 503,
        headers: { "X-Request-ID": "11111111-1111-4111-8111-111111111111" },
        json: {
          error: {
            code: "TEMPORARY_UNAVAILABLE",
            message: "Não foi possível conferir o roteiro.",
            supportId: "11111111-1111-4111-8111-111111111111",
          },
        },
      });
      return;
    }
    await route.fulfill({ json });
  });
  await page.goto("/app");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("combobox", { name: /^Persona/ }).selectOption("persona");
  await page.getByRole("link", { name: "Bases", exact: true }).click();
  const heading = page.locator("#console-content");
  const guide = page.getByRole("region", { name: "Guia passo a passo" });
  await expect(heading).toHaveText("Bases");
  await expect(guide.getByRole("alert")).toContainText("11111111-1111-4111-8111-111111111111");
  expect((await heading.boundingBox())!.y).toBeLessThan((await guide.boundingBox())!.y);
  const toggle = guide.getByRole("button", { name: "Ocultar guia" });
  const controlId = await toggle.getAttribute("aria-controls");
  await toggle.click();
  await expect(guide.getByRole("button", { name: "Mostrar guia" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.locator(`[id="${controlId}"]`)).toBeHidden();
  await expect(guide.getByRole("alert")).toContainText("11111111-1111-4111-8111-111111111111");
  await expect(guide).not.toContainText("Nenhum passo pendente");
  const reads = progressReads;
  const search = page.getByRole("searchbox", { name: "Buscar bases" });
  await search.fill("inexistente");
  await expect(page.getByText("Nenhum resultado. Limpe a busca ou use outro nome.")).toBeVisible();
  await page.getByRole("button", { name: "Limpar buscar bases" }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await search.fill("Base 1");
  await expect(page.getByText("1 de 2 registros correspondem à busca.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("sources-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  const nav = page.getByRole("navigation", { name: "Áreas do console" });
  await nav.getByRole("link", { name: "Bases", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
  await expect(nav.getByRole("link", { name: "Bases", exact: true })).toBeHidden();
  await expect(search).toHaveValue("Base 1");
  await page.evaluate("window.scrollTo(0, 0)");
  expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("sources-mobile.png"), fullPage: true });
  expect(progressReads).toBe(reads);
  expect(writes).toEqual([]);
});
