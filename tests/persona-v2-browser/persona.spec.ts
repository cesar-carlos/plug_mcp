import { withReviewDeadline } from "../helpers/review-deadline.js";
import { expect, test, type Page, type Locator } from "@playwright/test";
import { structureContent } from "../helpers/persona-v2-structure.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

import { runFederationCases } from "../../src/application/persona-v2/federation-cases.js";
import { runOperationCases } from "../../src/application/persona-v2/operation-cases.js";
import { PostgresOperationCaseExecutor } from "../../src/infrastructure/persistence/persona-v2/operation-case-postgres.js";
import { operationTraining, operationInput } from "../helpers/persona-v2-operation.js";
import { PostgresPersonaRepository } from "../../src/infrastructure/persistence/persona-v2/repository.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { testConfig } from "../../src/config/env.js";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { PersonaReviewWorker } from "../../src/application/persona-v2/review-worker.js";
import { PostgresReviewWorker } from "../../src/infrastructure/persistence/persona-v2/review-worker.js";
import { PersonaRetentionWorker } from "../../src/application/persona-v2/retention-worker.js";
import { PostgresPersonaRetentionWorker } from "../../src/infrastructure/persistence/persona-v2/retention-worker.js";
import { randomUUID } from "node:crypto";
import { exerciseManualPublication } from "../helpers/persona-manual-publication.js";
import { queryTraining } from "../helpers/persona-v2-training.js";
import type {
  FederationCase,
  FederationPublicationCase,
} from "../../src/domain/persona-v2/federation-training.js";
import {
  seedExternalAction,
  seedExternalConnection,
  runExternalBrowserCases,
} from "../helpers/persona-external-action.js";

const go = async (page: Page, area: string) => {
  await expect(page.getByRole("button", { name: "Sair", exact: true })).toBeEnabled();
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if ((await menu.isVisible()) && (await menu.getAttribute("aria-expanded")) !== "true")
    await menu.click();
  await page
    .getByRole("navigation", { name: "Áreas do console" })
    .getByRole("link", { name: area, exact: true })
    .click();
};

async function checkEditorErrors(
  page: Page,
  form: Locator,
  nameLabel: string,
  saveLabel: string,
  external = false,
) {
  const name = form.getByLabel(nameLabel, { exact: true });
  const original = await name.inputValue();
  let field = "name";
  const url = external
    ? "**/api/admin/personas/*/integracoes/skills/*/rascunho"
    : "**/api/admin/personas/*/skills/*/rascunho";
  await page.route(url, (route) =>
    route.fulfill({
      status: 400,
      json: {
        error: {
          code: "INVALID_TRAINING",
          message: "Revise o contrato informado.",
          fields: [field],
        },
      },
    }),
  );
  try {
    await form.getByRole("button", { name: saveLabel, exact: true }).click();
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveAccessibleDescription("Revise o contrato informado.");
    field = external ? "contract" : "training";
    await form.getByRole("button", { name: saveLabel, exact: true }).click();
    await expect(form.locator('p[aria-invalid="true"]')).toBeFocused();
    await expect(name).not.toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveValue(original);
  } finally {
    await page.unroute(url);
  }
}

const login = async (page: Page) => {
  await page.goto("/app");
  let reply = page.waitForResponse((response) => response.url().endsWith("/api/admin/login"));
  await page.getByLabel("E-mail", { exact: true }).fill("owner@fixture.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  if ((await reply).status() === 429) {
    // Respect the production throttle with a known cooldown; never disable it in the fixture.
    const delay = Number((await reply).headers()["retry-after"]);
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(60);
    test.setTimeout(90000);
    await new Promise((resolve) => setTimeout(resolve, delay * 1000));
    reply = page.waitForResponse((response) => response.url().endsWith("/api/admin/login"));
    await page.getByLabel("Senha", { exact: true }).fill("fixture-password");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
  }
  expect((await reply).status()).toBe(200);
  await expect(page.getByRole("button", { name: "Sair", exact: true })).toBeVisible();
  return (await (await reply).json()) as { csrfToken: string };
};

test("gestão de integrações no token exige seleção explícita e permite retirar escopo", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, `Escopo de gestão ${randomUUID()}`);
  const personaId = await page.getByRole("combobox", { name: "Persona", exact: true }).inputValue();
  const state = JSON.parse(
    await readFile("node_modules/.cache/persona-v2-browser-state.json", "utf8"),
  ) as { databaseName: string };
  expect(state.databaseName).toMatch(/^persona_browser_[a-f0-9]{32}_test$/);
  const url = new URL(personaV2TestDatabaseUrl());
  url.pathname = `/${state.databaseName}`;
  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    const c = testConfig();
    const crypto = new NodeCryptoAdapter(
      c.MCP_ENCRYPTION_KEY,
      c.MCP_ENCRYPTION_KEY_ID,
      c.MCP_ENCRYPTION_PREVIOUS_KEYS,
      c.MCP_ENCRYPTION_LEGACY_KEY,
    );
    const id = await seedExternalConnection(pool, crypto, personaId, "rest");
    await go(page, "Tokens e conexões");
    const form = page.getByRole("form", { name: "Emitir token", exact: true });
    await form.getByLabel("Nome do consumidor", { exact: true }).fill("Gestor explícito");
    await form
      .getByLabel("Gerenciar integrações (execução exige concessões próprias)", { exact: true })
      .check();
    const scope = form.getByRole("group", { name: "Integrações para administração", exact: true });
    await expect(scope.getByRole("checkbox")).toHaveCount(1);
    await expect(scope.getByRole("checkbox")).not.toBeChecked();
    await scope.getByRole("checkbox").check();
    const issued = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().endsWith(`/personas/${personaId}/tokens`),
    );
    await form.getByRole("button", { name: "Emitir token restrito", exact: true }).click();
    expect((await issued).status()).toBe(201);
    const tokenRow = async () =>
      (
        await pool.query("SELECT permissoes FROM persona_token WHERE persona_id=$1 AND nome=$2", [
          personaId,
          "Gestor explícito",
        ])
      ).rows[0].permissoes;
    expect(await tokenRow()).toMatchObject({
      managedIntegrationIds: [id],
      externalOperationIds: [],
      skills: [],
    });
    await page.getByRole("button", { name: "Editar Gestor explícito", exact: true }).click();
    const edit = page.getByRole("form", { name: "Editar token", exact: true });
    const selected = edit
      .getByRole("group", { name: "Integrações para administração", exact: true })
      .getByRole("checkbox");
    await expect(selected).toBeChecked();
    await selected.uncheck();
    await edit.getByRole("button", { name: "Salvar token", exact: true }).click();
    await expect.poll(async () => (await tokenRow()).managedIntegrationIds).toEqual([]);
    expect(await tokenRow()).toMatchObject({ externalOperationIds: [], skills: [] });
  } finally {
    await pool.end();
  }
});

test("delegação recupera leitura e confirmação perdida sem repetir a mutação", async ({ page }) => {
  await login(page);
  await createPersona(page, `Delegação recuperável ${randomUUID()}`);
  let reads = 0;
  let mutations = 0;
  let version = 0;
  await page.route("**/api/admin/personas/*/delegation{,/**}", async (route) => {
    if (route.request().method() === "GET") {
      reads++;
      if (reads === 1) {
        await route.fulfill({ status: 503, json: { error: "fixture unavailable" } });
        return;
      }
      await route.fulfill({
        json: {
          version,
          active: version > 0,
          expiresAt: null,
          administrative: version ? ["treinar"] : [],
        },
      });
      return;
    }
    mutations++;
    expect(route.request().postDataJSON().expectedVersion).toBe(0);
    version = 1;
    // Remote outcome happened, but the browser cannot confirm it. Never repeat the POST.
    await route.abort("failed");
  });
  await go(page, "Tokens e conexões");
  const panel = page.getByRole("region", { name: "Delegação administrativa", exact: true });
  await expect(panel.getByRole("alert")).toBeFocused();
  await panel.getByRole("button", { name: "Conferir estado da delegação", exact: true }).click();
  const permission = panel.getByLabel("Treinar skills nas bases selecionadas", { exact: true });
  await permission.check();
  page.once("dialog", (dialog) => dialog.accept());
  await panel.getByRole("button", { name: "Criar delegação por 30 dias", exact: true }).click();
  await expect(panel.getByRole("alert")).toBeFocused();
  await expect(permission).toBeChecked();
  await expect(
    panel.getByRole("button", { name: "Criar delegação por 30 dias", exact: true }),
  ).toBeDisabled();
  expect(mutations).toBe(1);
  page.once("dialog", (dialog) => dialog.dismiss());
  await panel.getByRole("button", { name: "Conferir estado da delegação", exact: true }).click();
  expect(reads).toBe(2);
  await expect(permission).toBeChecked();
  page.once("dialog", (dialog) => dialog.accept());
  await panel.getByRole("button", { name: "Conferir estado da delegação", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Renovar delegação por 30 dias", exact: true }),
  ).toBeEnabled();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  expect(reads).toBe(3);
  expect(mutations).toBe(1);
});

test("emissão incerta exige conferir lista e nova escolha explícita sem reenviar", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, `Emissão incerta ${randomUUID()}`);
  let emissions = 0;
  let unavailable = false;
  const tokens: object[] = [];
  await page.route("**/api/admin/personas/*/tokens", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill(
        unavailable
          ? { status: 503, json: { error: "fixture unavailable" } }
          : { json: { tokens } },
      );
      return;
    }
    emissions++;
    const body = route.request().postDataJSON();
    tokens.push({ ...body, id: randomUUID(), authorizationVersion: 1, revokedAt: null });
    await route.abort("failed");
  });
  await go(page, "Tokens e conexões");
  const form = page.getByRole("form", { name: "Emitir token", exact: true });
  await form.getByLabel("Nome do consumidor", { exact: true }).fill("Consumidor sem resposta");
  await form
    .getByLabel("Administrar tokens dentro dos limites de delegação", { exact: true })
    .check();
  await form.getByRole("button", { name: "Emitir token restrito", exact: true }).click();
  const recovery = page.getByRole("region", {
    name: "Conferir emissão sem confirmação",
    exact: true,
  });
  await expect(recovery).toBeVisible();
  await expect(
    form.getByRole("button", { name: "Emitir token restrito", exact: true }),
  ).toBeDisabled();
  await expect(
    recovery.getByRole("button", { name: "Iniciar nova emissão", exact: true }),
  ).toBeDisabled();
  unavailable = true;
  await recovery
    .getByRole("button", { name: "Conferir tokens antes de nova emissão", exact: true })
    .click();
  await expect(
    recovery.getByRole("button", { name: "Iniciar nova emissão", exact: true }),
  ).toBeDisabled();
  unavailable = false;
  await recovery
    .getByRole("button", { name: "Conferir tokens antes de nova emissão", exact: true })
    .click();
  await expect(recovery.getByRole("listitem")).toContainText("Consumidor sem resposta");
  page.once("dialog", (dialog) => dialog.accept());
  await recovery.getByRole("button", { name: "Iniciar nova emissão", exact: true }).click();
  await expect(recovery).toHaveCount(0);
  await expect(form.getByLabel("Nome do consumidor", { exact: true })).toHaveValue("");
  await expect(
    form.getByLabel("Administrar tokens dentro dos limites de delegação", { exact: true }),
  ).not.toBeChecked();
  expect(emissions).toBe(1);
});

test("tokens bloqueiam nova alteração após confirmação perdida e recuperam por leitura", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, `Tokens recuperáveis ${randomUUID()}`);
  const permissions = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const token = {
    id: randomUUID(),
    name: "Consumidor fixture",
    expiresAt: null,
    revokedAt: null,
    authorizationVersion: 1,
    permissions,
    delegation: permissions,
  };
  let mutations = 0;
  let failRead = false;
  await page.route("**/api/admin/personas/*/tokens{,/**}", async (route) => {
    if (route.request().method() === "GET") {
      if (failRead) {
        await route.fulfill({ status: 503, json: { error: "fixture unavailable" } });
      } else await route.fulfill({ json: { tokens: [token] } });
      return;
    }
    mutations++;
    token.name = route.request().postDataJSON().name;
    token.authorizationVersion++;
    await route.abort("failed");
  });
  await go(page, "Tokens e conexões");
  const panel = page.getByRole("region", { name: "Gerenciar tokens", exact: true });
  await panel.getByRole("button", { name: "Editar Consumidor fixture", exact: true }).click();
  await panel.getByLabel("Nome do consumidor", { exact: true }).fill("Nome alterado");
  await panel.getByRole("button", { name: "Salvar token", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Salvar token", exact: true })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Rotacionar token", exact: true })).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Revogar Consumidor fixture", exact: true }),
  ).toBeDisabled();
  failRead = true;
  const failedRead = page.waitForResponse(
    (response) => response.url().endsWith("/tokens") && response.status() === 503,
  );
  await panel.getByRole("button", { name: "Conferir estado dos tokens", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Descartar alterações", exact: true })
    .click();
  await failedRead;
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Salvar token", exact: true })).toBeDisabled();
  await expect(panel.getByLabel("Nome do consumidor", { exact: true })).toHaveValue(
    "Nome alterado",
  );
  failRead = false;
  await panel.getByRole("button", { name: "Conferir estado dos tokens", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Descartar alterações", exact: true })
    .click();
  await expect(panel.getByRole("button", { name: "Salvar token", exact: true })).toBeEnabled();
  await expect(panel.getByText(/versão 2/)).toBeVisible();
  expect(mutations).toBe(1);
});

async function consumerOperationFixture(page: Page, kind: "sql" | "external") {
  const { csrfToken } = await login(page);
  const name = `Consumidor ${kind} ${randomUUID()}`;
  await createPersona(page, name);
  const personasResponse = await page.request.get("/api/admin/personas", {
    headers: { Origin: "http://127.0.0.1:5188", "X-CSRF-Token": csrfToken },
  });
  expect(personasResponse.status()).toBe(200);
  const { personas } = (await personasResponse.json()) as {
    personas: { id: string; name: string }[];
  };
  const personaId = personas.find((item) => item.name === name)!.id;
  const operation = {
    operationId: randomUUID(),
    fingerprint: "a".repeat(64),
    sourceId: "fixture-source",
    publicationId: randomUUID(),
    name: "Ação sintética",
    state: "aprovada",
    version: 1,
    requireHumanApproval: true,
    expiresAt: new Date(Date.now() + 900000).toISOString(),
    receipt: null as unknown,
    reconciliation: null as unknown,
    command: null,
    contract: null,
  };
  const suffix = kind === "sql" ? "operations" : "external-actions";
  // UI transport fixture only. Existing server/native suites own authorization and real effects.
  await page.route(`**/api/admin/personas/*/${suffix}**`, async (route) => {
    await route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith(operation.operationId)
        ? operation
        : { operations: [operation], nextCursor: null },
    });
  });
  const calls: string[] = [];
  const behavior = {
    persona: personaId,
    execute: () => Promise.resolve(),
  };
  await page.route("**/mcp", async (route) => {
    const body = route.request().postDataJSON() as {
      id: number;
      params: { name: string; arguments: unknown };
    };
    const tool = body.params.name;
    expect(route.request().headers().authorization).toBe("Bearer fixture-consumer-token");
    calls.push(tool);
    let result: unknown = operation;
    if (tool === "obter_contexto_persona") result = { id: behavior.persona };
    else {
      expect(body.params.arguments).toEqual({
        operationId: operation.operationId,
        fingerprint: operation.fingerprint,
      });
      if (tool.startsWith("executar_")) {
        await behavior.execute();
        operation.state = "resultado_desconhecido";
        operation.receipt = { state: "resultado_desconhecido" };
      } else if (tool.startsWith("cancelar_")) operation.state = "cancelada";
      else if (tool.startsWith("conciliar_")) {
        operation.reconciliation = { status: "inconclusive", classification: "inconclusiva" };
        if (kind === "external") result = operation.reconciliation;
      } else expect(tool).toBe(kind === "sql" ? "obter_operacao" : "obter_acao_externa");
    }
    await route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: body.id,
        result: { content: [{ type: "text", text: JSON.stringify(result) }] },
      },
    });
  });
  await go(page, kind === "sql" ? "Operações" : "Integrações");
  await page
    .getByRole("button", {
      name:
        kind === "sql"
          ? `Revisar ${operation.operationId}`
          : `Revisar ação ${operation.operationId}`,
      exact: true,
    })
    .click();
  const panel = page.getByRole("region", { name: "Ações do consumidor", exact: true });
  await panel
    .getByLabel("Token do consumidor para esta operação", { exact: true })
    .fill("fixture-consumer-token");
  return { panel, operation, calls, behavior };
}

test("consumidor SQL executa uma vez, acompanha unknown e concilia sem reenviar em 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await consumerOperationFixture(page, "sql");
  await expect(
    f.panel.getByRole("button", { name: "Executar conteúdo preparado", exact: true }),
  ).toHaveCount(0);
  await f.panel
    .getByRole("button", { name: "Verificar estado com este token", exact: true })
    .click();
  await expect(f.panel.getByText("Estado do consumidor: Aprovada", { exact: true })).toBeVisible();
  await f.panel
    .getByLabel("Confirmo executar uma vez o conteúdo preparado e revisado", { exact: true })
    .check();
  await go(page, "Bases");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  let release!: () => void;
  f.behavior.execute = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  await f.panel.getByRole("button", { name: "Executar conteúdo preparado", exact: true }).click();
  await expect.poll(() => f.calls.filter((tool) => tool === "executar_operacao").length).toBe(1);
  await expect(
    f.panel.getByRole("button", { name: "Verificar estado com este token", exact: true }),
  ).toBeDisabled();
  release();
  await expect(
    f.panel.getByText("Estado do consumidor: Resultado desconhecido", { exact: true }),
  ).toBeVisible();
  await expect(
    f.panel.getByRole("button", { name: "Executar conteúdo preparado", exact: true }),
  ).toHaveCount(0);
  await f.panel
    .getByRole("button", { name: "Consultar conciliação treinada", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(f.panel.getByRole("status")).toContainText("Conciliação não autoriza reenviar");
  expect(f.calls.filter((tool) => tool === "executar_operacao")).toHaveLength(1);
  expect(f.calls).toContain("conciliar_operacao");
  expect(
    await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    ),
  ).not.toContain("fixture-consumer-token");
  expect(page.url()).not.toContain("fixture-consumer-token");
  expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
    true,
  );
  await f.panel.getByRole("button", { name: "Limpar token desta sessão", exact: true }).click();
  await expect(f.panel.getByText(/Estado do consumidor:/)).toHaveCount(0);
});

test("consumidor externo cancela antes do envio e outro token não herda a verificação", async ({
  page,
}) => {
  const f = await consumerOperationFixture(page, "external");
  await f.panel
    .getByRole("button", { name: "Verificar estado com este token", exact: true })
    .click();
  await f.panel
    .getByLabel("Confirmo solicitar cancelamento, sem garantia de reversão", { exact: true })
    .check();
  await f.panel.getByRole("button", { name: "Solicitar cancelamento", exact: true }).click();
  await expect(f.panel.getByText("Estado do consumidor: Cancelada", { exact: true })).toBeVisible();
  expect(f.calls).toContain("cancelar_acao_externa");
  expect(f.calls.some((tool) => tool.startsWith("executar_"))).toBe(false);
  await f.panel.getByRole("button", { name: "Limpar token desta sessão", exact: true }).click();
  f.behavior.persona = randomUUID();
  const reads = f.calls.filter((tool) => tool === "obter_acao_externa").length;
  await f.panel
    .getByLabel("Token do consumidor para esta operação", { exact: true })
    .fill("fixture-consumer-token");
  await f.panel
    .getByRole("button", { name: "Verificar estado com este token", exact: true })
    .click();
  await expect(f.panel.getByRole("alert")).toContainText("outra persona");
  await expect(f.panel.getByRole("alert")).toBeFocused();
  expect(f.calls.filter((tool) => tool === "obter_acao_externa")).toHaveLength(reads);
});

test("consumidor externo concilia unknown sem mudar receipt nem executar ação", async ({
  page,
}) => {
  const f = await consumerOperationFixture(page, "external");
  f.operation.state = "resultado_desconhecido";
  f.operation.receipt = { state: "resultado_desconhecido" };
  await f.panel
    .getByRole("button", { name: "Verificar estado com este token", exact: true })
    .click();
  await expect(
    f.panel.getByRole("button", { name: "Executar conteúdo preparado", exact: true }),
  ).toHaveCount(0);
  await f.panel
    .getByRole("button", { name: "Consultar conciliação treinada", exact: true })
    .click();
  await expect(f.panel.getByRole("status")).toContainText("Evidência consultada");
  expect(f.calls).toContain("conciliar_acao_externa");
  expect(f.calls.filter((tool) => tool === "obter_acao_externa")).toHaveLength(3);
  expect(f.operation.receipt).toEqual({ state: "resultado_desconhecido" });
  expect(f.calls.some((tool) => tool.startsWith("executar_"))).toBe(false);
});

test("notificações externas protegem edição, limpam segredo e não enviam teste", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await createPersona(page, `Avisos ${Date.now()}`);
  await go(page, "Operações");
  const panel = page.getByRole("region", { name: "Notificações externas", exact: true });
  await expect(panel.getByText("Envio desativado · Revisão 0", { exact: true })).toBeVisible();
  const form = panel.getByRole("form", { name: "Configurar notificações externas", exact: true });
  await expect(form.getByLabel("Habilitar envio", { exact: true })).toBeEnabled();
  await form.getByLabel("Habilitar envio", { exact: true }).check();
  await form
    .getByLabel("Endereço HTTPS público", { exact: true })
    .fill("http://fixture.example.com/notifications");
  await form
    .getByLabel("Segredo de assinatura", { exact: true })
    .fill("fixture_notification_secret_0123456789");
  await form.getByLabel("Revisões privadas vencidas", { exact: true }).check();
  await go(page, "Bases");
  await expect(page.getByRole("dialog", { name: "Há alterações não salvas" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await form.getByLabel(/Confirmo o destino e os metadados enviados/).check();
  await form.getByRole("button", { name: "Salvar notificações", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("HTTPS público");
  await expect(panel.getByRole("alert")).toBeFocused();
  await expect(form.getByLabel("Segredo de assinatura", { exact: true })).toHaveValue("");
  await form
    .getByLabel("Endereço HTTPS público", { exact: true })
    .fill("https://fixture.example.com/notifications");
  await form
    .getByLabel("Segredo de assinatura", { exact: true })
    .fill("fixture_notification_secret_0123456789");
  await form.getByRole("button", { name: "Salvar notificações", exact: true }).click();
  await expect(
    panel.getByText("Configuração salva. Nenhuma notificação de teste foi enviada.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(panel.getByText("Envio habilitado · Revisão 1", { exact: true })).toBeVisible();
  await expect(form.getByLabel("Segredo de assinatura", { exact: true })).toHaveValue("");
  expect(
    await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    ),
  ).not.toContain("fixture_notification_secret");
  expect(page.url()).not.toContain("fixture.example.com");
  await form.getByLabel("Habilitar envio", { exact: true }).uncheck();
  await form.getByLabel(/Confirmo o destino e os metadados enviados/).check();
  await form.getByRole("button", { name: "Salvar notificações", exact: true }).click();
  await expect(panel.getByText("Envio desativado · Revisão 2", { exact: true })).toBeVisible();
  await go(page, "Bases");
  await expect(panel).not.toBeVisible();
});

test("responsável revoga uma conexão OAuth no console sem revogar token ou outra conexão", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const name = `Conexões OAuth ${Date.now()}`;
  await createPersona(page, name);
  const state = JSON.parse(
    await readFile("node_modules/.cache/persona-v2-browser-state.json", "utf8"),
  ) as { databaseName: string };
  expect(state.databaseName).toMatch(/^persona_browser_[a-f0-9]{32}_test$/);
  const url = new URL(personaV2TestDatabaseUrl());
  url.pathname = `/${state.databaseName}`;
  const pool = new pg.Pool({ connectionString: url.toString() });
  const tokenId = randomUUID(),
    first = randomUUID(),
    second = randomUUID();
  try {
    const personaId = (
      await pool.query<{ id: string }>("SELECT id FROM persona WHERE nome=$1", [name])
    ).rows[0]!.id;
    const crypto = new NodeCryptoAdapter("01".repeat(32));
    const permissions = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
    await pool.query(
      "INSERT INTO persona_token(id,persona_id,nome,token_hash,permissoes,delegacao) VALUES($1,$2,'Consumidor OAuth',$3,$4,$4)",
      [tokenId, personaId, crypto.sha256Hex(randomUUID()), JSON.stringify(permissions)],
    );
    for (const id of [first, second])
      await pool.query(
        "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,1,$4,'https://client.fixture.test/oauth.json',now()+interval '1 day')",
        [id, personaId, tokenId, JSON.stringify(permissions)],
      );
    await go(page, "Tokens e conexões");
    const panel = page.getByRole("region", { name: "Conexões OAuth da persona", exact: true });
    await panel.getByRole("button", { name: "Atualizar conexões OAuth", exact: true }).click();
    await expect(
      panel.getByRole("button", { name: `Revisar revogação ${first}`, exact: true }),
    ).toBeEnabled();
    await panel.getByRole("button", { name: `Revisar revogação ${first}`, exact: true }).click();
    const form = panel.getByRole("form", { name: "Revogar conexão OAuth", exact: true });
    await expect(
      form.getByRole("button", { name: "Confirmar revogação da conexão", exact: true }),
    ).toBeDisabled();
    await go(page, "Bases");
    await expect(page.getByRole("dialog", { name: "Há alterações não salvas" })).toBeVisible();
    await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
    await form
      .getByLabel("Revisei esta conexão e confirmo sua revogação.", { exact: true })
      .check();
    await form.getByRole("button", { name: "Confirmar revogação da conexão", exact: true }).click();
    await expect(panel.getByRole("status")).toContainText(
      "revogada. Token originador e outras conexões foram preservados.",
    );
    await expect(
      panel.getByRole("button", { name: `Revisar revogação ${first}`, exact: true }),
    ).toBeDisabled();
    await expect(
      panel.getByRole("button", { name: `Revisar revogação ${second}`, exact: true }),
    ).toBeEnabled();
    expect(
      (await pool.query("SELECT revoked_at FROM persona_token WHERE id=$1", [tokenId])).rows[0]
        .revoked_at,
    ).toBeNull();
    expect(
      (await pool.query("SELECT revoked_at FROM oauth_concessao_v2 WHERE id=$1", [second])).rows[0]
        .revoked_at,
    ).toBeNull();
  } finally {
    await pool.end();
  }
});

for (const kind of ["rest", "mcp_http"] as const) {
  test(`cadastro direto ${kind} protege edição, cifra credenciais e recupera confirmação perdida`, async ({
    page,
  }) => {
    await login(page);
    await createPersona(page, `Cadastrar ${kind} ${Date.now()}`);
    const personaId = await page
      .getByRole("combobox", { name: "Persona", exact: true })
      .inputValue();
    const state = JSON.parse(
      await readFile("node_modules/.cache/persona-v2-browser-state.json", "utf8"),
    ) as { databaseName: string };
    expect(state.databaseName).toMatch(/^persona_browser_[a-f0-9]{32}_test$/);
    const url = new URL(personaV2TestDatabaseUrl());
    url.pathname = `/${state.databaseName}`;
    const pool = new pg.Pool({ connectionString: url.toString() });
    try {
      await go(page, "Integrações");
      const panel = page.getByRole("region", { name: "Gestão das integrações", exact: true });
      let posts = 0;
      await page.route("**/integracoes/gestao", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        posts++;
        if (kind === "rest" && posts === 1) {
          // Commit through the real HTTP service, then lose only its confirmation.
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          await route.fulfill({
            status: 502,
            json: {
              error: {
                code: "FIXTURE_CONFIRMATION_LOST",
                message: "Confirmação perdida. Confira a lista.",
              },
            },
          });
        } else await route.continue();
      });
      const c = testConfig(),
        crypto = new NodeCryptoAdapter(
          c.MCP_ENCRYPTION_KEY,
          c.MCP_ENCRYPTION_KEY_ID,
          c.MCP_ENCRYPTION_PREVIOUS_KEYS,
          c.MCP_ENCRYPTION_LEGACY_KEY,
        );
      for (const credentialType of ["bearer", "api_key", "basic"]) {
        await panel.getByRole("button", { name: "Cadastrar integração", exact: true }).click();
        const form = panel.getByRole("form", {
          name: "Confirmar mudança da integração",
          exact: true,
        });
        await form
          .getByLabel("Nome da integração", { exact: true })
          .fill(`${kind} ${credentialType}`);
        await form
          .getByRole("combobox", { name: "Tipo da integração", exact: true })
          .selectOption(kind);
        await form
          .getByLabel("Destino HTTPS da integração", { exact: true })
          .fill("https://isolated.example.com/mcp");
        await form
          .getByRole("combobox", { name: "Tipo da nova credencial", exact: true })
          .selectOption(credentialType);
        await form
          .getByLabel("E-mail do responsável para reautenticação", { exact: true })
          .fill("owner@fixture.test");
        await form
          .getByLabel("Senha do responsável para reautenticação", { exact: true })
          .fill("fixture-password");
        if (credentialType === "bearer")
          await form
            .getByLabel("Novo Bearer da integração", { exact: true })
            .fill("browser-private-create");
        else if (credentialType === "api_key") {
          await form.getByLabel("Header da API key", { exact: true }).fill("X-Fixture-Key");
          await form.getByLabel("Nova API key", { exact: true }).fill("browser-private-create");
        } else {
          await form.getByLabel("Usuário técnico Basic", { exact: true }).fill("technical");
          await form
            .getByLabel("Nova senha técnica Basic", { exact: true })
            .fill("browser-private-create");
        }
        if (credentialType === "bearer") {
          await go(page, "Bases");
          await expect(
            page.getByRole("dialog", { name: "Há alterações não salvas" }),
          ).toBeVisible();
          await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
          await expect(form.getByLabel("Novo Bearer da integração", { exact: true })).toHaveValue(
            "browser-private-create",
          );
          for (const width of [360, 390, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            expect(
              await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"),
            ).toBe(true);
          }
        }
        await form
          .getByLabel("Revisei destino e credenciais e confirmo o cadastro sem operações ativas.", {
            exact: true,
          })
          .check();
        const save = form.getByRole("button", {
          name: "Confirmar cadastro da integração",
          exact: true,
        });
        await save.click();
        if (kind === "rest" && credentialType === "bearer") {
          await expect(panel.getByRole("alert")).toContainText("Confirmação perdida");
          await expect(form.getByLabel("Novo Bearer da integração", { exact: true })).toHaveValue(
            "",
          );
          await expect(
            form.getByLabel("Senha do responsável para reautenticação", { exact: true }),
          ).toHaveValue("");
          await expect(save).toBeDisabled();
          expect(posts).toBe(1);
          await panel
            .getByRole("button", { name: "Recarregar gestão de integrações", exact: true })
            .click();
          await page
            .getByRole("dialog", { name: "Há alterações não salvas" })
            .getByRole("button", { name: "Descartar alterações", exact: true })
            .click();
          await expect(panel.getByRole("status")).toContainText("Cadastro localizado");
        } else
          await expect(panel.getByRole("status")).toContainText(
            "Integração cadastrada e desativada",
          );
        expect(await panel.locator('input[type="password"]').count()).toBe(0);
        const row = (
          await pool.query("SELECT * FROM integracao WHERE persona_id=$1 AND nome=$2", [
            personaId,
            `${kind} ${credentialType}`,
          ])
        ).rows;
        expect(row).toHaveLength(1);
        expect(row[0]).toMatchObject({ ativa: false, tipo: kind, credencial_versao: 1 });
        expect(row[0].credencial_enc).not.toContain("browser-private-create");
        expect(JSON.parse(crypto.decrypt(row[0].credencial_enc)).credential.credentialType).toBe(
          credentialType,
        );
        await expect(
          panel.getByRole("combobox", { name: "Integração a gerenciar", exact: true }),
        ).toHaveValue(row[0].id);
      }
      expect(posts).toBe(3);
      expect(
        (
          await pool.query("SELECT count(*) FROM integracao_operacao WHERE persona_id=$1", [
            personaId,
          ])
        ).rows[0].count,
      ).toBe("0");
      expect(
        (await pool.query("SELECT count(*) FROM skill_v2 WHERE persona_id=$1", [personaId])).rows[0]
          .count,
      ).toBe("0");
      const audit = await pool.query(
        "SELECT * FROM audit_v2 WHERE persona_id=$1 AND evento='integration.created'",
        [personaId],
      );
      expect(audit.rows).toHaveLength(3);
      expect(JSON.stringify(audit.rows)).not.toContain("browser-private-create");
      expect(
        await page.evaluate(
          "JSON.stringify({local:{...localStorage},session:{...sessionStorage}})",
        ),
      ).not.toContain("browser-private-create");
      expect(page.url()).not.toContain("browser-private-create");
    } finally {
      await pool.end();
    }
  });
}
for (const kind of ["rest", "mcp_http"] as const) {
  test(`gestão de integração ${kind} suspende, rotaciona credenciais e recupera sem restaurar contratos`, async ({
    page,
  }) => {
    await login(page);
    await createPersona(page, `Gerenciar ${kind} ${Date.now()}`);
    const personaId = await page
      .getByRole("combobox", { name: "Persona", exact: true })
      .inputValue();
    const state = JSON.parse(
      await readFile("node_modules/.cache/persona-v2-browser-state.json", "utf8"),
    ) as { databaseName: string };
    expect(state.databaseName).toMatch(/^persona_browser_[a-f0-9]{32}_test$/);
    const url = new URL(personaV2TestDatabaseUrl());
    url.pathname = `/${state.databaseName}`;
    const pool = new pg.Pool({ connectionString: url.toString() });
    try {
      const c = testConfig(),
        crypto = new NodeCryptoAdapter(
          c.MCP_ENCRYPTION_KEY,
          c.MCP_ENCRYPTION_KEY_ID,
          c.MCP_ENCRYPTION_PREVIOUS_KEYS,
          c.MCP_ENCRYPTION_LEGACY_KEY,
        );
      if (kind === "rest") await seedExternalAction(pool, crypto, personaId);
      else await seedExternalConnection(pool, crypto, personaId, kind);
      const initial = await pool.query(
        "SELECT id,nome,tipo,destino FROM integracao WHERE persona_id=$1",
        [personaId],
      );
      const id = initial.rows[0].id as string;
      const journalBefore = await pool.query(
        "SELECT id,estado,fingerprint,payload_enc,comprovante FROM external_action_v2 WHERE persona_id=$1 ORDER BY id",
        [personaId],
      );
      await go(page, "Integrações");
      const panel = page.getByRole("region", { name: "Gestão das integrações", exact: true });
      await panel
        .getByRole("button", { name: "Recarregar gestão de integrações", exact: true })
        .click();
      await panel
        .getByRole("combobox", { name: "Integração a gerenciar", exact: true })
        .selectOption(id);
      await panel
        .getByRole("button", { name: "Revisar suspensão da integração", exact: true })
        .click();
      await panel
        .getByLabel("Revisei o impacto e confirmo esta mudança da integração.", { exact: true })
        .check();
      await panel
        .getByRole("button", { name: "Confirmar suspensão da integração", exact: true })
        .click();
      await expect(panel.getByRole("status")).toContainText("Integração suspensa");
      for (const credentialType of ["bearer", "api_key", "basic"]) {
        await panel
          .getByRole("button", { name: "Revisar rotação de credenciais", exact: true })
          .click();
        await panel
          .getByRole("combobox", { name: "Tipo da nova credencial", exact: true })
          .selectOption(credentialType);
        await panel
          .getByLabel("E-mail do responsável para reautenticação", { exact: true })
          .fill("owner@fixture.test");
        await panel
          .getByLabel("Senha do responsável para reautenticação", { exact: true })
          .fill("fixture-password");
        if (credentialType === "bearer")
          await panel
            .getByLabel("Novo Bearer da integração", { exact: true })
            .fill("browser-private-rotation");
        else if (credentialType === "api_key") {
          await panel.getByLabel("Header da API key", { exact: true }).fill("X-Fixture-Key");
          await panel.getByLabel("Nova API key", { exact: true }).fill("browser-private-rotation");
        } else {
          await panel.getByLabel("Usuário técnico Basic", { exact: true }).fill("fixture");
          await panel
            .getByLabel("Nova senha técnica Basic", { exact: true })
            .fill("browser-private-rotation");
        }
        if (credentialType === "bearer") {
          await go(page, "Bases");
          await expect(
            page.getByRole("dialog", { name: "Há alterações não salvas" }),
          ).toBeVisible();
          await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
          await expect(panel.getByLabel("Novo Bearer da integração", { exact: true })).toHaveValue(
            "browser-private-rotation",
          );
        }
        await panel
          .getByLabel("Revisei o impacto e confirmo esta mudança da integração.", { exact: true })
          .check();
        await panel
          .getByRole("button", { name: "Confirmar rotação de credenciais", exact: true })
          .click();
        await expect(panel.getByRole("status")).toContainText("Credencial rotacionada");
        expect(await panel.locator('input[type="password"]').count()).toBe(0);
      }
      const row = await pool.query(
        "SELECT nome,tipo,destino,credencial_versao,ativa,suspensa_em,credencial_enc FROM integracao WHERE id=$1",
        [id],
      );
      expect(row.rows[0]).toMatchObject({
        nome: initial.rows[0].nome,
        tipo: kind,
        destino: initial.rows[0].destino,
        credencial_versao: 4,
        ativa: false,
      });
      expect(row.rows[0].suspensa_em).not.toBeNull();
      expect(JSON.parse(crypto.decrypt(row.rows[0].credencial_enc)).credential).toMatchObject({
        credentialType: "basic",
        password: "browser-private-rotation",
      });
      await panel
        .getByRole("button", { name: "Revisar recuperação da integração", exact: true })
        .click();
      await panel
        .getByLabel("Revisei o impacto e confirmo esta mudança da integração.", { exact: true })
        .check();
      await panel
        .getByRole("button", { name: "Confirmar recuperação da integração", exact: true })
        .click();
      await expect(panel.getByRole("status")).toContainText("Suspensão removida");
      expect(
        (await pool.query("SELECT ativa,suspensa_em FROM integracao WHERE id=$1", [id])).rows[0],
      ).toEqual({ ativa: false, suspensa_em: null });
      expect(
        (
          await pool.query(
            "SELECT id,estado,fingerprint,payload_enc,comprovante FROM external_action_v2 WHERE persona_id=$1 ORDER BY id",
            [personaId],
          )
        ).rows,
      ).toEqual(journalBefore.rows);
      expect(
        (
          await pool.query(
            "SELECT count(*) FROM integracao_operacao WHERE persona_id=$1 AND ativa=true",
            [personaId],
          )
        ).rows[0].count,
      ).toBe("0");
      expect(
        await page.evaluate(
          "JSON.stringify({local:{...localStorage},session:{...sessionStorage}})",
        ),
      ).not.toContain("browser-private-rotation");
      expect(page.url()).not.toContain("browser-private-rotation");
      let failedRequests = 0;
      await page.route(
        "**/integracoes/gestao/*/credenciais",
        async (route) => {
          failedRequests++;
          await route.fulfill({
            status: 409,
            json: { error: { code: "OPERATION_CONFLICT", message: "Revise novamente." } },
          });
        },
        { times: 1 },
      );
      await panel
        .getByRole("button", { name: "Revisar rotação de credenciais", exact: true })
        .click();
      await panel
        .getByLabel("E-mail do responsável para reautenticação", { exact: true })
        .fill("owner@fixture.test");
      await panel
        .getByLabel("Senha do responsável para reautenticação", { exact: true })
        .fill("fixture-password");
      await panel
        .getByLabel("Novo Bearer da integração", { exact: true })
        .fill("discard-on-attempt");
      await panel
        .getByLabel("Revisei o impacto e confirmo esta mudança da integração.", { exact: true })
        .check();
      await panel
        .getByRole("button", { name: "Confirmar rotação de credenciais", exact: true })
        .click();
      await expect(panel.getByLabel("Novo Bearer da integração", { exact: true })).toHaveValue("");
      await expect(
        panel.getByLabel("Senha do responsável para reautenticação", { exact: true }),
      ).toHaveValue("");
      await panel
        .getByLabel("Revisei o impacto e confirmo esta mudança da integração.", { exact: true })
        .check();
      await expect(
        panel.getByRole("button", { name: "Confirmar rotação de credenciais", exact: true }),
      ).toBeDisabled();
      expect(failedRequests).toBe(1);
      await panel
        .getByRole("button", { name: "Descartar mudança da integração", exact: true })
        .click();
      await panel
        .getByRole("button", { name: "Recarregar gestão de integrações", exact: true })
        .click();
      for (const width of [360, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"),
        ).toBe(true);
      }
    } finally {
      await pool.end();
    }
  });
}
for (const kind of ["rest", "mcp_http"] as const) {
  test(`importação externa ${kind} prepara somente rascunho com seleção e revisão explícitas`, async ({
    page,
  }) => {
    await login(page);
    await createPersona(page, `Importar ${kind} ${Date.now()}`);
    const personaId = await page
      .getByRole("combobox", { name: "Persona", exact: true })
      .inputValue();
    const state = JSON.parse(
      await readFile("node_modules/.cache/persona-v2-browser-state.json", "utf8"),
    ) as { databaseName: string };
    expect(state.databaseName).toMatch(/^persona_browser_[a-f0-9]{32}_test$/);
    const url = new URL(personaV2TestDatabaseUrl());
    url.pathname = `/${state.databaseName}`;
    const pool = new pg.Pool({ connectionString: url.toString() });
    try {
      const c = testConfig(),
        crypto = new NodeCryptoAdapter(
          c.MCP_ENCRYPTION_KEY,
          c.MCP_ENCRYPTION_KEY_ID,
          c.MCP_ENCRYPTION_PREVIOUS_KEYS,
          c.MCP_ENCRYPTION_LEGACY_KEY,
        );
      const integrationId = await seedExternalConnection(pool, crypto, personaId, kind);
      await go(page, "Treinamentos");
      const editor = page.getByRole("region", { name: "Treinamento de ação externa", exact: true });
      await editor.getByRole("button", { name: "Recarregar skill externa", exact: true }).click();
      const importer = editor.getByRole("region", {
        name: "Descoberta e importação externa",
        exact: true,
      });
      await importer
        .getByRole("combobox", { name: "Integração para descoberta ou importação", exact: true })
        .selectOption(integrationId);
      if (kind === "rest") {
        const shape = {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        };
        const document = {
          openapi: "3.1.0",
          servers: [{ url: "https://not-selected.example.com" }],
          paths: {
            "/lookup": {
              get: {
                summary: "Consultar fixture",
                responses: {
                  200: {
                    description: "Registro",
                    content: { "application/json": { schema: shape } },
                  },
                },
              },
            },
            "/wrong/{id}": { get: { responses: { 204: { description: "Vazio" } } } },
          },
        };
        await importer.getByLabel("Arquivo OpenAPI JSON", { exact: true }).setInputFiles({
          name: "fixture.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(document)),
        });
        await importer.getByRole("button", { name: "Analisar OpenAPI", exact: true }).click();
        await expect(importer.getByRole("option", { name: /GET \/wrong/ })).toHaveAttribute(
          "disabled",
          "",
        );
        await importer
          .getByRole("combobox", { name: "Operação a revisar", exact: true })
          .selectOption("GET /lookup");
      } else {
        await importer
          .getByRole("button", { name: "Descobrir ferramentas MCP", exact: true })
          .click();
        await importer
          .getByRole("combobox", { name: "Operação a revisar", exact: true })
          .selectOption("write");
      }
      expect(
        (await pool.query("SELECT count(*) FROM skill_v2 WHERE persona_id=$1", [personaId])).rows[0]
          .count,
      ).toBe("0");
      await importer
        .getByRole("button", { name: "Preparar rascunho desta operação", exact: true })
        .click();
      const form = editor.getByRole("form", { name: "Contrato de skill externa", exact: true });
      await expect(
        form.getByRole("combobox", { name: "Integração da skill", exact: true }),
      ).toHaveValue(integrationId);
      await form
        .getByLabel("Identificador curto da skill externa", { exact: true })
        .fill(`importar-${kind.replaceAll("_", "-")}`);
      if (kind === "mcp_http") {
        await expect(form.getByLabel("Ferramenta MCP remota", { exact: true })).toHaveValue(
          "write",
        );
        await expect(
          form.getByRole("combobox", { name: "Aprovação exigida pela skill", exact: true }),
        ).toHaveValue("human");
        await form
          .getByLabel("Descrição dos efeitos", { exact: true })
          .fill("Criar registro sintético");
        await form
          .getByLabel("Procedimento de conciliação", { exact: true })
          .fill("Conferir referência original sem reenvio");
      } else
        await expect(form.getByLabel("Rota fixa REST", { exact: true })).toHaveValue("/lookup");
      await form.getByRole("button", { name: "Salvar skill externa", exact: true }).click();
      await expect(editor.getByText("Rascunho externo salvo.", { exact: false })).toBeVisible();
      const row = await pool.query(
        "SELECT publicacao_ativa_id,rascunho FROM skill_v2 WHERE persona_id=$1 AND tipo='acao_externa'",
        [personaId],
      );
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].publicacao_ativa_id).toBeNull();
      expect(
        (
          await pool.query("SELECT count(*) FROM external_action_v2 WHERE persona_id=$1", [
            personaId,
          ])
        ).rows[0].count,
      ).toBe("0");
      for (const width of [360, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"),
        ).toBe(true);
      }
    } finally {
      await pool.end();
    }
  });
}
for (const kind of ["rest", "mcp_http"] as const) {
  test(`editor de skill externa ${kind} cria, testa por runner separado e publica sem enviar ação`, async ({
    page,
  }) => {
    const { csrfToken } = await login(page);
    await createPersona(page, `Editor externo ${kind} ${Date.now()}`);
    const personaId = await page
      .getByRole("combobox", { name: "Persona", exact: true })
      .inputValue();
    const headers = { Origin: "http://127.0.0.1:5188", "X-CSRF-Token": csrfToken },
      base = `/api/admin/personas/${personaId}`;
    const state = JSON.parse(
      await readFile("node_modules/.cache/persona-v2-browser-state.json", "utf8"),
    ) as { databaseName: string };
    expect(state.databaseName).toMatch(/^persona_browser_[a-f0-9]{32}_test$/);
    const url = new URL(personaV2TestDatabaseUrl());
    url.pathname = `/${state.databaseName}`;
    const pool = new pg.Pool({ connectionString: url.toString() });
    try {
      const c = testConfig(),
        crypto = new NodeCryptoAdapter(
          c.MCP_ENCRYPTION_KEY,
          c.MCP_ENCRYPTION_KEY_ID,
          c.MCP_ENCRYPTION_PREVIOUS_KEYS,
          c.MCP_ENCRYPTION_LEGACY_KEY,
        );
      const integrationId = await seedExternalConnection(pool, crypto, personaId, kind);
      await go(page, "Treinamentos");
      const editor = page.getByRole("region", { name: "Treinamento de ação externa", exact: true });
      await editor.getByRole("button", { name: "Recarregar skill externa", exact: true }).click();
      const form = editor.getByRole("form", { name: "Contrato de skill externa", exact: true });
      await form.getByLabel("Nome da skill externa", { exact: true }).fill(`Registrar ${kind}`);
      await form
        .getByLabel("Identificador curto da skill externa", { exact: true })
        .fill(`registrar-${kind.replaceAll("_", "-")}`);
      await form
        .getByRole("combobox", { name: "Integração da skill", exact: true })
        .selectOption(integrationId);
      await form
        .getByLabel("Finalidade da skill externa", { exact: true })
        .fill("Registrar referência sintética em serviço isolado");
      await form
        .getByLabel("Descrição dos efeitos", { exact: true })
        .fill("Criar registro sintético");
      await form
        .getByLabel("Procedimento de conciliação", { exact: true })
        .fill("Conferir a chave original; não reenviar resultado incerto");
      await expect(
        form.getByRole("combobox", { name: "Aprovação exigida pela skill", exact: true }),
      ).toHaveValue("human");
      if (kind === "mcp_http") {
        await form
          .getByRole("combobox", { name: "Aprovação exigida pela skill", exact: true })
          .selectOption("automatic");
      }
      if (kind === "mcp_http") {
        await form
          .getByRole("combobox", { name: "Novo transporte", exact: true })
          .selectOption("mcp_http");
        await form
          .getByLabel("Confirmo substituir rota/ferramenta e schemas do transporte local.", {
            exact: true,
          })
          .check();
        await form
          .getByRole("button", { name: "Aplicar escolha de transporte", exact: true })
          .click();
        await form.getByLabel("Ferramenta MCP remota", { exact: true }).fill("register");
      } else {
        await form.getByLabel("Rota fixa REST", { exact: true }).fill("/register");
      }
      for (const [label, key] of [
        ["Entrada da operação", "id"],
        ["Saída da operação", "name"],
      ]) {
        const group = form.getByRole("group", { name: label!, exact: true });
        await group.getByLabel(`Nome do novo campo de ${label}`, { exact: true }).fill(key!);
        await group
          .getByRole("button", { name: `Adicionar campo de ${label}`, exact: true })
          .click();
        await group
          .getByLabel(`Finalidade de ${key}`, { exact: true })
          .fill("Referência sintética explícita");
      }
      if (kind === "mcp_http") {
        await form
          .getByLabel(
            "Confirmo substituir os schemas por uma proposta plana dos campos declarados.",
            { exact: true },
          )
          .check();
        await form
          .getByRole("button", { name: "Gerar proposta dos schemas MCP", exact: true })
          .click();
      }
      await form
        .getByLabel("Incluir verificação por chave original e estado terminal", { exact: true })
        .check();
      const reconciliation = form.getByRole("group", {
        name: "Conciliação por leitura treinada",
        exact: true,
      });
      await reconciliation
        .getByLabel("Garantia revisada do serviço", { exact: true })
        .fill("Chave original única, completude e estado terminal comprovados na fixture");
      for (const [label, definitions] of [
        ["Entrada da conciliação", [{ name: "id", type: "string" }]],
        [
          "Saída da conciliação",
          [
            { name: "count", type: "number" },
            { name: "complete", type: "boolean" },
            { name: "reference", type: "string" },
            { name: "status", type: "string" },
          ],
        ],
      ] as const) {
        const fields = reconciliation.getByRole("group", { name: label, exact: true });
        for (const definition of definitions) {
          await fields
            .getByLabel(`Nome do novo campo de ${label}`, { exact: true })
            .fill(definition.name);
          await fields
            .getByRole("button", { name: `Adicionar campo de ${label}`, exact: true })
            .click();
          await fields
            .getByRole("combobox", { name: `Tipo de ${definition.name}`, exact: true })
            .selectOption(definition.type);
          await fields
            .getByLabel(`Finalidade de ${definition.name}`, { exact: true })
            .fill("Evidência sintética de conciliação");
        }
      }
      const readTransport = reconciliation.getByRole("group", {
        name: "Transporte da conciliação",
        exact: true,
      });
      if (kind === "rest") {
        await readTransport.getByLabel("Rota fixa REST", { exact: true }).fill("/status");
      } else {
        await readTransport.getByLabel("Ferramenta MCP remota", { exact: true }).fill("get_status");
        await readTransport
          .getByLabel(
            "Confirmo substituir os schemas por uma proposta plana dos campos declarados.",
            { exact: true },
          )
          .check();
        await readTransport
          .getByRole("button", { name: "Gerar proposta dos schemas MCP", exact: true })
          .click();
      }
      await reconciliation
        .getByRole("combobox", { name: "Origem de id", exact: true })
        .selectOption("id");
      await reconciliation
        .getByRole("combobox", { name: "Campo de contagem", exact: true })
        .selectOption("count");
      await reconciliation
        .getByRole("combobox", { name: "Campo de completude", exact: true })
        .selectOption("complete");
      await reconciliation
        .getByRole("combobox", { name: "Campo de estado terminal", exact: true })
        .selectOption("status");
      await reconciliation.getByLabel("Valor do estado esperado", { exact: true }).fill("applied");
      await expect(
        form.getByRole("button", { name: "Salvar skill externa", exact: true }),
      ).toBeDisabled();
      await reconciliation
        .getByRole("button", { name: "Aplicar estado esperado", exact: true })
        .click();
      await reconciliation
        .getByRole("button", { name: "Adicionar correlação de chave", exact: true })
        .click();
      await reconciliation
        .getByRole("combobox", { name: "Chave da entrada original", exact: true })
        .selectOption("id");
      await reconciliation
        .getByRole("combobox", { name: "Chave no resultado da leitura", exact: true })
        .selectOption("reference");
      await form.getByRole("button", { name: "Salvar skill externa", exact: true }).click();
      await expect(
        editor.getByRole("status").filter({ hasText: "Rascunho externo salvo" }),
      ).toBeVisible();
      const skillId = await editor
          .getByRole("combobox", { name: "Editar skill externa", exact: true })
          .inputValue(),
        path = `${base}/integracoes/skills/${skillId}`;
      const details = (await (await page.request.get(`${path}/rascunho`, { headers })).json()) as {
        revision: number;
        contract: { operationId: string };
        published: boolean;
      };
      expect(details.published).toBe(false);
      await editor
        .getByLabel("Revisar esta skill externa até", { exact: true })
        .fill("2027-01-20T12:00");
      await expect(
        editor.getByRole("button", { name: "Revisar publicação externa", exact: true }),
      ).toBeDisabled();
      const cases = editor.getByRole("region", {
        name: "Casos e relatórios externos",
        exact: true,
      });
      await cases.getByRole("button", { name: "Adicionar caso externo", exact: true }).click();
      const caseForm = cases.getByRole("form", { name: "Editor de caso externo", exact: true });
      await caseForm.getByLabel("Nome do caso", { exact: true }).fill("Registro sintético");
      await caseForm
        .getByLabel("Entrada id (obrigatório)", { exact: true })
        .fill("synthetic-reference");
      await caseForm
        .getByLabel("Saída esperada name (obrigatório)", { exact: true })
        .fill("fixture");
      await caseForm.getByRole("button", { name: "Salvar caso externo", exact: true }).click();
      await expect(cases.getByRole("status")).toContainText("Caso salvo");
      // Trusted runner process uses synthetic provider, not an HTTP report approval endpoint.
      expect((await runExternalBrowserCases(pool, crypto, personaId, skillId)).approved).toBe(true);
      await cases.getByRole("button", { name: "Atualizar skills externas", exact: true }).click();
      await expect(
        editor.getByRole("button", { name: "Revisar publicação externa", exact: true }),
      ).toBeEnabled();
      await editor.getByRole("button", { name: "Revisar publicação externa", exact: true }).click();
      await expect(
        editor.getByRole("region", { name: "Comparação de publicação", exact: true }),
      ).toContainText("Primeira publicação");
      await expect(editor.getByText(/Prévia válida até/)).toBeVisible();
      await editor
        .getByLabel(
          "Revisei destino, entrada, saída, efeitos, conciliação e aprovação do contrato externo.",
          { exact: true },
        )
        .check();
      await editor
        .getByRole("button", { name: "Confirmar publicação externa", exact: true })
        .click();
      await expect(
        editor.getByRole("status").filter({ hasText: "Skill externa publicada" }),
      ).toBeVisible();
      await expect(
        form.getByRole("button", { name: "Salvar skill externa", exact: true }),
      ).toBeDisabled();
      const published = (await (
        await page.request.get(`${path}/rascunho`, { headers })
      ).json()) as {
        revision: number;
        name: string;
        contract: unknown;
        publication: { id: string };
      };
      expect(
        (
          await page.request.post(`${path}/rascunho`, {
            headers,
            data: {
              expectedRevision: published.revision,
              name: "Alteração indevida",
              contract: published.contract,
            },
          })
        ).status(),
      ).toBe(409);
      await editor
        .getByRole("button", { name: "Preparar nova skill com este contrato", exact: true })
        .click();
      await expect(
        form.getByRole("combobox", { name: "Aprovação exigida pela skill", exact: true }),
      ).toHaveValue("human");
      await form
        .getByLabel("Nome da skill externa", { exact: true })
        .fill("Nova skill independente");
      await form
        .getByLabel("Identificador curto da skill externa", { exact: true })
        .fill(`nova-${kind.replaceAll("_", "-")}`);
      await form.getByRole("button", { name: "Salvar skill externa", exact: true }).click();
      await expect(
        editor.getByRole("status").filter({ hasText: "Rascunho externo salvo" }),
      ).toBeVisible();
      const nextId = await editor
          .getByRole("combobox", { name: "Editar skill externa", exact: true })
          .inputValue(),
        nextPath = `${base}/integracoes/skills/${nextId}`;
      expect(nextId).not.toBe(skillId);
      const next = (await (await page.request.get(`${nextPath}/rascunho`, { headers })).json()) as {
        revision: number;
        name: string;
        contract: { operationId: string };
        published: boolean;
      };
      expect(next.contract.operationId).not.toBe(details.contract.operationId);
      expect(next.published).toBe(false);
      const nextTests = (await (
        await page.request.get(`${nextPath}/testes`, { headers })
      ).json()) as { cases: unknown[]; reports: unknown[] };
      expect(nextTests.cases).toEqual([]);
      expect(nextTests.reports).toEqual([]);
      await form
        .getByLabel("Nome da skill externa", { exact: true })
        .fill("Edição local preservada");
      const invalidContract = await page.request.post(`${nextPath}/rascunho`, {
        headers,
        data: { expectedRevision: next.revision, name: "Edição local preservada" },
      });
      expect(invalidContract.status()).toBe(400);
      expect((await invalidContract.json()).error.fields).toContain("contract");
      await checkEditorErrors(page, form, "Nome da skill externa", "Salvar skill externa", true);
      expect(
        (
          await page.request.post(`${nextPath}/rascunho`, {
            headers,
            data: {
              expectedRevision: next.revision,
              name: "Edição concorrente",
              contract: next.contract,
            },
          })
        ).status(),
      ).toBe(200);
      await form.getByRole("button", { name: "Salvar skill externa", exact: true }).click();
      await expect(editor.getByRole("alert")).toContainText("Rascunho mudou");
      await expect(editor.getByRole("alert")).toBeFocused();
      await expect(form.getByLabel("Nome da skill externa", { exact: true })).toHaveValue(
        "Edição local preservada",
      );
      await go(page, "Visão geral");
      await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
      for (const width of [360, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate("document.documentElement.scrollWidth")).toBeLessThanOrEqual(
          width,
        );
      }
      await editor.getByRole("button", { name: "Recarregar skill externa", exact: true }).click();
      await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
      await expect(form.getByLabel("Nome da skill externa", { exact: true })).toHaveValue(
        "Edição concorrente",
      );
      const fresh = (await (
        await page.request.get(`${nextPath}/rascunho`, { headers })
      ).json()) as { revision: number; contract: unknown };
      expect(
        (
          await page.request.post(`${nextPath}/rascunho`, {
            headers,
            data: {
              expectedRevision: fresh.revision,
              name: "Mudou durante leitura de casos",
              contract: fresh.contract,
            },
          })
        ).status(),
      ).toBe(200);
      await cases.getByRole("button", { name: "Atualizar skills externas", exact: true }).click();
      await expect(editor.getByRole("alert")).toContainText("Contrato mudou em outra sessão");
      await expect(
        form.getByRole("button", { name: "Salvar skill externa", exact: true }),
      ).toBeDisabled();
      await expect(form.getByLabel("Nome da skill externa", { exact: true })).toHaveValue(
        "Edição concorrente",
      );
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM external_action_v2 WHERE persona_id=$1",
            [personaId],
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM external_runner_v2 WHERE persona_id=$1",
            [personaId],
          )
        ).rows[0].n,
      ).toBe(0);
      const current = (await (await page.request.get(`${path}/rascunho`, { headers })).json()) as {
        publication: { id: string };
      };
      expect(current.publication.id).toBe(published.publication.id);
    } finally {
      await pool.end();
    }
  });
}

test("casos e relatórios externos preservam edição, invalidam relatórios e não executam ações", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const personaName = `Casos externos ${Date.now()}`;
  await createPersona(page, personaName);
  const state = JSON.parse(
    await readFile("node_modules/.cache/persona-v2-browser-state.json", "utf8"),
  ) as { databaseName: string };
  expect(state.databaseName).toMatch(/^persona_browser_[a-f0-9]{32}_test$/);
  const url = new URL(personaV2TestDatabaseUrl());
  url.pathname = `/${state.databaseName}`;
  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    const persona = (
      await pool.query<{ id: string }>("SELECT id FROM persona WHERE nome=$1", [personaName])
    ).rows[0]!;
    const config = testConfig(),
      crypto = new NodeCryptoAdapter(
        config.MCP_ENCRYPTION_KEY,
        config.MCP_ENCRYPTION_KEY_ID,
        config.MCP_ENCRYPTION_PREVIOUS_KEYS,
        config.MCP_ENCRYPTION_LEGACY_KEY,
      );
    await seedExternalAction(pool, crypto, persona.id);
    await go(page, "Integrações");
    const panel = page.getByRole("region", { name: "Casos e relatórios externos", exact: true });
    await panel.getByRole("button", { name: /Registrar fixture · revisão/ }).click();
    await expect(panel.getByText(/Relatório técnico atual aprovado/)).toBeVisible();
    await panel.getByRole("button", { name: "Adicionar caso externo", exact: true }).click();
    const editor = panel.getByRole("form", { name: "Editor de caso externo" });
    await editor.getByLabel("Nome do caso", { exact: true }).fill("Segundo exemplo sintético");
    await editor.getByLabel("Entrada id (obrigatório)", { exact: true }).fill("synthetic-2");
    await editor.getByLabel("Saída esperada name (obrigatório)", { exact: true }).fill("fixture");
    await go(page, "Visão geral");
    await expect(page.getByRole("dialog", { name: "Há alterações não salvas" })).toBeVisible();
    await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
    await expect(editor.getByLabel("Nome do caso", { exact: true })).toHaveValue(
      "Segundo exemplo sintético",
    );
    await editor.getByRole("button", { name: "Salvar caso externo", exact: true }).click();
    await expect(panel.getByRole("status")).toContainText("Caso salvo");
    await expect(panel.getByText(/Obsoleto — não libera publicação/).first()).toBeVisible();
    await expect(panel.getByText(/Sem relatório atual aprovado/)).toBeVisible();
    expect(
      (
        await pool.query("SELECT count(*)::int AS n FROM external_action_v2 WHERE persona_id=$1", [
          persona.id,
        ])
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await pool.query("SELECT count(*)::int AS n FROM external_runner_v2 WHERE persona_id=$1", [
          persona.id,
        ])
      ).rows[0].n,
    ).toBe(0);
    await panel
      .getByRole("button", { name: "Editar caso Segundo exemplo sintético", exact: true })
      .click();
    await editor.getByRole("checkbox", { name: "Confirmo remover este caso", exact: true }).check();
    await editor.getByRole("button", { name: "Remover caso externo", exact: true }).click();
    await expect(panel.getByRole("status")).toContainText("Caso removido");
    await expect(
      panel.getByRole("button", { name: "Editar caso Segundo exemplo sintético", exact: true }),
    ).toHaveCount(0);
  } finally {
    await pool.end();
  }
});
test("consumidor prepara ação externa publicada pelo formulário sem executar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const name = `Preparação visual ${Date.now()}`;
  await createPersona(page, name);
  const state = JSON.parse(
    await readFile("node_modules/.cache/persona-v2-browser-state.json", "utf8"),
  ) as { databaseName: string };
  expect(state.databaseName).toMatch(/^persona_browser_[a-f0-9]{32}_test$/);
  const url = new URL(personaV2TestDatabaseUrl());
  url.pathname = `/${state.databaseName}`;
  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    const persona = (
      await pool.query<{ id: string }>("SELECT id FROM persona WHERE nome=$1", [name])
    ).rows[0]!;
    const config = testConfig();
    const fixture = await seedExternalAction(
      pool,
      new NodeCryptoAdapter(
        config.MCP_ENCRYPTION_KEY,
        config.MCP_ENCRYPTION_KEY_ID,
        config.MCP_ENCRYPTION_PREVIOUS_KEYS,
        config.MCP_ENCRYPTION_LEGACY_KEY,
      ),
      persona.id,
    );
    await page.getByRole("combobox", { name: "Persona", exact: true }).selectOption("");
    await page.getByRole("combobox", { name: "Persona", exact: true }).selectOption(persona.id);
    await go(page, "Tokens e conexões");
    const tokenForm = page.getByRole("form", { name: "Emitir token", exact: true });
    await tokenForm
      .getByLabel("Nome do consumidor", { exact: true })
      .fill("Consumidor externo visual");
    await tokenForm.getByRole("checkbox", { name: /Registrar fixture.*Ação externa/ }).check();
    const issueResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/admin/personas/${persona.id}/tokens`) &&
        r.request().method() === "POST",
    );
    await tokenForm.getByRole("button", { name: "Emitir token restrito" }).click();
    const issued = await issueResponse;
    expect(issued.status()).toBe(201);
    const { bearer: visualBearer } = (await issued.json()) as { bearer: string };
    const issuedPermissions = issued.request().postDataJSON().permissions;
    expect(issuedPermissions.externalOperationIds).toHaveLength(1);
    expect(issuedPermissions.skills).toEqual([
      expect.objectContaining({
        skillId: fixture.skillId,
        effects: [],
        requireHumanApproval: true,
      }),
    ]);
    expect(issuedPermissions.sourceIds).toEqual([]);
    await go(page, "Integrações");
    const panel = page.getByRole("region", { name: "Preparar ação externa", exact: true });
    await panel.getByLabel("Token do consumidor para preparar", { exact: true }).fill(visualBearer);
    await panel
      .getByRole("button", {
        name: "Carregar ações concedidas / iniciar nova preparação",
        exact: true,
      })
      .click();
    await panel
      .getByRole("combobox", { name: "Ação publicada", exact: true })
      .selectOption(fixture.skillId);
    await panel.getByLabel("Entrada id (obrigatório)", { exact: true }).fill("visual-fixture");
    await panel
      .getByLabel("Conferi os dados e quero criar esta preparação.", { exact: true })
      .check();
    await panel
      .getByLabel("Entrada id (obrigatório)", { exact: true })
      .fill("visual-fixture-final");
    await expect(
      panel.getByLabel("Conferi os dados e quero criar esta preparação.", { exact: true }),
    ).not.toBeChecked();
    await panel
      .getByLabel("Conferi os dados e quero criar esta preparação.", { exact: true })
      .check();
    const prepareRequest = page.waitForRequest(
      (r) =>
        r.url().endsWith("/mcp") &&
        r.method() === "POST" &&
        r.postDataJSON()?.params?.name === "preparar_acao_externa",
    );
    await panel.getByRole("button", { name: "Criar preparação", exact: true }).click();
    await expect(panel.getByText(/Preparação criada:/)).toBeVisible();
    const rows = await pool.query<{
      estado: string;
      publicacao_id: string;
      claimed_at: Date | null;
    }>(
      "SELECT estado,publicacao_id,claimed_at FROM external_action_v2 WHERE persona_id=$1 ORDER BY created_at DESC LIMIT 1",
      [persona.id],
    );
    expect(rows.rows[0]).toMatchObject({
      estado: "aprovacao_pendente",
      publicacao_id: fixture.publicationId,
      claimed_at: null,
    });
    expect(await page.evaluate(() => localStorage.getItem("bearer"))).toBeNull();
    const originalRequest = await prepareRequest;
    await go(page, "Tokens e conexões");
    const manager = page.getByRole("region", { name: "Gerenciar tokens", exact: true });
    await manager
      .getByRole("button", { name: "Editar Consumidor externo visual", exact: true })
      .click();
    const operations = manager.getByRole("group", {
      name: "Operações externas autorizadas",
      exact: true,
    });
    await operations.getByRole("checkbox", { name: /Registrar fixture/ }).uncheck();
    const editResponse = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/admin/personas/${persona.id}/tokens/`) &&
        r.url().endsWith("/editar") &&
        r.request().method() === "POST",
    );
    await manager.getByRole("button", { name: "Salvar token", exact: true }).click();
    const edited = await editResponse;
    expect(edited.ok()).toBe(true);
    expect(edited.request().postDataJSON().permissions.externalOperationIds).toEqual([]);
    expect(edited.request().postDataJSON().permissions.skills).toEqual(issuedPermissions.skills);
    const countBefore = (
      await pool.query("SELECT count(*)::int AS n FROM external_action_v2 WHERE persona_id=$1", [
        persona.id,
      ])
    ).rows[0].n;
    const denied = await page.request.post("/mcp", {
      headers: {
        authorization: `Bearer ${visualBearer}`,
        accept: "application/json, text/event-stream",
      },
      data: originalRequest.postDataJSON(),
    });
    const rpcResult = (body: string) => {
      if (body.trimStart().startsWith("{")) return JSON.parse(body);
      const messages = body.split(/\r?\n/).filter((line) => line.startsWith("data:"));
      const response = messages
        .map((line) => JSON.parse(line.slice(5)))
        .find((item) => item.id === originalRequest.postDataJSON().id);
      expect(response).toBeDefined();
      return response;
    };
    const denial = rpcResult(await denied.text());
    expect(denial.result?.isError === true || denied.status() === 403).toBe(true);
    expect(
      (
        await pool.query("SELECT count(*)::int AS n FROM external_action_v2 WHERE persona_id=$1", [
          persona.id,
        ])
      ).rows[0].n,
    ).toBe(countBefore);
    const independent = await page.request.post("/mcp", {
      headers: {
        authorization: `Bearer ${fixture.bearer}`,
        accept: "application/json, text/event-stream",
      },
      data: originalRequest.postDataJSON(),
    });
    expect(independent.ok()).toBe(true);
    expect(rpcResult(await independent.text()).result?.isError).not.toBe(true);
    expect(
      (
        await pool.query("SELECT count(*)::int AS n FROM external_action_v2 WHERE persona_id=$1", [
          persona.id,
        ])
      ).rows[0].n,
    ).toBe(countBefore + 1);
  } finally {
    await pool.end();
  }
});

test("responsável revisa e aprova ação externa em 390px sem reenviar resultado desconhecido", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const personaName = `Ação externa ${Date.now()}`;
  await createPersona(page, personaName);
  const state = JSON.parse(
    await readFile("node_modules/.cache/persona-v2-browser-state.json", "utf8"),
  ) as { databaseName: string };
  expect(state.databaseName).toMatch(/^persona_browser_[a-f0-9]{32}_test$/);
  const url = new URL(personaV2TestDatabaseUrl());
  url.pathname = `/${state.databaseName}`;
  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    const persona = (
      await pool.query<{ id: string }>("SELECT id FROM persona WHERE nome=$1", [personaName])
    ).rows[0]!;
    const config = testConfig(),
      crypto = new NodeCryptoAdapter(
        config.MCP_ENCRYPTION_KEY,
        config.MCP_ENCRYPTION_KEY_ID,
        config.MCP_ENCRYPTION_PREVIOUS_KEYS,
        config.MCP_ENCRYPTION_LEGACY_KEY,
      );
    const fixture = await seedExternalAction(pool, crypto, persona.id);
    await go(page, "Integrações");
    const panel = page.getByRole("region", { name: "Ações externas da persona", exact: true });
    await panel
      .getByRole("button", { name: `Revisar ação ${fixture.operationId}`, exact: true })
      .click();
    const review = panel.getByRole("region", { name: "Revisão de ação externa", exact: true });
    await expect(review.getByText("reference-fixture", { exact: true })).toBeVisible();
    const approve = review.getByRole("button", { name: "Aprovar ação externa", exact: true });
    await expect(approve).toBeDisabled();
    await review
      .getByRole("checkbox", { name: "Revisei os parâmetros e os efeitos desta ação externa" })
      .focus();
    await page.keyboard.press("Space");
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(panel.getByRole("status")).toContainText("Conteúdo aprovado");
    expect(
      (
        await pool.query<{ estado: string }>("SELECT estado FROM external_action_v2 WHERE id=$1", [
          fixture.operationId,
        ])
      ).rows[0]!.estado,
    ).toBe("aprovada");
    await panel
      .getByRole("button", { name: `Revisar ação ${fixture.unknownId}`, exact: true })
      .click();
    await expect(review.getByText(/A confirmação não é suficiente/)).toBeVisible();
    await expect(
      review.getByRole("button", { name: "Aprovar ação externa", exact: true }),
    ).toHaveCount(0);
    // Cancel the unsent fixture, then age its control metadata; no external effect is fabricated.
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "UPDATE external_action_v2 SET estado='cancelada',versao=versao+1 WHERE id=$1",
        [fixture.operationId],
      );
      await c.query("ALTER TABLE external_action_v2 DISABLE TRIGGER a_operation_retention");
      await c.query(
        "UPDATE external_action_v2 SET terminal_at=clock_timestamp()-interval '2 days',payload_purge_at=clock_timestamp()-interval '1 day',versao=versao+1 WHERE id=$1",
        [fixture.operationId],
      );
      await c.query("ALTER TABLE external_action_v2 ENABLE TRIGGER a_operation_retention");
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
    await new PersonaRetentionWorker(
      new PostgresPersonaRetentionWorker(pool),
      randomUUID(),
      () => new Date(),
    ).runOnce();
    await panel
      .getByRole("button", { name: `Revisar ação ${fixture.operationId}`, exact: true })
      .click();
    await expect(review.getByRole("status")).toContainText("dados operacionais foram removidos");
    await expect(review.getByText("reference-fixture", { exact: true })).toHaveCount(0);
    await expect(review.getByRole("heading", { name: /Cancelada/ })).toBeVisible();
    await expect(
      review.getByRole("button", { name: "Aprovar ação externa", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
      })),
    ).toEqual({ local: [], session: [] });
  } finally {
    await pool.end();
  }
});

test("biblioteca editorial cria rascunho de template, dataset e declarações DDL sem herdar publicação", async ({
  page,
}, testInfo) => {
  await login(page);
  const personaName = `Biblioteca ${Date.now()}`;
  await createPersona(page, personaName);
  await addSource(page, "a");
  await go(page, "Catálogo compartilhado");
  await page.getByText("Conhecimento compartilhado", { exact: true }).click();
  const region = page.getByRole("region", { name: "Conhecimento compartilhado" });
  const create = region.getByRole("form", { name: "Criar catálogo" });
  await create.getByLabel("Nome do catálogo").fill(`Biblioteca fixture ${Date.now()}`);
  await create.getByRole("button", { name: "Criar catálogo privado" }).click();
  await region.getByText("Templates, datasets e importação de DDL", { exact: true }).click();
  let library = region.getByRole("region", { name: "Biblioteca editorial do catálogo" });
  let form = library.getByRole("form", { name: "Salvar material da biblioteca" });
  await form.getByLabel("Identificador do material").fill("library-template");
  await form.getByLabel("Nome do material", { exact: true }).fill("Template visual");
  await form.getByLabel("Material JSON (template ou dataset)").fill("{invalid_json");
  await form.getByRole("button", { name: "Salvar primeiro material" }).click();
  await expect(library.getByRole("alert")).toHaveText(
    "JSON inválido. Confira a estrutura do material.",
  );
  await expect(form.getByLabel("Material JSON (template ou dataset)")).toHaveValue("{invalid_json");
  const templateContent = {
    ...structureContent(),
    tables: structureContent().tables.map((t) => ({ ...t, columns: [...t.columns] })),
    examples: [...structureContent().examples],
  };
  templateContent.tables[0]!.columns.push(
    {
      name: "label",
      meaning: "Texto sintético",
      logicalType: "varchar(2)",
      nullable: true,
      classification: "livre",
    },
    {
      name: "active",
      meaning: "Flag sintética",
      logicalType: "boolean",
      nullable: false,
      classification: "livre",
    },
    {
      name: "private_note",
      meaning: "Campo fora do dataset",
      logicalType: "string",
      nullable: true,
      classification: "pessoal",
    },
    {
      name: "ambiguous_date",
      meaning: "Tipo exige revisão",
      logicalType: "timestamp",
      nullable: true,
      classification: "livre",
    },
  );
  templateContent.examples.push({
    ...structuredClone(templateContent.examples[0]!),
    id: "orders-extra",
    purpose: "Outro exemplo compatível",
  });
  await form
    .getByLabel("Material JSON (template ou dataset)")
    .fill(JSON.stringify({ kind: "template", content: templateContent }));
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/biblioteca") && r.request().method() === "POST",
  );
  await form.getByRole("button", { name: "Salvar primeiro material" }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const material = await response.json();
  expect(material.payload.content.examples[0].state).toBe("candidate");
  const apply = library.getByRole("form", { name: "Criar treinamento de template" });
  await apply.getByRole("button", { name: "Carregar personas para o template" }).click();
  await apply.getByLabel("Persona de destino").selectOption({ label: personaName });
  await apply.getByLabel("Base de destino").selectOption({ label: "Base a · postgres" });
  await apply.getByLabel("Variante de dialeto").selectOption("postgres");
  await apply.getByLabel("Exemplo principal").selectOption("orders-after-id");
  await apply.getByRole("checkbox", { name: "Outro exemplo compatível", exact: true }).check();
  await apply.getByLabel("Identificador do novo treinamento").fill("template-query");
  await apply.getByLabel("Nome do novo treinamento").fill("Consulta visual de template");
  const imported = page.waitForResponse(
    (r) => r.url().endsWith("/skills/template") && r.request().method() === "POST",
  );
  await apply
    .getByRole("button", { name: "Criar rascunho com base e variante selecionadas" })
    .click();
  const importedResponse = await imported;
  expect(importedResponse.status()).toBe(201);
  expect((await importedResponse.json()).skill.training.examples).toEqual([
    expect.objectContaining({ id: "orders-after-id", state: "candidate" }),
    expect.objectContaining({ id: "orders-extra", state: "candidate" }),
  ]);
  await expect(library.getByRole("status")).toContainText(
    "Rascunho Consulta visual de template criado",
  );
  await library.getByText("Criar dataset com formulário", { exact: true }).click();
  const datasetForm = library.getByRole("form", { name: "Criar dataset do template" });
  await datasetForm.getByLabel("Identificador do dataset").fill("edicao-pendente");
  const history = library.getByRole("form", { name: "Versão histórica da biblioteca" });
  await history.getByRole("button", { name: "Consultar versão exata" }).click();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(datasetForm.getByLabel("Identificador do dataset")).toHaveValue("edicao-pendente");
  await history.getByRole("button", { name: "Consultar versão exata" }).click();
  await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  await library.getByText("Criar dataset com formulário", { exact: true }).click();
  await expect(datasetForm.getByLabel("Identificador do dataset")).toHaveValue("");
  await datasetForm.getByLabel("Identificador do dataset").fill("dataset-visual");
  await datasetForm.getByLabel("Nome do dataset", { exact: true }).fill("Dataset artificial");
  await datasetForm.getByLabel("Descrição da proveniência").fill("Fixture sem dados operacionais");
  await datasetForm.getByLabel("Tabela do template").selectOption("orders");
  await datasetForm.getByRole("button", { name: "Adicionar tabela ao dataset" }).click();
  for (const field of ["id", "amount", "label", "active"]) {
    await datasetForm.getByRole("checkbox", { name: new RegExp(`^${field} ·`) }).check();
  }
  await expect(
    datasetForm.getByRole("checkbox", { name: /private_note|ambiguous_date/ }),
  ).toHaveCount(0);
  await datasetForm.getByRole("button", { name: "Adicionar linha", exact: true }).click();
  const row = datasetForm.getByRole("group", { name: "Linha 1", exact: true });
  await row.getByLabel("id", { exact: true }).fill("9007199254740993");
  await row.getByLabel("amount", { exact: true }).fill("123456789.25");
  await row.getByLabel("label", { exact: true }).fill("🙂éx");
  await row.getByLabel("active", { exact: true }).selectOption("false");
  await datasetForm.getByRole("button", { name: "Salvar dataset editorial" }).click();
  await expect(datasetForm.getByRole("alert")).toContainText("inteiros devem ter precisão segura");
  await row.getByLabel("id", { exact: true }).fill("1");
  await datasetForm.getByRole("button", { name: "Salvar dataset editorial" }).click();
  await expect(library.getByRole("alert")).toContainText("incompatível");
  await expect(row.getByLabel("label", { exact: true })).toHaveValue("🙂éx");
  await row.getByLabel("label", { exact: true }).fill("🙂é");
  await datasetForm.getByRole("button", { name: "Adicionar linha", exact: true }).click();
  const secondRow = datasetForm.getByRole("group", { name: "Linha 2", exact: true });
  await secondRow.getByLabel("id", { exact: true }).fill("2");
  await secondRow.getByLabel("amount", { exact: true }).fill("0.00");
  await secondRow.getByLabel("label: valor nulo", { exact: true }).check();
  await secondRow.getByLabel("active", { exact: true }).selectOption("true");
  await go(page, "Visão geral");
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(row.getByLabel("amount", { exact: true })).toHaveValue("123456789.25");
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
      true,
    );
  }
  await page.screenshot({ path: testInfo.outputPath("dataset-editor.png"), fullPage: true });
  const savedDataset = page.waitForResponse(
    (r) => r.url().endsWith("/biblioteca") && r.request().method() === "POST",
  );
  await datasetForm.getByRole("button", { name: "Salvar dataset editorial" }).click();
  const datasetResponse = await savedDataset;
  expect(datasetResponse.status()).toBe(201);
  expect((await datasetResponse.json()).payload).toMatchObject({
    templateId: material.id,
    templateVersion: 1,
    templateHash: material.hash,
    tables: [
      {
        tableId: "orders",
        rows: [
          [1, "123456789.25", "🙂é", false],
          [2, "0.00", null, true],
        ],
      },
    ],
  });
  await expect(library.getByRole("status")).toContainText("Dataset editorial salvo");
  const ddl = library.getByRole("form", { name: "Importar estrutura DDL" });
  await ddl.getByLabel("Arquivo DDL (até 50 KiB)").setInputFiles({
    name: "invalid.sql",
    mimeType: "text/plain",
    buffer: Buffer.from([0xff, 0xfe, 0x61]),
  });
  await expect(library.getByRole("alert")).toContainText("UTF-8 válido");
  await expect(ddl.getByLabel("DDL estrutural")).toHaveValue("");
  await ddl.getByLabel("Arquivo DDL (até 50 KiB)").setInputFiles({
    name: "declaration.sql",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "CREATE TABLE declared_fixture (id int CONSTRAINT declared_pk PRIMARY KEY, value decimal(18,2));",
    ),
  });
  await ddl.getByLabel("Sistema declarado").fill("Estrutura artificial");
  await ddl.getByLabel("Rótulo da estrutura").fill("v1");
  await ddl.getByRole("button", { name: "Interpretar declarações do arquivo" }).click();
  await expect(library.getByRole("region", { name: "Declarações importadas" })).toContainText(
    "não são prova técnica",
  );
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
      true,
    );
  }
  await page.screenshot({ path: testInfo.outputPath("knowledge-library.png"), fullPage: true });
  await library
    .getByRole("button", { name: "Usar declarações em novo rascunho de padrão" })
    .click();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(ddl.getByLabel("DDL estrutural")).toHaveValue(/CREATE TABLE/);
  await library
    .getByRole("button", { name: "Usar declarações em novo rascunho de padrão" })
    .click();
  await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  const editor = region.getByRole("form", { name: "Editar padrão compartilhado" });
  await editor.getByLabel("Identificação do padrão").fill("declared-pattern");
  await editor.getByLabel("Nome do padrão", { exact: true }).fill("Somente declaração");
  await editor.getByRole("button", { name: "Salvar padrão", exact: true }).click();
  await expect(
    region.getByText("Rascunho salvo. A publicação exige revisão de um curador."),
  ).toBeVisible();
  library = region.getByRole("region", { name: "Biblioteca editorial do catálogo" });
  await region.getByText("Templates, datasets e importação de DDL", { exact: true }).click();
  form = library.getByRole("form", { name: "Salvar material da biblioteca" });
  await expect(form.getByLabel("Material JSON (template ou dataset)")).toHaveValue("");
});

test("abre treinamento importado na persona correta após releitura e preserva edição se destino estiver suspenso", async ({
  page,
}) => {
  const { csrfToken } = await login(page);
  const destinationName = `Destino da biblioteca ${randomUUID()}`;
  await createPersona(page, destinationName);
  await addSource(page, "a");
  const personaSelect = page.getByRole("combobox", { name: "Persona", exact: true });
  const destinationId = await personaSelect.inputValue();
  await createPersona(page, `Origem da navegação ${randomUUID()}`);
  const originalId = await personaSelect.inputValue();
  await go(page, "Catálogo compartilhado");
  await page.getByText("Conhecimento compartilhado", { exact: true }).click();
  const region = page.getByRole("region", { name: "Conhecimento compartilhado" });
  const create = region.getByRole("form", { name: "Criar catálogo" });
  await create.getByLabel("Nome do catálogo").fill(`Abertura fixture ${randomUUID()}`);
  await create.getByRole("button", { name: "Criar catálogo privado" }).click();
  await region.getByText("Templates, datasets e importação de DDL", { exact: true }).click();
  const library = region.getByRole("region", { name: "Biblioteca editorial do catálogo" });
  const material = library.getByRole("form", { name: "Salvar material da biblioteca" });
  await material.getByLabel("Identificador do material").fill("handoff-template");
  await material.getByLabel("Nome do material", { exact: true }).fill("Template para abrir");
  await material
    .getByLabel("Material JSON (template ou dataset)")
    .fill(JSON.stringify({ kind: "template", content: structureContent() }));
  await material.getByRole("button", { name: "Salvar primeiro material" }).click();
  const form = library.getByRole("form", { name: "Criar treinamento de template" });
  await form.getByRole("button", { name: "Carregar personas para o template" }).click();
  await form.getByLabel("Persona de destino").selectOption(destinationId);
  await form.getByLabel("Base de destino").selectOption({ label: "Base a · postgres" });
  await form.getByLabel("Variante de dialeto").selectOption("postgres");
  await form.getByLabel("Exemplo principal").selectOption("orders-after-id");
  await form.getByLabel("Identificador do novo treinamento").fill("handoff-query");
  await form.getByLabel("Nome do novo treinamento").fill("Rascunho importado");
  const response = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/skills/template"),
  );
  await form
    .getByRole("button", { name: "Criar rascunho com base e variante selecionadas" })
    .click();
  const imported = await response;
  expect(imported.status()).toBe(201);
  const { skill } = (await imported.json()) as { skill: { id: string; training: unknown } };
  const open = library.getByRole("button", { name: "Abrir treinamento criado", exact: true });
  await expect(open).toBeVisible();
  await material
    .getByLabel("Nome do material", { exact: true })
    .fill("Edição editorial preservada");
  await open.click();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(material.getByLabel("Nome do material", { exact: true })).toHaveValue(
    "Edição editorial preservada",
  );
  await expect(personaSelect).toHaveValue(originalId);
  const headers = { Origin: "http://127.0.0.1:5188", "X-CSRF-Token": csrfToken };
  const base = `/api/admin/personas/${destinationId}`;
  const suspended = await page.request.post(`${base}/suspender`, {
    headers,
    data: { expectedVersion: 1 },
  });
  expect(suspended.status()).toBe(200);
  await open.click();
  await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("persona de destino está indisponível");
  await expect(personaSelect).toHaveValue(originalId);
  await expect(material.getByLabel("Nome do material", { exact: true })).toHaveValue(
    "Edição editorial preservada",
  );
  const recovered = await page.request.post(`${base}/recuperar`, {
    headers,
    data: { expectedVersion: 2 },
  });
  expect(recovered.status()).toBe(200);
  const updated = await page.request.post(`${base}/skills/${skill.id}/rascunho`, {
    headers,
    data: { expectedRevision: 1, name: "Revisão salva mais recente", training: skill.training },
  });
  expect(updated.status()).toBe(200);
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") writes.push(request.url());
  });
  await open.click();
  await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  await expect(page).toHaveURL(/#\/training$/);
  await expect(personaSelect).toHaveValue(destinationId);
  await expect(page.getByRole("combobox", { name: "Editar treinamento", exact: true })).toHaveValue(
    skill.id,
  );
  const editor = page.getByRole("form", { name: "Treinar consulta", exact: true });
  await expect(editor.locator('[data-error-field="training:name"]')).toHaveValue(
    "Revisão salva mais recente",
  );
  await expect(editor.locator('[data-error-field="training:name"]')).toBeFocused();
  expect(writes).toEqual([]);
  const published = await page.request.get(`${base}/skills/${skill.id}/publicacao`, { headers });
  expect((await published.json()) as unknown).toEqual({ publication: null });
});

test("emite token administrativo sem consulta e exige seleção explícita de fonte e delegação", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, "Treinamento administrativo");
  await addSource(page, "a");
  await go(page, "Tokens e conexões");
  const form = page.getByRole("form", { name: "Emitir token", exact: true });
  await form.getByLabel("Nome do consumidor", { exact: true }).fill("Treinador limitado");
  await expect(form.getByLabel("Treinar skills nas bases selecionadas")).not.toBeChecked();
  await expect(
    form.getByLabel("Permitir delegar as concessões selecionadas a outros tokens"),
  ).not.toBeChecked();
  await form.getByLabel("Treinar skills nas bases selecionadas").check();
  await form.getByLabel(/^Base para administração:/).check();
  await form.getByLabel("Permitir delegar as concessões selecionadas a outros tokens").check();
  const request = page.waitForRequest(
    (r) => r.method() === "POST" && /\/personas\/[^/]+\/tokens$/.test(new URL(r.url()).pathname),
  );
  await form.getByRole("button", { name: "Emitir token restrito", exact: true }).click();
  const submitted = (await request).postDataJSON();
  expect(submitted.permissions.administrative).toEqual(["treinar"]);
  expect(submitted.permissions.sourceIds).toHaveLength(1);
  expect(submitted.permissions.skills).toEqual([]);
  expect(submitted.delegation).toEqual(submitted.permissions);
  await expect(
    page.getByLabel("Token para conectar o cliente ou testar", { exact: true }),
  ).not.toHaveValue("");
});

test("cria catálogo privado, importa padrão e publica somente após revisão explícita", async ({
  page,
}) => {
  await login(page);
  await go(page, "Catálogo compartilhado");
  await page.getByText("Conhecimento compartilhado", { exact: true }).click();
  const region = page.getByRole("region", { name: "Conhecimento compartilhado" });
  const create = region.getByRole("form", { name: "Criar catálogo" });
  await create.getByLabel("Nome do catálogo").fill(`Fixture compartilhada ${Date.now()}`);
  await create.getByRole("button", { name: "Criar catálogo privado" }).click();
  await expect(
    region.getByText("Catálogo privado criado. Conceda acesso para compartilhar."),
  ).toBeVisible();
  const editor = region.getByRole("form", { name: "Editar padrão compartilhado" });
  await editor.getByLabel("Identificação do padrão").fill("fixture-erp");
  await editor.getByLabel("Nome do padrão", { exact: true }).fill("Estrutura sintética");
  await editor.getByLabel("Importar estrutura revisada").setInputFiles({
    name: "fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(structureContent())),
  });
  await editor.getByRole("button", { name: "Salvar padrão", exact: true }).click();
  await expect(
    region.getByText("Rascunho salvo. A publicação exige revisão de um curador."),
  ).toBeVisible();
  await region
    .getByLabel("Prazo de revisão da publicação", { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  await region.getByRole("button", { name: "Revisar padrão para publicação" }).click();
  const publish = region.getByRole("button", { name: "Confirmar publicação do padrão" });
  await expect(publish).toBeDisabled();
  await region
    .getByLabel("Revisei a estrutura, os significados e os exemplos desta versão.")
    .check();
  await publish.click();
  await expect(
    region.getByText(
      "Versão compartilhada publicada. Adoção pelas fontes ainda exige compatibilidade e republicação das skills.",
    ),
  ).toBeVisible();
  await region
    .getByRole("button", { name: "Ver versões de Estrutura sintética", exact: true })
    .click();
  const calendar = region.getByRole("region", { name: "Revisão temporal do conhecimento" });
  const impact = region.getByRole("region", { name: "Impacto do padrão publicado" });
  await impact.getByRole("button", { name: "Ver impacto desta versão" }).click();
  await expect(
    impact.getByText("Nenhuma dependência visível registrada nas suas personas."),
  ).toBeVisible();
  await impact.getByLabel("Tabela ou view", { exact: true }).fill("public.orders");
  await expect(
    impact.getByText("Nenhuma dependência visível registrada nas suas personas."),
  ).not.toBeVisible();
  await impact.getByLabel("Coluna opcional", { exact: true }).fill("amount");
  await impact.getByRole("button", { name: "Ver impacto desta versão" }).click();
  await expect(
    impact.getByText("Nenhuma dependência visível registrada nas suas personas."),
  ).toBeVisible();
  await calendar.getByRole("button", { name: "Carregar calendário de revisão" }).click();
  await expect(calendar.getByText(/Revisão em dia/)).toBeVisible();
  await calendar
    .getByLabel("Próxima revisão", { exact: true })
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await calendar
    .getByLabel("Justificativa da revisão")
    .fill("Prazo de revisão do padrão escolhido pelo curador");
  await calendar.getByRole("button", { name: "Registrar prazo explícito" }).click();
  await expect(
    calendar.getByText("Prazo registrado. Publicação e permissões permanecem sem alteração."),
  ).toBeVisible();
  await editor.getByLabel("Versão do padrão", { exact: true }).fill("2.0");
  await expect(region.getByText("Há alterações não salvas.")).toBeVisible();
  await expect(
    region.getByRole("button", { name: "Revisar padrão para publicação" }),
  ).toBeDisabled();
  await create.getByLabel("Nome do catálogo").fill("Outro catálogo");
  await create.getByRole("button", { name: "Criar catálogo privado" }).click();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(region.getByText("Há alterações não salvas.")).toBeVisible();
  await expect(editor.getByLabel("Nome do padrão", { exact: true })).toHaveValue(
    "Estrutura sintética",
  );
  await editor.getByRole("button", { name: "Salvar padrão", exact: true }).click();
  await expect(
    region.getByText("Rascunho salvo. A publicação exige revisão de um curador."),
  ).toBeVisible();
  await region
    .getByLabel("Prazo de revisão da publicação", { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  await region.getByRole("button", { name: "Revisar padrão para publicação" }).click();
  await region
    .getByLabel("Revisei a estrutura, os significados e os exemplos desta versão.")
    .check();
  await publish.click();
  await expect(
    region.getByText(
      "Versão compartilhada publicada. Adoção pelas fontes ainda exige compatibilidade e republicação das skills.",
    ),
  ).toBeVisible();
  await region
    .getByRole("button", { name: "Ver versões de Estrutura sintética", exact: true })
    .click();
  const history = region.getByRole("region", { name: "Versões do padrão" });
  await expect(history.getByText("Revisão 2 · Disponível", { exact: true })).toBeVisible();
  await history.getByLabel("Versão de origem").selectOption({ index: 2 });
  await history.getByLabel("Versão de destino").selectOption({ index: 1 });
  await history.getByRole("button", { name: "Comparar versões", exact: true }).click();
  await expect(history.getByText("Alterado: label", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await history.getByRole("button", { name: "Suspender revisão 1", exact: true }).click();
  await expect(
    region.getByText("Versão suspensa. O conteúdo publicado foi preservado."),
  ).toBeVisible();
  await region
    .getByRole("button", { name: "Ver versões de Estrutura sintética", exact: true })
    .click();
  await expect(
    history.getByRole("button", { name: "Suspender revisão 1", exact: true }),
  ).toBeDisabled();
});
test("curadoria visual envia proposta e incorpora somente ao rascunho após revisão exata", async ({
  page,
}) => {
  const { csrfToken } = await login(page);
  const headers = { "X-CSRF-Token": csrfToken, Origin: "http://127.0.0.1:5188" };
  const post = async (url: string, data: unknown) => {
    const response = await page.request.post(url, {
      headers,
      data: withReviewDeadline(url, data as object),
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { catalog } = await post("/api/admin/catalogos", { name: `Curadoria ${Date.now()}` });
  const root = `/api/admin/catalogos/${catalog.id}`;
  const { pattern } = await post(`${root}/padroes`, {
    slug: "curadoria",
    name: "Padrão para curadoria",
    content: structureContent(),
  });
  const prepared = await post(`${root}/padroes/${pattern.id}/preview`, {});
  const { publication } = await post(`${root}/padroes/${pattern.id}/publicar`, {
    confirmationHash: prepared.confirmationHash,
  });
  await go(page, "Catálogo compartilhado");
  await page.getByText("Conhecimento compartilhado", { exact: true }).click();
  const shared = page.getByRole("region", { name: "Conhecimento compartilhado" });
  await shared.getByRole("button", { name: "Carregar catálogos" }).click();
  await shared.getByRole("combobox", { name: "Catálogo", exact: true }).selectOption(catalog.id);
  const region = page.getByRole("region", { name: "Curadoria do conhecimento" });
  await expect(region.getByRole("button", { name: "Atualizar propostas" })).toBeEnabled();
  const form = region.getByRole("form", { name: "Propor conhecimento compartilhado" });
  await form.getByLabel("Versão base da proposta").selectOption(publication.id);
  await form.getByLabel("Resumo da proposta").fill("Calendário da fixture");
  await form.getByLabel("Regra proposta").fill("Usar calendário sintético declarado");
  await form.getByRole("button", { name: "Enviar proposta de conhecimento" }).click();
  await expect(
    region.getByText("Proposta enviada. Ela não altera rascunho, publicação ou permissões."),
  ).toBeVisible();
  await region.getByRole("button", { name: "Calendário da fixture — Pendente" }).click();
  const apply = region.getByRole("button", { name: "Incorporar proposta ao rascunho" });
  await expect(apply).toBeDisabled();
  await region.getByRole("button", { name: "Revisar incorporação ao rascunho" }).click();
  await expect(region.getByRole("region", { name: "Revisão da incorporação" })).toContainText(
    "Usar calendário sintético declarado",
  );
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
    ).toBe(true);
    await expect(region.getByLabel("Justificativa da decisão")).toBeVisible();
    if (width === 360 || width === 1280)
      await region.screenshot({ path: test.info().outputPath(`curation-${width}.png`) });
  }
  await region.getByLabel("Justificativa da decisão").fill("Material revisado para edição");
  await region
    .getByLabel("Revisei a proposta e os efeitos desta decisão sobre o rascunho.")
    .check();
  await apply.click();
  await expect(region.getByText(/Proposta incorporada somente ao rascunho/)).toBeVisible();
  await shared
    .getByRole("button", { name: "Padrão para curadoria · revisão 2", exact: true })
    .click();
  await expect(
    shared
      .getByRole("form", { name: "Editar padrão compartilhado" })
      .getByLabel("Regras de negócio (uma por linha)"),
  ).toHaveValue(/Usar calendário sintético declarado/);
  const response = await page.request.get(`${root}/publicacoes/${publication.id}`, { headers });
  expect(response.ok(), await response.text()).toBe(true);
  expect((await response.json()).publication.content.rules).toEqual(structureContent().rules);
  await form.getByLabel("Versão base da proposta").selectOption(publication.id);
  await form.getByLabel("Tipo de proposta").selectOption("tabela");
  await form.getByLabel("Resumo da proposta").fill("Significado da tabela revisado");
  await form.getByRole("button", { name: "Carregar estrutura da versão base" }).click();
  await form
    .getByLabel("Significado da tabela", { exact: true })
    .fill("Pedidos da instalação sintética");
  await form
    .getByLabel("Item estrutural da proposta")
    .selectOption(structureContent().tables[0]!.id);
  await form.getByRole("button", { name: "Enviar proposta de conhecimento" }).click();
  await expect(
    region.getByRole("button", { name: "Significado da tabela revisado — Pendente" }),
  ).toBeVisible();
  await form.getByLabel("Tipo de proposta").selectOption("relacionamento");
  await form.getByLabel("Resumo da proposta").fill("Relacionamento explícito da fixture");
  await form.getByRole("button", { name: "Carregar estrutura da versão base" }).click();
  await form.getByRole("button", { name: "Adicionar relacionamento ao padrão" }).click();
  await form.getByLabel("Identificador do relacionamento").fill("orders_identity");
  await form
    .getByRole("combobox", { name: "Origem", exact: true })
    .selectOption(structureContent().tables[0]!.id);
  await form
    .getByRole("combobox", { name: "Destino", exact: true })
    .selectOption(structureContent().tables[0]!.id);
  await form.getByRole("combobox", { name: "Cardinalidade", exact: true }).selectOption("1:1");
  await form
    .getByRole("combobox", { name: "Origem da declaração", exact: true })
    .selectOption("database");
  await form.getByLabel("Nome declarado da constraint").fill("fk_orders_id");
  await form
    .getByRole("combobox", { name: "Estado declarado da constraint", exact: true })
    .selectOption("enabled");
  await form
    .getByRole("combobox", { name: "Origem da declaração", exact: true })
    .selectOption("business");
  await expect(form.getByLabel("Nome declarado da constraint")).toHaveCount(0);
  await form
    .getByLabel("Significado do relacionamento")
    .fill("Identidade declarada, sem prova técnica");
  await form.getByLabel("Campo de origem").selectOption("id");
  await form.getByLabel("Campo de destino").selectOption("id");
  await form.getByLabel("Item estrutural da proposta").selectOption("orders_identity");
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
    ).toBe(true);
    if (width === 360 || width === 1280)
      await form.screenshot({ path: test.info().outputPath(`structural-proposal-${width}.png`) });
  }
  await form.getByRole("button", { name: "Enviar proposta de conhecimento" }).click();
  await expect(
    region.getByRole("button", { name: "Relacionamento explícito da fixture — Pendente" }),
  ).toBeVisible();
  const original = await page.request.get(`${root}/publicacoes/${publication.id}`, { headers });
  expect((await original.json()).publication.content).toEqual(structureContent());
});
const createPersona = async (page: Page, name: string) => {
  await go(page, "Personas");
  const form = page.getByRole("form", { name: "Criar persona", exact: true });
  if (!(await form.isVisible())) {
    await page.getByText("Criar uma persona", { exact: true }).click();
  }
  await form.getByLabel("Nome", { exact: true }).fill(name);
  await form.getByLabel("Especialidade", { exact: true }).fill("Financeiro sintético");
  await form.getByRole("button", { name: "Criar persona", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
};

test("suspende e recupera persona preservando histórico e revisão explícita", async ({ page }) => {
  await login(page);
  const name = `Ciclo de vida ${Date.now()}`;
  await createPersona(page, name);
  await page.getByText("Gerenciar disponibilidade", { exact: true }).click();
  await page.getByRole("button", { name: "Suspender persona", exact: true }).click();
  const form = page.getByRole("form", { name: "Confirmar estado da persona" });
  const suspend = form.getByRole("button", { name: "Confirmar suspensão", exact: true });
  await expect(suspend).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Revisar suspensão" })).toBeFocused();
  await form.getByLabel("Revisei os efeitos desta alteração").check();
  await suspend.click();
  await expect(
    page
      .getByRole("region", { name: "Estado da persona" })
      .getByText("Persona suspensa", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Editar persona", { exact: true })).not.toBeVisible();
  await go(page, "Bases");
  await expect(page).toHaveURL(/#\/overview$/);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await go(page, "Histórico");
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "persona.suspended" })
      .getByText("Persona suspensa", { exact: true }),
  ).toBeVisible();
  await go(page, "Visão geral");
  await page.getByRole("button", { name: "Recuperar persona", exact: true }).click();
  await form.getByLabel("Revisei os efeitos desta alteração").check();
  await form.getByRole("button", { name: "Confirmar recuperação", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Estado da persona" })
      .getByText("Persona ativa", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Editar persona", { exact: true })).toBeVisible();
});
const addSource = async (page: Page, account: "a" | "b" | "view") => {
  await go(page, "Bases");
  const form = page.getByRole("form", { name: "Cadastrar base", exact: true });
  if (!(await form.isVisible())) {
    await page.getByText("Adicionar uma base", { exact: true }).click();
  }
  await form.getByLabel("Nome da base", { exact: true }).fill(`Base ${account}`);
  await form
    .getByLabel("Para que essa base será usada?", { exact: true })
    .fill(`Pedidos da empresa ${account}`);
  await form
    .getByLabel("AGENT_ID", { exact: true })
    .fill(
      account === "a"
        ? "11111111-1111-4111-8111-111111111111"
        : "22222222-2222-4222-8222-222222222222",
    );
  await form.getByLabel("CLIENT_EMAIL", { exact: true }).fill(`${account}@fixture.test`);
  await form.getByLabel("CLIENT_PASSWORD", { exact: true }).fill("fixture-password");
  await form.getByLabel("CLIENT_TOKEN", { exact: true }).fill(`fixture-${account}`);
  await form.getByRole("combobox", { name: "DIALETO", exact: true }).selectOption("postgres");
  await form.getByRole("button", { name: "Conectar base", exact: true }).click();
  await expect(page.getByText(`Base ${account}`, { exact: true }).first()).toBeVisible();
  await page.getByText("Adicionar uma base", { exact: true }).click();
  await expect(form.getByLabel("CLIENT_TOKEN", { exact: true })).toHaveValue("");
  await expect(form.getByLabel("CLIENT_PASSWORD", { exact: true })).toHaveValue("");
  await expect(form.getByLabel("Nome da base", { exact: true })).toHaveValue("");
  await page.getByText("Adicionar uma base", { exact: true }).click();
};

test("inspeção estrutural não duplica submissão no mesmo evento", async ({ page }) => {
  await login(page);
  await createPersona(page, `Inspeção única ${Date.now()}`);
  await addSource(page, "a");
  await go(page, "Conhecimento");
  const knowledge = page.getByRole("region", {
    name: "Conhecimento das bases da persona",
    exact: true,
  });
  await knowledge.getByLabel("Base para conhecimento").selectOption({ label: "Base a — postgres" });
  const panel = knowledge.getByRole("region", { name: "Inspeção estrutural", exact: true });
  await panel.getByLabel("Tabela ou view 1", { exact: true }).fill("orders");
  let requests = 0;
  let release: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/personas/*/fontes/*/estrutura", async (route) => {
    requests++;
    await barrier;
    await route.continue();
  });
  try {
    await panel.getByRole("form", { name: "Escopo da inspeção" }).evaluate((form: unknown) => {
      const element = form as { dispatchEvent: (event: Event) => boolean };
      element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await expect(
      panel.getByRole("button", { name: "Inspecionar estrutura", exact: true }),
    ).toBeDisabled();
    await expect.poll(() => requests).toBeGreaterThan(0);
    release?.();
    await expect(panel.getByRole("heading", { name: "public.orders — Disponível" })).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Inspecionar estrutura", exact: true }),
    ).toBeEnabled();
    expect(requests).toBe(1);
  } finally {
    release?.();
  }
});

test("combina páginas de inspeção explicitamente e descarta prova ao mudar o escopo", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, `Inspeção paginada ${Date.now()}`);
  await addSource(page, "a");
  await go(page, "Conhecimento");
  const knowledge = page.getByRole("region", {
    name: "Conhecimento das bases da persona",
    exact: true,
  });
  await knowledge.getByLabel("Base para conhecimento").selectOption({ label: "Base a — postgres" });
  const panel = knowledge.getByRole("region", { name: "Inspeção estrutural", exact: true });
  const names = ["orders", "missing_a", "missing_b", "missing_c", "missing_d"];
  for (let i = 0; i < names.length; i++) {
    if (i) await panel.getByRole("button", { name: "Adicionar recurso", exact: true }).click();
    await panel.getByLabel(`Tabela ou view ${i + 1}`, { exact: true }).fill(names[i]!);
  }
  await panel.getByRole("button", { name: "Inspecionar estrutura", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Inspecionar próxima página" })).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Combinar páginas inspecionadas" }),
  ).not.toBeVisible();
  await panel.getByRole("button", { name: "Inspecionar próxima página" }).click();
  await panel.getByRole("button", { name: "Combinar páginas inspecionadas" }).click();
  await expect(
    panel.getByRole("status").filter({ hasText: "Evidência composta de 2 páginas" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("list", { name: "Origem das páginas" }).getByRole("listitem"),
  ).toHaveCount(2);
  await expect(panel.getByRole("heading", { name: "public.orders — Disponível" })).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "public.missing_d — Não encontrado" }),
  ).toBeVisible();
  await expect(
    knowledge.getByRole("button", { name: "Verificar compatibilidade" }),
  ).not.toBeVisible();
  await panel.getByLabel("Tabela ou view 1", { exact: true }).fill("changed");
  await expect(panel.getByText(/Evidência composta de/)).not.toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Combinar páginas inspecionadas" }),
  ).not.toBeVisible();
});
const train = async (page: Page, account: "a" | "b", attachments = false) => {
  await go(page, "Treinamentos");
  await page.getByRole("combobox", { name: "Editar treinamento", exact: true }).selectOption("");
  const form = page.getByRole("form", { name: "Treinar consulta", exact: true });
  await form.getByLabel("Nome", { exact: true }).fill(`Pedidos ${account}`);
  await form.getByLabel("Identificador curto", { exact: true }).fill(`pedidos-${account}`);
  await form
    .getByRole("combobox", { name: "Base", exact: true })
    .selectOption({ label: `Base ${account}` });
  await form
    .getByLabel("Objetivo da consulta", { exact: true })
    .fill(`Consultar pedidos da empresa ${account}`);
  await form.getByRole("button", { name: "Adicionar tabela", exact: true }).click();
  const table = form.locator(".row").first();
  await table.getByLabel("Nome físico", { exact: true }).fill("public.orders");
  await table.getByLabel("Significado", { exact: true }).fill("Um pedido por identificador");
  await table.getByLabel("Colunas que identificam um registro", { exact: true }).fill("id");
  for (const [index, name, meaning] of [
    [1, "id", "Identificador"],
    [2, "amount", "Valor em reais"],
  ] as const) {
    await form.getByRole("button", { name: "Adicionar coluna", exact: true }).click();
    const row = form.locator(".row").nth(index);
    await row.getByRole("combobox", { name: "Tabela", exact: true }).selectOption("public.orders");
    await row.getByLabel("Coluna", { exact: true }).fill(name);
    await row.getByLabel("Significado", { exact: true }).fill(meaning);
    if (attachments) {
      const uses = row.getByRole("group", {
        name: `Finalidades de public.orders.${name}`,
        exact: true,
      });
      await uses.getByLabel("Restringir as finalidades deste campo livre", { exact: true }).check();
      for (const use of [
        "Exibir no resultado",
        "Filtrar registros",
        "Ordenar",
        "Exportar em anexo (JSON ou binário)",
      ])
        await uses.getByLabel(use, { exact: true }).check();
    }
  }
  if (attachments)
    await form
      .getByLabel("Permitir anexos JSON após publicação e concessão explícitas", { exact: true })
      .check();
  await form
    .getByLabel("Regras de negócio (uma por linha)", { exact: true })
    .fill("Valores em BRL");
  await form
    .getByLabel("Exemplo de SQL", { exact: true })
    .fill("SELECT p.id, p.amount FROM public.orders p WHERE p.id > 0 ORDER BY p.id");
  await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(
    page.getByText("Rascunho salvo. Revise o pacote antes de publicar.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Prazo de revisão da publicação", { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Revisar publicação", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar publicação", exact: true }),
  ).toBeDisabled();
  await form.getByLabel("Objetivo da consulta", { exact: true }).fill("Alteração ainda não salva");
  await expect(
    page.getByRole("button", { name: "Confirmar publicação", exact: true }),
  ).not.toBeVisible();
  await form
    .getByLabel("Objetivo da consulta", { exact: true })
    .fill(`Consultar pedidos da empresa ${account}`);
  await page
    .getByLabel("Prazo de revisão da publicação", { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Revisar publicação", exact: true }).click();
  await page
    .getByLabel("Revisei o SQL, a estrutura e as regras deste pacote.", { exact: true })
    .check();
  await page.getByRole("button", { name: "Confirmar publicação", exact: true }).click();
  await expect(
    page.getByText("Treinamento publicado. Libere seu uso em um token.", { exact: true }),
  ).toBeVisible();
};
test("publica exportação explícita e baixa anexo JSON; troca de token limpa o handle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await createPersona(page, `Anexos ${Date.now()}`);
  await addSource(page, "a");
  await train(page, "a", true);
  await go(page, "Tokens e conexões");
  const tokens = page.getByRole("form", { name: "Emitir token", exact: true });
  await tokens.getByLabel("Nome do consumidor", { exact: true }).fill("Exportação sintética");
  await tokens.getByLabel(/^Pedidos a · revisão 1/).check();
  await tokens.getByRole("button", { name: "Emitir token restrito", exact: true }).click();
  await expect(page.getByText(/Token emitido/)).toBeVisible();
  await go(page, "Consultas");
  await page
    .getByRole("combobox", { name: "Consulta", exact: true })
    .selectOption({ label: "Pedidos a · revisão 1" });
  await page.getByRole("combobox", { name: "Linhas por página", exact: true }).selectOption("25");
  await page.getByRole("button", { name: "Criar anexo JSON", exact: true }).click();
  const panel = page.getByRole("region", { name: "Anexo da consulta", exact: true });
  await expect(panel).toContainText("O download revalida o acesso.");
  const saved = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Baixar anexo JSON", exact: true }).click();
  const download = await saved;
  expect(download.suggestedFilename()).toMatch(/^consulta-[a-f0-9-]{36}\.json$/);
  const content = await readFile(await download.path(), "utf8");
  const data = JSON.parse(content);
  expect(data).toMatchObject({
    format: "persona-query-attachment-v1",
    completeness: { complete: false },
    pagination: { page: 1, pageSize: 25, hasNextPage: true },
  });
  expect(data.rows).toHaveLength(25);
  expect(data.rows[0]).toEqual({ id: 1, amount: "10.25" });
  expect(data.rows[24]).toEqual({ id: 25, amount: "0.25" });
  await expect(panel).toContainText("Parcial: o arquivo não representa o total.");
  expect(content).not.toMatch(/SELECT|Bearer|clientToken|fixture-password/);
  expect(page.url()).not.toMatch(/anexo|token|SELECT/);
  await page.getByLabel("Token para consultar", { exact: true }).fill("");
  await expect(panel).not.toBeVisible();
});

test("publica coluna binária e baixa bytes originais sem mostrá-los na consulta comum", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await createPersona(page, `Binários ${Date.now()}`);
  await addSource(page, "a");
  await train(page, "a");
  await page
    .getByRole("combobox", { name: "Editar treinamento", exact: true })
    .selectOption({ label: "Pedidos a · publicado" });
  const form = page.getByRole("form", { name: "Treinar consulta", exact: true });
  await form.getByLabel("Nome", { exact: true }).fill("Documento a");
  await form.getByLabel("Nome físico", { exact: true }).fill("public.documents");
  for (const row of [form.locator(".row").nth(1), form.locator(".row").nth(2)])
    await row
      .getByRole("combobox", { name: "Tabela", exact: true })
      .selectOption("public.documents");
  const column = form.locator(".row").nth(2);
  await column.getByLabel("Coluna", { exact: true }).fill("document");
  await column
    .getByRole("combobox", { name: "Classificação", exact: true })
    .selectOption("pessoal");
  const uses = column.getByRole("group", {
    name: "Finalidades de public.documents.document",
    exact: true,
  });
  await uses.getByLabel("Exibir no resultado", { exact: true }).check();
  await uses.getByLabel("Exportar em anexo (JSON ou binário)", { exact: true }).check();
  await uses
    .getByLabel("Justificativa de uso", { exact: true })
    .fill("Download de documento sintético autorizado");
  const editor = form.getByRole("group", { name: "Anexo binário desta consulta", exact: true });
  await editor
    .getByLabel("Permitir arquivo binário após publicação e concessão explícitas", { exact: true })
    .check();
  await editor
    .getByRole("combobox", { name: "Coluna física do arquivo", exact: true })
    .selectOption({ label: "public.documents.document" });
  await editor.getByLabel("application/pdf", { exact: true }).check();
  await editor.getByLabel("application/octet-stream", { exact: true }).uncheck();
  await form
    .getByLabel("Exemplo de SQL", { exact: true })
    .fill("SELECT p.document AS attachment FROM public.documents p WHERE p.id = 1 ORDER BY p.id");
  await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(
    page.getByText("Rascunho salvo. Revise o pacote antes de publicar.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Prazo de revisão da publicação", { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Revisar publicação", exact: true }).click();
  await page
    .getByLabel("Revisei o SQL, a estrutura e as regras deste pacote.", { exact: true })
    .check();
  await page.getByRole("button", { name: "Confirmar publicação", exact: true }).click();
  await expect(
    page.getByText("Treinamento publicado. Libere seu uso em um token.", { exact: true }),
  ).toBeVisible();
  await go(page, "Tokens e conexões");
  const tokens = page.getByRole("form", { name: "Emitir token", exact: true });
  await tokens.getByLabel("Nome do consumidor", { exact: true }).fill("Documento sintético");
  await tokens.getByLabel(/^Documento a · revisão 2/).check();
  await tokens.getByRole("button", { name: "Emitir token restrito", exact: true }).click();
  await expect(page.getByText(/Token emitido/)).toBeVisible();
  await go(page, "Consultas");
  await page
    .getByRole("combobox", { name: "Consulta", exact: true })
    .selectOption({ label: "Documento a · revisão 2" });
  await page.getByRole("button", { name: "Criar anexo binário", exact: true }).click();
  const panel = page.getByRole("region", { name: "Anexo da consulta", exact: true });
  await expect(panel).toContainText("application/pdf");
  const pending = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Baixar anexo binário", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^consulta-[a-f0-9-]+\.pdf$/);
  expect(await readFile(await download.path())).toEqual(
    Buffer.from("%PDF-1.4\n% Browser fixture\n%%EOF\n"),
  );
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Campo ou finalidade");
  await expect(panel).not.toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "attachment", exact: true }),
  ).not.toBeVisible();
});

test("reduz limites publicados, do token e da concessão no console", async ({ page }) => {
  await login(page);
  await createPersona(page, `Limites ${Date.now()}`);
  await addSource(page, "a");
  await train(page, "a");
  await page
    .getByRole("combobox", { name: "Editar treinamento", exact: true })
    .selectOption({ label: "Pedidos a · publicado" });
  const form = page.getByRole("form", { name: "Treinar consulta", exact: true });
  const skillLimits = form.getByRole("group", {
    name: "Limites desta skill de consulta",
    exact: true,
  });
  await skillLimits.getByRole("checkbox").check();
  await skillLimits.getByLabel("Máximo de linhas", { exact: true }).fill("8");
  await skillLimits.getByLabel("Máximo de linhas por página").fill("6");
  await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(
    page.getByText("Rascunho salvo. Revise o pacote antes de publicar.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Prazo de revisão da publicação", { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Revisar publicação", exact: true }).click();
  await page
    .getByLabel("Revisei o SQL, a estrutura e as regras deste pacote.", { exact: true })
    .check();
  await page.getByRole("button", { name: "Confirmar publicação", exact: true }).click();
  await expect(
    page.getByText("Treinamento publicado. Libere seu uso em um token.", { exact: true }),
  ).toBeVisible();
  await go(page, "Tokens e conexões");
  const tokens = page.getByRole("form", { name: "Emitir token", exact: true });
  await tokens.getByLabel("Nome do consumidor", { exact: true }).fill("Tetos menores");
  await tokens.getByLabel(/^Pedidos a · revisão 2/).check();
  await tokens.getByText("Limites do novo token", { exact: true }).click();
  const globalLimits = tokens.getByRole("group", { name: "Consultas do novo token", exact: true });
  await globalLimits.getByRole("checkbox").check();
  await globalLimits.getByLabel("Máximo de linhas", { exact: true }).fill("5");
  await globalLimits.getByLabel("Máximo de linhas por página").fill("4");
  const grantLimits = tokens.getByRole("group", { name: "Concessão desta consulta", exact: true });
  await grantLimits.getByRole("checkbox").check();
  await grantLimits.getByLabel("Máximo de linhas", { exact: true }).fill("3");
  await grantLimits.getByLabel("Máximo de linhas por página").fill("2");
  const issued = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/tokens"),
  );
  await tokens.getByRole("button", { name: "Emitir token restrito", exact: true }).click();
  const response = await issued;
  expect(response.ok(), await response.text()).toBe(true);
  const submitted = response.request().postDataJSON();
  expect(submitted.permissions.queryLimits).toEqual({ maxRows: 5, pageSize: 4 });
  expect(submitted.permissions.skills[0].queryLimits).toEqual({ maxRows: 3, pageSize: 2 });
  await go(page, "Consultas");
  await page
    .getByRole("combobox", { name: "Consulta", exact: true })
    .selectOption({ label: "Pedidos a · revisão 2" });
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByText(/Limites desta execução: 3 linhas, 2 por página/)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "id", exact: true })).toBeVisible();
});

test("configura finalidade pessoal no formulário e concede somente o uso publicado ao consumidor", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, `Finalidades ${Date.now()}`);
  await addSource(page, "a");
  await train(page, "a");
  await page
    .getByRole("combobox", { name: "Editar treinamento", exact: true })
    .selectOption({ label: "Pedidos a · publicado" });
  const form = page.getByRole("form", { name: "Treinar consulta", exact: true });
  await form
    .getByRole("combobox", { name: "Classificação", exact: true })
    .nth(1)
    .selectOption("pessoal");
  const field = form.getByRole("group", {
    name: "Finalidades de public.orders.amount",
    exact: true,
  });
  await field.getByRole("checkbox", { name: "Filtrar registros", exact: true }).check();
  await field.getByLabel("Justificativa de uso").fill("Filtro autorizado de valores sintéticos");
  await form
    .getByLabel("Exemplo de SQL", { exact: true })
    .fill("SELECT p.id FROM public.orders p WHERE p.amount > 0 ORDER BY p.id");
  await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(
    page.getByText("Rascunho salvo. Revise o pacote antes de publicar.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Prazo de revisão da publicação", { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Revisar publicação", exact: true }).click();
  await page
    .getByLabel("Revisei o SQL, a estrutura e as regras deste pacote.", { exact: true })
    .check();
  await page.getByRole("button", { name: "Confirmar publicação", exact: true }).click();
  await expect(
    page.getByText("Treinamento publicado. Libere seu uso em um token.", { exact: true }),
  ).toBeVisible();
  await go(page, "Tokens e conexões");
  const tokens = page.getByRole("form", { name: "Emitir token", exact: true });
  await expect(tokens.getByText("public.orders.amount · filtrar", { exact: true })).toBeVisible();
  await tokens.getByLabel("Nome do consumidor", { exact: true }).fill("Somente filtro");
  await tokens.getByLabel(/^Pedidos a · revisão 2/).check();
  await tokens.getByRole("button", { name: "Emitir token restrito", exact: true }).click();
  await go(page, "Consultas");
  await page
    .getByRole("combobox", { name: "Consulta", exact: true })
    .selectOption({ label: "Pedidos a · revisão 2" });
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "id", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "amount", exact: true })).not.toBeVisible();
});

test("inspeciona, publica perfil físico e adota versão exata no rascunho sem mudar a publicação anterior", async ({
  page,
}) => {
  const { csrfToken } = await login(page);
  const personaName = `Perfil físico ${Date.now()}`;
  await createPersona(page, personaName);
  await addSource(page, "a");
  await addSource(page, "b");
  await train(page, "a");
  const headers = { "X-CSRF-Token": csrfToken, Origin: "http://127.0.0.1:5188" };
  const post = async (url: string, data: unknown) => {
    const result = await page.request.post(url, {
      headers,
      data: withReviewDeadline(url, data as object),
    });
    expect(result.ok(), await result.text()).toBe(true);
    return result.json();
  };
  // Fixture setup only; the journey under review uses the real console editors.
  const catalog = await post("/api/admin/catalogos", { name: `Catálogo físico ${Date.now()}` });
  const baseContent = structureContent();
  const table = baseContent.tables[0]!;
  const content = {
    ...baseContent,
    examples: [],
    dialects: ["postgres"],
    tables: [
      {
        ...table,
        physicalNames: [{ dialect: "postgres", name: "public.orders" }],
        columns: table.columns.map((c) => ({
          ...c,
          nullable: c.name !== "id",
          nativeTypes: [{ dialect: "postgres", type: c.name === "id" ? "int4" : "numeric" }],
        })),
        keys: [{ id: "pk-orders", kind: "primary", columns: ["id"], status: "enabled" }],
      },
    ],
  };
  const pattern = await post(`/api/admin/catalogos/${catalog.catalog.id}/padroes`, {
    slug: "profile-fixture",
    name: "Padrão comprovável",
    content,
  });
  const patternRoot = `/api/admin/catalogos/${catalog.catalog.id}/padroes/${pattern.pattern.id}`;
  const preview = await post(`${patternRoot}/preview`, {});
  const publication = await post(`${patternRoot}/publicar`, {
    confirmationHash: preview.confirmationHash,
  });
  await go(page, "Conhecimento");
  const knowledge = page.getByRole("region", {
    name: "Conhecimento das bases da persona",
    exact: true,
  });
  await knowledge.getByLabel("Base para conhecimento").selectOption({ label: "Base a — postgres" });
  await knowledge.getByLabel("Catálogo autorizado").selectOption(catalog.catalog.id);
  await knowledge
    .getByRole("combobox", { name: "Versão do padrão", exact: true })
    .selectOption(publication.publication.id);
  await knowledge.getByRole("button", { name: "Preencher escopo da versão selecionada" }).click();
  await go(page, "Treinamentos");
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(knowledge.getByLabel("Tabela ou view 1")).toHaveValue("orders");
  await knowledge.getByRole("button", { name: "Inspecionar estrutura", exact: true }).click();
  await expect(knowledge.getByText(/Primária orders_pkey/)).toContainText("Habilitada e validada");
  await knowledge.getByRole("button", { name: "Verificar compatibilidade" }).click();
  await expect(
    knowledge.getByRole("heading", { name: "Estrutura compatível", exact: true }),
  ).toBeVisible();
  await knowledge.getByRole("button", { name: "Criar perfil físico", exact: true }).click();
  const profile = knowledge.getByRole("form", { name: "Editar perfil físico", exact: true });
  await profile
    .getByLabel("Nome do perfil físico", { exact: true })
    .fill("Particularidade da empresa A");
  await profile
    .getByLabel("Significado da tabela", { exact: true })
    .fill("Pedidos sintéticos revisados da empresa A");
  await profile.getByLabel("Substituir definição de orders", { exact: true }).check();
  await profile.getByRole("button", { name: "Salvar perfil físico", exact: true }).click();
  await expect(profile.getByLabel("Nome do perfil físico")).toHaveValue(
    "Particularidade da empresa A",
  );
  await expect(
    knowledge.getByRole("button", { name: /Editar Particularidade da empresa A/ }),
  ).toBeVisible();
  await knowledge
    .getByLabel("Prazo de revisão da publicação", { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  await knowledge.getByRole("button", { name: "Revisar perfil para publicação" }).click();
  const publish = knowledge.getByRole("button", { name: "Confirmar publicação do perfil físico" });
  await expect(publish).toBeDisabled();
  await knowledge
    .getByLabel("Revisei as particularidades, os significados e as substituições desta base.")
    .check();
  await publish.click();
  const profiles = knowledge.getByRole("combobox", {
    name: "Perfil físico publicado",
    exact: true,
  });
  await expect(profiles).toContainText("Particularidade da empresa A · revisão 1");
  await expect(profiles).toHaveValue("");
  const profileHistory = knowledge.getByRole("region", {
    name: "Histórico de perfis físicos",
    exact: true,
  });
  await profileHistory
    .getByRole("combobox", { name: "Versão anterior", exact: true })
    .selectOption({ label: "Particularidade da empresa A · revisão 1" });
  await profileHistory
    .getByRole("combobox", { name: "Versão posterior", exact: true })
    .selectOption({ label: "Particularidade da empresa A · revisão 1" });
  await profileHistory.getByRole("button", { name: "Comparar perfis publicados" }).click();
  await expect(profileHistory.getByText("Nenhuma diferença de conteúdo.")).toBeVisible();
  await expect(profiles).toHaveValue("");
  await profiles.selectOption({ label: "Particularidade da empresa A · revisão 1" });
  const physicalImpact = knowledge.getByRole("region", {
    name: "Impacto do perfil físico publicado",
  });
  await physicalImpact.getByRole("button", { name: "Ver impacto desta versão" }).click();
  await expect(
    physicalImpact.getByText("Nenhuma dependência visível registrada nas suas personas."),
  ).toBeVisible();
  const physicalCuration = knowledge.getByRole("region", {
    name: "Curadoria de particularidades físicas",
    exact: true,
  });
  const proposalForm = physicalCuration.getByRole("form", {
    name: "Propor conhecimento compartilhado",
  });
  await proposalForm.getByLabel("Resumo da proposta").fill("Calendário da empresa A");
  await proposalForm
    .getByLabel("Regra proposta")
    .fill("Regra particular candidata, sem adoção automática");
  await proposalForm.getByRole("button", { name: "Enviar proposta de conhecimento" }).click();
  await physicalCuration
    .getByRole("button", { name: "Calendário da empresa A — Pendente" })
    .click();
  await physicalCuration.getByRole("button", { name: "Revisar incorporação ao rascunho" }).click();
  const incorporate = physicalCuration.getByRole("button", {
    name: "Incorporar proposta ao rascunho",
  });
  await expect(incorporate).toBeDisabled();
  await physicalCuration
    .getByLabel("Justificativa da decisão")
    .fill("Revisado para o rascunho desta base");
  await physicalCuration
    .getByLabel("Revisei a proposta e os efeitos desta decisão sobre o rascunho.")
    .check();
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
    ).toBe(true);
  }
  await incorporate.click();
  await expect(
    knowledge.getByRole("button", { name: /Editar Particularidade da empresa A · revisão 2/ }),
  ).toBeVisible();
  await expect(profiles).toContainText("Particularidade da empresa A · revisão 1");
  await expect(profiles).not.toContainText("revisão 2");
  const physicalCalendar = knowledge.getByRole("region", {
    name: "Revisão temporal do conhecimento",
  });
  await physicalCalendar.getByRole("button", { name: "Carregar calendário de revisão" }).click();
  await physicalCalendar
    .getByLabel("Próxima revisão", { exact: true })
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await physicalCalendar
    .getByLabel("Justificativa da revisão")
    .fill("Revisão específica da instalação");
  await knowledge.getByLabel("Base para conhecimento").selectOption({ label: "Base b — postgres" });
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(physicalCalendar.getByLabel("Justificativa da revisão")).toHaveValue(
    "Revisão específica da instalação",
  );
  await physicalCalendar.getByRole("button", { name: "Registrar prazo explícito" }).click();
  await expect(
    physicalCalendar.getByText(
      "Prazo registrado. Publicação e permissões permanecem sem alteração.",
    ),
  ).toBeVisible();
  await knowledge.getByLabel("Base para conhecimento").selectOption({ label: "Base b — postgres" });
  await knowledge.getByLabel("Catálogo autorizado").selectOption(catalog.catalog.id);
  await knowledge
    .getByRole("combobox", { name: "Versão do padrão", exact: true })
    .selectOption(publication.publication.id);
  await expect(profiles).not.toContainText("Particularidade da empresa A");
  await go(page, "Treinamentos");
  const adoption = page.getByRole("region", {
    name: "Adoção de conhecimento na skill",
    exact: true,
  });
  await adoption.getByLabel("Catálogo autorizado").selectOption(catalog.catalog.id);
  await adoption
    .getByRole("combobox", { name: "Versão do padrão", exact: true })
    .selectOption(publication.publication.id);
  await adoption
    .getByRole("combobox", { name: "Perfil físico publicado", exact: true })
    .selectOption({ label: "Particularidade da empresa A · revisão 1" });
  await adoption.getByRole("button", { name: "Selecionar tabelas e campos livres" }).click();
  await adoption.getByRole("button", { name: "Preencher escopo da versão selecionada" }).click();
  await adoption.getByRole("button", { name: "Inspecionar estrutura", exact: true }).click();
  await adoption.getByRole("button", { name: "Verificar compatibilidade", exact: true }).click();
  await expect(
    adoption.getByRole("heading", { name: "Estrutura compatível", exact: true }),
  ).toBeVisible();
  const apply = adoption.getByRole("button", {
    name: "Aplicar conhecimento ao rascunho",
    exact: true,
  });
  await expect(apply).toBeDisabled();
  await adoption.getByLabel("Tabela ou view 1").fill("missing_fixture");
  await expect(
    adoption.getByRole("heading", { name: "Estrutura compatível", exact: true }),
  ).not.toBeVisible();
  await adoption.getByRole("button", { name: "Inspecionar estrutura", exact: true }).click();
  await adoption.getByRole("button", { name: "Verificar compatibilidade", exact: true }).click();
  await expect(
    adoption.getByRole("heading", { name: "Compatibilidade inconclusiva", exact: true }),
  ).toBeVisible();
  await expect(apply).toBeDisabled();
  await adoption.getByRole("button", { name: "Preencher escopo da versão selecionada" }).click();
  await adoption.getByRole("button", { name: "Inspecionar estrutura", exact: true }).click();
  await adoption.getByRole("button", { name: "Verificar compatibilidade", exact: true }).click();
  await adoption
    .getByLabel(
      "Revisei a estrutura, os relacionamentos e as regras que substituirão o conteúdo do rascunho.",
    )
    .check();
  await apply.click();
  const training = page.getByRole("form", { name: "Treinar consulta", exact: true });
  await expect(training.getByLabel("Exemplo de SQL", { exact: true })).toHaveValue(
    "SELECT p.id, p.amount FROM public.orders p WHERE p.id > 0 ORDER BY p.id",
  );
  await expect(training.getByLabel("Significado", { exact: true }).first()).toHaveValue(
    "Pedidos sintéticos revisados da empresa A",
  );
  const personaId = await page.getByRole("combobox", { name: "Persona", exact: true }).inputValue();
  const skillId = await page
    .getByRole("combobox", { name: "Editar treinamento", exact: true })
    .inputValue();
  const activeResponse = await page.request.get(
    `/api/admin/personas/${personaId}/skills/${skillId}/publicacao`,
    { headers },
  );
  expect(activeResponse.ok()).toBe(true);
  const activePublication = (await activeResponse.json()) as {
    publication: { package: { training: { tables: { meaning: string }[] } } };
  };
  expect(activePublication.publication.package.training.tables[0]!.meaning).toBe(
    "Um pedido por identificador",
  );
  await training.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await page
    .getByLabel("Prazo de revisão da publicação", { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Revisar publicação", exact: true }).click();
  await page
    .getByLabel("Revisei o SQL, a estrutura e as regras deste pacote.", { exact: true })
    .check();
  await page.getByRole("button", { name: "Confirmar publicação", exact: true }).click();
  await expect(
    page.getByText("Treinamento publicado. Libere seu uso em um token.", { exact: true }),
  ).toBeVisible();
  await go(page, "Conhecimento");
  await knowledge.getByLabel("Base para conhecimento").selectOption({ label: "Base a — postgres" });
  await knowledge.getByLabel("Catálogo autorizado").selectOption(catalog.catalog.id);
  await knowledge
    .getByRole("combobox", { name: "Versão do padrão", exact: true })
    .selectOption(publication.publication.id);
  await knowledge
    .getByRole("combobox", { name: "Perfil físico publicado", exact: true })
    .selectOption({ label: "Particularidade da empresa A · revisão 1" });
  await knowledge.getByRole("button", { name: "Preencher escopo da versão selecionada" }).click();
  await knowledge.getByRole("button", { name: "Inspecionar estrutura", exact: true }).click();
  await knowledge.getByRole("button", { name: "Verificar compatibilidade", exact: true }).click();
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
      true,
    );
    if (width === 360)
      await page.screenshot({
        path: "node_modules/.cache/persona-physical-profile-mobile.png",
        fullPage: true,
      });
  }
  await page.screenshot({
    path: "node_modules/.cache/persona-physical-profile-console.png",
    fullPage: true,
  });
  // Reopen the saved draft, without pending edits in the separate knowledge workspace.
  await page.reload();
  const renewed = await login(page);
  headers["X-CSRF-Token"] = renewed.csrfToken;
  await page.getByRole("combobox", { name: "Persona", exact: true }).selectOption(personaId);
  await go(page, "Treinamentos");
  await page
    .getByRole("combobox", { name: "Editar treinamento", exact: true })
    .selectOption(skillId);
  const sourceChoice = training.getByRole("combobox", { name: "Base", exact: true });
  const oldSource = await sourceChoice.inputValue();
  await sourceChoice.selectOption({ label: "Base b" });
  await expect(page.getByRole("button", { name: "Continuar editando", exact: true })).toBeVisible({
    timeout: 5000,
  });
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(sourceChoice).toHaveValue(oldSource);
  await expect(
    adoption.getByText(/Este rascunho tem uma referência compartilhada salva/),
  ).toBeVisible();
  await sourceChoice.selectOption({ label: "Base b" });
  await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  await expect(sourceChoice).not.toHaveValue(oldSource);
  await expect(
    adoption.getByText(/Este rascunho tem uma referência compartilhada salva/),
  ).not.toBeVisible();
  const savedDraft = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/skills/${skillId}/rascunho`) &&
      response.request().method() === "POST",
  );
  await training.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  const response = await savedDraft;
  expect(response.ok()).toBe(true);
  const changed = (await response.json()).skill.training;
  expect(changed.sourceId).not.toBe(oldSource);
  expect(changed.sharedKnowledge).toBeUndefined();
  const stillPublished = await page.request.get(
    `/api/admin/personas/${personaId}/skills/${skillId}/publicacao`,
    { headers },
  );
  expect(stillPublished.ok()).toBe(true);
  const publishedTraining = (await stillPublished.json()).publication.package.training;
  expect(publishedTraining.sourceId).toBe(oldSource);
  expect(publishedTraining.sharedKnowledge.profilePublicationId).toBeTruthy();
});
for (const width of [390, 1280]) {
  test(`ciclo de fontes revisado preserva histórico e exige cadastro independente (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await createPersona(page, `Ciclo de fontes ${width}`);
    await addSource(page, "a");
    await addSource(page, "b");
    await train(page, "a");
    await go(page, "Bases");
    const lifecycle = page.getByRole("region", { name: "Ciclo da base Base a", exact: true });
    await lifecycle.getByRole("button", { name: "Revisar suspensão", exact: true }).click();
    const suspension = lifecycle.getByRole("form", {
      name: "Confirmar suspender base Base a",
      exact: true,
    });
    await expect(suspension.getByText(/Pedidos a · revisão 1/)).toBeVisible();
    await expect(
      suspension.getByRole("button", { name: "Confirmar suspensão", exact: true }),
    ).toBeDisabled();
    await go(page, "Treinamentos");
    await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
    await expect(suspension).toBeVisible();
    await suspension
      .getByLabel("Revisei os efeitos desta ação sobre a base e suas publicações.")
      .check();
    await suspension.getByRole("button", { name: "Confirmar suspensão", exact: true }).click();
    await expect(
      page.getByText(
        "Fonte suspensa, incluindo publicações e cruzamentos dependentes. As outras fontes continuam independentes.",
        { exact: true },
      ),
    ).toBeVisible();
    await lifecycle.getByRole("button", { name: "Revisar recuperação", exact: true }).click();
    const recovery = lifecycle.getByRole("form", {
      name: "Confirmar recuperar base Base a",
      exact: true,
    });
    await recovery
      .getByLabel("Revisei os efeitos desta ação sobre a base e suas publicações.")
      .check();
    await recovery.getByRole("button", { name: "Confirmar recuperação", exact: true }).click();
    await expect(
      page.getByText(
        "Mesma base confirmada e vínculo recuperado. Revise e publique novamente as skills; nenhuma permissão nova foi concedida.",
        { exact: true },
      ),
    ).toBeVisible();
    await go(page, "Treinamentos");
    await expect(
      page.getByRole("combobox", { name: "Editar treinamento", exact: true }),
    ).toContainText("publicação suspensa");
    await go(page, "Bases");
    await lifecycle.getByRole("button", { name: "Revisar substituição", exact: true }).click();
    const review = lifecycle.getByRole("form", {
      name: "Confirmar substituir base Base a",
      exact: true,
    });
    await review
      .getByLabel("Revisei os efeitos desta ação sobre a base e suas publicações.")
      .check();
    await review
      .getByRole("button", { name: "Preencher nova base substituta", exact: true })
      .click();
    const form = page.getByRole("form", { name: "Cadastrar base substituta", exact: true });
    await expect(form).toBeVisible();
    await expect(form).toBeFocused();
    await form.getByLabel("Nome da base", { exact: true }).fill("Base substituta");
    await go(page, "Visão geral");
    await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
    await expect(form.getByLabel("Nome da base", { exact: true })).toHaveValue("Base substituta");
    await form.getByLabel("AGENT_ID", { exact: true }).fill("22222222-2222-4222-8222-222222222222");
    await form.getByLabel("CLIENT_EMAIL", { exact: true }).fill("b@fixture.test");
    await form.getByLabel("CLIENT_PASSWORD", { exact: true }).fill("fixture-password");
    await form.getByLabel("CLIENT_TOKEN", { exact: true }).fill("fixture-b");
    await expect(
      form.getByRole("button", { name: "Verificar e substituir base", exact: true }),
    ).toBeDisabled();
    await form.getByLabel("Confirmo o cadastro independente desta base substituta.").check();
    await form.getByRole("button", { name: "Verificar e substituir base", exact: true }).click();
    await expect(
      page.getByText(
        "Nova base verificada. O vínculo anterior ficou no histórico; treine, publique e conceda acesso explicitamente à substituta.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(lifecycle.getByText(/Vínculo substituído e mantido no histórico/)).toBeVisible();
    await expect(lifecycle.getByRole("button")).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: "Ciclo da base Base substituta", exact: true })
        .getByRole("button", { name: "Revisar suspensão", exact: true }),
    ).toBeVisible();
    await go(page, "Histórico");
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "source.replaced" })
        .getByText("Vínculo da base substituído", { exact: true }),
    ).toBeVisible();
  });
}

test("descartar edição da base antes de substituir realmente limpa o formulário anterior", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, "Descarte na substituição");
  await addSource(page, "a");
  await page.getByText("Gerenciar Base a", { exact: true }).click();
  const settings = page.getByRole("form", { name: "Editar base Base a", exact: true });
  await settings.getByLabel("Nome da base", { exact: true }).fill("Edição pendente");
  const lifecycle = page.getByRole("region", { name: "Ciclo da base Base a", exact: true });
  await lifecycle.getByRole("button", { name: "Revisar substituição", exact: true }).click();
  const review = lifecycle.getByRole("form", {
    name: "Confirmar substituir base Base a",
    exact: true,
  });
  await review.getByLabel("Revisei os efeitos desta ação sobre a base e suas publicações.").check();
  await review.getByRole("button", { name: "Preencher nova base substituta", exact: true }).click();
  await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  const replacement = page.getByRole("form", { name: "Cadastrar base substituta", exact: true });
  await expect(replacement.getByLabel("Nome da base", { exact: true })).toHaveValue("Base a");
  await page.getByText("Gerenciar Base a", { exact: true }).click();
  await expect(settings.getByLabel("Nome da base", { exact: true })).toHaveValue("Base a");
});

test("dataset de origem carrega sementes revisáveis sem salvar caso e preserva edição após recusa", async ({
  page,
}) => {
  const { csrfToken } = await login(page);
  await createPersona(page, `Dataset de casos ${randomUUID()}`);
  const sourceResponse = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/fontes"),
  );
  await addSource(page, "a");
  const source = (
    (await (await sourceResponse).json()) as { fonte: { id: string; authorizationVersion: number } }
  ).fonte;
  const personaId = await page.getByRole("combobox", { name: "Persona", exact: true }).inputValue();
  const base = `/api/admin/personas/${personaId}`;
  const headers = { Origin: "http://127.0.0.1:5188", "X-CSRF-Token": csrfToken };
  const createdCatalog = await page.request.post("/api/admin/catalogos", {
    headers,
    data: { name: "Dataset artificial" },
  });
  expect(createdCatalog.status()).toBe(201);
  const catalogId = ((await createdCatalog.json()) as { catalog: { id: string } }).catalog.id;
  const content = {
    ...structureContent(),
    tables: structureContent().tables.map((table) => ({
      ...table,
      physicalNames: [{ dialect: "postgres", name: "public.orders" }],
    })),
    examples: structureContent().examples.map((example) => ({
      ...example,
      variants: example.variants.map((variant) => ({
        ...variant,
        sql:
          variant.dialect === "postgres"
            ? variant.sql.replace("FROM orders", "FROM public.orders")
            : variant.sql,
      })),
    })),
  };
  const templateResponse = await page.request.post(`/api/admin/catalogos/${catalogId}/biblioteca`, {
    headers,
    data: {
      slug: "case-template",
      name: "Template de casos",
      expectedVersion: 0,
      payload: { kind: "template", content },
    },
  });
  expect(templateResponse.status()).toBe(201);
  const template = (await templateResponse.json()) as { id: string; hash: string };
  const datasetResponse = await page.request.post(`/api/admin/catalogos/${catalogId}/biblioteca`, {
    headers,
    data: {
      slug: "case-dataset",
      name: "Dataset de sementes",
      expectedVersion: 0,
      payload: {
        kind: "dataset",
        templateId: template.id,
        templateVersion: 1,
        templateHash: template.hash,
        provenance: { kind: "synthetic", description: "Fixture de revisão visual" },
        tables: [
          {
            tableId: "orders",
            columns: [
              { name: "id", type: "integer" },
              { name: "amount", type: "decimal" },
            ],
            rows: [[7, "1234567890123456.25"]],
          },
        ],
      },
    },
  });
  expect(datasetResponse.status()).toBe(201);
  const dataset = (await datasetResponse.json()) as { id: string; hash: string };
  const datasetV2Response = await page.request.post(
    `/api/admin/catalogos/${catalogId}/biblioteca/${dataset.id}/versoes`,
    {
      headers,
      data: {
        slug: "case-dataset",
        name: "Dataset de sementes v2",
        expectedVersion: 1,
        payload: {
          kind: "dataset",
          templateId: template.id,
          templateVersion: 1,
          templateHash: template.hash,
          provenance: { kind: "synthetic", description: "Outra versão explícita" },
          tables: [
            {
              tableId: "orders",
              columns: [
                { name: "id", type: "integer" },
                { name: "amount", type: "decimal" },
              ],
              rows: [[8, "2.50"]],
            },
          ],
        },
      },
    },
  );
  expect(datasetV2Response.status()).toBe(201);
  const datasetV2 = (await datasetV2Response.json()) as { id: string; hash: string };
  const imported = await page.request.post(`${base}/skills/template`, {
    headers,
    data: {
      catalogId,
      templateId: template.id,
      templateVersion: 1,
      templateHash: template.hash,
      sourceId: source.id,
      sourceVersion: source.authorizationVersion,
      dialect: "postgres",
      exampleId: "orders-after-id",
      slug: "case-from-dataset",
      name: "Consulta com dataset",
      dataset: { id: dataset.id, version: 1, hash: dataset.hash },
    },
  });
  expect(imported.status()).toBe(201);
  const skillId = ((await imported.json()) as { skill: { id: string } }).skill.id;
  await page.getByRole("combobox", { name: "Persona", exact: true }).selectOption(personaId);
  await go(page, "Treinamentos");
  await page
    .getByRole("combobox", { name: "Editar treinamento", exact: true })
    .selectOption(skillId);
  const panel = page.getByRole("region", { name: "Casos e relatórios da consulta", exact: true });
  await panel.getByRole("button", { name: "Adicionar caso de consulta", exact: true }).click();
  const form = panel.getByRole("form", { name: "Caso de consulta", exact: true });
  await form.getByLabel("Nome do caso de consulta", { exact: true }).fill("Caso em revisão");
  await form
    .getByRole("button", { name: "Carregar sementes do dataset de origem", exact: true })
    .click();
  await expect(form.getByRole("status")).toContainText("Nenhum caso foi salvo");
  await form.getByText("Origem editorial das sementes carregadas", { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
    true,
  );
  const amount = form.getByLabel("amount (decimal)", { exact: true });
  await expect(amount).toHaveValue("1234567890123456.25");
  const details = await page.request.get(`${base}/skills/${skillId}/testes-consulta`, { headers });
  expect((await details.json()) as unknown).toMatchObject({
    revision: 1,
    cases: [],
    reports: [],
    requiredApproved: false,
  });
  await amount.fill("1.25");
  await form
    .getByRole("button", { name: "Carregar sementes do dataset de origem", exact: true })
    .click();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(amount).toHaveValue("1.25");
  await page.route("**/sementes-dataset", (route) =>
    route.fulfill({
      status: 403,
      json: { error: { code: "AUTHORIZATION_DENIED", message: "Acesso ao catálogo revogado." } },
    }),
  );
  await form
    .getByRole("button", { name: "Carregar sementes do dataset de origem", exact: true })
    .click();
  await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("revogado");
  await expect(amount).toHaveValue("1.25");
  await expect(form.getByLabel("Nome do caso de consulta", { exact: true })).toHaveValue(
    "Caso em revisão",
  );
  await go(page, "Visão geral");
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(amount).toHaveValue("1.25");
  await page.unroute("**/sementes-dataset");
  await form.getByRole("button", { name: "Adicionar coluna esperada", exact: true }).click();
  await form.getByLabel("Coluna esperada", { exact: true }).fill("id");
  await form.getByRole("combobox", { name: "Tipo esperado", exact: true }).selectOption("integer");
  await form.getByRole("button", { name: "Salvar caso de consulta", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Caso salvo");
  await panel.getByRole("button", { name: "Consultar testes da consulta", exact: true }).click();
  await panel.getByRole("button", { name: "Editar caso Caso em revisão", exact: true }).click();
  const origin = form
    .locator("details")
    .filter({ has: page.getByText("Origem editorial registrada no caso", { exact: true }) });
  await origin.locator("summary").click();
  await expect(origin).toContainText("as sementes diferiam do dataset de origem");
  await expect(origin).toContainText(dataset.hash);
  await expect(form.getByLabel("amount (decimal)", { exact: true })).toHaveValue("1.25");
  await expect(panel).toContainText("Sem aprovação técnica obrigatória atual comprovada.");
  await page.reload();
  await login(page);
  await page.getByRole("combobox", { name: "Persona", exact: true }).selectOption(personaId);
  await go(page, "Treinamentos");
  const reloaded = page.getByRole("region", {
    name: "Casos e relatórios da consulta",
    exact: true,
  });
  await page
    .getByRole("combobox", { name: "Editar treinamento", exact: true })
    .selectOption(skillId);
  await reloaded.getByRole("button", { name: "Consultar testes da consulta", exact: true }).click();
  await reloaded.getByRole("button", { name: "Editar caso Caso em revisão", exact: true }).click();
  await expect(
    reloaded.getByText("Origem editorial registrada no caso", { exact: true }),
  ).toBeVisible();
  const reopened = reloaded.getByRole("form", { name: "Caso de consulta", exact: true });
  await reopened
    .getByRole("button", { name: "Escolher outro dataset deste template", exact: true })
    .click();
  const choices = reopened.getByRole("group", { name: "Escolha de dataset do caso", exact: true });
  await choices
    .getByRole("combobox", { name: "Dataset para preparar sementes", exact: true })
    .selectOption(`${dataset.id}:2`);
  await expect(reopened.getByLabel("amount (decimal)", { exact: true })).toHaveValue("1.25");
  await choices
    .getByRole("button", { name: "Preparar sementes do dataset selecionado", exact: true })
    .click();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(reopened.getByLabel("amount (decimal)", { exact: true })).toHaveValue("1.25");
  await choices
    .getByRole("button", { name: "Preparar sementes do dataset selecionado", exact: true })
    .click();
  await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  await expect(reopened.getByLabel("amount (decimal)", { exact: true })).toHaveValue("2.50");
  await reopened.getByRole("button", { name: "Salvar caso de consulta", exact: true }).click();
  await expect(reloaded.getByRole("status")).toContainText("Caso salvo");
  await reloaded.getByRole("button", { name: "Consultar testes da consulta", exact: true }).click();
  await reloaded.getByRole("button", { name: "Editar caso Caso em revisão", exact: true }).click();
  const finalOrigin = reopened
    .locator("details")
    .filter({ has: page.getByText("Origem editorial registrada no caso", { exact: true }) });
  await finalOrigin.locator("summary").click();
  await expect(finalOrigin).toContainText(datasetV2.hash);
  await expect(finalOrigin).toContainText("as sementes correspondiam ao dataset de origem");
});

test("editor visual de caso de consulta preserva conflito e permite remoção explícita", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, `Casos ${randomUUID()}`);
  await addSource(page, "a");
  await train(page, "a");
  const panel = page.getByRole("region", { name: "Casos e relatórios da consulta", exact: true });
  await panel.getByRole("button", { name: "Adicionar caso de consulta", exact: true }).click();
  const form = panel.getByRole("form", { name: "Caso de consulta", exact: true });
  await form
    .getByLabel("Nome do caso de consulta", { exact: true })
    .fill("Consulta vazia sintética");
  await form.getByRole("button", { name: "Adicionar semente", exact: true }).click();
  await form.getByRole("button", { name: "Adicionar coluna esperada", exact: true }).click();
  await form.getByLabel("Coluna esperada", { exact: true }).fill("id");
  await form.getByRole("combobox", { name: "Tipo esperado", exact: true }).selectOption("integer");
  await go(page, "Visão geral");
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(form.getByLabel("Nome do caso de consulta", { exact: true })).toHaveValue(
    "Consulta vazia sintética",
  );
  await expect(
    page
      .getByRole("form", { name: "Treinar consulta", exact: true })
      .getByLabel("Nome", { exact: true }),
  ).toBeDisabled();
  await page.route("**/casos-consulta", (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: { code: "OPERATION_CONFLICT", message: "Caso alterado; preserve sua edição." },
      },
    }),
  );
  await form.getByRole("button", { name: "Salvar caso de consulta", exact: true }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(form.getByLabel("Nome do caso de consulta", { exact: true })).toHaveValue(
    "Consulta vazia sintética",
  );
  await page.unroute("**/casos-consulta");
  await form.getByRole("button", { name: "Salvar caso de consulta", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Caso salvo");
  await panel.getByRole("button", { name: "Consultar testes da consulta", exact: true }).click();
  await panel
    .getByRole("button", { name: "Editar caso Consulta vazia sintética", exact: true })
    .click();
  await expect(
    form.getByRole("button", { name: "Remover caso de consulta", exact: true }),
  ).toBeDisabled();
  await form.getByLabel("Confirmo remover este caso", { exact: true }).check();
  await form.getByRole("button", { name: "Remover caso de consulta", exact: true }).click();
  await expect(form).not.toBeVisible();
  await panel.getByRole("button", { name: "Consultar testes da consulta", exact: true }).click();
  await expect(
    panel.getByText("Nenhum caso cadastrado nesta revisão.", { exact: true }),
  ).toBeVisible();
});

test("consulta lê casos no console e recusa relatório de revisão concorrente", async ({ page }) => {
  const { csrfToken } = await login(page);
  await createPersona(page, `Relatórios ${randomUUID()}`);
  await addSource(page, "a");
  await train(page, "a");
  const panel = page.getByRole("region", { name: "Casos e relatórios da consulta", exact: true });
  let releaseRead!: () => void;
  const readBarrier = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  await page.route("**/testes-consulta", async (route) => {
    await readBarrier;
    await route.continue();
  });
  await panel.getByRole("button", { name: "Consultar testes da consulta", exact: true }).click();
  try {
    await expect(
      page
        .getByRole("form", { name: "Treinar consulta", exact: true })
        .getByLabel("Nome", { exact: true }),
    ).toBeDisabled();
  } finally {
    releaseRead();
  }
  await expect(
    panel.getByText("Nenhum caso cadastrado nesta revisão.", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/testes-consulta");
  const form = page.getByRole("form", { name: "Treinar consulta", exact: true });
  await form.getByLabel("Nome", { exact: true }).fill("Edição não salva");
  await expect(
    panel.getByText("Nenhum caso cadastrado nesta revisão.", { exact: true }),
  ).not.toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Consultar testes da consulta", exact: true }),
  ).toBeDisabled();
  await form.getByLabel("Nome", { exact: true }).fill("Pedidos a");
  const personaId = await page.getByRole("combobox", { name: "Persona", exact: true }).inputValue();
  const skillId = await page
    .getByRole("combobox", { name: "Editar treinamento", exact: true })
    .inputValue();
  const root = `/api/admin/personas/${personaId}/skills/${skillId}`;
  const headers = { Origin: "http://127.0.0.1:5188", "X-CSRF-Token": csrfToken };
  const before = await page.request.get(`${root}/testes-consulta`, { headers });
  expect(before.status()).toBe(200);
  const details = (await before.json()) as { revision: number };
  const changed = await page.request.post(`${root}/casos-consulta`, {
    headers,
    data: {
      expectedRevision: details.revision,
      required: true,
      content: {
        name: "Caso sintético concorrente",
        input: { params: {}, fixtures: [{ table: "public.orders", rows: [] }] },
        expected: { columns: [{ name: "id", type: "integer" }], rows: [], ordered: true },
      },
    },
  });
  expect(changed.status()).toBe(200);
  await panel.getByRole("button", { name: "Consultar testes da consulta", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("O treinamento ou os casos mudaram");
  await expect(panel.getByRole("alert")).toBeFocused();
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
      true,
    );
  }
});

test("cria persona, conecta duas bases, publica treinamento e consulta dados reais de cada fonte", async ({
  page,
}, testInfo) => {
  const { csrfToken } = await login(page);
  await createPersona(page, "Financeiro");
  await addSource(page, "a");
  await addSource(page, "b");
  await train(page, "a");
  await train(page, "b");
  await go(page, "Tokens e conexões");
  const tokens = page.getByRole("form", { name: "Emitir token", exact: true });
  await tokens.getByLabel("Nome do consumidor", { exact: true }).fill("Consulta das duas bases");
  await tokens.getByLabel(/^Pedidos a · revisão/).check();
  await tokens.getByLabel(/^Pedidos b · revisão/).check();
  await tokens.getByRole("button", { name: "Emitir token restrito", exact: true }).click();
  await expect(
    page.getByLabel("Token para conectar o cliente ou testar", { exact: true }),
  ).not.toHaveValue("");
  const connection = page.getByRole("region", { name: "Conexão do consumidor", exact: true });
  await connection.getByRole("button", { name: "Testar conexão", exact: true }).click();
  await expect(connection.getByRole("status")).toContainText(
    "Conexão autenticada e descoberta concluída",
  );
  await expect(
    connection.getByText("Pedidos a · Permitido localmente", { exact: true }),
  ).toBeVisible();
  await expect(
    connection.getByText("Pedidos b · Permitido localmente", { exact: true }),
  ).toBeVisible();
  await expect(
    connection.getByText(
      "0 de 1 fontes verificadas nesta sessão. Acesso às demais não confirmado.",
      { exact: true },
    ),
  ).toHaveCount(2);
  await expect(connection.getByText("Linhas por consulta", { exact: true })).toHaveCount(2);
  await connection
    .getByRole("button", { name: "Verificar acesso à fonte", exact: true })
    .first()
    .click();
  await expect(
    connection.getByText("Portões remotos e identidade verificados; SQL não validado.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    connection.getByText(
      "Fontes verificadas nesta sessão. Recursos da skill e SQL ainda exigem validação na execução.",
      { exact: true },
    ),
  ).toHaveCount(1);
  await expect(
    connection.getByText(
      "0 de 1 fontes verificadas nesta sessão. Acesso às demais não confirmado.",
      { exact: true },
    ),
  ).toHaveCount(1);
  await go(page, "Conhecimento");
  const explorer = page.getByRole("region", { name: "Explorar conhecimento autorizado" });
  await explorer.getByLabel("Termos para encontrar conhecimento").fill("reais");
  await explorer.getByRole("button", { name: "Buscar conhecimento", exact: true }).click();
  await expect(
    explorer.getByRole("list", { name: "Correspondências do conhecimento" }),
  ).toContainText("Valor em reais");
  await explorer
    .getByRole("button", { name: "Registrar feedback sobre este item" })
    .first()
    .click();
  const feedbackForm = explorer.getByRole("form", { name: "Registrar feedback de conhecimento" });
  await feedbackForm.getByLabel("Tipo de feedback").selectOption("correcao");
  await feedbackForm
    .getByLabel("Descrição do feedback")
    .fill("Revisar significado sintético, sem dados operacionais");
  await go(page, "Visão geral");
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(feedbackForm.getByLabel("Descrição do feedback")).toHaveValue(
    "Revisar significado sintético, sem dados operacionais",
  );
  await feedbackForm.getByRole("button", { name: "Enviar feedback para revisão" }).click();
  await expect(
    feedbackForm.getByText("Feedback registrado para revisão. O treinamento não foi alterado."),
  ).toBeVisible();
  const maintenance = page.getByRole("region", {
    name: "Feedback e revisão do conhecimento",
    exact: true,
  });
  await maintenance.getByRole("button", { name: "Carregar feedback da persona" }).click();
  await maintenance.getByRole("button", { name: /correcao · aberto/ }).click();
  await maintenance
    .getByLabel("Justificativa do feedback")
    .fill("Tratado pelo responsável, sem alterar publicação");
  await maintenance.getByRole("button", { name: "Encerrar feedback", exact: true }).click();
  await expect(maintenance.getByRole("button", { name: /correcao · encerrado/ })).toBeVisible();
  await maintenance.getByLabel("Skill publicada para revisão").selectOption({ label: "Pedidos a" });
  const calendar = maintenance.getByRole("region", { name: "Revisão temporal do conhecimento" });
  await calendar.getByRole("button", { name: "Carregar calendário de revisão" }).click();
  await expect(calendar.getByText(/Revisão em dia/)).toBeVisible();
  await calendar
    .getByLabel("Próxima revisão", { exact: true })
    .fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16));
  await calendar
    .getByLabel("Justificativa da revisão")
    .fill("Prazo escolhido explicitamente no console");
  await calendar.getByRole("button", { name: "Registrar prazo explícito" }).click();
  await expect(
    calendar.getByText("Prazo registrado. Publicação e permissões permanecem sem alteração."),
  ).toBeVisible();
  const state = JSON.parse(
    await readFile("node_modules/.cache/persona-v2-browser-state.json", "utf8"),
  ) as { databaseName: string };
  expect(state.databaseName).toMatch(/^persona_browser_[a-f0-9]{32}_test$/);
  const url = new URL(personaV2TestDatabaseUrl());
  url.pathname = `/${state.databaseName}`;
  const reviewPool = new pg.Pool({ connectionString: url.toString() });
  try {
    const reviewSkillId = await maintenance.getByLabel("Skill publicada para revisão").inputValue();
    const publication = (
      await reviewPool.query<{ id: string; persona_id: string; skill_id: string }>(
        "SELECT p.id,p.persona_id,p.skill_id FROM publicacao p WHERE p.skill_id=$1 ORDER BY p.revisao DESC LIMIT 1",
        [reviewSkillId],
      )
    ).rows[0]!;
    expect(publication).toBeDefined();
    const reviewRoot = `/api/admin/personas/${publication.persona_id}/skills/${publication.skill_id}/publicacoes/${publication.id}/revisao`;
    const timed = await page.request.post(reviewRoot, {
      headers: { "X-CSRF-Token": csrfToken, Origin: "http://127.0.0.1:5188" },
      data: {
        expectedVersion: 2,
        dueAt: new Date(Date.now() + 1000).toISOString(),
        decision: "configurar",
        reason: "Vencimento isolado para testar notificação",
      },
    });
    expect(timed.status(), await timed.text()).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await new PersonaReviewWorker(
      new PostgresReviewWorker(reviewPool),
      randomUUID(),
      () => new Date(),
    ).runOnce();
    await calendar.getByRole("button", { name: "Carregar calendário de revisão" }).click();
    const notifications = calendar.getByRole("region", { name: "Notificações de revisão" });
    await expect(notifications).toContainText("Não lida");
    await notifications.getByRole("button", { name: "Marcar notificação como lida" }).click();
    await expect(notifications).not.toContainText("Não lida");
    await expect(calendar.getByText(/Revisão vencida/)).toBeVisible();
    await calendar
      .getByLabel("Próxima revisão", { exact: true })
      .fill(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16));
    await calendar
      .getByLabel("Justificativa da revisão")
      .fill("Revisão humana posterior à notificação");
    await calendar.getByRole("combobox", { name: /^Decisão/ }).selectOption("revisado");
    const reviewSaved = page.waitForResponse(
      (response) => response.url().endsWith(reviewRoot) && response.request().method() === "POST",
    );
    await calendar.getByRole("button", { name: "Registrar prazo explícito" }).click();
    expect((await reviewSaved).status()).toBe(200);
    await new PersonaReviewWorker(
      new PostgresReviewWorker(reviewPool),
      randomUUID(),
      () => new Date(),
    ).runOnce();
    await calendar.getByRole("button", { name: "Carregar calendário de revisão" }).click();
    await expect(notifications).toContainText("Resolvida ou obsoleta");
  } finally {
    await reviewPool.end();
  }
  await explorer.getByRole("button", { name: "Carregar skills para o grafo" }).click();
  await explorer
    .getByRole("combobox", { name: "Skill para o grafo", exact: true })
    .selectOption({ label: "Pedidos a" });
  await explorer.getByRole("button", { name: "Verificar prazos de revisão" }).click();
  await expect(explorer.getByRole("list", { name: "Avisos de revisão concedidos" })).toContainText(
    "Revisão em dia",
  );
  await explorer.getByRole("button", { name: "Ler grafo publicado" }).click();
  await expect(explorer.getByRole("article", { name: "Grafo publicado autorizado" })).toContainText(
    "public.orders.amount",
  );
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
    ).toBe(true);
  }
  await go(page, "Consultas");
  await page
    .getByRole("button", { name: "Ver consultas permitidas por este token", exact: true })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "Consultas filtradas" })).toBeVisible();
  for (const [account, amount] of [
    ["a", "10.25"],
    ["b", "100.75"],
  ] as const) {
    await page
      .getByRole("combobox", { name: "Consulta", exact: true })
      .selectOption({ label: `Pedidos ${account} · revisão 1` });
    await page.getByRole("combobox", { name: "Linhas por página", exact: true }).selectOption("25");
    await page.getByRole("button", { name: "Validar SQL", exact: true }).click();
    await expect(page.getByText(/SQL validado tecnicamente/)).toBeVisible();
    await page.getByRole("button", { name: "Consultar", exact: true }).click();
    await expect(page.getByRole("cell", { name: amount, exact: true })).toBeVisible();
    await expect(
      page.getByText("Resultado parcial: não utilize estas linhas como total.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Próxima página", exact: true }).click();
    await expect(
      page.getByText("Página 2 · 5 registros nesta página", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Próxima página", exact: true })).toBeDisabled();
    await expect(page.getByRole("cell", { name: amount, exact: true })).not.toBeVisible();
    await page.getByRole("button", { name: "Página anterior", exact: true }).click();
    await expect(page.getByRole("cell", { name: amount, exact: true })).toBeVisible();
  }
  await page
    .getByLabel("SQL adaptado (opcional; vazio usa o exemplo publicado)", { exact: true })
    .fill("SELECT p.id, p.amount FROM public.orders p WHERE p.id > 999 ORDER BY p.id");
  await expect(page.getByRole("table")).not.toBeVisible();
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(
    page.getByText("Nenhum registro retornado para os filtros desta consulta.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("SQL adaptado (opcional; vazio usa o exemplo publicado)", { exact: true })
    .fill("DELETE FROM public.orders");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByText("Nenhum registro retornado para os filtros desta consulta.", { exact: true }),
  ).not.toBeVisible();
  await expect(page.getByRole("table")).not.toBeVisible();
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await go(page, "Visão geral");
  const progress = page.getByRole("region", { name: "Roteiro da persona", exact: true });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  await expect(progress.getByText("Conexão · Concluído", { exact: true })).toBeVisible();
  await expect(progress.getByText("Primeira consulta · Concluído", { exact: true })).toBeVisible();
  await go(page, "Histórico");
  const history = page.getByRole("region", { name: "Histórico administrativo", exact: true });
  const recorded = history.getByRole("list");
  await expect(
    recorded.getByText("Conexão do consumidor autenticada", { exact: true }),
  ).toBeVisible();
  await history.getByRole("combobox", { name: "Evento", exact: true }).selectOption("token.issued");
  await history.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(recorded.getByText("Token emitido", { exact: true })).toBeVisible();
  await expect(recorded.getByText("Consulta executada", { exact: true })).not.toBeVisible();
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => {
        const browser = globalThis as unknown as {
          document: { documentElement: { scrollWidth: number } };
          innerWidth: number;
        };
        return browser.document.documentElement.scrollWidth <= browser.innerWidth;
      }),
    ).toBe(true);
    // Only recorded metadata appears in this area; the Bearer and query data are unmounted.
    await page.screenshot({ path: testInfo.outputPath(`history-${width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
  await expect(page.getByRole("table")).not.toBeVisible();
});
test("teste de conexão não executa SQL, explica ausência de concessões e recusa outra persona", async ({
  page,
}) => {
  const { csrfToken } = await login(page);
  await createPersona(page, "Consumidor isolado");
  await go(page, "Tokens e conexões");
  await expect(page.getByRole("region", { name: "Conexão ChatGPT", exact: true })).toContainText(
    "OAuth indisponível neste ambiente",
  );
  // The query-token UI requires a published skill. Exercise the existing empty-grant API
  // with the same authenticated browser session, without weakening that UI requirement.
  const personaId = await page.getByRole("combobox", { name: "Persona", exact: true }).inputValue();
  const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const issued = await page.request.post(`/api/admin/personas/${personaId}/tokens`, {
    headers: { Origin: new URL(page.url()).origin, "X-CSRF-Token": csrfToken },
    data: { name: "Sem concessões", permissions: empty, delegation: empty, expiresAt: null },
  });
  expect(issued.status()).toBe(201);
  const { bearer } = (await issued.json()) as { bearer: string };
  const bearerInput = page.getByLabel("Token para conectar o cliente ou testar", { exact: true });
  await bearerInput.fill(bearer);
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/mcp") && request.method() === "POST") {
      const rpc = request.postDataJSON() as { method?: string; params?: { name?: string } };
      if (rpc.method === "tools/call" && rpc.params?.name) calls.push(rpc.params.name);
    }
  });
  const connection = page.getByRole("region", { name: "Conexão do consumidor", exact: true });
  await connection.getByRole("button", { name: "Testar conexão", exact: true }).click();
  await expect(connection.getByRole("status")).toContainText(
    "Conexão autenticada e descoberta concluída",
  );
  await expect(
    connection.getByText(
      "Este token não possui skills concedidas. Solicite a seleção explícita ao responsável.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(calls).toEqual([
    "obter_contexto_persona",
    "diagnosticar_permissoes",
    "listar_fontes",
    "obter_capacidades",
  ]);
  await createPersona(page, "Outra persona do consumidor");
  await go(page, "Tokens e conexões");
  await bearerInput.fill(bearer);
  calls.length = 0;
  await connection.getByRole("button", { name: "Testar conexão", exact: true }).click();
  await expect(connection.getByRole("alert")).toHaveText("Este token pertence a outra persona.");
  await expect(connection.getByRole("alert")).toBeFocused();
  expect(calls).toEqual(["obter_contexto_persona"]);
  await expect(
    connection.getByText("Por que esta capacidade está disponível ou bloqueada?", { exact: true }),
  ).not.toBeVisible();
});

test("preserva edição pendente e limpa o contexto na troca de persona", async ({ page }) => {
  await login(page);
  await createPersona(page, "Primeira");
  await addSource(page, "a");
  await createPersona(page, "Segunda");
  await page
    .getByRole("combobox", { name: "Persona", exact: true })
    .selectOption({ label: "Primeira" });
  await go(page, "Treinamentos");
  const form = page.getByRole("form", { name: "Treinar consulta", exact: true });
  await form.getByLabel("Nome", { exact: true }).fill("Edição pendente");
  await page
    .getByRole("combobox", { name: "Persona", exact: true })
    .selectOption({ label: "Segunda" });
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(form.getByLabel("Nome", { exact: true })).toHaveValue("Edição pendente");
  await expect(page.getByRole("combobox", { name: "Persona", exact: true })).toHaveValue(
    (await page
      .getByRole("combobox", { name: "Persona", exact: true })
      .locator("option", { hasText: "Primeira" })
      .getAttribute("value")) ?? "",
  );
  await page
    .getByRole("combobox", { name: "Persona", exact: true })
    .selectOption({ label: "Segunda" });
  await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  await go(page, "Bases");
  await expect(
    page.getByText("Cadastre a primeira base desta persona.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Token para conectar o cliente ou testar", { exact: true }),
  ).toHaveValue("");
});
test("console móvel mantém campos acessíveis por teclado sem rolagem horizontal", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await createPersona(page, "Móvel");
  await go(page, "Bases");
  await page.getByText("Adicionar uma base", { exact: true }).click();
  await page.getByLabel("Nome da base", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Para que essa base será usada?", { exact: true })).toBeFocused();
  expect(
    await page.evaluate(() => {
      const browser = globalThis as unknown as {
        document: { documentElement: { scrollWidth: number } };
        innerWidth: number;
      };
      return browser.document.documentElement.scrollWidth <= browser.innerWidth;
    }),
  ).toBe(true);
  // No source credentials, bearer or query results are present in this visual fixture.
  await page.screenshot({ path: testInfo.outputPath("mobile-onboarding.png"), fullPage: true });
});

test("edita persona e fonte, troca credenciais e consulta somente após republicar", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, "Persona editável");
  await page.getByText("Editar persona", { exact: true }).click();
  const settings = page.getByRole("form", { name: "Editar persona", exact: true });
  await settings.getByLabel("Nome", { exact: true }).fill("Persona revisada");
  await settings.getByRole("button", { name: "Salvar persona", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Persona revisada", exact: true })).toBeVisible();
  await addSource(page, "a");
  await addSource(page, "b");
  await train(page, "a");
  await train(page, "b");
  await go(page, "Bases");
  await page.getByText("Gerenciar Base a", { exact: true }).click();
  const base = page.getByRole("form", { name: "Editar base Base a", exact: true });
  await base.getByLabel("Finalidade", { exact: true }).fill("Pedidos revisados");
  await base.getByRole("button", { name: "Salvar base", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revisar impacto em Base a" })).toBeVisible();
  await expect(page.getByText(/Pedidos a · revisão 1 · consulta · Usa esta base/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar alteração da base" })).toBeDisabled();
  await page.getByLabel("Entendi o impacto desta alteração").check();
  await page.getByRole("button", { name: "Confirmar alteração da base" }).click();
  await expect(
    page.getByText("Base atualizada. Revise e publique novamente o treinamento desta fonte.", {
      exact: true,
    }),
  ).toBeVisible();
  await go(page, "Tokens e conexões");
  const tokens = page.getByRole("form", { name: "Emitir token", exact: true });
  await expect(tokens.getByLabel(/^Pedidos a · revisão/)).not.toBeVisible();
  await expect(tokens.getByLabel(/^Pedidos b · revisão/)).toBeVisible();
  await go(page, "Bases");
  await page.getByText("Gerenciar Base a", { exact: true }).click();
  await page
    .getByRole("listitem")
    .filter({ has: page.getByText("Gerenciar Base a", { exact: true }) })
    .getByText("Trocar credenciais", { exact: true })
    .click();
  const rotation = page.getByRole("form", { name: "Trocar credenciais de Base a", exact: true });
  await rotation.getByLabel("CLIENT_EMAIL", { exact: true }).fill("a@fixture.test");
  await rotation.getByLabel("CLIENT_PASSWORD", { exact: true }).fill("fixture-password");
  await rotation.getByLabel("CLIENT_TOKEN", { exact: true }).fill("fixture-a");
  await rotation
    .getByRole("button", { name: "Verificar e trocar credenciais", exact: true })
    .click();
  await page.getByLabel("Entendi o impacto desta alteração").check();
  await page.getByRole("button", { name: "Confirmar troca de credenciais" }).click();
  await expect(
    page.getByText(
      "Credenciais verificadas e trocadas. Revise e publique novamente o treinamento desta fonte.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByText("Gerenciar Base a", { exact: true }).click();
  await page
    .getByRole("listitem")
    .filter({ has: page.getByText("Gerenciar Base a", { exact: true }) })
    .getByText("Trocar credenciais", { exact: true })
    .click();
  await expect(rotation.getByLabel("CLIENT_PASSWORD", { exact: true })).toHaveValue("");
  await expect(rotation.getByLabel("CLIENT_TOKEN", { exact: true })).toHaveValue("");
  await go(page, "Treinamentos");
  await page
    .getByRole("combobox", { name: "Editar treinamento", exact: true })
    .selectOption({ label: "Pedidos a · publicação suspensa" });
  await page
    .getByLabel("Prazo de revisão da publicação", { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Revisar publicação", exact: true }).click();
  await page
    .getByLabel("Revisei o SQL, a estrutura e as regras deste pacote.", { exact: true })
    .check();
  await page.getByRole("button", { name: "Confirmar publicação", exact: true }).click();
  await go(page, "Tokens e conexões");
  await tokens.getByLabel("Nome do consumidor", { exact: true }).fill("Após revisão");
  await tokens.getByLabel(/^Pedidos a · revisão/).check();
  await tokens.getByRole("button", { name: "Emitir token restrito", exact: true }).click();
  await go(page, "Consultas");
  await page
    .getByRole("combobox", { name: "Consulta", exact: true })
    .selectOption({ label: "Pedidos a · revisão 1" });
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByRole("cell", { name: "10.25", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
});

test("conflito de edição da fonte preserva os campos até recarregamento explícito", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, "Concorrência de fonte");
  await addSource(page, "a");
  await page.getByText("Gerenciar Base a", { exact: true }).click();
  const form = page.getByRole("form", { name: "Editar base Base a", exact: true });
  await form.getByLabel("Finalidade", { exact: true }).fill("Minha edição pendente");
  let backgroundRefreshes = 0;
  const sourceRefreshRoute = "**/fontes";
  await page.route(sourceRefreshRoute, async (route) => {
    backgroundRefreshes++;
    await route.abort();
  });
  await page.route(
    "**/fontes/*/editar",
    async (route) => {
      const body = route.request().postDataJSON() as { purpose: string };
      const concurrent = await route.fetch({
        postData: { ...body, purpose: "Alteração concorrente no servidor" },
        timeout: 10000,
      });
      expect(concurrent.ok()).toBe(true);
      await route.fulfill({
        status: 409,
        headers: { "Content-Type": "application/json" },
        json: {
          error: {
            code: "OPERATION_CONFLICT",
            message: "Cadastro mudou; recarregue antes de salvar.",
          },
        },
      });
    },
    { times: 1 },
  );
  await form.getByRole("button", { name: "Salvar base", exact: true }).click();
  await page.getByLabel("Entendi o impacto desta alteração").check();
  const conflictResponse = page.waitForResponse(
    (response) => response.url().endsWith("/editar") && response.status() === 409,
  );
  await page.getByRole("button", { name: "Confirmar alteração da base" }).click();
  await conflictResponse;
  await expect(page.getByRole("alert")).toContainText("Cadastro mudou");
  expect(backgroundRefreshes).toBe(0);
  await page.unroute(sourceRefreshRoute);
  await expect(form.getByLabel("Finalidade", { exact: true })).toHaveValue("Minha edição pendente");
  await page.getByRole("button", { name: "Recarregar base", exact: true }).click();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(form.getByLabel("Finalidade", { exact: true })).toHaveValue("Minha edição pendente");
  await page.getByRole("button", { name: "Recarregar base", exact: true }).click();
  await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  // Reload replaces the form only after the server response. Do not toggle the
  // old details while that request is still pending.
  await expect(form).toBeHidden();
  await page.getByText("Gerenciar Base a", { exact: true }).click();
  await expect(form.getByLabel("Finalidade", { exact: true })).toHaveValue(
    "Alteração concorrente no servidor",
  );
  await page.getByRole("button", { name: "Sair", exact: true }).click();
});

test("cadastro de base pendente exige descarte e preserva campos ao continuar", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, "Proteção de cadastro");
  await go(page, "Bases");
  await page.getByText("Adicionar uma base", { exact: true }).click();
  const form = page.getByRole("form", { name: "Cadastrar base" });
  await form.getByLabel("Nome da base", { exact: true }).fill("Cadastro pendente");
  await go(page, "Treinamentos");
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(form.getByLabel("Nome da base", { exact: true })).toHaveValue("Cadastro pendente");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(form.getByLabel("Nome da base", { exact: true })).toHaveValue("Cadastro pendente");
  await go(page, "Treinamentos");
  await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  await expect(page).toHaveURL(/#\/training$/);
  // The lazy editor can start its initial read after the route changes.
  // Wait for its mounted, enabled control before requesting another navigation.
  await expect(
    page.getByRole("button", { name: "Recarregar skill externa", exact: true }),
  ).toBeEnabled();
  await go(page, "Bases");
  await page.getByText("Adicionar uma base", { exact: true }).click();
  await expect(form.getByLabel("Nome da base", { exact: true })).toHaveValue("");
});

test("treinamento recusado foca campo ou conteúdo e preserva a edição", async ({ page }) => {
  await login(page);
  await createPersona(page, `Erros de treinamento ${randomUUID()}`);
  await addSource(page, "a");
  await train(page, "a");
  const form = page.getByRole("form", { name: "Treinar consulta", exact: true });
  const name = form.getByLabel("Nome", { exact: true });
  const sql = form.getByLabel("Exemplo de SQL", { exact: true });
  const originalSql = await sql.inputValue();
  let field = "name";
  await page.route("**/api/admin/personas/*/skills/*/rascunho", (route) =>
    route.fulfill({
      status: 400,
      json: {
        error: {
          code: "INVALID_TRAINING",
          message: "Revise o treinamento informado.",
          fields: [field],
        },
      },
    }),
  );
  await name.fill("Edição preservada");
  await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(form.locator("#training-name-error")).toBeVisible();
  await expect(sql).toHaveValue(originalSql);
  field = "training";
  await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(
    form.getByRole("group", { name: "Treinamento recusado", exact: true }),
  ).toBeFocused();
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveValue("Edição preservada");
  await expect(sql).toHaveValue(originalSql);
});

test("nome do rascunho não substitui nome publicado e token pode ser revogado", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, "Publicação imutável");
  await addSource(page, "a");
  await train(page, "a");
  const form = page.getByRole("form", { name: "Treinar consulta" });
  await form.getByLabel("Nome", { exact: true }).fill("Nome ainda não publicado");
  await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(page.getByText("Rascunho salvo. Revise o pacote antes de publicar.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Editar treinamento" })).toContainText(
    "Nome ainda não publicado · alterações pendentes",
  );
  await go(page, "Tokens e conexões");
  const issue = page.getByRole("form", { name: "Emitir token" });
  await expect(issue.getByLabel("Pedidos a · revisão 1", { exact: true })).toBeVisible();
  await issue.getByLabel("Nome do consumidor", { exact: true }).fill("Consumidor revogável");
  await issue.getByLabel("Pedidos a · revisão 1", { exact: true }).check();
  await issue.getByRole("button", { name: "Emitir token restrito" }).click();
  await expect(page.getByRole("button", { name: "Editar Consumidor revogável" })).toBeVisible();
  await page.getByRole("button", { name: "Editar Consumidor revogável" }).click();
  const edit = page.getByRole("form", { name: "Editar token" });
  await edit.getByLabel("Nome do consumidor", { exact: true }).fill("Consumidor alterado");
  await edit.getByRole("button", { name: "Salvar token", exact: true }).click();
  await expect(page.getByRole("button", { name: "Editar Consumidor alterado" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revogar Consumidor alterado" }).click();
  await expect(page.getByText("Token revogado.", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Token para conectar o cliente ou testar", { exact: true }),
  ).toHaveValue("");
});

test("consulta de view preserva o tipo publicado e respeita policy que recusa tabelas", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, "Consulta de view");
  await addSource(page, "view");
  await go(page, "Treinamentos");
  const form = page.getByRole("form", { name: "Treinar consulta", exact: true });
  await form.getByLabel("Nome", { exact: true }).fill("Pedidos da view");
  await form.getByLabel("Identificador curto", { exact: true }).fill("pedidos-view");
  await form
    .getByRole("combobox", { name: "Base", exact: true })
    .selectOption({ label: "Base view" });
  await form.getByLabel("Objetivo da consulta", { exact: true }).fill("Ler a view autorizada");
  await form.getByRole("button", { name: "Adicionar tabela", exact: true }).click();
  const table = form.locator(".row").first();
  await table.getByLabel("Nome físico", { exact: true }).fill("public.orders_view");
  await expect(table.getByRole("combobox", { name: "Tipo do recurso", exact: true })).toHaveValue(
    "table",
  );
  await table.getByLabel("Significado", { exact: true }).fill("Um pedido por identificador");
  await table.getByLabel("Colunas que identificam um registro", { exact: true }).fill("id");
  for (const [index, name] of ["id", "amount"].entries()) {
    await form.getByRole("button", { name: "Adicionar coluna", exact: true }).click();
    const column = form.locator(".row").nth(index + 1);
    await column
      .getByRole("combobox", { name: "Tabela", exact: true })
      .selectOption("public.orders_view");
    await column.getByLabel("Coluna", { exact: true }).fill(name);
    await column.getByLabel("Significado", { exact: true }).fill(name);
  }
  await form
    .getByLabel("Exemplo de SQL", { exact: true })
    .fill("SELECT p.id, p.amount FROM public.orders_view p WHERE p.id > 0 ORDER BY p.id");
  const publish = async () => {
    await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
    await expect(
      page.getByText("Rascunho salvo. Revise o pacote antes de publicar.", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Prazo de revisão da publicação", { exact: true })
      .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
    await page.getByRole("button", { name: "Revisar publicação", exact: true }).click();
    await page
      .getByLabel("Revisei o SQL, a estrutura e as regras deste pacote.", { exact: true })
      .check();
    await page.getByRole("button", { name: "Confirmar publicação", exact: true }).click();
    await expect(
      page.getByText("Treinamento publicado. Libere seu uso em um token.", { exact: true }),
    ).toBeVisible();
  };
  const issueAndQuery = async (revision: number) => {
    await go(page, "Tokens e conexões");
    const tokens = page.getByRole("form", { name: "Emitir token", exact: true });
    await tokens
      .getByLabel("Nome do consumidor", { exact: true })
      .fill(`Consumidor da revisão ${revision}`);
    await tokens.getByLabel(new RegExp(`^Pedidos da view · revisão ${revision}`)).check();
    await tokens.getByRole("button", { name: "Emitir token restrito", exact: true }).click();
    await expect(page.getByText(/Token emitido/)).toBeVisible();
    const issued = await page
      .getByLabel("Token para conectar o cliente ou testar", { exact: true })
      .inputValue();
    await go(page, "Consultas");
    await page
      .getByRole("combobox", { name: "Consulta", exact: true })
      .selectOption({ label: `Pedidos da view · revisão ${revision}` });
    await page.getByRole("button", { name: "Consultar", exact: true }).click();
    return issued;
  };
  await publish();
  const originalToken = await issueAndQuery(1);
  await expect(page.getByRole("alert")).toContainText("Leitura não concedida na policy da fonte.");
  await expect(page.getByRole("table")).not.toBeVisible();
  await go(page, "Treinamentos");
  await table.getByRole("combobox", { name: "Tipo do recurso", exact: true }).selectOption("view");
  await publish();
  await page.getByRole("button", { name: "Recarregar treinamento", exact: true }).click();
  await expect(table.getByRole("combobox", { name: "Tipo do recurso", exact: true })).toHaveValue(
    "view",
  );
  await go(page, "Consultas");
  await page.getByLabel("Token para consultar", { exact: true }).fill(originalToken);
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("não está concedida ao token atual");
  await expect(page.getByRole("table")).not.toBeVisible();
  await issueAndQuery(2);
  await expect(page.getByRole("cell", { name: "10.25", exact: true })).toBeVisible();
});

test("sair das consultas descarta modos antigos de parâmetros sem alterar a publicação", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, "Parâmetros sem resíduos");
  await addSource(page, "a");
  await train(page, "a");
  await go(page, "Treinamentos");
  const form = page.getByRole("form", { name: "Treinar consulta", exact: true });
  await form.getByRole("button", { name: "Adicionar parâmetro", exact: true }).click();
  const parameter = form
    .locator(".row")
    .filter({ has: page.getByRole("checkbox", { name: "Obrigatório", exact: true }) });
  await parameter.getByLabel("Nome do parâmetro", { exact: true }).fill("nota");
  await parameter.getByLabel("Significado do parâmetro", { exact: true }).fill("Nota opcional");
  await parameter.getByRole("checkbox", { name: "Obrigatório", exact: true }).uncheck();
  await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(
    page.getByText("Rascunho salvo. Revise o pacote antes de publicar.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Prazo de revisão da publicação", { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Revisar publicação", exact: true }).click();
  await page
    .getByLabel("Revisei o SQL, a estrutura e as regras deste pacote.", { exact: true })
    .check();
  await page.getByRole("button", { name: "Confirmar publicação", exact: true }).click();
  await expect(
    page.getByText("Treinamento publicado. Libere seu uso em um token.", { exact: true }),
  ).toBeVisible();
  await go(page, "Consultas");
  await page
    .getByRole("combobox", { name: "Consulta", exact: true })
    .selectOption({ label: "Pedidos a · revisão 2" });
  const mode = page.getByRole("combobox", { name: "Como enviar nota", exact: true });
  const value = page.getByRole("textbox", { name: "Nota opcional (nota) · Opcional", exact: true });
  const sql = page.getByLabel("SQL adaptado (opcional; vazio usa o exemplo publicado)", {
    exact: true,
  });
  await sql.fill("SELECT id FROM orders");
  await go(page, "Tokens e conexões");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(sql).toHaveValue("SELECT id FROM orders");
  await sql.fill("");
  for (const selected of ["null", "empty", "omit"]) {
    await mode.selectOption(selected);
    await expect(value).toBeDisabled();
    await go(page, "Tokens e conexões");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
    await expect(mode).toHaveValue(selected);
    await go(page, "Tokens e conexões");
    await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
    await go(page, "Consultas");
    await expect(mode).toHaveValue("value");
    await expect(value).toBeEnabled();
    await expect(value).toHaveValue("");
    await expect(page.getByRole("combobox", { name: "Consulta", exact: true })).toContainText(
      "Pedidos a · revisão 2",
    );
  }
  await value.fill("Valor sintético da sessão");
  await go(page, "Tokens e conexões");
  await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  await go(page, "Consultas");
  await expect(value).toHaveValue("");
  await expect(mode).toHaveValue("value");
});

test("consulta permite editar e reler caminho N:N sem autorizar JOIN direto", async ({ page }) => {
  const { csrfToken } = await login(page);
  await createPersona(page, "Caminho de consulta");
  await addSource(page, "a");
  const personaId = await page.getByRole("combobox", { name: "Persona", exact: true }).inputValue();
  const base = `/api/admin/personas/${personaId}`;
  const headers = { Origin: "http://127.0.0.1:5188", "X-CSRF-Token": csrfToken };
  const { fontes } = await (await page.request.get(`${base}/fontes`, { headers })).json();
  const training = {
    ...queryTraining(fontes[0].id),
    sqlModel: "SELECT a.id FROM a WHERE a.id > 0 ORDER BY a.id",
    parameters: [],
    tables: ["a", "ab", "b"].map((name) => ({ name, meaning: "Sintética", grain: ["id"] })),
    columns: ["a", "ab", "b"].map((table) => ({
      table,
      name: "id",
      meaning: "Chave",
      classification: "livre",
    })),
    relationships: [
      {
        id: "a_ab",
        from: "a",
        to: "ab",
        cardinality: "1:N",
        join: "inner",
        meaning: "Origem",
        keys: [{ from: "id", to: "id" }],
      },
      {
        id: "ab_b",
        from: "ab",
        to: "b",
        cardinality: "N:1",
        join: "inner",
        meaning: "Destino",
        keys: [{ from: "id", to: "id" }],
      },
      {
        id: "a_b",
        from: "a",
        to: "b",
        cardinality: "N:N",
        join: "inner",
        meaning: "Associação conceitual",
        keys: [{ from: "id", to: "id" }],
      },
    ],
  };
  const created = await page.request.post(`${base}/skills`, {
    headers,
    data: { name: "Consulta com caminho", slug: "caminho", kind: "consulta", training },
  });
  expect(created.status()).toBe(201);
  const { skill } = await created.json();
  await page.getByRole("combobox", { name: "Persona", exact: true }).selectOption("");
  await page.getByRole("combobox", { name: "Persona", exact: true }).selectOption(personaId);
  await go(page, "Treinamentos");
  await page
    .getByRole("combobox", { name: "Editar treinamento", exact: true })
    .selectOption(skill.id);
  const form = page.getByRole("form", { name: "Treinar consulta", exact: true });
  const relation = form
    .locator(".relationship")
    .filter({ has: page.getByLabel("O que esse relacionamento significa?", { exact: true }) })
    .nth(2);
  await expect(relation.getByLabel("Identificador do relacionamento", { exact: true })).toHaveValue(
    "a_b",
  );
  await relation.getByRole("button", { name: "Adicionar intermediária", exact: true }).click();
  await relation.getByRole("combobox", { name: /^Intermediária 1/ }).selectOption("ab");
  for (const [index, edge] of ["a_ab", "ab_b"].entries()) {
    await relation.getByRole("button", { name: "Adicionar elo direto", exact: true }).click();
    await relation
      .getByRole("combobox", { name: new RegExp(`^Elo direto ${index + 1}`) })
      .selectOption(edge);
  }
  await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(
    page.getByText("Rascunho salvo. Revise o pacote antes de publicar.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recarregar treinamento", exact: true }).click();
  await expect(relation.getByRole("combobox", { name: /^Intermediária 1/ })).toHaveValue("ab");
  await expect(relation.getByRole("combobox", { name: /^Elo direto 2/ })).toHaveValue("ab_b");
  const saved = (await (await page.request.get(`${base}/skills`, { headers })).json()) as {
    skills: { id: string; training: typeof training }[];
  };
  expect(saved.skills.find((s) => s.id === skill.id)!.training.relationships[2]).toMatchObject({
    id: "a_b",
    via: ["ab"],
    path: ["a_ab", "ab_b"],
  });
  await page
    .getByLabel("Prazo de revisão da publicação", { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  const preview = async () => {
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/preview") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Revisar publicação", exact: true }).click();
    return (await response).status();
  };
  expect(await preview()).toBe(200);
  const sql = form.getByLabel("Exemplo de SQL", { exact: true });
  await sql.fill("SELECT a.id FROM a INNER JOIN b ON a.id = b.id WHERE a.id > 0 ORDER BY a.id");
  await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(
    page.getByText("Rascunho salvo. Revise o pacote antes de publicar.", { exact: true }),
  ).toBeVisible();
  expect(await preview()).not.toBe(200);
  await expect(page.getByRole("alert")).toContainText(/relacionamento|join|escopo/i);
  await sql.fill(training.sqlModel);
  await relation.getByRole("button", { name: "Remover elo", exact: true }).last().click();
  await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(
    page.getByText("Rascunho salvo. Revise o pacote antes de publicar.", { exact: true }),
  ).toBeVisible();
  expect(await preview()).not.toBe(200);
  await expect(page.getByRole("alert")).toContainText(/caminho|N:N|elos/i);
  await expect(relation.getByRole("combobox", { name: /^Intermediária 1/ })).toHaveValue("ab");
});

test("caso obrigatório é declarado no console e exige runner separado antes da publicação", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, "Caso obrigatório do operador");
  await addSource(page, "a");
  let operatorCalls = 0;
  await expect(
    exerciseManualPublication({
      page,
      dialects: ["postgres"],
      sourceLabel: () => "Base a",
      run: async () => {
        operatorCalls++;
        throw new Error("Fronteira do operador alcançada");
      },
    }),
  ).rejects.toThrow("Fronteira do operador alcançada");
  expect(operatorCalls).toBe(1);
});

test("releitura do treinamento resolve conflito sem perder edição antes de confirmar", async ({
  page,
}) => {
  const { csrfToken } = await login(page);
  await createPersona(page, "Releitura concorrente de consulta");
  await addSource(page, "a");
  await train(page, "a");
  const personaId = await page.getByRole("combobox", { name: "Persona", exact: true }).inputValue();
  const skillId = await page
    .getByRole("combobox", { name: "Editar treinamento", exact: true })
    .inputValue();
  const base = `/api/admin/personas/${personaId}/skills`;
  const headers = { Origin: "http://127.0.0.1:5188", "X-CSRF-Token": csrfToken };
  const current = await page.request.get(base, { headers });
  expect(current.status()).toBe(200);
  const content = (await current.json()) as {
    skills: { id: string; training: unknown; revision: number }[];
  };
  const skill = content.skills.find((row) => row.id === skillId);
  if (!skill) throw new Error("Rascunho da fixture não encontrado.");
  const changed = await page.request.post(`${base}/${skillId}/rascunho`, {
    headers,
    data: {
      name: "Revisão de outro editor",
      training: skill.training,
      expectedRevision: skill.revision,
    },
  });
  expect(changed.status()).toBe(200);
  const form = page.getByRole("form", { name: "Treinar consulta", exact: true });
  const name = form.getByLabel("Nome", { exact: true });
  await name.fill("Minha edição preservada");
  const conflict = page.waitForResponse(
    (r) => r.url().endsWith(`/${skillId}/rascunho`) && r.request().method() === "POST",
  );
  await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(name).toHaveValue("Minha edição preservada");
  const reload = page.getByRole("button", { name: "Recarregar treinamento", exact: true });
  await expect(reload).toBeVisible();
  await reload.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Continuar editando", exact: true })
    .click();
  await expect(name).toHaveValue("Minha edição preservada");
  const failedRead = `**/api/admin/personas/${personaId}/skills`;
  await page.route(failedRead, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "UNAVAILABLE", message: "Leitura indisponível na fixture." } },
    }),
  );
  await reload.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Descartar alterações", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Leitura indisponível na fixture.");
  await expect(name).toHaveValue("Minha edição preservada");
  await page.unroute(failedRead);
  await reload.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Descartar alterações", exact: true })
    .click();
  await expect(name).toHaveValue("Revisão de outro editor");
  await expect(page.getByRole("heading", { name: /Revisão \d/ })).not.toBeVisible();
  await page.getByRole("button", { name: "Adicionar caso de consulta", exact: true }).click();
  const caseName = page.getByLabel("Nome do caso de consulta", { exact: true });
  await caseName.fill("Caso local ainda não salvo");
  await reload.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Continuar editando", exact: true })
    .click();
  await expect(caseName).toHaveValue("Caso local ainda não salvo");
  await reload.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Descartar alterações", exact: true })
    .click();
  await expect(page.getByRole("form", { name: "Caso de consulta", exact: true })).not.toBeVisible();
  await name.fill("Salva após releitura");
  const saved = page.waitForResponse(
    (r) => r.url().endsWith(`/${skillId}/rascunho`) && r.request().method() === "POST",
  );
  await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await go(page, "Tokens e conexões");
  await expect(
    page
      .getByRole("form", { name: "Emitir token" })
      .getByLabel("Pedidos a · revisão 1", { exact: true }),
  ).toBeVisible();
});

test("assets oficiais e manifesto v2 são servidos por rotas explícitas", async ({
  page,
  request,
}) => {
  await page.goto("/app/");
  const logo = page.locator(".brand img");
  await expect(logo).toBeVisible();
  expect(
    await logo.evaluate((image: unknown) => {
      const element = image as { complete: boolean; naturalWidth: number };
      return element.complete && element.naturalWidth > 0;
    }),
  ).toBe(true);
  expect(await page.locator('link[rel="icon"]').getAttribute("href")).toBe("/app/favicon.ico");
  expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute("href")).toBe(
    "/app/apple-touch-icon.png",
  );
  const manifest = await request.get("/app/persona-v2.webmanifest");
  expect(manifest.headers()["content-type"]).toContain("application/manifest+json");
  expect(await manifest.json()).toMatchObject({
    name: "Se7e — Personas",
    short_name: "Se7e",
    start_url: "/app/",
    scope: "/app/",
  });
  for (const [name, mime] of [
    ["favicon.ico", "image/"],
    ["apple-touch-icon.png", "image/png"],
    ["icon-192.png", "image/png"],
    ["icon-512-maskable.png", "image/png"],
  ]) {
    const response = await request.get(`/app/${name}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain(mime);
  }
  expect((await request.get("/app/index.html")).status()).toBe(404);
  expect((await request.get("/app/manifest.webmanifest")).status()).toBe(404);
  expect(
    await page.evaluate(async () => {
      const browser = globalThis as unknown as {
        navigator: { serviceWorker: { getRegistrations(): Promise<unknown[]> } };
      };
      return (await browser.navigator.serviceWorker.getRegistrations()).length;
    }),
  ).toBe(0);
});

test("operação exige revisão exata e distingue resultado desconhecido", async ({ page }) => {
  await login(page);
  await createPersona(page, "Aprovações sintéticas");
  const id = "14afef81-33f5-423e-8aac-77e4b36ce484",
    fingerprint = "a".repeat(64);
  const operation = {
    operationId: id,
    sourceId: "fixture-source",
    publicationId: "fixture-publication",
    fingerprint,
    state: "aprovacao_pendente",
    expiresAt: new Date(Date.now() + 900000).toISOString(),
    version: 1,
    requireHumanApproval: true,
    receipt: null,
    reconciliation: null,
  };
  const command = {
    operationId: id,
    fingerprint,
    database: "fixture",
    steps: [
      {
        id: "synthetic",
        effect: "update",
        sql: "UPDATE synthetic SET amount=:amount WHERE id=:id",
        params: { amount: { kind: "value", scalar: { type: "decimal", value: "12.00" } } },
        outputs: {},
        affectedRows: { min: 1, max: 1 },
      },
    ],
    maxAffectedRows: 1,
    timeoutMs: 1000,
  };
  let approvals = 0;
  // UI-only fixture: no real dispatch, publication or business database is involved.
  await page.route("**/api/admin/personas/*/operations**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/approve")) {
      expect(route.request().postDataJSON()).toEqual({ operationId: id, fingerprint });
      approvals++;
      operation.state = "aprovada";
      await route.fulfill({ json: operation });
    } else if (url.pathname.endsWith(id)) await route.fulfill({ json: { ...operation, command } });
    else await route.fulfill({ json: { operations: [operation], nextCursor: null } });
  });
  await go(page, "Operações");
  await page.getByRole("button", { name: `Revisar ${id}`, exact: true }).click();
  const approve = page.getByRole("button", { name: "Aprovar conteúdo preparado", exact: true });
  await expect(approve).toBeDisabled();
  await expect(page.getByText(command.steps[0]!.sql, { exact: true })).toBeVisible();
  await page.getByLabel("Revisei as etapas e os parâmetros deste conteúdo exato.").check();
  await approve.click();
  await expect(
    page.getByRole("region", { name: "Operações da persona", exact: true }).getByRole("status"),
  ).toContainText("aprovada");
  expect(approvals).toBe(1);
  operation.state = "resultado_desconhecido";
  await page.getByRole("button", { name: "Atualizar operações", exact: true }).click();
  await page.getByRole("button", { name: `Revisar ${id}`, exact: true }).click();
  await expect(page.getByText(/Não reenvie esta operação/)).toBeVisible();
  await expect(approve).not.toBeVisible();
});

async function operationKnowledgeFixture(page: Page) {
  const { csrfToken } = await login(page);
  await createPersona(page, `Conhecimento SQL ${randomUUID()}`);
  await addSource(page, "a");
  await addSource(page, "b");
  const personaId = await page.getByRole("combobox", { name: "Persona", exact: true }).inputValue();
  const headers = { Origin: "http://127.0.0.1:5188", "X-CSRF-Token": csrfToken };
  const base = `/api/admin/personas/${personaId}`;
  const post = async (path: string, data: object) => {
    const response = await page.request.post(path, {
      headers,
      data: withReviewDeadline(path, data),
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { fontes } = (await (await page.request.get(`${base}/fontes`, { headers })).json()) as {
    fontes: { id: string; name: string }[];
  };
  const training = operationTraining(fontes.find((s) => s.name === "Base a")!.id);
  const { skill } = await post(`${base}/skills`, {
    slug: "conhecimento-sql",
    name: "Operação privada",
    kind: "operacao_sql",
    training,
  });
  return { personaId, base, headers, post, training, skillId: skill.id as string };
}

test("relacionamentos SQL preservam chaves compostas e caminho N:N sem inferir JOIN", async ({
  page,
}) => {
  const f = await operationKnowledgeFixture(page);
  const training = {
    ...f.training,
    tables: [
      ...f.training.tables,
      ...["a", "ab", "b"].map((name) => ({
        name,
        meaning: "Tabela sintética",
        identity: ["id", "tenant"],
        concurrency: [],
        columns: ["id", "tenant"].map((name) => ({
          name,
          meaning: "Chave sintética",
          type: "integer" as const,
          writable: false,
        })),
      })),
    ],
  };
  await f.post(`${f.base}/skills/${f.skillId}/rascunho`, {
    expectedRevision: 1,
    name: "Relacionamentos sintéticos",
    training,
  });
  await go(page, "Treinamentos");
  const panel = page.getByRole("region", { name: "Treinamento de operação SQL", exact: true });
  await panel
    .getByRole("combobox", { name: "Editar operação SQL", exact: true })
    .selectOption(f.skillId);
  const relationships = panel.getByRole("region", {
    name: "Relacionamentos da operação SQL",
    exact: true,
  });
  for (const [i, id, from, to, cardinality] of [
    [0, "a_ab", "a", "ab", "1:N"],
    [1, "ab_b", "ab", "b", "N:1"],
    [2, "a_b", "a", "b", "N:N"],
  ] as const) {
    await relationships
      .getByRole("button", { name: "Adicionar relacionamento da operação", exact: true })
      .click();
    const relation = relationships.getByRole("group", {
      name: `Relacionamento ${i + 1}`,
      exact: true,
    });
    await relation.getByLabel("Identificador do relacionamento", { exact: true }).fill(id);
    await relation
      .getByRole("combobox", { name: "Origem do relacionamento", exact: true })
      .selectOption(from);
    await relation
      .getByRole("combobox", { name: "Destino do relacionamento", exact: true })
      .selectOption(to);
    await relation
      .getByRole("combobox", { name: "Cardinalidade", exact: true })
      .selectOption(cardinality);
    await relation
      .getByLabel("Significado do relacionamento", { exact: true })
      .fill("Associação sintética confirmada pelo autor");
    await relation.getByRole("button", { name: "Adicionar par de chaves", exact: true }).click();
    for (const [index, column] of [
      [0, "id"],
      [1, "tenant"],
    ] as const) {
      const pair = relation.getByRole("group", { name: `Par de chaves ${index + 1}`, exact: true });
      await pair
        .getByRole("combobox", { name: "Campo de origem", exact: true })
        .selectOption(column);
      await pair
        .getByRole("combobox", { name: "Campo de destino", exact: true })
        .selectOption(column);
    }
    if (cardinality === "N:N") {
      await relation.getByRole("button", { name: "Adicionar intermediária", exact: true }).click();
      await relation
        .getByRole("combobox", { name: "Intermediária 1", exact: true })
        .selectOption("ab");
      for (const [index, edge] of [
        [0, "a_ab"],
        [1, "ab_b"],
      ] as const) {
        await relation.getByRole("button", { name: "Adicionar elo direto", exact: true }).click();
        await relation
          .getByRole("combobox", { name: `Elo direto ${index + 1}`, exact: true })
          .selectOption(edge);
      }
    }
  }
  await relationships
    .getByText("Visualizar relacionamentos e lista acessível", { exact: true })
    .click();
  await expect(
    relationships.getByText("Caminho de relações: a_ab → ab_b.", { exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Salvar operação SQL", exact: true }).click();
  await expect(panel.getByRole("status").filter({ hasText: "Rascunho salvo" })).toBeVisible();
  const { skills } = (await (
    await page.request.get(`${f.base}/skills`, { headers: f.headers })
  ).json()) as {
    skills: {
      id: string;
      training: typeof training & {
        relationships: { id: string; via?: string[]; path?: string[]; keys: unknown[] }[];
      };
    }[];
  };
  const saved = skills.find((s) => s.id === f.skillId)!.training;
  expect(saved.relationships[2]).toMatchObject({
    id: "a_b",
    via: ["ab"],
    path: ["a_ab", "ab_b"],
    keys: [
      { from: "id", to: "id" },
      { from: "tenant", to: "tenant" },
    ],
  });
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
      true,
    );
  }
  await relationships
    .getByRole("group", { name: "Relacionamento 1", exact: true })
    .getByRole("button", { name: "Remover relacionamento da operação", exact: true })
    .click();
  await panel.getByRole("button", { name: "Salvar operação SQL", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText(/caminho|N:N|elos/i);
  await expect(panel.getByRole("alert")).toBeFocused();
});

test("adota padrão e perfil físico visualmente na operação sem ampliar escrita ou publicar", async ({
  page,
}) => {
  const f = await operationKnowledgeFixture(page);
  // Fixture setup: private publication and report are produced by a separate native runner.
  const table = f.training.tables[0]!;
  table.concurrency = [];
  table.columns = table.columns.filter((c) => c.name !== "version");
  f.training.parameters = f.training.parameters.filter((p) => p.name !== "version");
  f.training.steps[0]!.where = f.training.steps[0]!.where.filter((w) => w.column !== "version");
  await f.post(`${f.base}/skills/${f.skillId}/rascunho`, {
    expectedRevision: 1,
    name: "Operação privada",
    training: f.training,
  });
  const input = { id: operationInput.id, amount: operationInput.amount };
  const row = (amount: string) => ({ id: input.id, amount: { type: "decimal", value: amount } });
  await f.post(`${f.base}/skills/${f.skillId}/casos`, {
    required: true,
    content: {
      name: "Altera fixture",
      input: {
        parameters: input,
        fixtures: [{ table: "orders", generated: [], rows: [row("10.00")] }],
      },
      expected: { affectedRows: 1, tables: [{ table: "orders", rows: [row("42.50")] }] },
    },
  });
  const state = JSON.parse(
    await readFile("node_modules/.cache/persona-v2-browser-state.json", "utf8"),
  ) as { databaseName: string };
  expect(state.databaseName).toMatch(/^persona_browser_[a-f0-9]{32}_test$/);
  const url = new URL(personaV2TestDatabaseUrl());
  url.pathname = "/postgres";
  const controlUrl = new URL(url);
  controlUrl.pathname = `/${state.databaseName}`;
  const name = `persona_editor_${randomUUID().replaceAll("-", "")}_test`,
    fixtureUrl = new URL(url);
  fixtureUrl.pathname = `/${name}`;
  const admin = new pg.Pool({ connectionString: url.toString() }),
    control = new pg.Pool({ connectionString: controlUrl.toString() }),
    fixture = new pg.Pool({ connectionString: fixtureUrl.toString() });
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const config = testConfig(),
      crypto = new NodeCryptoAdapter(
        config.MCP_ENCRYPTION_KEY,
        config.MCP_ENCRYPTION_KEY_ID,
        config.MCP_ENCRYPTION_PREVIOUS_KEYS,
        config.MCP_ENCRYPTION_LEGACY_KEY,
      );
    const report = await new PostgresPersonaRepository(control).transaction(
      { personaIds: [f.personaId], tokenIds: [] },
      (tx) =>
        runOperationCases(
          tx,
          f.personaId,
          f.skillId,
          crypto,
          new PostgresOperationCaseExecutor(fixture),
        ),
    );
    expect(report.approved).toBe(true);
  } finally {
    await fixture.end();
    await control.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.end();
  }
  const preview = await f.post(`${f.base}/skills/${f.skillId}/preview`, {});
  const active = await f.post(`${f.base}/skills/${f.skillId}/publicar`, {
    confirmationHash: preview.confirmationHash,
  });
  const baseContent = structureContent(),
    baseTable = baseContent.tables[0]!;
  const content = {
    ...baseContent,
    examples: [],
    dialects: ["postgres" as const],
    tables: [
      {
        ...baseTable,
        physicalNames: [{ dialect: "postgres" as const, name: "public.orders" }],
        columns: baseTable.columns.map((c) => ({
          ...c,
          nullable: c.name !== "id",
          nativeTypes: [
            { dialect: "postgres" as const, type: c.name === "id" ? "int4" : "numeric" },
          ],
        })),
        keys: [{ id: "pk-orders", kind: "primary", columns: ["id"], status: "enabled" }],
      },
    ],
  };
  const { catalog } = await f.post("/api/admin/catalogos", {
    name: `Catálogo operação ${randomUUID()}`,
  });
  const { pattern } = await f.post(`/api/admin/catalogos/${catalog.id}/padroes`, {
    slug: "operation-fixture",
    name: "Padrão da operação",
    content,
  });
  const root = `/api/admin/catalogos/${catalog.id}/padroes/${pattern.id}`;
  const proposed = await f.post(`${root}/preview`, {});
  const { publication } = await f.post(`${root}/publicar`, {
    confirmationHash: proposed.confirmationHash,
  });
  const sourceRoot = `${f.base}/fontes/${f.training.sourceId}`;
  const evidence = await f.post(`${sourceRoot}/estrutura`, {
    resources: [{ schema: "public", name: "orders", type: "table" }],
    offset: 0,
    pageSize: 4,
  });
  const local = structuredClone(content);
  local.tables[0]!.meaning = "Pedidos da instalação A";
  const { profile } = await f.post(`${sourceRoot}/perfis/salvar`, {
    catalogId: catalog.id,
    basePublicationId: publication.id,
    name: "Perfil da operação A",
    content: local,
    overrides: { tables: ["orders"], relationships: [] },
  });
  const profileInput = { catalogId: catalog.id, profileId: profile.id, evidenceId: evidence.id };
  const profilePreview = await f.post(`${sourceRoot}/perfis/preview`, profileInput);
  const profilePublication = await f.post(`${sourceRoot}/perfis/publicar`, {
    ...profileInput,
    confirmationHash: profilePreview.confirmationHash,
  });
  await go(page, "Treinamentos");
  const panel = page.getByRole("region", { name: "Treinamento de operação SQL", exact: true });
  await panel
    .getByRole("combobox", { name: "Editar operação SQL", exact: true })
    .selectOption(f.skillId);
  await panel.getByLabel("Nome físico da tabela", { exact: true }).fill("public.orders");
  await panel
    .getByRole("combobox", { name: "Tabela da etapa", exact: true })
    .selectOption("public.orders");
  const adoption = panel.getByRole("region", {
    name: "Adoção de conhecimento na operação",
    exact: true,
  });
  await adoption
    .getByRole("combobox", { name: "Catálogo autorizado", exact: true })
    .selectOption(catalog.id);
  await adoption
    .getByRole("combobox", { name: "Versão do padrão", exact: true })
    .selectOption(publication.id);
  await adoption
    .getByRole("combobox", { name: "Perfil físico publicado", exact: true })
    .selectOption(profilePublication.publicationId);
  await adoption
    .getByRole("button", { name: "Selecionar tabelas e campos livres", exact: true })
    .click();
  await adoption
    .getByRole("button", { name: "Preencher escopo da versão selecionada", exact: true })
    .click();
  await adoption.getByRole("button", { name: "Inspecionar estrutura", exact: true }).click();
  await adoption.getByRole("button", { name: "Verificar compatibilidade", exact: true }).click();
  await expect(
    adoption.getByRole("heading", { name: "Estrutura compatível", exact: true }),
  ).toBeVisible();
  await expect(
    adoption.getByRole("button", { name: "Aplicar conhecimento ao rascunho", exact: true }),
  ).toBeDisabled();
  await adoption
    .getByLabel(
      "Revisei a adoção estrutural sem alteração das etapas, parâmetros e permissões de escrita.",
      { exact: true },
    )
    .check();
  await adoption
    .getByRole("button", { name: "Aplicar conhecimento ao rascunho", exact: true })
    .click();
  await expect(panel.getByLabel("Significado da tabela", { exact: true })).toHaveValue(
    "Pedidos da instalação A",
  );
  await panel.getByRole("button", { name: "Salvar operação SQL", exact: true }).click();
  await expect(panel.getByRole("status").filter({ hasText: "Rascunho salvo" })).toBeVisible();
  const { skills } = (await (
    await page.request.get(`${f.base}/skills`, { headers: f.headers })
  ).json()) as { skills: { id: string; training: typeof f.training }[] };
  const adopted = skills.find((s) => s.id === f.skillId)!.training;
  expect(adopted.sharedKnowledge).toEqual({
    catalogId: catalog.id,
    publicationId: publication.id,
    evidenceId: expect.any(String),
    profilePublicationId: profilePublication.publicationId,
  });
  expect(adopted.parameters).toEqual(f.training.parameters);
  expect(adopted.steps).toEqual(f.training.steps.map((s) => ({ ...s, table: "public.orders" })));
  expect(adopted.tables[0]!.columns.map((c) => [c.name, c.type, c.writable])).toEqual(
    f.training.tables[0]!.columns.map((c) => [c.name, c.type, c.writable]),
  );
  const old = await (
    await page.request.get(`${f.base}/skills/${f.skillId}/publicacao`, { headers: f.headers })
  ).json();
  expect(old.publication.id).toBe(active.publication.id);
  expect(old.publication.hash).toBe(active.publication.hash);
  await expect(panel.getByText(/Sem relatório obrigatório aprovado e atual/)).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Base da operação", exact: true })
    .selectOption({ label: "Base b · postgres" });
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(panel.getByRole("combobox", { name: "Base da operação", exact: true })).toHaveValue(
    f.training.sourceId,
  );
  await adoption
    .getByRole("button", { name: "Remover vínculo compartilhado do rascunho", exact: true })
    .click();
  await expect(panel.getByLabel("Significado da tabela", { exact: true })).toHaveValue(
    "Pedidos da instalação A",
  );
  await go(page, "Visão geral");
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(
    panel.getByText("Há alterações não salvas no contrato.", { exact: true }),
  ).toBeVisible();
});

for (const mode of ["somente_parametros", "sql_adaptavel"] as const) {
  test(`edita operação SQL, casos e publicação com runner isolado sem executar pela UI (${mode})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { csrfToken } = await login(page);
    await createPersona(page, `Editor SQL ${randomUUID()}`);
    await addSource(page, "a");
    const personaId = await page
      .getByRole("combobox", { name: "Persona", exact: true })
      .inputValue();
    const headers = { Origin: "http://127.0.0.1:5188", "X-CSRF-Token": csrfToken };
    await go(page, "Treinamentos");
    const panel = page.getByRole("region", { name: "Treinamento de operação SQL", exact: true });
    const form = panel.getByRole("form", { name: "Contrato de operação SQL", exact: true });
    await form.getByLabel("Nome da operação", { exact: true }).fill("Ajustar valor");
    await form.getByRole("combobox", { name: "Adaptação", exact: true }).selectOption(mode);
    await form.getByLabel("Identificador curto da operação", { exact: true }).fill("ajustar-valor");
    await form
      .getByRole("combobox", { name: "Base da operação", exact: true })
      .selectOption({ label: "Base a · postgres" });
    await form
      .getByLabel("Objetivo da operação", { exact: true })
      .fill("Ajustar valor de pedido sintético identificado");
    await expect(
      form.getByRole("combobox", { name: "Aprovação de cada lançamento", exact: true }),
    ).toHaveValue("human");
    await form
      .getByLabel("Efeitos indiretos conhecidos", { exact: true })
      .fill("Fixture sem triggers ou cascatas");
    await form
      .getByLabel("Procedimento de conciliação", { exact: true })
      .fill("Conferir estado sem repetir escrita incerta");
    for (const [index, name, type] of [
      [0, "id", "integer"],
      [1, "amount", "decimal"],
    ] as const) {
      await form
        .getByRole("button", { name: "Adicionar parâmetro de operação", exact: true })
        .click();
      await form.getByLabel("Parâmetro", { exact: true }).nth(index).fill(name);
      await form
        .getByRole("combobox", { name: "Tipo do parâmetro", exact: true })
        .nth(index)
        .selectOption(type);
      await form.getByLabel("Significado do parâmetro", { exact: true }).nth(index).fill(name);
    }
    await form.getByRole("button", { name: "Adicionar tabela de operação", exact: true }).click();
    const table = form.getByRole("group", { name: "Tabela 1", exact: true });
    await table.getByLabel("Nome físico da tabela", { exact: true }).fill("orders");
    await table.getByLabel("Significado da tabela", { exact: true }).fill("Pedidos sintéticos");
    await table.getByLabel("Identidade, campos separados por vírgula", { exact: true }).fill("id");
    for (const [index, name, type] of [
      [0, "id", "integer"],
      [1, "amount", "decimal"],
    ] as const) {
      await table
        .getByRole("button", { name: "Adicionar coluna de operação", exact: true })
        .click();
      await table.getByLabel("Coluna", { exact: true }).nth(index).fill(name);
      await table
        .getByRole("combobox", { name: "Tipo da coluna", exact: true })
        .nth(index)
        .selectOption(type);
      await table.getByLabel("Significado da coluna", { exact: true }).nth(index).fill(name);
    }
    await table.getByLabel("Permitir escrita", { exact: true }).nth(1).check();
    await form.getByRole("button", { name: "Adicionar etapa SQL", exact: true }).click();
    const step = form.getByRole("group", { name: "Etapa 1", exact: true });
    await step.getByLabel("Identificador da etapa", { exact: true }).fill("change");
    await step
      .getByRole("combobox", { name: "Tabela da etapa", exact: true })
      .selectOption("orders");
    for (const [name, button, column] of [
      ["Valores gravados", "Adicionar valor gravado", "amount"],
      ["Filtros obrigatórios", "Adicionar filtro obrigatório", "id"],
    ] as const) {
      const group = step.getByRole("group", { name, exact: true });
      await group.getByRole("button", { name: button, exact: true }).click();
      await group.getByRole("combobox", { name: "Campo", exact: true }).selectOption(column);
      await group
        .getByRole("combobox", { name: "Origem do valor", exact: true })
        .selectOption(`input:${column}`);
    }
    await form.getByRole("button", { name: "Salvar operação SQL", exact: true }).click();
    await expect(panel.getByRole("status").filter({ hasText: "Rascunho salvo" })).toBeVisible();
    const cases = panel.getByRole("region", { name: "Casos da operação SQL", exact: true });
    await cases.getByRole("button", { name: "Adicionar caso SQL", exact: true }).click();
    await cases.getByLabel("Nome do caso SQL", { exact: true }).fill("Altera pedido sintético");
    await cases.getByLabel("Parâmetro id (integer)", { exact: true }).fill("1");
    await cases.getByLabel("Parâmetro amount (decimal)", { exact: true }).fill("42.50");
    for (const title of ["Sementes", "Estado final"] as const) {
      const group = cases.getByRole("group", { name: title, exact: true });
      await group
        .getByRole("button", { name: `Adicionar tabela em ${title}`, exact: true })
        .click();
      await group
        .getByRole("combobox", { name: "Tabela do caso", exact: true })
        .selectOption("orders");
      await group
        .getByRole("button", { name: "Adicionar registro sintético", exact: true })
        .click();
      await group.getByLabel("id (integer)", { exact: true }).fill("1");
      await group
        .getByLabel("amount (decimal)", { exact: true })
        .fill(title === "Sementes" ? "10.00" : "42.50");
    }
    if (mode === "sql_adaptavel") {
      await cases.getByText("SQL adaptado por etapa (somente casos)", { exact: true }).click();
      await cases
        .getByLabel("SQL de change", { exact: true })
        .fill('UPDATE "orders" SET "amount" = :v_amount WHERE "id" = :w_id');
    }
    await cases.getByRole("button", { name: "Salvar caso SQL", exact: true }).click();
    if (mode === "sql_adaptavel") {
      await cases.getByRole("button", { name: "Adicionar caso SQL", exact: true }).click();
      await cases
        .getByLabel("Nome do caso SQL", { exact: true })
        .fill("Recusa ausência de recorte");
      await cases.getByLabel("Parâmetro id (integer)", { exact: true }).fill("1");
      await cases.getByLabel("Parâmetro amount (decimal)", { exact: true }).fill("42.50");
      const seeds = cases.getByRole("group", { name: "Sementes", exact: true });
      await seeds
        .getByRole("button", { name: "Adicionar tabela em Sementes", exact: true })
        .click();
      await seeds
        .getByRole("combobox", { name: "Tabela do caso", exact: true })
        .selectOption("orders");
      await seeds
        .getByRole("button", { name: "Adicionar registro sintético", exact: true })
        .click();
      await seeds.getByLabel("id (integer)", { exact: true }).fill("1");
      await seeds.getByLabel("amount (decimal)", { exact: true }).fill("10.00");
      await cases
        .getByRole("combobox", { name: "Resultado esperado", exact: true })
        .selectOption("INVALID_PLAN");
      await cases.getByText("SQL adaptado por etapa (somente casos)", { exact: true }).click();
      await cases
        .getByLabel("SQL de change", { exact: true })
        .fill('UPDATE "orders" SET "amount" = :v_amount');
      await cases.getByRole("button", { name: "Salvar caso SQL", exact: true }).click();
    }
    await expect(
      panel.getByRole("status").filter({ hasText: "É necessária uma rodada técnica atual" }),
    ).toBeVisible();
    await panel.getByLabel("Revisar esta operação até", { exact: true }).fill("2030-01-01T12:00");
    await expect(
      panel.getByRole("button", { name: "Revisar publicação SQL", exact: true }),
    ).toBeDisabled();
    const base = `/api/admin/personas/${personaId}/skills`;
    const { skills } = (await (await page.request.get(base, { headers })).json()) as {
      skills: { id: string; kind: string }[];
    };
    const skillId = skills.find((s) => s.kind === "operacao_sql")!.id;
    const state = JSON.parse(
      await readFile("node_modules/.cache/persona-v2-browser-state.json", "utf8"),
    ) as { databaseName: string };
    expect(state.databaseName).toMatch(/^persona_browser_[a-f0-9]{32}_test$/);
    const adminUrl = new URL(personaV2TestDatabaseUrl());
    adminUrl.pathname = "/postgres";
    const metadataUrl = new URL(adminUrl);
    metadataUrl.pathname = `/${state.databaseName}`;
    const fixtureName = `persona_editor_${randomUUID().replaceAll("-", "")}_test`;
    const fixtureUrl = new URL(adminUrl);
    fixtureUrl.pathname = `/${fixtureName}`;
    const admin = new pg.Pool({ connectionString: adminUrl.toString() });
    const metadata = new pg.Pool({ connectionString: metadataUrl.toString() });
    const fixture = new pg.Pool({ connectionString: fixtureUrl.toString() });
    try {
      await admin.query(`CREATE DATABASE "${fixtureName}"`);
      const config = testConfig();
      const crypto = new NodeCryptoAdapter(
        config.MCP_ENCRYPTION_KEY,
        config.MCP_ENCRYPTION_KEY_ID,
        config.MCP_ENCRYPTION_PREVIOUS_KEYS,
        config.MCP_ENCRYPTION_LEGACY_KEY,
      );
      const report = await new PostgresPersonaRepository(metadata).transaction(
        { personaIds: [personaId], tokenIds: [] },
        (tx) =>
          runOperationCases(
            tx,
            personaId,
            skillId,
            crypto,
            new PostgresOperationCaseExecutor(fixture),
          ),
      );
      expect(report.approved).toBe(true);
    } finally {
      await fixture.end();
      await metadata.end();
      await admin.query(`DROP DATABASE IF EXISTS "${fixtureName}"`);
      await admin.end();
    }
    // Separate runner owns SQL. Neither HTTP nor the console can write a technical approval.
    await panel.getByRole("button", { name: "Recarregar operação SQL", exact: true }).click();
    await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
    await expect(
      panel.getByText("Relatório técnico atual aprovado; falta revisão semântica e publicação.", {
        exact: true,
      }),
    ).toBeVisible();
    await panel.getByLabel("Revisar esta operação até", { exact: true }).fill("2030-01-01T12:00");
    await panel.getByRole("button", { name: "Revisar publicação SQL", exact: true }).click();
    await expect(
      panel.getByRole("region", { name: "Comparação de publicação", exact: true }),
    ).toBeVisible();
    await panel
      .getByLabel(
        "Revisei o significado, etapas, limites, efeitos indiretos e aprovação desta operação.",
        { exact: true },
      )
      .check();
    await panel.getByRole("button", { name: "Confirmar publicação SQL", exact: true }).click();
    await expect(
      panel.getByRole("status").filter({ hasText: "Skill de operação publicada" }),
    ).toBeVisible();
    await expect(
      panel.getByText(
        `Publicação ativa: Ajustar valor · revisão ${mode === "sql_adaptavel" ? 3 : 2}. Alterar o rascunho não muda este contrato.`,
        { exact: true },
      ),
    ).toBeVisible();
    await form.getByLabel("Nome da operação", { exact: true }).fill("Nome futuro");
    await checkEditorErrors(page, form, "Nome da operação", "Salvar operação SQL");
    await form.getByRole("button", { name: "Salvar operação SQL", exact: true }).click();
    await expect(panel.getByRole("status").filter({ hasText: "Rascunho salvo" })).toBeVisible();
    await expect(panel.getByText(/Publicação ativa: Ajustar valor/)).toBeVisible();
    await expect(panel.getByText(/Sem relatório obrigatório aprovado e atual/)).toBeVisible();
    expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
      true,
    );
    await form.getByLabel("Nome da operação", { exact: true }).fill("Edição pendente");
    await go(page, "Visão geral");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
    await expect(form.getByLabel("Nome da operação", { exact: true })).toHaveValue(
      "Edição pendente",
    );
    const current = (await (await page.request.get(base, { headers })).json()) as {
      skills: { id: string; revision: number; training: unknown }[];
    };
    const draft = current.skills.find((s) => s.id === skillId)!;
    expect(
      (
        await page.request.post(`${base}/${skillId}/rascunho`, {
          headers,
          data: {
            expectedRevision: draft.revision,
            name: "Alteração concorrente",
            training: draft.training,
          },
        })
      ).status(),
    ).toBe(200);
    await form.getByRole("button", { name: "Salvar operação SQL", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Rascunho mudou");
    await expect(panel.getByRole("alert")).toBeFocused();
    await expect(form.getByLabel("Nome da operação", { exact: true })).toHaveValue(
      "Edição pendente",
    );
    expect(page.url()).not.toContain("42.50");
    const readPool = new pg.Pool({ connectionString: metadataUrl.toString() });
    const publication = await new PostgresPersonaRepository(readPool)
      .transaction({ personaIds: [personaId], tokenIds: [] }, async (tx) => {
        const skill = await tx.catalog.find(personaId, skillId);
        return tx.catalog.publication(personaId, skill!.activePublicationId!);
      })
      .finally(() => readPool.end());
    expect(publication?.package.format).toBe("persona-sql-operation-v2");
    if (publication?.package.format !== "persona-sql-operation-v2")
      throw new Error("Missing SQL publication");
    await go(page, "Tokens e conexões");
    await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
    const tokenForm = page.getByRole("form", { name: "Emitir token", exact: true });
    await tokenForm.getByLabel("Nome do consumidor", { exact: true }).fill("Preparação visual SQL");
    const operationChoice = tokenForm.getByRole("checkbox", { name: /revisão.*UPDATE/ });
    await expect(operationChoice).toBeVisible();
    await operationChoice.check();
    const tokenResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/admin/personas/${personaId}/tokens`) &&
        response.request().method() === "POST",
    );
    await tokenForm.getByRole("button", { name: "Emitir token restrito" }).click();
    const issued = await tokenResponse;
    expect(issued.status()).toBe(201);
    const { bearer } = (await issued.json()) as { bearer: string };
    const issuedRequest = issued.request().postDataJSON() as {
      permissions: {
        skills: { skillId: string; effects: string[]; requireHumanApproval: boolean }[];
      };
    };
    expect(issuedRequest.permissions.skills).toEqual([
      expect.objectContaining({ skillId, effects: ["update"], requireHumanApproval: true }),
    ]);
    await go(page, "Operações");
    const preparationCalls: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/mcp") && request.method() === "POST") {
        const rpc = request.postDataJSON() as { method?: string; params?: { name?: string } };
        if (rpc.method === "tools/call" && rpc.params?.name) preparationCalls.push(rpc.params.name);
      }
    });
    const preparation = page.getByRole("region", { name: "Preparar operação SQL", exact: true });
    await preparation.getByLabel("Token do consumidor para preparar", { exact: true }).fill(bearer);
    await preparation
      .getByRole("button", {
        name: "Carregar operações concedidas / iniciar nova preparação",
        exact: true,
      })
      .click();
    await preparation
      .getByRole("combobox", { name: "Operação publicada", exact: true })
      .selectOption(skillId);
    await expect(
      preparation.getByRole("option", { name: "Ajustar valor", exact: true }),
    ).toHaveCount(1);
    await expect(preparation.getByRole("checkbox", { name: "id: nulo", exact: true })).toHaveCount(
      0,
    );
    await preparation.getByLabel("id (integer)", { exact: true }).fill("1");
    await preparation.getByLabel("amount (decimal)", { exact: true }).fill("42.50");
    if (mode === "sql_adaptavel") {
      await preparation
        .getByLabel("SQL da etapa change (update em orders)", { exact: true })
        .fill('UPDATE "orders" SET "amount" = :v_amount WHERE "id" = :w_id');
    } else {
      await expect(preparation.getByRole("textbox", { name: /SQL da etapa/ })).toHaveCount(0);
    }
    const confirm = preparation.getByLabel("Conferi os dados e quero criar esta preparação.", {
      exact: true,
    });
    await confirm.check();
    await preparation.getByLabel("amount (decimal)", { exact: true }).fill("43.75");
    await expect(confirm).not.toBeChecked();
    await confirm.check();
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/mcp") &&
        r.request().postData()?.includes('"name":"preparar_operacao"') === true,
    );
    await preparation.getByRole("button", { name: "Criar preparação", exact: true }).click();
    expect((await response).ok()).toBe(true);
    await expect(preparation.getByText(/Preparação criada:/)).toBeVisible();
    await expect(preparation.getByText(/Aguarda aprovação humana separada/)).toBeVisible();
    await preparation.getByLabel("Token do consumidor para preparar", { exact: true }).fill("");
    await expect(preparation.getByText(/Preparação criada:/)).toHaveCount(0);
    expect(preparationCalls.filter((name) => name === "preparar_operacao")).toHaveLength(1);
    expect(preparationCalls).not.toContain("executar_operacao");
    expect(preparationCalls).not.toContain("cancelar_operacao");
    expect(preparationCalls).not.toContain("conciliar_operacao");
    await preparation.getByLabel("Token do consumidor para preparar", { exact: true }).fill(bearer);
    await preparation
      .getByRole("button", {
        name: "Carregar operações concedidas / iniciar nova preparação",
        exact: true,
      })
      .click();
    await preparation
      .getByRole("combobox", { name: "Operação publicada", exact: true })
      .selectOption(skillId);
    await preparation.getByLabel("id (integer)", { exact: true }).fill("1");
    await preparation.getByLabel("amount (decimal)", { exact: true }).fill("44.00");
    await confirm.check();
    let lost = false;
    await page.route("**/mcp", async (route) => {
      const rpc = route.request().postDataJSON() as { params?: { name?: string } };
      if (!lost && rpc.params?.name === "preparar_operacao") {
        lost = true;
        const committed = await route.fetch();
        expect(committed.ok()).toBe(true);
        await route.abort("failed");
      } else await route.continue();
    });
    await preparation.getByRole("button", { name: "Criar preparação", exact: true }).click();
    await expect(preparation.getByRole("alert")).toContainText("não será reenviada");
    await expect(
      preparation.getByRole("button", { name: "Criar preparação", exact: true }),
    ).toBeDisabled();
    expect(lost).toBe(true);
    const verifyPool = new pg.Pool({ connectionString: metadataUrl.toString() });
    try {
      const stored = await verifyPool.query<{
        estado: string;
        publicacao_id: string;
        comprovante: unknown;
      }>("SELECT estado,publicacao_id,comprovante FROM operacao_v2 WHERE persona_id=$1", [
        personaId,
      ]);
      expect(stored.rows).toHaveLength(2);
      expect(
        stored.rows.every(
          (row) =>
            row.estado === "aprovacao_pendente" &&
            row.publicacao_id === publication.id &&
            row.comprovante === null,
        ),
      ).toBe(true);
    } finally {
      await verifyPool.end();
    }
    expect(preparationCalls.filter((name) => name === "preparar_operacao")).toHaveLength(2);
    expect(preparationCalls).not.toContain("executar_operacao");
  });
}

test("cruza duas bases por publicação real, pagina depois de combinar e recusa token revogado", async ({
  page,
}) => {
  const { csrfToken } = await login(page);
  const headers = { Origin: "http://127.0.0.1:5188", "X-CSRF-Token": csrfToken };
  await createPersona(page, `Cruzamento ${Date.now()}`);
  await addSource(page, "a");
  await addSource(page, "b");
  await train(page, "a");
  await train(page, "b");
  const personaId = await page.getByRole("combobox", { name: "Persona", exact: true }).inputValue();
  const base = `/api/admin/personas/${personaId}`;
  const { skills } = (await (await page.request.get(`${base}/skills`, { headers })).json()) as {
    skills: {
      id: string;
      name: string;
      activePublicationId: string;
      training: { sourceId: string };
    }[];
  };
  const sources = ["Pedidos a", "Pedidos b"].map((name) => {
    const skill = skills.find((item) => item.name === name)!;
    return { id: skill.training.sourceId, publicationId: skill.activePublicationId };
  });
  const editor = page.getByRole("region", { name: "Treinamento de cruzamento", exact: true });
  await editor.getByRole("button", { name: "Recarregar cruzamento", exact: true }).click();
  await editor.getByLabel("Nome do cruzamento", { exact: true }).fill("Comparar bases");
  await editor.getByLabel("Identificador curto do cruzamento").fill("comparar-bases");
  await editor
    .getByLabel("Finalidade do cruzamento")
    .fill("Comparar pedidos das duas bases sem inventar dados");
  for (const label of [
    "Correspondência de registros",
    "Normalização das chaves",
    "Ausência de registros",
    "Duplicidades e grão",
    "Unidades",
    "Moedas",
    "Calendário",
  ]) {
    await editor
      .getByLabel(label, { exact: true })
      .fill(`${label}: conforme exemplos sintéticos revisados`);
  }
  const a = editor.getByRole("article", { name: "Etapa 1", exact: true }),
    b = editor.getByRole("article", { name: "Etapa 2", exact: true }),
    combination = editor.getByRole("article", { name: "Etapa 3", exact: true });
  await expect(a).toBeVisible();
  await expect(a.getByRole("combobox", { name: "Consulta publicada", exact: true })).toBeVisible();
  await expect(
    a
      .getByRole("combobox", { name: "Consulta publicada", exact: true })
      .locator(`option[value="${sources[0]!.publicationId}"]`),
  ).toHaveCount(1);
  for (const [index, local] of [a, b].entries()) {
    await local
      .getByRole("combobox", { name: "Consulta publicada", exact: true })
      .selectOption(sources[index]!.publicationId);
    await local
      .getByLabel("Colunas retornadas pela consulta (na ordem)", { exact: true })
      .fill("id, amount");
  }
  await combination
    .getByRole("combobox", { name: "Etapa esquerda", exact: true })
    .selectOption("a");
  await combination.getByRole("combobox", { name: "Etapa direita", exact: true }).selectOption("b");
  await combination
    .getByRole("combobox", { name: "Chave esquerda 1", exact: true })
    .selectOption("id");
  await combination
    .getByRole("combobox", { name: "Chave direita 1", exact: true })
    .selectOption("id");
  for (const [index, column] of [
    { side: "left", column: "id", as: "id" },
    { side: "left", column: "amount", as: "amount_a" },
    { side: "right", column: "amount", as: "amount_b" },
  ].entries()) {
    await combination
      .getByRole("button", { name: "Adicionar campo combinado", exact: true })
      .click();
    await combination
      .getByRole("combobox", { name: `Lado do campo ${index + 1}`, exact: true })
      .selectOption(column.side);
    await combination
      .getByRole("combobox", { name: `Campo retornado ${index + 1}`, exact: true })
      .selectOption(column.column);
    await combination.getByLabel(`Nome de saída ${index + 1}`, { exact: true }).fill(column.as);
  }
  await editor.getByRole("button", { name: "Salvar cruzamento", exact: true }).click();
  await expect(
    editor.getByRole("status").filter({ hasText: "Rascunho de cruzamento salvo" }),
  ).toBeVisible();
  const cross = {
    id: await editor.getByRole("combobox", { name: "Editar cruzamento", exact: true }).inputValue(),
  };
  const path = `${base}/skills/${cross.id}`;
  const cases = editor.getByRole("region", { name: "Casos do cruzamento", exact: true });
  await cases.getByLabel("Tipo do novo caso").selectOption("synthetic");
  await cases.getByRole("button", { name: "Adicionar caso de cruzamento", exact: true }).click();
  await cases
    .getByLabel("Nome do caso de cruzamento", { exact: true })
    .fill("Correspondência sintética e valores exatos");
  for (const step of ["a", "b"]) {
    await cases
      .getByLabel(`SQL sintético de ${step}`, { exact: true })
      .fill("SELECT p.id, p.amount FROM public.orders p WHERE p.id > 0 ORDER BY p.id");
    const input = cases.getByRole("group", { name: `Entrada ${step}`, exact: true });
    await input
      .getByRole("button", { name: `Adicionar linha em Entrada ${step}`, exact: true })
      .click();
    const row = input.getByRole("group", { name: "Linha 1", exact: true });
    await row.getByRole("combobox", { name: "id · tipo", exact: true }).selectOption("number");
    await row.getByLabel("id · valor", { exact: true }).fill("1");
    await row.getByLabel("amount · valor", { exact: true }).fill(step === "a" ? "10.25" : "100.75");
  }
  const expected = cases.getByRole("group", { name: "Resultado esperado", exact: true });
  await expected
    .getByRole("button", { name: "Adicionar linha em Resultado esperado", exact: true })
    .click();
  const expectedRow = expected.getByRole("group", { name: "Linha 1", exact: true });
  await expectedRow
    .getByRole("combobox", { name: "id · tipo", exact: true })
    .selectOption("number");
  await expectedRow.getByLabel("id · valor", { exact: true }).fill("1");
  await expectedRow.getByLabel("amount_a · valor", { exact: true }).fill("10.25");
  await expectedRow.getByLabel("amount_b · valor", { exact: true }).fill("100.75");
  await cases.getByLabel("Total esperado antes da paginação", { exact: true }).fill("1");
  await cases.getByRole("button", { name: "Salvar caso de cruzamento", exact: true }).click();
  await expect(
    editor.getByRole("status").filter({ hasText: "Caso de cruzamento salvo" }),
  ).toBeVisible();
  expect((await page.request.post(`${path}/preview`, { headers, data: {} })).status()).toBe(409);
  // Separate trusted runner against the owned fixture, never a browser approval endpoint.
  const state = JSON.parse(
    await readFile("node_modules/.cache/persona-v2-browser-state.json", "utf8"),
  ) as { databaseName: string };
  expect(state.databaseName).toMatch(/^persona_browser_[a-f0-9]{32}_test$/);
  const url = new URL(personaV2TestDatabaseUrl());
  url.pathname = `/${state.databaseName}`;
  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    const config = testConfig();
    const crypto = new NodeCryptoAdapter(
      config.MCP_ENCRYPTION_KEY,
      config.MCP_ENCRYPTION_KEY_ID,
      config.MCP_ENCRYPTION_PREVIOUS_KEYS,
      config.MCP_ENCRYPTION_LEGACY_KEY,
    );
    const report = await new PostgresPersonaRepository(pool).transaction(
      { personaIds: [personaId], tokenIds: [] },
      (tx) => runFederationCases(tx, personaId, cross.id, crypto),
    );
    expect(report.approved).toBe(true);
  } finally {
    await pool.end();
  }
  await editor.getByRole("button", { name: "Recarregar cruzamento", exact: true }).click();
  await editor.getByLabel("Revisar este cruzamento até", { exact: true }).fill("2027-01-20T12:00");
  await editor
    .getByRole("button", { name: "Revisar publicação do cruzamento", exact: true })
    .click();
  await expect(editor.getByText(/Prévia válida até/)).toBeVisible();
  await editor
    .getByLabel(
      "Revisei correspondência, cardinalidade, ausência, duplicidades, unidades e completude do cruzamento.",
      { exact: true },
    )
    .check();
  await editor
    .getByRole("button", { name: "Confirmar publicação do cruzamento", exact: true })
    .click();
  await expect(
    editor.getByRole("status").filter({ hasText: "Cruzamento publicado" }),
  ).toBeVisible();
  await editor.getByLabel("Nome do cruzamento", { exact: true }).fill("Rascunho posterior");
  await checkEditorErrors(page, editor, "Nome do cruzamento", "Salvar cruzamento");
  await editor.getByRole("button", { name: "Salvar cruzamento", exact: true }).click();
  await expect(
    editor.getByRole("status").filter({ hasText: "Rascunho de cruzamento salvo" }),
  ).toBeVisible();
  await expect(editor.getByText(/Publicação ativa: Comparar bases · revisão/)).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Revisar publicação do cruzamento", exact: true }),
  ).toBeDisabled();
  await cases.getByLabel("Tipo do novo caso").selectOption("transport");
  await cases.getByRole("button", { name: "Adicionar caso de cruzamento", exact: true }).click();
  await cases
    .getByLabel("Nome do caso de cruzamento", { exact: true })
    .fill("Consultas vazias nas fixtures de transporte");
  for (const step of ["a", "b"]) {
    await cases
      .getByLabel(`SQL sintético de ${step}`, { exact: true })
      .fill("SELECT p.id, p.amount FROM public.orders p WHERE p.id > 0 ORDER BY p.id");
  }
  const seeds = cases.getByRole("group", { name: /^Sementes da base/ });
  for (let i = 0; i < 2; i++) {
    await seeds
      .nth(i)
      .getByRole("button", { name: "Adicionar tabela de semente", exact: true })
      .click();
    await seeds
      .nth(i)
      .getByRole("combobox", { name: "Tabela da semente", exact: true })
      .selectOption("public.orders");
  }
  for (const [index, column] of [
    { name: "id", type: "integer" },
    { name: "amount_a", type: "decimal" },
    { name: "amount_b", type: "decimal" },
  ].entries()) {
    await cases.getByRole("button", { name: "Adicionar coluna esperada", exact: true }).click();
    await cases
      .getByLabel(`Nome da coluna esperada ${index + 1}`, { exact: true })
      .fill(column.name);
    await cases
      .getByRole("combobox", { name: `Tipo da coluna esperada ${index + 1}`, exact: true })
      .selectOption(column.type);
  }
  await cases.getByRole("button", { name: "Salvar caso de cruzamento", exact: true }).click();
  await expect(
    editor.getByRole("status").filter({ hasText: "Caso de cruzamento salvo" }),
  ).toBeVisible();
  const details = (await (
    await page.request.get(`${path}/testes-cruzamento`, { headers })
  ).json()) as {
    revision: number;
    cases: { id: string; content: FederationCase | FederationPublicationCase }[];
    requiredApproved: boolean;
    reports: { current: boolean }[];
  };
  const nativeCase = details.cases.find(
    (c) => c.content.name === "Consultas vazias nas fixtures de transporte",
  )!;
  const nativeContent = nativeCase.content as FederationPublicationCase;
  expect(nativeContent.input.sources).toHaveLength(2);
  expect(details.requiredApproved).toBe(false);
  expect(details.reports.every((r) => !r.current)).toBe(true);
  // Existing valid cases can omit the schema's generated default; reading must not rewrite them.
  const oldShape = {
    ...nativeContent,
    input: {
      ...nativeContent.input,
      sources: nativeContent.input.sources.map((s) => ({
        ...s,
        fixtures: s.fixtures.map((f) => ({ table: f.table, rows: f.rows })),
      })),
    },
  };
  expect(
    (
      await page.request.post(`${path}/casos-cruzamento`, {
        headers,
        data: {
          id: nativeCase.id,
          expectedRevision: details.revision,
          required: true,
          content: oldShape,
        },
      })
    ).status(),
  ).toBe(200);
  await editor.getByRole("button", { name: "Recarregar cruzamento", exact: true }).click();
  await cases
    .getByRole("button", { name: `Editar caso ${nativeContent.name}`, exact: true })
    .click();
  await expect(cases.getByLabel("Colunas geradas da semente").first()).toHaveValue("");
  await cases.getByRole("button", { name: "Fechar caso de cruzamento", exact: true }).click();
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate("document.documentElement.scrollWidth")).toBeLessThanOrEqual(width);
  }
  await editor.getByLabel("Nome do cruzamento", { exact: true }).fill("Edição local preservada");
  await go(page, "Bases");
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(editor.getByLabel("Nome do cruzamento", { exact: true })).toHaveValue(
    "Edição local preservada",
  );
  await editor.getByLabel("Nome do cruzamento", { exact: true }).fill("Rascunho posterior");
  await page.getByRole("combobox", { name: "Persona", exact: true }).selectOption("");
  await page.getByRole("combobox", { name: "Persona", exact: true }).selectOption(personaId);
  await go(page, "Tokens e conexões");
  const tokenForm = page.getByRole("form", { name: "Emitir token", exact: true });
  await tokenForm.getByLabel("Nome do consumidor").fill("Cliente de cruzamento");
  await tokenForm.getByLabel(/^Comparar bases · revisão/).check();
  await tokenForm.getByRole("button", { name: "Emitir token restrito" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Selecione explicitamente todas as consultas dependentes",
  );
  await tokenForm.getByLabel(/^Pedidos a · revisão/).check();
  await tokenForm.getByLabel(/^Pedidos b · revisão/).check();
  await tokenForm.getByRole("button", { name: "Emitir token restrito" }).click();
  await expect(
    page.getByText("Token emitido. Copie agora; ele fica somente na memória desta página."),
  ).toBeVisible();
  await go(page, "Consultas");
  const panel = page.getByRole("region", { name: "Cruzamentos publicados" });
  await panel.getByRole("button", { name: "Ver cruzamentos permitidos por este token" }).click();
  await panel.getByRole("combobox", { name: "Cruzamento", exact: true }).selectOption(cross.id);
  await expect(panel.getByLabel("SQL da etapa a")).toHaveValue(
    "SELECT p.id, p.amount FROM public.orders p WHERE p.id > 0 ORDER BY p.id",
  );
  await panel.getByLabel("Linhas por página do cruzamento").selectOption("25");
  await panel.getByRole("button", { name: "Validar cruzamento", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("validados tecnicamente");
  await expect(panel.getByRole("table")).not.toBeVisible();
  await panel.getByRole("button", { name: "Consultar cruzamento", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("30 registros na combinação · Página 1");
  await expect(panel.getByRole("table").getByRole("row")).toHaveCount(26);
  await expect(panel.getByRole("table").getByRole("row").nth(1)).toContainText("10.25");
  await expect(panel.getByRole("table").getByRole("row").nth(1)).toContainText("100.75");
  await panel.getByRole("button", { name: "Próxima página do cruzamento" }).click();
  await expect(panel.getByRole("status")).toContainText("Página 2");
  await expect(panel.getByRole("table").getByRole("row")).toHaveCount(6);
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => {
        const browser = globalThis as unknown as {
          document: { documentElement: { scrollWidth: number } };
        };
        return browser.document.documentElement.scrollWidth;
      }),
    ).toBeLessThanOrEqual(width);
  }
  if (process.env.PERSONA_V2_UI_EVIDENCE_DIR) {
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(process.env.PERSONA_V2_UI_EVIDENCE_DIR, "persona-v2-cruzamento-se7e.png"),
    });
  }
  await panel
    .getByLabel("SQL da etapa a")
    .fill("SELECT p.id, p.amount FROM public.orders p WHERE p.id > 1 ORDER BY p.id");
  await expect(panel.getByRole("table")).not.toBeVisible();
  await go(page, "Bases");
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(panel.getByLabel("SQL da etapa a")).toHaveValue(/p.id > 1/);
  const tokens = (await (await page.request.get(`${base}/tokens`, { headers })).json()) as {
    tokens: { id: string; name: string }[];
  };
  const token = tokens.tokens.find((item) => item.name === "Cliente de cruzamento")!;
  expect(
    (await page.request.post(`${base}/tokens/${token.id}/revogar`, { headers, data: {} })).status(),
  ).toBe(204);
  await panel.getByRole("button", { name: "Consultar cruzamento", exact: true }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(panel.getByRole("table")).not.toBeVisible();
  await go(page, "Bases");
  await page.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  await expect(panel).not.toBeVisible();
});

test("cadastro aponta campo inválido e descarta credenciais sem refletir seu conteúdo", async ({
  page,
}) => {
  await login(page);
  await createPersona(page, `Validação ${Date.now()}`);
  await go(page, "Bases");
  await page.getByText("Adicionar uma base", { exact: true }).click();
  const form = page.getByRole("form", { name: "Cadastrar base", exact: true });
  await form.getByLabel("Nome da base").fill("Fixture inválida");
  await form.getByLabel("Para que essa base será usada?").fill("Validar cadastro");
  await form.getByLabel("AGENT_ID", { exact: true }).fill("agente-invalido");
  await form.getByLabel("CLIENT_EMAIL", { exact: true }).fill("a@fixture.test");
  await form.getByLabel("CLIENT_PASSWORD", { exact: true }).fill("fixture-password");
  await form.getByLabel("CLIENT_TOKEN", { exact: true }).fill("fixture-a");
  await form.getByRole("button", { name: "Conectar base", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Confira AGENT_ID");
  await expect(form.getByLabel("AGENT_ID", { exact: true })).toBeFocused();
  await expect(form.getByLabel("AGENT_ID", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(form.getByLabel("CLIENT_PASSWORD", { exact: true })).toHaveValue("");
  await expect(form.getByLabel("CLIENT_TOKEN", { exact: true })).toHaveValue("");
  await expect(page.getByRole("alert")).not.toContainText("fixture-password");
});

test("seleciona ERP no cadastro e verifica compatibilidade sem conceder acesso", async ({
  page,
}) => {
  const { csrfToken } = await login(page);
  const personaName = `Perfil físico ${Date.now()}`;
  await createPersona(page, personaName);
  await addSource(page, "a");

  const headers = { "X-CSRF-Token": csrfToken, Origin: "http://127.0.0.1:5188" };
  const post = async (url: string, data: unknown) => {
    const result = await page.request.post(url, {
      headers,
      data: withReviewDeadline(url, data as object),
    });
    expect(result.ok(), await result.text()).toBe(true);
    return result.json();
  };
  // Fixture setup only; the journey under review uses the real console editors.
  const catalog = await post("/api/admin/catalogos", { name: `Catálogo físico ${Date.now()}` });
  const baseContent = structureContent();
  const table = baseContent.tables[0]!;
  const content = {
    ...baseContent,
    examples: [],
    dialects: ["postgres"],
    tables: [
      {
        ...table,
        physicalNames: [{ dialect: "postgres", name: "public.orders" }],
        columns: table.columns.map((c) => ({
          ...c,
          nullable: c.name !== "id",
          nativeTypes: [{ dialect: "postgres", type: c.name === "id" ? "int4" : "numeric" }],
        })),
        keys: [{ id: "pk-orders", kind: "primary", columns: ["id"], status: "enabled" }],
      },
    ],
  };
  const pattern = await post(`/api/admin/catalogos/${catalog.catalog.id}/padroes`, {
    slug: "profile-fixture",
    name: "Padrão comprovável",
    content,
  });
  const patternRoot = `/api/admin/catalogos/${catalog.catalog.id}/padroes/${pattern.pattern.id}`;
  const preview = await post(`${patternRoot}/preview`, {});
  const publication = await post(`${patternRoot}/publicar`, {
    confirmationHash: preview.confirmationHash,
  });
  await go(page, "Bases");
  const knowledge = page.getByRole("region", {
    name: "Conhecimento das bases da persona",
    exact: true,
  });
  await knowledge.getByLabel("Base para conhecimento").selectOption({ label: "Base a — postgres" });
  await knowledge.getByRole("button", { name: "Atualizar versões disponíveis" }).click();
  await knowledge.getByLabel("Catálogo autorizado").selectOption(catalog.catalog.id);
  await knowledge
    .getByRole("combobox", { name: "Versão do padrão", exact: true })
    .selectOption(publication.publication.id);
  await knowledge.getByRole("button", { name: "Preencher escopo da versão selecionada" }).click();
  await go(page, "Treinamentos");
  await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(knowledge.getByLabel("Tabela ou view 1")).toHaveValue("orders");
  await knowledge.getByRole("button", { name: "Inspecionar estrutura", exact: true }).click();
  await expect(knowledge.getByText(/Primária orders_pkey/)).toContainText("Habilitada e validada");
  await knowledge.getByRole("button", { name: "Verificar compatibilidade" }).click();
  await expect(
    knowledge.getByRole("heading", { name: "Estrutura compatível", exact: true }),
  ).toBeVisible();
  await expect(knowledge.getByText(/o vínculo executável será salvo/)).toBeVisible();
});
