import { expect, type Page, type Locator } from "@playwright/test";

/** UI writes declarations; only the separate operator callback can execute fixture cases. */
export async function exerciseManualPublication(input: {
  page: Page;
  dialects: readonly string[];
  sourceLabel?: (dialect: string) => string;
  run: (binding: {
    personaId: string;
    skillId: string;
    sourceId: string;
    dialect: string;
  }) => Promise<void>;
}): Promise<void> {
  const { page } = input;
  const scalar = async (row: Locator, column: string, type: string, value: string) => {
    await row.getByRole("combobox", { name: `Tipo de ${column}`, exact: true }).selectOption(type);
    await row.getByLabel(`${column} (${type})`, { exact: true }).fill(value);
  };
  for (const dialect of input.dialects) {
    await page
      .getByRole("navigation", { name: "Áreas do console" })
      .getByRole("link", { name: "Treinamentos", exact: true })
      .click();
    await page.getByRole("combobox", { name: "Editar treinamento", exact: true }).selectOption("");
    const form = page.getByRole("form", { name: "Treinar consulta", exact: true });
    await form.getByLabel("Nome", { exact: true }).fill(`Consulta com caso ${dialect}`);
    await form.getByLabel("Identificador curto", { exact: true }).fill(`caso-${dialect}`);
    const source = form.getByRole("combobox", { name: "Base", exact: true });
    await source.selectOption({ label: input.sourceLabel?.(dialect) ?? `Base real ${dialect}` });
    const sourceId = await source.inputValue();
    await form
      .getByLabel("Objetivo da consulta", { exact: true })
      .fill("Ler identificador da semente sintética");
    await form.getByRole("button", { name: "Adicionar tabela", exact: true }).click();
    const table = form.locator(".row").first();
    await table.getByLabel("Nome físico", { exact: true }).fill("publication_orders");
    await table
      .getByLabel("Significado", { exact: true })
      .fill("Registros exclusivos do runner de fixture");
    await table.getByLabel("Colunas que identificam um registro", { exact: true }).fill("id");
    for (const [index, name] of ["id", "marker", "revision"].entries()) {
      await form.getByRole("button", { name: "Adicionar coluna", exact: true }).click();
      const column = form.locator(".row").nth(index + 1);
      await column
        .getByRole("combobox", { name: "Tabela", exact: true })
        .selectOption("publication_orders");
      await column.getByLabel("Coluna", { exact: true }).fill(name);
      await column.getByLabel("Significado", { exact: true }).fill(`Campo sintético ${name}`);
    }
    await form
      .getByLabel("Regras de negócio (uma por linha)", { exact: true })
      .fill("Não extrapolar os registros sintéticos");
    await form
      .getByLabel("Exemplo de SQL", { exact: true })
      .fill("SELECT p.id FROM publication_orders p WHERE p.id > 0 ORDER BY p.id");
    const saveDraft = page.waitForResponse(
      (r) => r.url().endsWith("/skills") && r.request().method() === "POST",
    );
    await form.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
    expect((await saveDraft).status()).toBe(201);
    const panel = page.getByRole("region", { name: "Casos e relatórios da consulta", exact: true });
    await panel.getByRole("button", { name: "Adicionar caso de consulta", exact: true }).click();
    const test = panel.getByRole("form", { name: "Caso de consulta", exact: true });
    const caseName = `Caso obrigatório ${dialect}`;
    await test.getByLabel("Nome do caso de consulta", { exact: true }).fill(caseName);
    await expect(test.getByLabel("Caso obrigatório", { exact: true })).toBeChecked();
    await test.getByRole("button", { name: "Adicionar semente", exact: true }).click();
    const seed = test.getByRole("group", { name: "Semente 1", exact: true }).last();
    await seed
      .getByRole("button", { name: "Adicionar registro em Semente 1", exact: true })
      .click();
    const row = seed.getByRole("group", { name: "Registro 1", exact: true });
    await scalar(row, "id", "integer", "10");
    await scalar(row, "marker", "string", "caso-sintetico");
    await scalar(row, "revision", "integer", "1");
    await test.getByRole("button", { name: "Adicionar coluna esperada", exact: true }).click();
    await test.getByLabel("Coluna esperada", { exact: true }).fill("id");
    await test
      .getByRole("combobox", { name: "Tipo esperado", exact: true })
      .selectOption("integer");
    const expected = test.getByRole("group", { name: "Resultado esperado", exact: true }).last();
    await expected
      .getByRole("button", { name: "Adicionar registro em Resultado esperado", exact: true })
      .click();
    await scalar(
      expected.getByRole("group", { name: "Registro 1", exact: true }),
      "id",
      "integer",
      "10",
    );
    await test.getByRole("button", { name: "Salvar caso de consulta", exact: true }).click();
    await expect(panel.getByRole("status")).toContainText("Caso salvo.");
    await panel.getByRole("button", { name: "Consultar testes da consulta", exact: true }).click();
    await expect(panel).toContainText("Sem aprovação técnica obrigatória atual comprovada.");
    const reviewDate = page.getByLabel("Prazo de revisão da publicação", { exact: true });
    await reviewDate.fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
    const preview = page.getByRole("button", { name: "Revisar publicação", exact: true });
    const refused = page.waitForResponse(
      (r) => r.url().endsWith("/preview") && r.request().method() === "POST",
    );
    await preview.click();
    expect((await refused).status()).not.toBe(200);
    await input.run({
      personaId: await page.getByRole("combobox", { name: "Persona", exact: true }).inputValue(),
      skillId: await page
        .getByRole("combobox", { name: "Editar treinamento", exact: true })
        .inputValue(),
      sourceId,
      dialect,
    });
    await panel.getByRole("button", { name: "Consultar testes da consulta", exact: true }).click();
    await expect(panel).toContainText(
      "Relatório técnico obrigatório atual aprovado; revisão semântica permanece separada.",
    );
    await preview.click();
    await page
      .getByLabel("Revisei o SQL, a estrutura e as regras deste pacote.", { exact: true })
      .check();
    await page.getByRole("button", { name: "Confirmar publicação", exact: true }).click();
    await expect(
      page.getByText("Treinamento publicado. Libere seu uso em um token.", { exact: true }),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Consultar testes da consulta", exact: true }).click();
    await panel.getByRole("button", { name: `Editar caso ${caseName}`, exact: true }).click();
    await test.getByLabel("Nome do caso de consulta", { exact: true }).fill(`${caseName} revisado`);
    await test.getByRole("button", { name: "Salvar caso de consulta", exact: true }).click();
    await expect(panel.getByRole("status")).toContainText("Caso salvo.");
    await panel.getByRole("button", { name: "Consultar testes da consulta", exact: true }).click();
    await expect(panel).toContainText("Sem aprovação técnica obrigatória atual comprovada.");
    await expect(panel).toContainText("conteúdo diferente ou não comprovado");
  }
}
