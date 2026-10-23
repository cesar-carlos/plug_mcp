import { chromium, expect, type Page } from "@playwright/test";
import request from "supertest";
import { parseMcpPayload } from "./mcp-rpc.js";

const go = async (page: Page, area: string) => {
  await page
    .getByRole("navigation", { name: "Áreas do console" })
    .getByRole("link", { name: area, exact: true })
    .click();
};
async function finishSession(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
  await expect(page.getByRole("table")).not.toBeVisible();
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
}

/** Real browser + real HTTP composition; only isolated fixture credentials enter forms. */
export async function exerciseChainBrowser(input: {
  url: string;
  client: { email: string; password: string };
  sources: readonly { dialect: string; agentId: string; clientToken: string }[];
  journey?: "training" | "publication";
  verifyPublicationCases?: (page: Page, csrfToken: string) => Promise<void>;
}): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let phase = "login";
  try {
    await page.goto(`${input.url}/app`);
    await page.getByLabel("E-mail", { exact: true }).fill(input.client.email);
    await page.getByLabel("Senha", { exact: true }).fill(input.client.password);
    const loginResponse = page.waitForResponse(
      (r) => r.url().endsWith("/api/admin/login") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sair", exact: true })).toBeVisible();
    const login = (await (await loginResponse).json()) as { csrfToken: string };
    if (typeof login.csrfToken !== "string" || !login.csrfToken)
      throw new Error("Sessão de fixture não confirmada.");
    phase = "persona vazia";
    await go(page, "Personas");
    const create = page.getByRole("form", { name: "Criar persona", exact: true });
    if (!(await create.isVisible()))
      await page.getByText("Criar uma persona", { exact: true }).click();
    await create.getByLabel("Nome", { exact: true }).fill("Persona pelo navegador real");
    await create
      .getByLabel("Especialidade", { exact: true })
      .fill("Dados sintéticos da homologação");
    await create.getByRole("button", { name: "Criar persona", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Persona pelo navegador real", exact: true }),
    ).toBeVisible();
    for (const source of input.sources) {
      phase = `cadastro ${source.dialect}`;
      await go(page, "Bases");
      const form = page.getByRole("form", { name: "Cadastrar base", exact: true });
      if (!(await form.isVisible()))
        await page.getByText("Adicionar uma base", { exact: true }).click();
      await form.getByLabel("Nome da base", { exact: true }).fill(`Base real ${source.dialect}`);
      await form
        .getByLabel("Para que essa base será usada?", { exact: true })
        .fill("Consulta da fixture isolada");
      await form.getByLabel("AGENT_ID", { exact: true }).fill(source.agentId);
      await form.getByLabel("CLIENT_EMAIL", { exact: true }).fill(input.client.email);
      await form.getByLabel("CLIENT_PASSWORD", { exact: true }).fill(input.client.password);
      await form.getByLabel("CLIENT_TOKEN", { exact: true }).fill(source.clientToken);
      await form
        .getByRole("combobox", { name: "DIALETO", exact: true })
        .selectOption(source.dialect);
      await form.getByRole("button", { name: "Conectar base", exact: true }).click();
      await expect(
        page.getByText(`Base real ${source.dialect}`, { exact: true }).first(),
      ).toBeVisible();
      if (input.journey === "publication") continue;
      phase = `treinamento ${source.dialect}`;
      await go(page, "Treinamentos");
      await page
        .getByRole("combobox", { name: "Editar treinamento", exact: true })
        .selectOption("");
      const training = page.getByRole("form", { name: "Treinar consulta", exact: true });
      await training.getByLabel("Nome", { exact: true }).fill(`Consulta real ${source.dialect}`);
      await training
        .getByLabel("Identificador curto", { exact: true })
        .fill(`real-${source.dialect}`);
      await training
        .getByRole("combobox", { name: "Base", exact: true })
        .selectOption({ label: `Base real ${source.dialect}` });
      await training
        .getByLabel("Objetivo da consulta", { exact: true })
        .fill("Ler valores comprovados da fixture");
      await training.getByRole("button", { name: "Adicionar tabela", exact: true }).click();
      const table = training.locator(".row").first();
      await table.getByLabel("Nome físico", { exact: true }).fill("operation_fixture");
      await table
        .getByLabel("Significado", { exact: true })
        .fill("Registro sintético por identificador");
      await table.getByLabel("Colunas que identificam um registro", { exact: true }).fill("id");
      for (const [index, column] of ["id", "amount"].entries()) {
        await training.getByRole("button", { name: "Adicionar coluna", exact: true }).click();
        const row = training.locator(".row").nth(index + 1);
        await row
          .getByRole("combobox", { name: "Tabela", exact: true })
          .selectOption("operation_fixture");
        await row.getByLabel("Coluna", { exact: true }).fill(column);
        await row
          .getByLabel("Significado", { exact: true })
          .fill(column === "id" ? "Identificador" : "Valor sintético");
      }
      await training
        .getByLabel("Regras de negócio (uma por linha)", { exact: true })
        .fill("Não extrapolar os registros retornados");
      await training.getByRole("button", { name: "Adicionar parâmetro", exact: true }).click();
      const parameter = training.locator(".row").filter({
        has: page.getByRole("checkbox", { name: "Obrigatório", exact: true }),
      });
      await parameter.getByLabel("Nome do parâmetro", { exact: true }).fill("minimum");
      await parameter
        .getByRole("combobox", { name: "Tipo do parâmetro", exact: true })
        .selectOption("integer");
      await parameter
        .getByLabel("Significado do parâmetro", { exact: true })
        .fill("Identificador mínimo");
      await training
        .getByLabel("Exemplo de SQL", { exact: true })
        .fill("SELECT p.id, p.amount FROM operation_fixture p WHERE p.id > :minimum ORDER BY p.id");
      await training.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
      await expect(
        page.getByText("Rascunho salvo. Revise o pacote antes de publicar.", { exact: true }),
      ).toBeVisible();
      phase = `releitura ${source.dialect}`;
      await page.getByRole("button", { name: "Recarregar treinamento", exact: true }).click();
      await expect(
        page.getByText("Treinamento recarregado do servidor. Revise antes de salvar ou publicar.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(training.getByLabel("Nome", { exact: true })).toHaveValue(
        `Consulta real ${source.dialect}`,
      );
      await expect(training.getByLabel("Exemplo de SQL", { exact: true })).toHaveValue(
        "SELECT p.id, p.amount FROM operation_fixture p WHERE p.id > :minimum ORDER BY p.id",
      );
      await expect(parameter.getByLabel("Nome do parâmetro", { exact: true })).toHaveValue(
        "minimum",
      );
      await expect(
        parameter.getByRole("combobox", { name: "Tipo do parâmetro", exact: true }),
      ).toHaveValue("integer");
      phase = `publicação ${source.dialect}`;
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
      phase = `rascunho posterior à publicação ${source.dialect}`;
      await training
        .getByLabel("Nome", { exact: true })
        .fill(`Edição ainda privada ${source.dialect}`);
      await training
        .getByLabel("Exemplo de SQL", { exact: true })
        .fill("SELECT p.id, p.amount FROM operation_fixture p WHERE p.id > 999 ORDER BY p.id");
      await training.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
      await expect(
        page.getByRole("combobox", { name: "Editar treinamento", exact: true }),
      ).toContainText(`Edição ainda privada ${source.dialect} · alterações pendentes`);
    }
    if (input.journey === "publication") {
      if (!input.verifyPublicationCases) throw new Error("Runner privado explícito obrigatório.");
      phase = "casos obrigatórios e relatório do operador";
      await input.verifyPublicationCases(page, login.csrfToken);
      phase = "saída e descarte";
      await finishSession(page);
      return;
    }
    phase = "token e conexão";
    await go(page, "Tokens e conexões");
    const tokens = page.getByRole("form", { name: "Emitir token", exact: true });
    await tokens
      .getByLabel("Nome do consumidor", { exact: true })
      .fill("Consumidor da fixture real");
    for (const source of input.sources)
      await tokens.getByLabel(new RegExp(`^Consulta real ${source.dialect} · revisão`)).check();
    await tokens.getByRole("button", { name: "Emitir token restrito", exact: true }).click();
    await expect(
      page.getByLabel("Token para conectar o cliente ou testar", { exact: true }),
    ).not.toHaveValue("");
    const independentToken = await page
      .getByLabel("Token para conectar o cliente ou testar", { exact: true })
      .inputValue();
    phase = "instruções MCP de treinamento";
    const initialized = await request(input.url)
      .post("/mcp")
      .set("Host", new URL(input.url).host)
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${independentToken}`)
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "manual-training-fixture", version: "1" },
        },
      });
    expect(initialized.status).toBe(200);
    const initializedResult = parseMcpPayload(initialized).result as { instructions?: string };
    expect(initializedResult.instructions).toContain(
      "adotadas por skills de consulta ou operação SQL concedidas",
    );
    expect(initializedResult.instructions).not.toContain(
      "Não há tool de descoberta/importação administrativa nesta entrega",
    );
    expect(initializedResult.instructions).toContain(
      "Runners de publicação são exclusivos do operador",
    );
    phase = "token e conexão";
    const connection = page.getByRole("region", { name: "Conexão do consumidor", exact: true });
    await connection.getByRole("button", { name: "Testar conexão", exact: true }).click();
    await expect(connection.getByRole("status")).toContainText(
      "Conexão autenticada e descoberta concluída",
    );
    await go(page, "Consultas");
    await page
      .getByRole("button", { name: "Ver consultas permitidas por este token", exact: true })
      .click();
    const publications = new Map<string, string>();
    for (const source of input.sources) {
      phase = `consulta ${source.dialect}`;
      const option = page.getByRole("option", {
        name: `Consulta real ${source.dialect} · revisão 1`,
        exact: true,
      });
      const id = await option.getAttribute("value");
      if (!id) throw new Error("Publicação concedida não identificada.");
      publications.set(source.dialect, id);
      await page
        .getByRole("combobox", { name: "Consulta", exact: true })
        .selectOption({ label: `Consulta real ${source.dialect} · revisão 1` });
      await page
        .getByRole("textbox", { name: "Identificador mínimo (minimum) · Obrigatório", exact: true })
        .fill("0");
      await page.getByRole("button", { name: "Validar SQL", exact: true }).click();
      await expect(page.getByText(/SQL validado tecnicamente/)).toBeVisible();
      await page.getByRole("button", { name: "Consultar", exact: true }).click();
      await expect(page.getByRole("cell", { name: /^10\.25(?:0*)?$/, exact: true })).toBeVisible();
      await expect(page.getByText(/Página 1 · 1 registro/)).toBeVisible();
    }
    phase = "vazio e recusa";
    const sql = page.getByLabel("SQL adaptado (opcional; vazio usa o exemplo publicado)", {
      exact: true,
    });
    await sql.fill(
      "SELECT p.id, p.amount FROM operation_fixture p WHERE p.id > :minimum ORDER BY p.id",
    );
    await page
      .getByRole("textbox", { name: "Identificador mínimo (minimum) · Obrigatório", exact: true })
      .fill("999");
    await page.getByRole("button", { name: "Consultar", exact: true }).click();
    await expect(
      page.getByText("Nenhum registro retornado para os filtros desta consulta.", { exact: true }),
    ).toBeVisible();
    await sql.fill("DELETE FROM operation_fixture");
    await page.getByRole("button", { name: "Consultar", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("table")).not.toBeVisible();
    phase = "token limitado e chamada direta";
    const first = input.sources[0],
      other = input.sources[1];
    if (!first || !other) throw new Error("Ensaio exige duas fontes distintas.");
    const firstId = publications.get(first.dialect),
      otherId = publications.get(other.dialect);
    if (!firstId || !otherId) throw new Error("Publicações de fixture ausentes.");
    const assertDirectRefusal = async (token: string, skillId: string) => {
      const response = await request(input.url)
        .post("/mcp")
        .set("Host", new URL(input.url).host)
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", `Bearer ${token}`)
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "consultar_dados", arguments: { skillIds: [skillId] } },
        });
      expect(response.status).toBe(200);
      const result = parseMcpPayload(response).result as {
        isError?: boolean;
        content: { text: string }[];
      };
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0]!.text)).toMatchObject({
        error: { code: "AUTHORIZATION_DENIED" },
      });
    };
    phase = "emissão do segundo token";
    await go(page, "Tokens e conexões");
    await tokens.getByLabel("Nome do consumidor", { exact: true }).fill("Consumidor limitado");
    await tokens.getByLabel(new RegExp(`^Consulta real ${first.dialect} · revisão`)).check();
    await tokens.getByRole("button", { name: "Emitir token restrito", exact: true }).click();
    await expect(
      page.getByLabel("Token para conectar o cliente ou testar", { exact: true }),
    ).not.toHaveValue("");
    await expect(
      page.getByLabel("Token para conectar o cliente ou testar", { exact: true }),
    ).not.toHaveValue(independentToken);
    const limitedToken = await page
      .getByLabel("Token para conectar o cliente ou testar", { exact: true })
      .inputValue();
    expect(limitedToken).not.toBe(independentToken);
    phase = "descoberta do token limitado";
    await go(page, "Consultas");
    const inspect = page.getByRole("button", {
      name: "Ver consultas permitidas por este token",
      exact: true,
    });
    await inspect.click();
    const query = page.getByRole("combobox", { name: "Consulta", exact: true });
    await expect(query.locator("option")).toHaveCount(2);
    await expect(query).not.toContainText(`Consulta real ${other.dialect}`);
    phase = "chamada direta à fonte não concedida";
    await assertDirectRefusal(limitedToken, otherId);
    phase = "consulta do token limitado";
    await query.selectOption(firstId);
    await page
      .getByRole("textbox", { name: "Identificador mínimo (minimum) · Obrigatório", exact: true })
      .fill("0");
    await page.getByRole("button", { name: "Consultar", exact: true }).click();
    await expect(page.getByRole("cell", { name: /^10\.25(?:0*)?$/, exact: true })).toBeVisible();
    phase = "retirada de concessão";
    await go(page, "Tokens e conexões");
    await page.getByRole("button", { name: "Editar Consumidor limitado", exact: true }).click();
    const edit = page.getByRole("form", { name: "Editar token", exact: true });
    await edit.getByRole("button", { name: "Remover concessão", exact: true }).click();
    await edit.getByRole("button", { name: "Salvar token", exact: true }).click();
    await expect(
      page.getByText("Token atualizado. Acessos derivados anteriores foram invalidados.", {
        exact: true,
      }),
    ).toBeVisible();
    await go(page, "Consultas");
    const consumerToken = page.getByLabel("Token para consultar", { exact: true });
    await consumerToken.fill(limitedToken);
    await expect(page.getByRole("table")).not.toBeVisible();
    await inspect.click();
    await expect(
      page.getByText("Nenhuma consulta desta persona foi concedida ao token.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(query.locator("option")).toHaveCount(1);
    await assertDirectRefusal(limitedToken, firstId);
    phase = "consumidor independente preservado";
    await consumerToken.fill(independentToken);
    await inspect.click();
    await expect(query.locator("option")).toHaveCount(input.sources.length + 1);
    await query.selectOption(firstId);
    await page
      .getByRole("textbox", { name: "Identificador mínimo (minimum) · Obrigatório", exact: true })
      .fill("0");
    await page.getByRole("button", { name: "Consultar", exact: true }).click();
    await expect(page.getByRole("cell", { name: /^10\.25(?:0*)?$/, exact: true })).toBeVisible();
    phase = "saída e descarte";
    await finishSession(page);
  } catch {
    // Never print credentials, Bearer, form values, screenshots or traces on failure.
    throw new Error(`Percurso Chromium real falhou na etapa: ${phase}`);
  } finally {
    await context.close();
    await browser.close();
  }
}
