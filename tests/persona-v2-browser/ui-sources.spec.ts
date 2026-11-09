import { expect, test } from "@playwright/test";

test("bases homônimas têm identidade visível, busca útil e suspensão somente após revisão", async ({
  page,
}) => {
  const sources = [1, 2].map((n) => ({
    id: `source-${n}`,
    name: "Campo",
    purpose: "Vendas",
    dialect: "mssql",
    database: `erp_${n}`,
    environment: n === 1 ? "produção" : "homologação",
    agentId: `agent-${n}`,
    active: true,
    authorizationVersion: 1,
  }));
  const writes: string[] = [];
  const deletionBodies: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path.endsWith("/login"))
      json = { csrfToken: "fixture", expiresAt: new Date(Date.now() + 3600000).toISOString() };
    else if (route.request().method() !== "GET") {
      writes.push(path);
      if (path.endsWith("/excluir")) {
        deletionBodies.push(route.request().postDataJSON());
        if (deletionBodies.length === 1) {
          await route.fulfill({
            status: 409,
            json: {
              error: {
                code: "OPERATION_CONFLICT",
                message: "Cadastro possui vínculos.",
                supportId: "fixture-support",
              },
            },
          });
          return;
        }
        sources.splice(
          sources.findIndex((s) => path.includes(s.id)),
          1,
        );
      }
      json = {};
    } else if (path === "/api/admin/personas")
      json = {
        personas: [
          {
            id: "persona",
            name: "Fixture",
            specialty: "Testes",
            instructions: "",
            active: true,
            authorizationVersion: 1,
          },
        ],
      };
    else if (path.endsWith("/fontes")) json = { fontes: sources };
    else if (path.endsWith("/skills")) json = { skills: [] };
    else if (path.endsWith("/tokens")) json = { tokens: [] };
    else if (path.endsWith("/catalogos")) json = { catalogs: [] };
    else if (path.endsWith("/oauth")) json = { enabled: false };
    else if (path.endsWith("/progresso"))
      json = { steps: [], skills: [], sources: [], currentAvailabilityVerified: false };
    else if (path.endsWith("/impacto")) json = { sourceVersion: 1, total: 0, publications: [] };
    await route.fulfill({ json });
  });
  await page.goto("/app");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("combobox", { name: /^Persona/ }).selectOption("persona");
  await page.getByRole("link", { name: "Bases", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Buscar bases" });
  for (const query of ["erp_2", "homologacao", "source-2"]) {
    await search.fill(query);
    await expect(page.locator("#source-source-1")).toBeHidden();
    await expect(page.locator("#source-source-2")).toBeVisible();
  }
  await search.fill("fixture@example.test");
  await expect(page.getByText("Nenhum resultado.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Limpar buscar bases" }).click();
  await expect(page.locator("#source-source-1")).toContainText("source-1");
  await expect(page.locator("#source-source-2")).toContainText("Há outros cadastros com este nome");
  const picker = page.getByRole("combobox", { name: "Base para conhecimento" });
  await expect(picker.locator('option[value="source-1"]')).toContainText(
    "erp_1 · produção · mssql · ID: source-1",
  );
  await expect(picker.locator('option[value="source-2"]')).toContainText(
    "erp_2 · homologação · mssql · ID: source-2",
  );
  await page.getByText("Cadastrei uma base duplicada. Como remover?", { exact: true }).click();
  await expect(page.getByText("O banco externo não será apagado.", { exact: false })).toBeVisible();
  await page.locator("#source-source-2").getByRole("button", { name: "Revisar suspensão" }).click();
  await expect(page.getByRole("form", { name: "Confirmar suspender base Campo" })).toBeVisible();
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Continuar sem alterar" }).click();
  for (const attempt of [1, 2]) {
    await page
      .locator("#source-source-2")
      .getByRole("button", { name: "Excluir cadastro", exact: true })
      .click();
    const form = page.getByRole("form", { name: "Confirmar excluir base Campo" });
    const remove = form.getByRole("button", { name: "Excluir definitivamente este cadastro" });
    await expect(remove).toBeDisabled();
    await expect(form).toContainText("ID: source-2");
    await form.getByRole("checkbox").check();
    await remove.click();
    if (attempt === 1) {
      await expect(
        page.getByText("Cadastro possui vínculos.", { exact: false }).first(),
      ).toBeVisible();
      await expect(page.locator("#source-source-2")).toBeVisible();
      expect(deletionBodies).toHaveLength(1);
    }
  }
  await expect(page.locator("#source-source-2")).toHaveCount(0);
  await expect(page.locator("#source-source-1")).toBeVisible();
  expect(deletionBodies).toEqual([
    { expectedVersion: 1, confirmedSourceId: "source-2" },
    { expectedVersion: 1, confirmedSourceId: "source-2" },
  ]);
});
