import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import type { Source } from "../../src/domain/persona-v2/model.js";
import type { CryptoPort } from "../../src/domain/ports/crypto.port.js";
import type {
  PersonaRepositoryPort,
  SqlOperationGatewayPort,
} from "../../src/domain/ports/persona-v2.port.js";
import type { SourceQueryGatewayPort } from "../../src/domain/ports/source-query.port.js";
import {
  fixtureSeedsSchema,
  fixtureTablesSchema,
} from "../../src/domain/persona-v2/publication-fixture.js";
import { BridgePublicationCaseExecutor } from "../../src/infrastructure/plug-server/bridge-publication-cases.js";
import { LocalPublicationFixtureControl } from "../../src/infrastructure/persistence/persona-v2/publication-fixture-control.js";
import { runFederationPublicationCases } from "../../src/application/persona-v2/federation-publication-cases.js";
import type { FederationPlan } from "../../src/domain/persona-v2/federation.js";
import { executePublicationManifest } from "../../src/infrastructure/persistence/persona-v2/run-publication-cases.js";
import type { loadConfig } from "../../src/config/env.js";
import { operationTrainingSchema } from "../../src/domain/persona-v2/operation-training.js";
import { matrixTables } from "./persona-publication-matrix.js";
import { createDatasetPublicationQuery } from "./persona-publication-dataset.js";
import { queryTrainingSchema } from "../../src/application/persona-v2/query-training.js";

export const publicationTables = fixtureTablesSchema.parse([
  ...["publication_orders", "publication_audit"].map((table) => ({
    table,
    columns: [
      { name: "id", type: "integer" },
      { name: "marker", type: "string", nullable: true },
      { name: "revision", type: "integer" },
    ],
    primaryKey: ["id"],
    uniqueKeys: [],
  })),
  {
    table: "publication_ledger",
    columns: [{ name: "operation_id", type: "uuid" }],
    primaryKey: ["operation_id"],
    uniqueKeys: [],
  },
  ...matrixTables,
]);

export async function exerciseGenericPublication(context: {
  source: Source;
  sessionRoot: string;
  runId: string;
  repository: PersonaRepositoryPort;
  crypto: CryptoPort;
  reads: SourceQueryGatewayPort;
  operations: SqlOperationGatewayPort;
  post: (
    path: string,
    body: object,
  ) => Promise<{ status: number; body: { skill?: { id: string }; [key: string]: unknown } }>;
  publish: (skill: string) => Promise<unknown>;
  hubUrl: string;
  runnerConfig: ReturnType<typeof loadConfig>;
}): Promise<{
  source: Source;
  publicationId: string;
  queryId: string;
  executor: BridgePublicationCaseExecutor;
  run: (id: string) => ReturnType<typeof executePublicationManifest>;
}> {
  const { source, sessionRoot, runId, repository, reads, operations, post, publish } = context;
  const observations: unknown[] = [];
  const observedReads: SourceQueryGatewayPort = {
    authorize: async (...args) => {
      const lease = await reads.authorize(...args);
      return {
        revalidate: () => lease.revalidate(),
        execute: async (...args) => {
          const result = await lease.execute(...args);
          observations.push({
            columns: result.columns,
            rowCount: result.rows.length,
            truncated: result.truncated,
          });
          return result;
        },
      };
    },
  };
  const observedOperations: SqlOperationGatewayPort = {
    verifyCapabilitiesAndPolicy: (...args) => operations.verifyCapabilitiesAndPolicy(...args),
    execute: async (...args) => {
      const result = await operations.execute(...args);
      observations.push(result);
      return result;
    },
    get: (...args) => operations.get(...args),
    cancel: (...args) => operations.cancel(...args),
  };
  const executor = new BridgePublicationCaseExecutor(
    source,
    publicationTables,
    new LocalPublicationFixtureControl(sessionRoot),
    observedReads,
    observedOperations,
    { runId, agentId: source.agentId, identityHash: source.identityHash! },
  );
  const integer = (value: string) => ({ type: "integer", value });
  const row = {
    id: integer("10"),
    marker: { type: "string", value: "ação" },
    revision: integer("1"),
  };
  let fixtures = fixtureSeedsSchema.parse([
    { table: "publication_orders", rows: [row] },
    { table: "publication_audit", rows: [] },
    { table: "publication_ledger", rows: [] },
    ...matrixTables.map((t) => ({ table: t.table, rows: [] })),
  ]);
  const root = `/api/admin/personas/${source.personaId}/skills`;
  const editorialTraining = queryTrainingSchema.parse({
    sourceId: source.id,
    dialect: source.dialect,
    purpose: "Publicação genérica na fixture",
    sqlModel:
      'SELECT p.id AS "id", p.marker AS "marker", p.revision AS "revision" FROM publication_orders p WHERE p.id > :minimum ORDER BY p.id',
    tables: [{ name: "publication_orders", meaning: "Pedidos privados", grain: ["id"] }],
    columns: ["id", "marker", "revision"].map((name) => ({
      table: "publication_orders",
      name,
      meaning: name,
      classification: "livre",
    })),
    relationships: [],
    rules: ["Fixture descartável"],
    parameters: [{ name: "minimum", type: "integer", required: true, meaning: "ID mínimo" }],
  });
  const {
    queryId,
    fixtures: datasetFixtures,
    origin: datasetOrigin,
  } = await createDatasetPublicationQuery(
    root,
    source.authorizationVersion,
    editorialTraining,
    post,
  );
  expect(datasetFixtures[0]!.rows).toEqual([row]);
  fixtures = [...datasetFixtures, ...fixtures.slice(1)];
  for (const minimum of [0, 100]) {
    const added = await post(`${root}/${queryId}/casos`, {
      required: true,
      content: {
        name: `Filtro ${minimum}`,
        editorialOrigin: datasetOrigin,
        input: { params: { minimum }, fixtures },
        expected: {
          columns: publicationTables[0]!.columns.map(({ name, type }) => ({ name, type })),
          rows: minimum === 0 ? [row] : [],
          ordered: true,
        },
      },
    });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(added.body).toMatchObject({
      case: {
        content: {
          editorialOrigin: {
            ...datasetOrigin,
            modified: fixtures.length !== datasetFixtures.length,
            caseSeedsHash: expect.any(String),
          },
        },
      },
    });
  }
  expect(
    (
      await post(`${root}/${queryId}/casos`, {
        required: true,
        content: {
          name: "SQL adaptado com projeção menor",
          input: {
            sql: 'SELECT p.id AS "id" FROM publication_orders p WHERE p.id > :minimum ORDER BY p.id',
            params: { minimum: 0 },
            fixtures,
          },
          expected: {
            columns: [{ name: "id", type: "integer" }],
            rows: [{ id: integer("10") }],
            ordered: true,
          },
        },
      })
    ).status,
  ).toBe(201);
  expect((await post(`${root}/${queryId}/preview`, {})).status).not.toBe(200);
  const operatorManifest = join(sessionRoot, `publication-${source.dialect}.json`);
  const runByManifest = async (skillId: string) => {
    await writeFile(
      operatorManifest,
      JSON.stringify({
        version: 1,
        runId,
        sessionRoot,
        hubUrl: context.hubUrl,
        personaId: source.personaId,
        skillId,
        bindings: [{ sourceId: source.id, fixtureSourceId: source.id, tables: publicationTables }],
      }),
    );
    return executePublicationManifest(operatorManifest, context.runnerConfig, {
      reads: observedReads,
      operations: observedOperations,
    });
  };
  expect((await runByManifest(queryId)).approved).toBe(true);
  await publish(queryId);
  const publicationId = await repository.transaction(
    { personaIds: [source.personaId], tokenIds: [] },
    async (tx) => (await tx.catalog.find(source.personaId, queryId))!.activePublicationId!,
  );

  const operation = await post(root, {
    slug: `generic-write-${source.dialect}`,
    name: "Operação em duas tabelas",
    kind: "operacao_sql",
    training: {
      sourceId: source.id,
      dialect: source.dialect,
      purpose: "Alterar pedido e inserir auditoria atomicamente",
      mode: "somente_parametros",
      approval: "human",
      maxAffectedRows: 2,
      timeoutMs: 30000,
      parameters: [
        { name: "id", type: "integer", nullable: false, meaning: "Pedido" },
        { name: "expected_revision", type: "integer", nullable: false, meaning: "Versão esperada" },
        { name: "revision", type: "integer", nullable: false, meaning: "Nova versão" },
        { name: "marker", type: "string", nullable: true, meaning: "Marca opcional" },
      ],
      tables: publicationTables.map((table) => ({
        name: table.table,
        meaning: "Fixture privada",
        identity: table.primaryKey,
        concurrency: table.columns.some((c) => c.name === "revision") ? ["revision"] : [],
        uniqueKeys: [],
        columns: table.columns.map((c) => ({
          name: c.name,
          type: c.type,
          writable: true,
          meaning: c.name,
        })),
      })),
      steps: [
        {
          id: "audit",
          effect: "insert",
          table: "publication_audit",
          values: ["id", "marker", "revision"].map((column) => ({
            column,
            binding: { kind: "input", name: column },
          })),
          where: [],
          outputs: [],
          rows: { min: 1, max: 1 },
        },
        {
          id: "change",
          effect: "update",
          table: "publication_orders",
          values: ["revision", "marker"].map((column) => ({
            column,
            binding: { kind: "input", name: column },
          })),
          where: [
            { column: "id", binding: { kind: "input", name: "id" } },
            { column: "revision", binding: { kind: "input", name: "expected_revision" } },
          ],
          outputs: [],
          rows: { min: 1, max: 1 },
        },
      ],
      rules: ["Versão obrigatória"],
      indirectEffects: "Sem triggers/cascatas",
      reconciliation: "Não repetir resultado desconhecido",
    },
  });
  expect(operation.status, JSON.stringify(operation.body)).toBe(201);
  const operationId = operation.body.skill!.id;
  for (const stale of [false, true]) {
    const updated = {
      id: integer("10"),
      revision: integer("2"),
      marker: { type: "null", value: null },
    };
    const added = await post(`${root}/${operationId}/casos`, {
      required: true,
      content: {
        name: stale ? "Rollback de ambas tabelas" : "Atualização e auditoria",
        input: {
          parameters: { ...updated, expected_revision: integer(stale ? "5" : "1") },
          fixtures,
        },
        expected: stale
          ? { error: "ROW_CONDITION_FAILED" }
          : {
              affectedRows: 2,
              tables: publicationTables.map((t) => ({
                table: t.table,
                rows: ["publication_orders", "publication_audit"].includes(t.table)
                  ? [updated]
                  : [],
              })),
            },
      },
    });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
  }
  const report = await runByManifest(operationId);
  expect(report.approved, JSON.stringify({ results: report.results, observations })).toBe(true);
  await publish(operationId);
  const originalTraining = await repository.transaction(
    { personaIds: [source.personaId], tokenIds: [] },
    async (tx) =>
      operationTrainingSchema.parse(
        (await tx.catalog.find(source.personaId, operationId))!.training,
      ),
  );
  const q = (column: string) => (source.dialect === "postgres" ? `"${column}"` : `[${column}]`);
  const adaptiveSql = `UPDATE ${q("publication_orders")} SET ${q("marker")} = :v_marker, ${q("revision")} = :v_revision WHERE ${q("revision")} = :w_revision AND ${q("id")} = :w_id`;
  const updated = {
    id: integer("10"),
    revision: integer("2"),
    marker: { type: "null", value: null },
  };
  const parameters = { ...updated, expected_revision: integer("1") };
  const adaptive = await post(root, {
    slug: `generic-adaptive-${source.dialect}`,
    name: "SQL adaptável em fixture",
    kind: "operacao_sql",
    training: { ...originalTraining, mode: "sql_adaptavel" },
  });
  expect(adaptive.status, JSON.stringify(adaptive.body)).toBe(201);
  for (const accepted of [true, false]) {
    expect(
      (
        await post(`${root}/${adaptive.body.skill!.id}/casos`, {
          required: true,
          content: {
            name: accepted ? "Adaptação aceita" : "SQL fora do contrato",
            input: {
              parameters,
              fixtures,
              sqlByStep: {
                change: accepted ? adaptiveSql : `${adaptiveSql}; DELETE FROM publication_orders`,
              },
            },
            expected: accepted
              ? {
                  affectedRows: 2,
                  tables: publicationTables.map((t) => ({
                    table: t.table,
                    rows: ["publication_orders", "publication_audit"].includes(t.table)
                      ? [updated]
                      : [],
                  })),
                }
              : { error: "INVALID_PLAN" },
          },
        })
      ).status,
    ).toBe(201);
  }
  expect((await runByManifest(adaptive.body.skill!.id)).approved).toBe(true);
  await publish(adaptive.body.skill!.id);
  const alias = randomUUID();
  const reconciled = await post(root, {
    slug: `generic-reconciled-${source.dialect}`,
    name: "Marcador com identidade nova por rodada",
    kind: "operacao_sql",
    training: {
      ...originalTraining,
      maxAffectedRows: 3,
      steps: [
        ...originalTraining.steps,
        {
          id: "mark",
          effect: "insert",
          table: "publication_ledger",
          values: [{ column: "operation_id", binding: { kind: "operation_id" } }],
          where: [],
          outputs: [],
          rows: { min: 1, max: 1 },
        },
      ],
      reconciliationQuery: {
        table: "publication_ledger",
        operationIdColumn: "operation_id",
        appendOnlyGuarantee: "PK UUID exclusiva na fixture; não reusar receipts.",
      },
    },
  });
  expect(reconciled.status, JSON.stringify(reconciled.body)).toBe(201);
  expect(
    (
      await post(`${root}/${reconciled.body.skill!.id}/casos`, {
        required: true,
        content: {
          name: "Marcador simbólico materializado por rodada",
          input: { parameters, fixtures, operationId: alias },
          expected: {
            affectedRows: 3,
            tables: publicationTables.map((t) => ({
              table: t.table,
              rows:
                t.table === "publication_ledger"
                  ? [{ operation_id: { type: "uuid", value: alias } }]
                  : ["publication_orders", "publication_audit"].includes(t.table)
                    ? [updated]
                    : [],
            })),
          },
        },
      })
    ).status,
  ).toBe(201);
  expect((await runByManifest(reconciled.body.skill!.id)).approved).toBe(true);
  expect((await runByManifest(reconciled.body.skill!.id)).approved).toBe(true);
  await publish(reconciled.body.skill!.id);
  return { source, publicationId, queryId, executor, run: runByManifest };
}

export async function exerciseGenericFederationPublication(context: {
  selected: readonly Awaited<ReturnType<typeof exerciseGenericPublication>>[];
  repository: PersonaRepositoryPort;
  crypto: CryptoPort;
  post: (
    path: string,
    body: object,
  ) => Promise<{ status: number; body: { skill?: { id: string }; [key: string]: unknown } }>;
  publish: (id: string) => Promise<unknown>;
  verifyEvidence: (id: string) => Promise<void>;
}): Promise<void> {
  const { selected, repository, crypto, post, publish } = context;
  const personaId = selected[0]!.source.personaId;
  const root = `/api/admin/personas/${personaId}/skills`;
  const locals = selected.map((s, i) => ({
    kind: "local" as const,
    id: i === 0 ? "a" : "b",
    sourceId: s.source.id,
    publicationId: s.publicationId,
    columns: ["id", "marker"],
  }));
  const joined = {
    kind: "join" as const,
    id: "combined",
    left: "a",
    right: "b",
    join: "left" as const,
    keys: [{ left: "id", right: "id" }],
    cardinality: "one_to_one" as const,
    columns: [
      { side: "left" as const, column: "id", as: "id" },
      { side: "left" as const, column: "marker", as: "marker_a" },
      { side: "right" as const, column: "marker", as: "marker_b" },
    ],
  };
  const created = await post(root, {
    slug: `generic-cross-${selected[1]!.source.dialect}`,
    name: "Cruzamento em fixtures privadas",
    kind: "cruzamento",
    training: {
      purpose: "Cruzar marcas sintéticas sem inventar ausências",
      semantics: {
        matching: "Igualdade exata do ID",
        normalization: "Inteiro nativo nos dois motores",
        missing: "Preservar null",
        duplicates: "Um registro por ID",
        units: "Sem medidas",
        currency: "Não aplicável",
        calendar: "Não aplicável",
      },
      steps: [...locals, joined],
      output: "combined",
      budget: { rowsPerSource: 3 },
    },
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const skillId = created.body.skill!.id;
  const plan: FederationPlan = {
    publicationId: randomUUID(),
    output: "combined",
    page: 1,
    pageSize: 10,
    steps: [
      ...locals.map((l) => ({
        kind: l.kind,
        id: l.id,
        sourceId: l.sourceId,
        publicationId: l.publicationId,
        sql: 'SELECT p.id AS "id", p.marker AS "marker" FROM publication_orders p WHERE p.id > :minimum ORDER BY p.id',
        params: { minimum: 0 },
      })),
      joined,
    ],
  };
  const integer = (value: number) => ({ type: "integer", value: String(value) });
  const marker = (value: string | null) =>
    value === null ? { type: "null", value: null } : { type: "string", value };
  for (const kind of ["match", "empty", "budget"] as const) {
    const ids = kind === "empty" ? [] : kind === "budget" ? [10, 20, 30, 40] : [10, 20];
    const content = {
      name: `Cruzamento ${kind}`,
      input: {
        plan,
        sources: selected.map((s, i) => ({
          sourceId: s.source.id,
          fixtures: publicationTables.map((t, index) => ({
            table: t.table,
            rows:
              index === 0
                ? ids
                    .filter((id) => i === 0 || id === 10)
                    .map((id) => ({
                      id: integer(id),
                      revision: integer(1),
                      marker: marker(i === 0 ? "ação" : null),
                    }))
                : [],
          })),
        })),
      },
      expected:
        kind === "budget"
          ? { errorCode: "BUDGET_EXCEEDED" }
          : {
              columns: [
                { name: "id", type: "integer" },
                { name: "marker_a", type: "string" },
                { name: "marker_b", type: "string" },
              ],
              rows: ids.map((id) => ({
                id: integer(id),
                marker_a: marker("ação"),
                marker_b: marker(null),
              })),
              ordered: false,
              totalRows: ids.length,
            },
    };
    expect((await post(`${root}/${skillId}/casos`, { required: true, content })).status).toBe(201);
  }
  expect((await post(`${root}/${skillId}/preview`, {})).status).not.toBe(200);
  const report = await runFederationPublicationCases(
    repository,
    personaId,
    skillId,
    crypto,
    new Map(selected.map((s) => [s.source.id, s.executor])),
  );
  expect(report.approved, JSON.stringify(report)).toBe(true);
  await context.verifyEvidence(skillId);
  await publish(skillId);
}
