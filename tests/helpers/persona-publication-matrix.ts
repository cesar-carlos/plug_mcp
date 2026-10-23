import { expect } from "vitest";
import { fixtureTablesSchema } from "../../src/domain/persona-v2/publication-fixture.js";
import type { Source } from "../../src/domain/persona-v2/model.js";
import type { TypedScalar } from "../../src/domain/persona-v2/operation.js";
import { effectTables } from "./persona-publication-effects.js";

const auditColumns = [
  { name: "id", type: "integer" },
  { name: "marker", type: "string", nullable: true },
  { name: "revision", type: "integer" },
];
export const matrixTables = fixtureTablesSchema.parse([
  {
    table: "publication_types",
    primaryKey: ["id"],
    uniqueKeys: [["code"]],
    columns: [
      { name: "id", type: "integer" },
      { name: "code", type: "string" },
      { name: "amount", type: "decimal" },
      { name: "day", type: "date" },
      { name: "enabled", type: "boolean" },
      { name: "reference", type: "uuid" },
      { name: "note", type: "string", nullable: true },
    ],
  },
  {
    table: "publication_parent",
    primaryKey: ["tenant_id", "id"],
    columns: [
      { name: "tenant_id", type: "integer" },
      { name: "id", type: "integer" },
    ],
  },
  {
    table: "publication_child",
    primaryKey: ["id"],
    columns: [
      { name: "id", type: "integer" },
      { name: "tenant_id", type: "integer" },
      { name: "parent_id", type: "integer" },
    ],
    foreignKeys: [
      {
        columns: ["tenant_id", "parent_id"],
        targetTable: "publication_parent",
        targetColumns: ["tenant_id", "id"],
      },
    ],
  },
  { table: "publication_trigger_log", primaryKey: ["id"], columns: auditColumns },
  {
    table: "publication_trigger_source",
    primaryKey: ["id"],
    columns: auditColumns,
    insertAudit: { targetTable: "publication_trigger_log" },
  },
  ...effectTables,
]);

type Row = Record<string, TypedScalar>;
const integer = (value: string): TypedScalar => ({ type: "integer", value });
const text = (value: string): TypedScalar => ({ type: "string", value });
const nil: TypedScalar = { type: "null", value: null };

export async function exercisePublicationMatrix(context: {
  phase: "types" | "trigger" | "constraints" | "unique-types";
  source: Source;
  tables: typeof matrixTables;
  post: (
    path: string,
    body: object,
  ) => Promise<{ status: number; body: { skill?: { id: string }; [key: string]: unknown } }>;
  run: (
    id: string,
  ) => Promise<{ approved: boolean; results: readonly { id: string; passed: boolean }[] }>;
  publish: (id: string) => Promise<unknown>;
}): Promise<void> {
  const { source, tables, post, run, publish } = context;
  const root = `/api/admin/personas/${source.personaId}/skills`;
  const seeds = (rows: Record<string, Row[]>) =>
    tables.map((t) => ({ table: t.table, rows: rows[t.table] ?? [] }));
  const typed: Row = {
    id: integer("9007199254740993"),
    code: text("ação 漢字"),
    amount: { type: "decimal", value: "12345678901234567890.12345678" },
    day: { type: "date", value: "2024-02-29" },
    enabled: { type: "boolean", value: true },
    reference: { type: "uuid", value: "12345678-1234-4234-8234-123456789abc" },
    note: nil,
  };
  const typeTable = tables.find((t) => t.table === "publication_types")!;
  if (context.phase === "types") {
    const query = await post(root, {
      slug: `matrix-types-${source.dialect}`,
      name: "Tipos exatos na cadeia",
      kind: "consulta",
      training: {
        sourceId: source.id,
        dialect: source.dialect,
        purpose: "Verificar tipos sem aproximação",
        sqlModel:
          'SELECT CAST(p."id" AS VARCHAR(32)) AS "id", p."code" AS "code", CAST(p."amount" AS VARCHAR(64)) AS "amount", p."day" AS "day", p."enabled" AS "enabled", CAST(p."reference" AS VARCHAR(36)) AS "reference", p."note" AS "note" FROM publication_types p WHERE p."id" <> 0 ORDER BY p."id"',
        tables: [{ name: typeTable.table, meaning: "Fixture de tipos", grain: ["id"] }],
        columns: typeTable.columns.map((c) => ({
          table: typeTable.table,
          name: c.name,
          meaning: c.name,
          classification: "livre",
        })),
        parameters: [],
        relationships: [],
        rules: ["Não converter valores exatos para number"],
      },
    });
    expect(query.status, JSON.stringify(query.body)).toBe(201);
    const second: Row = {
      ...typed,
      id: integer("-9007199254740993"),
      code: text(""),
      amount: { type: "decimal", value: "-0.00000001" },
      enabled: { type: "boolean", value: false },
      day: { type: "date", value: "2000-01-01" },
      note: text("null ≠ vazio"),
    };
    expect(
      (
        await post(`${root}/${query.body.skill!.id}/casos`, {
          required: true,
          content: {
            name: "BIGINT decimal date boolean UUID Unicode e null",
            input: { params: {}, fixtures: seeds({ publication_types: [typed, second] }) },
            expected: {
              columns: typeTable.columns.map(({ name, type }) => ({ name, type })),
              rows: [second, typed],
              ordered: true,
            },
          },
        })
      ).status,
    ).toBe(201);
    expect((await run(query.body.skill!.id)).approved).toBe(true);
    await publish(query.body.skill!.id);
    return;
  }

  const tableTraining = tables.map((t) => ({
    name: t.table,
    meaning: "Fixture privada",
    identity: t.primaryKey,
    uniqueKeys: t.uniqueKeys,
    concurrency: [],
    columns: t.columns.map((c) => ({
      name: c.name,
      type: c.type,
      writable: true,
      meaning: c.name,
    })),
  }));
  const createOperation = async (label: string, steps: object[], parameters: object[]) => {
    const result = await post(root, {
      slug: `matrix-${label}-${source.dialect}`,
      name: label,
      kind: "operacao_sql",
      training: {
        sourceId: source.id,
        dialect: source.dialect,
        purpose: "Matriz transacional isolada",
        mode: "somente_parametros",
        approval: "human",
        maxAffectedRows: steps.length,
        timeoutMs: 30000,
        tables: tableTraining,
        parameters,
        steps,
        rules: ["Rollback completo obrigatório"],
        indirectEffects:
          "publication_trigger_source copia a linha inserida para publication_trigger_log; contagem direta não inclui esse efeito.",
        reconciliation: "Não repetir resultado incerto",
      },
    });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return result.body.skill!.id;
  };
  const insert = (id: string, table: string, fields: string[]) => ({
    id,
    effect: "insert",
    table,
    values: fields.map((column) => ({ column, binding: { kind: "input", name: column } })),
    where: [],
    outputs: [],
    rows: { min: 1, max: 1 },
  });
  const audit: Row = { id: integer("10"), marker: text("trigger ação"), revision: integer("1") };
  const auditParameters = [
    { name: "id", type: "integer", nullable: false, meaning: "ID" },
    { name: "marker", type: "string", nullable: true, meaning: "Marca" },
    { name: "revision", type: "integer", nullable: false, meaning: "Versão" },
  ];
  if (context.phase === "trigger") {
    const triggerId = await createOperation(
      "trigger",
      [insert("audit", "publication_trigger_source", ["id", "marker", "revision"])],
      auditParameters,
    );
    for (const duplicate of [false, true]) {
      const initial = seeds({ publication_trigger_log: duplicate ? [audit] : [] });
      const expected = duplicate
        ? { error: "NATIVE_FAILURE" }
        : {
            affectedRows: 1,
            tables: seeds({
              publication_trigger_source: [audit],
              publication_trigger_log: [audit],
            }),
          };
      expect(
        (
          await post(`${root}/${triggerId}/casos`, {
            required: true,
            content: {
              name: duplicate
                ? "Trigger falha: rollback fonte e destino"
                : "Trigger gera efeito indireto",
              input: { parameters: audit, fixtures: initial },
              expected,
            },
          })
        ).status,
      ).toBe(201);
    }
    expect((await run(triggerId)).approved).toBe(true);
    await publish(triggerId);
    return;
  }

  if (context.phase === "constraints") {
    const constraintId = await createOperation(
      "constraints",
      [
        insert("audit", "publication_trigger_source", ["id", "marker", "revision"]),
        insert("child", "publication_child", ["id", "tenant_id", "parent_id"]),
      ],
      [
        ...auditParameters,
        ...["tenant_id", "parent_id"].map((name) => ({
          name,
          type: "integer",
          nullable: false,
          meaning: name,
        })),
      ],
    );
    for (const kind of ["valid", "fk", "pk"] as const) {
      const child: Row = { id: integer("10"), tenant_id: integer("1"), parent_id: integer("7") };
      const initial = seeds({
        publication_parent: [{ tenant_id: integer(kind === "fk" ? "2" : "1"), id: integer("7") }],
        publication_child: kind === "pk" ? [child] : [],
      });
      const expected =
        kind !== "valid"
          ? { error: "NATIVE_FAILURE" }
          : {
              affectedRows: 2,
              tables: seeds({
                publication_parent: [{ tenant_id: integer("1"), id: integer("7") }],
                publication_child: [child],
                publication_trigger_source: [audit],
                publication_trigger_log: [audit],
              }),
            };
      expect(
        (
          await post(`${root}/${constraintId}/casos`, {
            required: true,
            content: {
              name: `Constraint composta ${kind}`,
              input: { parameters: { ...audit, ...child }, fixtures: initial },
              expected,
            },
          })
        ).status,
      ).toBe(201);
    }
    expect((await run(constraintId)).approved).toBe(true);
    await publish(constraintId);
    return;
  }

  const uniqueId = await createOperation(
    "unique-types",
    [
      insert(
        "types",
        typeTable.table,
        typeTable.columns.map((c) => c.name),
      ),
    ],
    typeTable.columns.map((c) => ({
      name: c.name,
      type: c.type,
      nullable: c.nullable || c.name === "code",
      meaning: c.name,
    })),
  );
  for (const kind of ["valid", "unique", "pk", "not-null"] as const) {
    const existing = { ...typed, id: integer(kind === "pk" ? "9007199254740993" : "20") };
    expect(
      (
        await post(`${root}/${uniqueId}/casos`, {
          required: true,
          content: {
            name: `Tipos e unicidade ${kind}`,
            input: {
              parameters: kind === "not-null" ? { ...typed, code: nil } : typed,
              fixtures: seeds({
                publication_types: kind === "valid" || kind === "not-null" ? [] : [existing],
              }),
            },
            expected:
              kind === "valid"
                ? { affectedRows: 1, tables: seeds({ publication_types: [typed] }) }
                : { error: "NATIVE_FAILURE" },
          },
        })
      ).status,
    ).toBe(201);
  }
  expect((await run(uniqueId)).approved).toBe(true);
  await publish(uniqueId);
}
