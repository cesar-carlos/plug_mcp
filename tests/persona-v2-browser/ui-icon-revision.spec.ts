import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { operationTraining } from "../helpers/persona-v2-operation.js";
import { queryTraining, trainingSource } from "../helpers/persona-v2-training.js";
import { federationTraining } from "../helpers/persona-v2-federation.js";
import { federationPublicationCaseSchema } from "../../src/domain/persona-v2/federation-training.js";
import { operationCaseSchema } from "../../src/application/persona-v2/operation-cases.js";

async function fixture(page: Page, failLoad = false) {
  let revision = 1;
  let hasIcon = true;
  const sent: number[] = [];
  const state = {
    failLoad,
    holdSave: undefined as Promise<void> | undefined,
    reads: 0,
    changeRemotely: () => {
      revision += 1;
      hasIcon = true;
    },
  };
  await page.route("**/brand/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path.endsWith("/login"))
      json = { csrfToken: "fixture", expiresAt: new Date(Date.now() + 3600000).toISOString() };
    else if (path === "/api/admin/personas")
      json = {
        personas: [
          {
            id: "icon-fixture",
            name: "Icon",
            specialty: "Test",
            instructions: "",
            active: true,
            authorizationVersion: 1,
          },
        ],
      };
    else if (path.endsWith("/icone")) {
      if (route.request().method() === "GET") state.reads += 1;
      if (state.failLoad && route.request().method() === "GET") {
        await route.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", message: "Não foi possível ler o ícone." } },
        });
        return;
      }
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as {
          expectedRevision: number;
          image: string | null;
        };
        sent.push(body.expectedRevision);
        await state.holdSave;
        if (body.expectedRevision !== revision) {
          await route.fulfill({
            status: 409,
            json: {
              error: {
                code: "OPERATION_CONFLICT",
                message: "Cadastro mudou; recarregue antes de salvar.",
              },
            },
          });
          return;
        }
        revision += 1;
        hasIcon = body.image !== null;
      }
      json = { revision, hasIcon };
    } else if (path.endsWith("/fontes")) json = { fontes: [] };
    else if (path.endsWith("/skills")) json = { skills: [] };
    else if (path.endsWith("/catalogos")) json = { catalogs: [] };
    else if (path.endsWith("/progresso"))
      json = { steps: [], checkedAt: new Date().toISOString(), currentAvailabilityVerified: false };
    await route.fulfill({ json });
  });
  await page.goto("/app");
  await page.getByLabel("E-mail", { exact: true }).fill("icon@fixture.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("combobox", { name: /^Persona/ }).selectOption("icon-fixture");
  await page.getByRole("link", { name: "Visão geral", exact: true }).click();
  await page.getByText("Editar persona", { exact: true }).click();
  const panel = page.getByRole("region", { name: "Ícone da persona" });
  return { panel, state, sent };
}

test("edição da persona associa recusa ao campo sem perder texto e limpa erro após salvar", async ({
  page,
}) => {
  await fixture(page);
  let attempts = 0;
  await page.route("**/api/admin/personas/icon-fixture/editar", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 400,
        json: {
          error: {
            code: "INCOMPLETE_INPUT",
            message: "Revise o cadastro.",
            fields: ["specialty"],
          },
        },
      });
      return;
    }
    const input = route.request().postDataJSON();
    await route.fulfill({
      json: {
        persona: {
          id: "icon-fixture",
          name: input.name,
          specialty: input.specialty,
          instructions: input.instructions,
          active: true,
          authorizationVersion: 2,
        },
      },
    });
  });
  const form = page.getByRole("form", { name: "Editar persona", exact: true });
  const name = form.getByLabel("Nome", { exact: true });
  const specialty = form.getByLabel("Especialidade", { exact: true });
  await name.fill("Nome preservado");
  await specialty.fill("Especialidade em revisão");
  await form.getByRole("button", { name: "Salvar persona", exact: true }).click();
  await expect(specialty).toBeFocused();
  await expect(specialty).toHaveAttribute("aria-invalid", "true");
  await expect(specialty).toHaveAccessibleDescription("Revise a especialidade e salve novamente.");
  await expect(name).toHaveValue("Nome preservado");
  await expect(specialty).toHaveValue("Especialidade em revisão");
  await name.focus();
  await page.getByText("Editar persona", { exact: true }).click();
  await expect(specialty).not.toBeVisible();
  await page.getByRole("button", { name: "Confira Especialidade", exact: true }).click();
  await expect(specialty).toBeFocused();
  await specialty.fill("Especialidade corrigida");
  await form.getByRole("button", { name: "Salvar persona", exact: true }).click();
  await expect(specialty).not.toHaveAttribute("aria-invalid", "true");
  await expect(specialty).not.toHaveAttribute("aria-describedby");
  await expect(name).toHaveValue("Nome preservado");
  await expect(specialty).toHaveValue("Especialidade corrigida");
  expect(attempts).toBe(2);
});

for (const chooseVersion of [false, true]) {
  test(`dataset editorial SQL preserva caso e aprovação (${chooseVersion ? "outra versão e recuperação" : "versão original"})`, async ({
    page,
  }) => {
    await fixture(page);
    const operationId = "55555555-5555-4555-8555-555555555555";
    const queryId = "66666666-6666-4666-8666-666666666666";
    const ref = { id: "77777777-7777-4777-8777-777777777777", version: 1, hash: "a".repeat(64) };
    const origin = {
      format: "operation-dataset-case-origin-v1",
      querySkillId: queryId,
      queryRevision: 1,
      catalogId: ref.id,
      sourceId: trainingSource.id,
      sourceVersion: 1,
      dialect: "postgres",
      template: ref,
      dataset: ref,
      sourceSeedsHash: ref.hash,
      caseSeedsHash: ref.hash,
      modified: false,
    };
    const fixtures = [
      { table: "orders", generated: [], rows: [{ amount: { type: "decimal", value: "17.25" } }] },
    ];
    const alternate = { ...ref, version: 2, hash: "b".repeat(64) };
    let expectedOrigin = origin;
    let listCalls = 0;
    let alternateCalls = 0;
    await page.route(`**/skills/${queryId}/datasets-caso`, async (route) => {
      listCalls++;
      if (listCalls === 1) {
        await route.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", message: "Lista temporariamente indisponível." } },
        });
        return;
      }
      const body = route.request().postDataJSON();
      expect(body.expectedRevision).toBe(1);
      const more = !!body.after;
      if (more) expect(body.after).toEqual({ id: ref.id, version: 1 });
      await route.fulfill({
        json: {
          revision: 1,
          sourceId: trainingSource.id,
          catalogId: ref.id,
          template: ref,
          datasets: [
            {
              ...(more ? alternate : ref),
              name: more ? "Dataset alternativo" : "Dataset original",
            },
          ],
          nextCursor: more ? null : { id: ref.id, version: 1 },
        },
      });
    });
    let saves = 0;
    await page.route("**/api/admin/personas/icon-fixture/fontes", (route) =>
      route.fulfill({ json: { fontes: [{ ...trainingSource, personaId: "icon-fixture" }] } }),
    );
    await page.route("**/api/admin/personas/icon-fixture/skills", (route) =>
      route.fulfill({
        json: {
          skills: [
            {
              id: operationId,
              personaId: "icon-fixture",
              kind: "operacao_sql",
              slug: "editorial-operation",
              name: "Operação editorial",
              revision: 1,
              training: operationTraining(),
              activePublicationId: null,
            },
            {
              id: queryId,
              personaId: "icon-fixture",
              kind: "consulta",
              slug: "editorial-query",
              name: "Consulta editorial",
              revision: 1,
              training: queryTraining(),
              activePublicationId: null,
            },
          ],
        },
      }),
    );
    await page.route(`**/skills/${operationId}/testes-operacao`, (route) =>
      route.fulfill({
        json: { revision: 1, cases: [], reports: [], requiredApproved: false, nextCursor: null },
      }),
    );
    await page.route(`**/skills/${operationId}/publicacao`, (route) =>
      route.fulfill({ json: { publication: null } }),
    );
    await page.route(`**/skills/${operationId}/sementes-dataset-operacao`, async (route) => {
      const chosen = route.request().postDataJSON().dataset;
      if (chosen) {
        expect(chosen).toEqual(alternate);
        alternateCalls++;
        if (alternateCalls === 1) {
          await route.fulfill({
            status: 503,
            json: {
              error: { code: "UNAVAILABLE", message: "Sementes temporariamente indisponíveis." },
            },
          });
          return;
        }
      }
      const material = chosen ? alternate : ref;
      await route.fulfill({
        json: {
          revision: 1,
          sourceId: trainingSource.id,
          catalogId: ref.id,
          template: ref,
          dataset: { ...material, name: "Dataset revisado" },
          fixtures,
          origin: { ...origin, dataset: material },
          executable: false,
          technicalApproval: false,
        },
      });
    });
    await page.route(`**/skills/${operationId}/casos-operacao`, async (route) => {
      saves++;
      const body = route.request().postDataJSON();
      expect(body.content.editorialOrigin).toEqual(expectedOrigin);
      expect(body.content.input.fixtures).toEqual(fixtures);
      expect(body.content.expected).toEqual({ error: "INVALID_PLAN" });
      await route.fulfill({ json: { revision: 2 } });
    });
    await page.getByRole("combobox", { name: /^Persona/ }).selectOption("");
    await page.getByRole("combobox", { name: /^Persona/ }).selectOption("icon-fixture");
    await page.getByRole("link", { name: "Treinamentos", exact: true }).click();
    const editor = page.getByRole("region", { name: "Treinamento de operação SQL", exact: true });
    await editor
      .getByRole("combobox", { name: "Editar operação SQL", exact: true })
      .selectOption(operationId);
    await editor.getByRole("button", { name: "Adicionar caso SQL" }).click();
    const form = editor.getByRole("form", { name: "Editor de caso SQL" });
    await form.getByLabel("Nome do caso SQL", { exact: true }).fill("Caso preservado");
    await form
      .getByRole("combobox", { name: "Resultado esperado", exact: true })
      .selectOption("INVALID_PLAN");
    await form.getByText("Usar dataset editorial nas sementes", { exact: true }).click();
    await form.getByRole("button", { name: "Listar consultas da mesma fonte" }).click();
    await form.getByLabel("Consulta de origem do dataset").selectOption(queryId);
    await form.getByRole("button", { name: "Preparar sementes da consulta" }).click();
    await expect(form.getByText(/Dataset revisado · versão 1/)).toBeVisible();
    if (chooseVersion) {
      await form.getByRole("button", { name: "Escolher outra versão de dataset" }).click();
      await expect(form.getByRole("alert")).toContainText("Lista temporariamente indisponível");
      await expect(
        form.getByRole("button", { name: "Substituir sementes pelo dataset" }),
      ).toHaveCount(0);
      await expect(form.getByLabel("Nome do caso SQL", { exact: true })).toHaveValue(
        "Caso preservado",
      );
      await form.getByRole("button", { name: "Escolher outra versão de dataset" }).click();
      await form.getByRole("button", { name: "Carregar mais versões de dataset" }).click();
      await form
        .getByRole("combobox", { name: "Dataset para as sementes SQL", exact: true })
        .selectOption(`${ref.id}:2`);
      await form.getByRole("button", { name: "Preparar sementes da versão escolhida" }).click();
      await expect(form.getByRole("alert")).toContainText("Sementes temporariamente indisponíveis");
      await expect(
        form.getByRole("button", { name: "Substituir sementes pelo dataset" }),
      ).toHaveCount(0);
      expect(alternateCalls).toBe(1);
      await form.getByRole("button", { name: "Preparar sementes da versão escolhida" }).click();
      await expect(form.getByText(/Dataset revisado · versão 2/)).toBeVisible();
      expectedOrigin = { ...origin, dataset: alternate };
    }
    expect(saves).toBe(0);
    await form.getByRole("button", { name: "Substituir sementes pelo dataset" }).click();
    await expect(form.getByLabel("Nome do caso SQL", { exact: true })).toHaveValue(
      "Caso preservado",
    );
    await expect(
      form.getByRole("combobox", { name: "Resultado esperado", exact: true }),
    ).toHaveValue("INVALID_PLAN");
    expect(saves).toBe(0);
    await form.getByRole("button", { name: "Salvar caso SQL", exact: true }).click();
    await expect.poll(() => saves).toBe(1);
  });
}

test("dataset direto dispensa consulta, pagina biblioteca e preserva caso após falha de versão", async ({
  page,
}) => {
  await fixture(page);
  const operationId = "55555555-5555-4555-8555-555555555555";
  const catalogId = "66666666-6666-4666-8666-666666666666";
  const datasetId = "77777777-7777-4777-8777-777777777777";
  const template = { id: "88888888-8888-4888-8888-888888888888", version: 1, hash: "a".repeat(64) };
  const dataset = { id: datasetId, version: 1, hash: "b".repeat(64) };
  const origin = {
    format: "operation-direct-dataset-case-origin-v1",
    catalogId,
    sourceId: trainingSource.id,
    sourceVersion: 1,
    dialect: "postgres",
    template,
    dataset,
    sourceSeedsHash: "c".repeat(64),
    caseSeedsHash: "c".repeat(64),
    modified: false,
  };
  const fixtures = [
    { table: "orders", generated: [], rows: [{ amount: { type: "decimal", value: "17.25" } }] },
  ];
  let saves = 0,
    reads = 0,
    prepares = 0;
  let expectedOrigin: unknown = origin;
  let expectedFixtures = fixtures;
  await page.route("**/api/admin/personas/icon-fixture/fontes", (route) =>
    route.fulfill({ json: { fontes: [{ ...trainingSource, personaId: "icon-fixture" }] } }),
  );
  await page.route("**/api/admin/personas/icon-fixture/skills", (route) =>
    route.fulfill({
      json: {
        skills: [
          {
            id: operationId,
            personaId: "icon-fixture",
            kind: "operacao_sql",
            slug: "direct-operation",
            name: "Operação direta",
            revision: 1,
            training: operationTraining(),
            activePublicationId: null,
          },
        ],
      },
    }),
  );
  await page.route(`**/skills/${operationId}/testes-operacao`, (route) =>
    route.fulfill({
      json: { revision: 1, cases: [], reports: [], requiredApproved: false, nextCursor: null },
    }),
  );
  await page.route(`**/skills/${operationId}/publicacao`, (route) =>
    route.fulfill({ json: { publication: null } }),
  );
  await page.route("**/api/admin/catalogos", (route) =>
    route.fulfill({
      json: { catalogs: [{ id: catalogId, name: "Catálogo sintético", role: "contributor" }] },
    }),
  );
  await page.route(`**/api/admin/catalogos/${catalogId}/biblioteca*`, (route) => {
    const more = new URL(route.request().url()).searchParams.has("beforeId");
    return route.fulfill({
      json: {
        items: [
          more
            ? { ...dataset, version: 2, name: "Dataset direto", kind: "dataset" }
            : { ...template, name: "Template", kind: "template" },
        ],
        nextCursor: more ? null : template.id,
      },
    });
  });
  await page.route(
    `**/api/admin/catalogos/${catalogId}/biblioteca/${datasetId}?*`,
    async (route) => {
      reads++;
      if (reads === 1) {
        await route.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", message: "Versão temporariamente indisponível." } },
        });
        return;
      }
      const chosenVersion = Number(new URL(route.request().url()).searchParams.get("version"));
      expect([1, 2]).toContain(chosenVersion);
      await route.fulfill({
        json: { ...dataset, version: chosenVersion, name: "Dataset direto", kind: "dataset" },
      });
    },
  );
  await page.route(`**/skills/${operationId}/sementes-dataset-operacao-direto`, async (route) => {
    prepares++;
    expect(route.request().postDataJSON()).toEqual({ expectedRevision: 1, catalogId, dataset });
    await route.fulfill({
      json: {
        revision: 1,
        sourceId: trainingSource.id,
        catalogId,
        template,
        dataset: { ...dataset, name: "Dataset direto" },
        fixtures,
        origin,
        executable: false,
        technicalApproval: false,
      },
    });
  });
  await page.route(`**/skills/${operationId}/casos-operacao`, async (route) => {
    const body = route.request().postDataJSON() as { content: unknown; expectedRevision: number };
    const content = operationCaseSchema.parse(body.content);
    expect(body.expectedRevision).toBe(1);
    expect(content.editorialOrigin).toEqual(expectedOrigin);
    expect(content.input.fixtures).toEqual(expectedFixtures);
    expect(content.input.parameters).toEqual({
      id: { type: "integer", value: "1" },
      version: { type: "integer", value: "2" },
      amount: { type: "decimal", value: "42.50" },
    });
    expect(content.expected).toEqual({ error: "INVALID_PLAN" });
    expect(content.name).toBe("Caso direto preservado");
    saves++;
    await route.fulfill({ json: { revision: 2 } });
  });
  await page.getByRole("combobox", { name: /^Persona/ }).selectOption("");
  await page.getByRole("combobox", { name: /^Persona/ }).selectOption("icon-fixture");
  await page.getByRole("link", { name: "Treinamentos", exact: true }).click();
  const editor = page.getByRole("region", { name: "Treinamento de operação SQL", exact: true });
  await editor
    .getByRole("combobox", { name: "Editar operação SQL", exact: true })
    .selectOption(operationId);
  await editor.getByRole("button", { name: "Adicionar caso SQL" }).click();
  const form = editor.getByRole("form", { name: "Editor de caso SQL" });
  await form.getByLabel("Nome do caso SQL", { exact: true }).fill("Caso direto preservado");
  await form.getByLabel("Parâmetro id (integer)", { exact: true }).fill("1");
  await form.getByLabel("Parâmetro version (integer)", { exact: true }).fill("2");
  await form.getByLabel("Parâmetro amount (decimal)", { exact: true }).fill("42.50");
  await form
    .getByRole("combobox", { name: "Resultado esperado", exact: true })
    .selectOption("INVALID_PLAN");
  await form.getByText("Importar sementes diretamente da biblioteca", { exact: true }).click();
  await form.getByRole("button", { name: "Listar catálogos editoriais" }).click();
  await form
    .getByRole("combobox", { name: "Catálogo do dataset", exact: true })
    .selectOption(catalogId);
  await form.getByRole("button", { name: "Listar datasets da biblioteca" }).click();
  await expect(form.getByRole("alert")).toContainText("Nenhum dataset nesta página");
  await form.getByRole("button", { name: "Carregar mais itens da biblioteca" }).click();
  await form
    .getByRole("combobox", { name: "Dataset da biblioteca", exact: true })
    .selectOption(datasetId);
  await expect(form.getByLabel("Versão do dataset", { exact: true })).toHaveValue("2");
  await form.getByLabel("Versão do dataset", { exact: true }).fill("1");
  await form.getByRole("button", { name: "Preparar sementes da biblioteca" }).click();
  await expect(form.getByRole("alert")).toContainText("Versão temporariamente indisponível");
  expect(prepares).toBe(0);
  expect(saves).toBe(0);
  await expect(form.getByLabel("Nome do caso SQL", { exact: true })).toHaveValue(
    "Caso direto preservado",
  );
  await form.getByRole("button", { name: "Preparar sementes da biblioteca" }).click();
  await expect(form.getByText(/Dataset direto · versão 1 · 1 tabelas/)).toBeVisible();
  await form.getByLabel("Versão do dataset", { exact: true }).fill("2");
  await expect(
    form.getByRole("button", { name: "Substituir sementes pelo dataset da biblioteca" }),
  ).toHaveCount(0);
  await form.getByLabel("Versão do dataset", { exact: true }).fill("1");
  await form.getByRole("button", { name: "Preparar sementes da biblioteca" }).click();
  await form
    .getByRole("button", { name: "Substituir sementes pelo dataset da biblioteca" })
    .click();
  expect(saves).toBe(0);
  await page.route(`**/skills/${operationId}/compor-sementes-datasets`, async (route) => {
    const materials = [1, 2].map((version) => ({ catalogId, dataset: { ...dataset, version } }));
    expect(route.request().postDataJSON()).toEqual({ expectedRevision: 1, materials });
    expectedOrigin = {
      format: "operation-dataset-composition-v1",
      sourceId: trainingSource.id,
      sourceVersion: 1,
      dialect: "postgres",
      materials: materials.map((item) => ({
        ...item,
        template,
        sourceSeedsHash: origin.sourceSeedsHash,
      })),
      sourceSeedsHash: origin.sourceSeedsHash,
      caseSeedsHash: origin.caseSeedsHash,
      modified: false,
    };
    expectedFixtures = [
      {
        ...fixtures[0]!,
        rows: [...fixtures[0]!.rows, { amount: { type: "decimal", value: "8.50" } }],
      },
    ];
    await route.fulfill({
      json: {
        revision: 1,
        sourceId: trainingSource.id,
        origin: expectedOrigin,
        fixtures: expectedFixtures,
        executable: false,
        technicalApproval: false,
      },
    });
  });
  await form.getByRole("button", { name: "Adicionar versão à combinação" }).click();
  await form.getByLabel("Versão do dataset", { exact: true }).fill("2");
  await form.getByRole("button", { name: "Adicionar versão à combinação" }).click();
  await form.getByRole("button", { name: "Adicionar versão à combinação" }).click();
  await expect(form.getByRole("alert")).toContainText("já está na combinação");
  await form.getByRole("button", { name: "Preparar combinação de datasets" }).click();
  await expect(form.getByText(/Combinação de 2 dataset/)).toBeVisible();
  expect(saves).toBe(0);
  await form
    .getByRole("button", { name: "Substituir sementes pelo dataset da biblioteca" })
    .click();
  await form.getByRole("button", { name: "Salvar caso SQL", exact: true }).click();
  await expect.poll(() => saves).toBe(1);
});

test("datasets de cruzamento preenchem bases separadas sem alterar SQL ou resultado", async ({
  page,
}) => {
  await fixture(page);
  const sourceIds = [trainingSource.id, "99999999-9999-4999-8999-999999999999"];
  const queryIds = ["55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666"];
  const publicationIds = [
    "77777777-7777-4777-8777-777777777777",
    "88888888-8888-4888-8888-888888888888",
  ];
  const crossId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const dependencies = sourceIds.map((id, i) => ({ id, publicationId: publicationIds[i]! }));
  const origins: unknown[] = [];
  const directRef = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    version: 1,
    hash: "a".repeat(64),
  };
  await page.route("**/api/admin/catalogos", (route) =>
    route.fulfill({
      json: { catalogs: [{ id: directRef.id, name: "Biblioteca direta", role: "contributor" }] },
    }),
  );
  await page.route(`**/catalogos/${directRef.id}/biblioteca`, (route) =>
    route.fulfill({
      json: {
        items: [{ ...directRef, name: "Dataset direto", kind: "dataset" }],
        nextCursor: null,
      },
    }),
  );
  await page.route(`**/catalogos/${directRef.id}/biblioteca/${directRef.id}?version=1`, (route) =>
    route.fulfill({ json: { ...directRef, name: "Dataset direto", kind: "dataset" } }),
  );
  await page.route(`**/skills/${crossId}/compor-sementes-datasets`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      expectedRevision: 1,
      publicationId: publicationIds[0],
      materials: [{ catalogId: directRef.id, dataset: directRef }],
    });
    const origin = {
      format: "federation-source-dataset-composition-v1",
      sourceId: sourceIds[0],
      sourceVersion: 1,
      dialect: "postgres",
      publicationId: publicationIds[0],
      publicationHash: "b".repeat(64),
      materials: [
        {
          catalogId: directRef.id,
          dataset: directRef,
          template: directRef,
          sourceSeedsHash: directRef.hash,
        },
      ],
      sourceSeedsHash: directRef.hash,
      caseSeedsHash: directRef.hash,
      modified: false,
    };
    origins[0] = origin;
    await route.fulfill({
      json: {
        revision: 1,
        sourceId: sourceIds[0],
        origin,
        fixtures: [
          {
            table: "orders",
            generated: [],
            rows: [{ amount: { type: "decimal", value: "10.25" } }],
          },
        ],
        executable: false,
        technicalApproval: false,
      },
    });
  });
  let saves = 0;
  await page.route("**/api/admin/personas/icon-fixture/fontes", (route) =>
    route.fulfill({
      json: {
        fontes: sourceIds.map((id, index) => ({
          ...trainingSource,
          id,
          name: `Base ${index}`,
          personaId: "icon-fixture",
        })),
      },
    }),
  );
  await page.route("**/api/admin/personas/icon-fixture/skills", (route) =>
    route.fulfill({
      json: {
        skills: [
          {
            id: crossId,
            personaId: "icon-fixture",
            kind: "cruzamento",
            slug: "cross",
            name: "Cruzamento editorial",
            revision: 1,
            training: federationTraining(dependencies),
            activePublicationId: null,
          },
          ...queryIds.map((id, index) => ({
            id,
            personaId: "icon-fixture",
            kind: "consulta",
            slug: `query-${index}`,
            name: `Consulta ${index}`,
            revision: 1,
            training: queryTraining(sourceIds[index]),
            activePublicationId: publicationIds[index],
          })),
        ],
      },
    }),
  );
  for (let index = 0; index < 2; index++) {
    await page.route(`**/skills/${queryIds[index]}/publicacao`, (route) =>
      route.fulfill({
        json: {
          publication: {
            id: publicationIds[index],
            skillId: queryIds[index],
            revision: 1,
            suspendedAt: null,
            package: {
              format: "persona-query-v2",
              requiredCapabilities: [],
              name: `Consulta ${index}`,
              sourceId: sourceIds[index],
              training: queryTraining(sourceIds[index]),
            },
          },
        },
      }),
    );
  }
  await page.route(`**/skills/${crossId}/publicacao`, (route) =>
    route.fulfill({ json: { publication: null } }),
  );
  await page.route(`**/skills/${crossId}/testes-cruzamento`, (route) =>
    route.fulfill({
      json: { revision: 1, cases: [], reports: [], requiredApproved: false, nextCursor: null },
    }),
  );
  await page.route(`**/skills/${crossId}/sementes-dataset-cruzamento`, async (route) => {
    const body = route.request().postDataJSON();
    const index = publicationIds.indexOf(body.publicationId);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(body.querySkillId).toBe(queryIds[index]);
    const reference = { id: queryIds[index]!, version: 1, hash: "a".repeat(64) };
    const origin = {
      format: "federation-source-dataset-v1",
      publicationId: publicationIds[index],
      publicationHash: "b".repeat(64),
      querySkillId: queryIds[index],
      queryRevision: 1,
      catalogId: reference.id,
      sourceId: sourceIds[index],
      sourceVersion: 1,
      dialect: "postgres",
      template: reference,
      dataset: reference,
      sourceSeedsHash: reference.hash,
      caseSeedsHash: reference.hash,
      modified: false,
    };
    origins[index] = origin;
    await route.fulfill({
      json: {
        revision: 1,
        sourceId: sourceIds[index],
        catalogId: reference.id,
        template: reference,
        dataset: { ...reference, name: `Dataset ${index}` },
        origin,
        fixtures: [
          {
            table: "orders",
            generated: [],
            rows: [{ amount: { type: "decimal", value: index === 0 ? "10.25" : "20.50" } }],
          },
        ],
        executable: false,
        technicalApproval: false,
      },
    });
  });
  await page.route(`**/skills/${crossId}/casos-cruzamento`, async (route) => {
    saves++;
    const body = route.request().postDataJSON();
    const content = federationPublicationCaseSchema.parse(body.content);
    expect(content.editorialOrigin).toEqual({
      format: "federation-dataset-case-origin-v1",
      sources: origins,
    });
    expect(content.input.sources.map((source) => source.sourceId)).toEqual(sourceIds);
    expect(
      content.input.sources.map((source) => source.fixtures[0]!.rows[0]!.amount!.value),
    ).toEqual(["10.25", "20.50"]);
    expect(body.content.expected).toEqual({ errorCode: "INVALID_PLAN" });
    await route.fulfill({ json: { revision: 2 } });
  });
  await page.getByRole("combobox", { name: /^Persona/ }).selectOption("");
  await page.getByRole("combobox", { name: /^Persona/ }).selectOption("icon-fixture");
  await page.getByRole("link", { name: "Treinamentos", exact: true }).click();
  const editor = page.getByRole("region", { name: "Treinamento de cruzamento", exact: true });
  await editor
    .getByRole("combobox", { name: "Editar cruzamento", exact: true })
    .selectOption(crossId);
  await editor.getByRole("button", { name: "Adicionar caso de cruzamento", exact: true }).click();
  const form = editor.getByRole("form", { name: "Editor de caso de cruzamento" });
  await form.getByLabel("Nome do caso de cruzamento", { exact: true }).fill("Caso de duas bases");
  for (const step of ["a", "b"])
    await form
      .getByLabel(`SQL sintético de ${step}`, { exact: true })
      .fill("SELECT id, amount FROM orders");
  await form
    .getByRole("combobox", { name: "Resultado esperado do cruzamento", exact: true })
    .selectOption("INVALID_PLAN");
  for (let index = 0; index < 2; index++) {
    const group = form.getByRole("group", { name: `Sementes da base Base ${index}`, exact: true });
    await group
      .getByRole("combobox", { name: "Consulta publicada de origem do dataset", exact: true })
      .selectOption(publicationIds[index]!);
    if (index === 0) {
      await group.getByText("Importar sementes diretamente da biblioteca", { exact: true }).click();
      await group.getByRole("button", { name: "Listar catálogos editoriais" }).click();
      await group
        .getByRole("combobox", { name: "Catálogo do dataset", exact: true })
        .selectOption(directRef.id);
      await group.getByRole("button", { name: "Listar datasets da biblioteca" }).click();
      await group
        .getByRole("combobox", { name: "Dataset da biblioteca", exact: true })
        .selectOption(directRef.id);
      await group.getByRole("button", { name: "Preparar sementes da biblioteca" }).click();
      await group
        .getByRole("button", { name: "Substituir sementes pelo dataset da biblioteca" })
        .click();
      continue;
    }
    await group.getByText("Usar dataset editorial nas sementes", { exact: true }).click();
    await group.getByRole("button", { name: "Listar consultas da mesma fonte" }).click();
    await group
      .getByRole("combobox", { name: "Consulta de origem do dataset", exact: true })
      .selectOption(queryIds[index]!);
    await group.getByRole("button", { name: "Preparar sementes da consulta" }).click();
    expect(saves).toBe(0);
    await group.getByRole("button", { name: "Substituir sementes pelo dataset" }).click();
  }
  await expect(form.getByLabel("SQL sintético de a", { exact: true })).toHaveValue(
    "SELECT id, amount FROM orders",
  );
  expect(saves).toBe(0);
  await form.getByRole("button", { name: "Salvar caso de cruzamento", exact: true }).click();
  await expect.poll(() => saves).toBe(1);
});

test("organização prioriza roteiro, recolhe edição e preserva descarte pelo menu", async ({
  page,
}) => {
  const { panel } = await fixture(page);
  await page.getByText("Editar persona", { exact: true }).click();
  await expect(panel).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Suspender persona", exact: true }),
  ).not.toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Áreas do console" });
  await expect(navigation.locator(".navigation-group")).toHaveCount(5);
  await expect(navigation.getByRole("link", { name: "Visão geral", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.evaluate("window.scrollTo(0, 0)");
  await page.screenshot({ path: "test-results/organized-overview-desktop.png", fullPage: true });
  await page.getByText("Editar persona", { exact: true }).click();
  await panel.getByRole("button", { name: "Usar ícone padrão" }).click();
  await navigation.getByRole("link", { name: "Bases", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Continuar editando/ })
    .click();
  await expect(panel.getByRole("status")).toHaveText("Alteração ainda não salva.");
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await expect(menu).toContainText("Visão geral");
  await menu.click();
  await expect(navigation.getByRole("link", { name: "Bases", exact: true })).toBeVisible();
  await menu.click();
  await page.getByText("Editar persona", { exact: true }).click();
  await page.evaluate("window.scrollTo(0, 0)");
  await page.screenshot({ path: "test-results/organized-overview-mobile.png", fullPage: true });
});

test("mascotes carregam sob demanda, preparam retrato e oferecem pacote sem instalar conexão", async ({
  page,
}, testInfo) => {
  const assets: string[] = [];
  page.on("request", (req) => {
    if (/spritesheet|\.zip/.test(req.url())) assets.push(req.url());
  });
  const { panel, sent } = await fixture(page);
  expect(assets).toEqual([]);
  await panel.getByRole("button", { name: "Escolher um mascote" }).click();
  const gallery = panel.getByRole("region", { name: "Mascotes para ChatGPT" });
  const cat = gallery.getByRole("article", { name: "Marmalade" });
  await expect(cat).toBeVisible();
  await cat.getByRole("button", { name: "Ver animação" }).click();
  await expect(cat.getByRole("img", { name: "Prévia animada de Marmalade" })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate<string>(
      "getComputedStyle(document.querySelector('.mascot-animation')).animationName",
    ),
  ).toBe("none");
  await cat.getByRole("button", { name: "Pausar prévia" }).click();
  await cat.getByRole("button", { name: "Usar retrato de Marmalade" }).click();
  await expect(panel.locator(".icon-preview")).toHaveAttribute("src", /^blob:/);
  expect(sent).toEqual([]);
  await panel.getByRole("button", { name: "Salvar ícone", exact: true }).click();
  await expect(panel.locator(".icon-preview")).toHaveAttribute("src", /icon\?v=2$/);
  expect(sent).toEqual([1]);
  await gallery.getByText("Usar no ChatGPT ou Codex", { exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await gallery.getByRole("link", { name: "Baixar Marmalade (ZIP v2)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("marmalade-pet-v2.zip");
  const output = testInfo.outputPath("marmalade.zip");
  await download.saveAs(output);
  const zip = await readFile(output);
  expect(zip.subarray(0, 2).toString()).toBe("PK");
  expect(zip.length).toBeGreaterThan(1_000_000);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
  ).toBe(true);
  await gallery.screenshot({ path: testInfo.outputPath("mascots-mobile.png") });
});

test("falha ao buscar retrato mantém a escolha anterior e downloads também aparecem na conexão", async ({
  page,
}) => {
  const { panel, sent } = await fixture(page);
  await panel.getByRole("button", { name: "Usar ícone padrão" }).click();
  await panel.getByRole("button", { name: "Escolher um mascote" }).click();
  const cat = panel.getByRole("article", { name: "Marmalade" });
  const src = await cat.getByRole("img", { name: "Marmalade", exact: true }).getAttribute("src");
  await page.route(new URL(src!, page.url()).href, (route) => route.fulfill({ status: 503 }));
  await cat.getByRole("button", { name: "Usar retrato de Marmalade" }).click();
  await expect(panel.getByRole("alert")).toContainText("Sua escolha anterior foi preservada");
  await expect(panel.locator(".icon-preview")).toHaveAttribute("src", "/brand/icon-192.png");
  await panel.getByRole("button", { name: "Salvar ícone", exact: true }).click();
  await expect(panel.locator(".icon-preview")).toHaveAttribute("src", "/brand/icon-192.png");
  await expect(panel.getByRole("status")).toHaveText("Ícone padrão salvo.");
  expect(sent).toEqual([1]);
  await page.getByRole("link", { name: "Tokens e conexões", exact: true }).click();
  await page.getByRole("tab", { name: "Conectar no ChatGPT", exact: true }).click();
  const connection = page.getByRole("tabpanel", { name: "Conexão ChatGPT", exact: true });
  await connection.getByText("Ícone, mascotes e Dots", { exact: true }).click();
  await connection.getByRole("button", { name: "Ver mascotes para download" }).click();
  await connection.getByText("Usar no ChatGPT ou Codex", { exact: true }).click();
  await expect(connection.getByRole("link", { name: "Baixar Voltcoin (ZIP v2)" })).toBeVisible();
  await expect(connection.getByRole("button", { name: /Usar retrato/ })).toHaveCount(0);
});

test("ícone removido conserva revisão no console e recriação usa a revisão atual", async ({
  page,
}) => {
  const { panel, sent } = await fixture(page);
  await expect(panel.locator("img")).toHaveAttribute("src", /icon\?v=1$/);
  await page.screenshot({ path: "test-results/icon-ux-overview.png", fullPage: true });
  await panel.getByRole("button", { name: "Usar ícone padrão" }).click();
  await panel.getByRole("button", { name: "Salvar ícone" }).click();
  await expect(panel.getByRole("button", { name: "Salvar ícone" })).toBeDisabled();
  await expect(panel.locator("img")).toHaveAttribute("src", "/brand/icon-192.png");
  await expect(panel.getByText("Ícone padrão salvo.", { exact: true })).toBeVisible();
  await expect(panel.getByLabel("Imagem PNG, JPEG ou WebP")).toBeEnabled();
  await panel.getByLabel("Imagem PNG, JPEG ou WebP").setInputFiles({
    name: "icon.png",
    mimeType: "image/png",
    buffer: Buffer.from("synthetic-ui-image"),
  });
  await panel.getByRole("button", { name: "Salvar ícone" }).click();
  await expect(panel.locator("img")).toHaveAttribute("src", /icon\?v=3$/);
  expect(sent).toEqual([1, 2]);
});

test("resumo mostra somente ícone salvo e descarte restaura a prévia sem requisição", async ({
  page,
}) => {
  const { panel, sent, state } = await fixture(page);
  const avatar = page.getByRole("img", { name: "Ícone salvo de Icon", exact: true });
  await expect(avatar).toHaveAttribute("src", /icon\?v=1$/);
  await page.getByText("Editar persona", { exact: true }).click();
  await expect(avatar).toBeVisible();
  await page.getByText("Editar persona", { exact: true }).click();
  await panel.getByRole("button", { name: "Usar ícone padrão" }).click();
  await expect(panel.locator(".icon-preview")).toHaveAttribute("src", "/brand/icon-192.png");
  await expect(avatar).toHaveAttribute("src", /icon\?v=1$/);
  const reads = state.reads;
  await panel.getByRole("button", { name: "Descartar alterações do ícone" }).click();
  await expect(panel.locator(".icon-preview")).toHaveAttribute("src", /icon\?v=1$/);
  await expect(panel.getByLabel("Imagem PNG, JPEG ou WebP")).toBeFocused();
  expect(sent).toEqual([]);
  expect(state.reads).toBe(reads);
  await page.getByRole("link", { name: "Bases", exact: true }).click();
  await expect(page).toHaveURL(/#\/sources$/);
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("conflito conserva arquivo, impede reenvio e permite releitura explícita sem salvar", async ({
  page,
}) => {
  const { panel, state, sent } = await fixture(page);
  await panel.getByLabel("Imagem PNG, JPEG ou WebP").setInputFiles({
    name: "local.png",
    mimeType: "image/png",
    buffer: Buffer.from("local-image"),
  });
  const preview = await panel.locator(".icon-preview").getAttribute("src");
  state.changeRemotely();
  await panel.getByRole("button", { name: "Salvar ícone", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("outra aba ou sessão");
  await expect(panel.getByRole("button", { name: "Salvar ícone", exact: true })).toBeDisabled();
  await panel.locator("form").dispatchEvent("submit");
  expect(sent).toEqual([1]);
  state.failLoad = true;
  await panel
    .getByRole("button", { name: "Conferir versão salva sem perder minha escolha" })
    .click();
  await expect(panel.getByRole("alert")).toContainText("Não foi possível");
  await expect(panel.getByRole("button", { name: "Salvar ícone", exact: true })).toBeDisabled();
  state.failLoad = false;
  await panel
    .getByRole("button", { name: "Conferir versão salva sem perder minha escolha" })
    .click();
  await expect(panel.getByRole("button", { name: "Salvar ícone", exact: true })).toBeEnabled();
  await expect(panel.locator(".icon-preview")).toHaveAttribute("src", preview!);
  await expect(page.getByRole("img", { name: "Ícone salvo de Icon", exact: true })).toHaveAttribute(
    "src",
    /icon\?v=2$/,
  );
  expect(sent).toEqual([1]);
  await panel.getByRole("button", { name: "Salvar ícone", exact: true }).click();
  await expect(page.getByRole("img", { name: "Ícone salvo de Icon", exact: true })).toHaveAttribute(
    "src",
    /icon\?v=3$/,
  );
  expect(sent).toEqual([1, 2]);
});

test("galeria informa seleção, baixa PNG e mantém teclado, contraste e reflow ampliado", async ({
  page,
}, testInfo) => {
  const { panel } = await fixture(page);
  const trigger = panel.getByRole("button", { name: "Escolher um mascote" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const gallery = panel.getByRole("region", { name: "Mascotes para ChatGPT" });
  const cat = gallery.getByRole("article", { name: "Marmalade" });
  const choose = cat.getByRole("button", { name: "Usar retrato de Marmalade" });
  await choose.focus();
  await page.keyboard.press("Space");
  await expect(choose).toHaveAttribute("aria-pressed", "true");
  await expect(cat.getByText("Selecionado para salvar", { exact: true })).toBeVisible();
  await expect(gallery.getByRole("link", { name: "Baixar Marmalade (ZIP v2)" })).not.toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  const pngLink = cat.getByRole("link", { name: "Baixar retrato de Marmalade (PNG)" });
  await pngLink.focus();
  await page.keyboard.press("Enter");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("marmalade.png");
  const output = testInfo.outputPath("marmalade.png");
  await download.saveAs(output);
  expect((await readFile(output)).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  await choose.focus();
  await expect(choose).toBeFocused();
  const colors = await page.evaluate<{ fg: string; bg: string; outline: string }>(
    "(() => { const s = getComputedStyle(document.activeElement); return {fg:s.color,bg:s.backgroundColor,outline:s.outlineStyle}; })()",
  );
  const luminance = (color: string) => {
    const rgb = color
      .match(/\d+/g)!
      .slice(0, 3)
      .map((n) => {
        const x = Number(n) / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
    return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
  };
  const values = [luminance(colors.fg), luminance(colors.bg)].sort((a, b) => a - b);
  expect((values[1]! + 0.05) / (values[0]! + 0.05)).toBeGreaterThanOrEqual(4.5);
  expect(colors.outline).not.toBe("none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await cat.getByRole("button", { name: "Ver animação" }).click();
  expect(
    await page.evaluate<string>(
      "getComputedStyle(document.querySelector('.mascot-animation')).animationName",
    ),
  ).toBe("none");
  await page.setViewportSize({ width: 640, height: 900 });
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  expect(
    await page.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
  ).toBe(true);
  await gallery.screenshot({ path: testInfo.outputPath("mascots-zoom.png") });
  await panel.getByRole("button", { name: "Descartar alterações do ícone" }).click();
  await expect(choose).toHaveAttribute("aria-pressed", "false");
});

test("ícone permite recuperar leitura, preserva escolha válida e bloqueia salvamento duplicado", async ({
  page,
}) => {
  const { panel, state, sent } = await fixture(page, true);
  const input = panel.getByLabel("Imagem PNG, JPEG ou WebP");
  await expect(input).toBeDisabled();
  await expect(panel.getByRole("alert")).toContainText("Não foi possível");
  state.failLoad = false;
  await panel.getByRole("button", { name: "Tentar carregar ícone novamente" }).click();
  await expect(input).toBeEnabled();
  await input.setInputFiles({
    name: "valid.png",
    mimeType: "image/png",
    buffer: Buffer.from("synthetic"),
  });
  const preview = await panel.locator("img").getAttribute("src");
  await input.setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("invalid"),
  });
  await expect(panel.locator("img")).toHaveAttribute("src", preview!);
  await expect(panel.getByRole("alert")).toContainText("Escolha PNG");
  let release!: () => void;
  state.holdSave = new Promise<void>((resolve) => {
    release = resolve;
  });
  await panel.getByRole("button", { name: "Salvar ícone" }).click();
  await expect(panel.getByRole("status")).toHaveText("Salvando ícone…");
  await expect(input).toBeDisabled();
  // A second submit event must not dispatch another POST, even before the first returns.
  await panel.locator("form").dispatchEvent("submit");
  release();
  await expect(panel.getByRole("status")).toHaveText("Ícone atualizado.");
  expect(sent).toEqual([1]);
  await expect(input).toHaveValue("");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth"),
  ).toBe(true);
  await page.screenshot({ path: "test-results/icon-ux-mobile.png", fullPage: true });
});
