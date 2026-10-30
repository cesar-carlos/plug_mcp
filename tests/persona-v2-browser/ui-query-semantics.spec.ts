import { expect, test } from "@playwright/test";
import { queryTraining, trainingSource } from "../helpers/persona-v2-training.js";

test("semântica preserva edição e envia somente rascunho por ação explícita", async ({ page }) => {
  const training = queryTraining();
  const draft = {
    id: "synthetic-skill",
    name: "Pedidos",
    slug: "pedidos",
    kind: "consulta",
    revision: 1,
    training,
    activePublicationId: null,
  };
  const writes: {
    path: string;
    body: { training: { semantics?: { metrics: unknown[]; synonyms: string[] } } };
  }[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path.endsWith("/login"))
      json = { csrfToken: "fixture", expiresAt: new Date(Date.now() + 3600000).toISOString() };
    else if (route.request().method() === "POST") {
      writes.push({ path, body: route.request().postDataJSON() });
      await route.fulfill({
        status: 409,
        json: { error: { code: "OPERATION_CONFLICT", message: "Releia a revisão." } },
      });
      return;
    } else if (path === "/api/admin/personas")
      json = {
        personas: [
          {
            id: trainingSource.personaId,
            name: "Fixture",
            specialty: "Testes",
            instructions: "",
            active: true,
            authorizationVersion: 1,
          },
        ],
      };
    else if (path.endsWith("/fontes")) json = { fontes: [trainingSource] };
    else if (path.endsWith("/skills")) json = { skills: [draft] };
    else if (path.endsWith("/catalogos")) json = { catalogs: [] };
    else if (path.endsWith("/tokens")) json = { tokens: [] };
    else if (path.endsWith("/publicacao")) json = { publication: null };
    else if (path.endsWith("/testes-consulta"))
      json = {
        revision: 1,
        packageHash: null,
        casesHash: "fixture",
        cases: [],
        reports: [],
        requiredApproved: false,
        nextCursor: null,
      };
    else if (path.endsWith("/oauth")) json = { enabled: false };
    else if (path.endsWith("/progresso"))
      json = { steps: [], skills: [], sources: [], currentAvailabilityVerified: false };
    await route.fulfill({ json });
  });
  await page.goto("/app");
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("combobox", { name: /^Persona/ }).selectOption(trainingSource.personaId);
  await page.getByRole("link", { name: "Treinamentos", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Editar treinamento", exact: true })
    .selectOption(draft.id);
  await page.getByText("Métricas e termos comerciais", { exact: true }).click();
  await page.getByRole("button", { name: "Definir semântica comercial" }).click();
  const synonyms = page.getByLabel("Sinônimos da consulta (um por linha)");
  await synonyms.pressSequentially("Vendas liquidas");
  await expect(synonyms).toHaveValue("Vendas liquidas");
  await page.getByLabel("Sinônimos da consulta (um por linha)").fill("Receita\nVendas líquidas");
  await page.getByRole("button", { name: "Adicionar métrica", exact: true }).click();
  const metric = page.getByRole("group", { name: "Métrica 1", exact: true });
  await metric.getByRole("textbox", { name: "Identificador", exact: true }).fill("receita");
  await metric.getByRole("textbox", { name: "Nome", exact: true }).fill("Receita");
  await metric.getByLabel("Definição e fórmula comercial").fill("Soma do valor dos pedidos");
  await metric.getByLabel("Campos utilizados").selectOption(["1"]);
  await metric.getByLabel("Grão da medida").selectOption(["0"]);
  for (const label of [
    "Unidade e moeda",
    "Período, calendário e fuso",
    "Tratamento de nulos",
    "Valores negativos e devoluções",
    "Conciliação, descontos, frete e impostos",
  ]) {
    await metric.getByLabel(label).fill("Definição sintética revisada");
  }
  await page.getByText("Métricas e termos comerciais", { exact: true }).click();
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]!.path).toMatch(/rascunho$/);
  expect(writes[0]!.body.training.semantics).toMatchObject({
    synonyms: ["Receita", "Vendas líquidas"],
    metrics: [
      {
        id: "receita",
        inputs: [{ table: "orders", column: "amount" }],
        grain: [{ table: "orders", column: "id" }],
      },
    ],
  });
  await page.getByText("Métricas e termos comerciais", { exact: true }).click();
  await expect(metric.getByRole("textbox", { name: "Nome", exact: true })).toHaveValue("Receita");
  expect(writes).toHaveLength(1);
});
