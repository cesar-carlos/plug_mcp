import { test, expect } from "@playwright/test";
import express from "express";
import request from "supertest";
import { registerPersonaOAuthRoutes } from "../../src/infrastructure/http/persona-v2-oauth.js";
import type { PersonaOAuth } from "../../src/application/persona-v2/oauth.js";
import type { PersonaConsumerCatalog } from "../../src/application/persona-v2/consumer-catalog.js";

test("consentimento organiza grupos e seleção em lote sem conceder outros grupos", async ({
  page,
}) => {
  const app = express();
  const oauth = {
    policy: { issuer: "https://consent.test", resource: "https://consent.test/mcp/chatgpt" },
    authenticate: async () => ({
      redirectUri: "https://client.test/callback",
      persona: "Persona sintética",
      csrf: "fixture",
      identity: { personaId: "fixture" },
      permissions: {
        sourceIds: ["source-a", "source-b"],
        skills: [],
        externalOperationIds: [],
        administrative: ["gerenciar_tokens"],
      },
    }),
  } as unknown as PersonaOAuth;
  const catalog = {
    sources: async () => [
      { id: "source-a", name: "Base A", dialect: "postgres" },
      { id: "source-b", name: "Base B", dialect: "postgres" },
    ],
    list: async () => [],
    grantedSkillNames: async () => new Map(),
  } as unknown as PersonaConsumerCatalog;
  registerPersonaOAuthRoutes(app, oauth, catalog);
  const response = await request(app)
    .post("/oauth/persona-v2/authenticate")
    .set("Host", "consent.test")
    .set("Origin", "https://consent.test")
    .type("form")
    .send({ transaction: "fixture", csrf: "fixture", token: "synthetic" });
  expect(response.status).toBe(200);
  await page.route("https://consent.test/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      headers: { "Content-Security-Policy": response.headers["content-security-policy"]! },
      body: response.text,
    }),
  );
  await page.goto("https://consent.test/oauth/persona-v2/authenticate");
  const bases = page.getByRole("group", { name: "Bases", exact: true });
  await expect(page.locator("input:checked")).toHaveCount(0);
  await bases.getByRole("button", { name: "Marcar todos", exact: true }).click();
  await expect(bases.locator("input:checked")).toHaveCount(2);
  await expect(page.locator('input[name="administrative"]')).not.toBeChecked();
  await expect(bases.getByText("2 de 2 selecionados")).toBeVisible();
  await bases.getByRole("button", { name: "Desmarcar todos", exact: true }).click();
  await expect(page.locator("input:checked")).toHaveCount(0);
  await expect(page.locator('input[name="query_maxRows"]')).toBeHidden();
  await page.getByText("Limites de consulta da conexão · opcional", { exact: true }).click();
  await page.locator('input[name="query_maxRows"]').fill("5");
  await page.getByText("Limites de consulta da conexão · opcional", { exact: true }).click();
  await expect(page.locator('input[name="query_maxRows"]')).toHaveValue("5");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
  await page.screenshot({ path: "test-results/oauth-consent-mobile.png", fullPage: true });
});
