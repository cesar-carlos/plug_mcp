import { expect } from "vitest";
import {
  fixtureTablesSchema,
  type PublicationFixtureTable,
} from "../../src/domain/persona-v2/publication-fixture.js";
import type { Source } from "../../src/domain/persona-v2/model.js";
import type { TypedScalar } from "../../src/domain/persona-v2/operation.js";

const auditColumns = [
  { name: "id", type: "integer" },
  { name: "marker", type: "string", nullable: true },
  { name: "revision", type: "integer" },
];
export const effectTables = fixtureTablesSchema.parse([
  {
    table: "publication_checked",
    primaryKey: ["id"],
    columns: [
      { name: "id", type: "integer" },
      { name: "score", type: "integer", nullable: true },
    ],
    checks: [{ kind: "integer_range", column: "score", min: "0", max: "10" }],
  },
  {
    table: "publication_cascade_parent",
    primaryKey: ["tenant_id", "id"],
    columns: [
      { name: "tenant_id", type: "integer" },
      { name: "id", type: "integer" },
    ],
  },
  {
    table: "publication_cascade_child",
    primaryKey: ["id"],
    columns: [
      { name: "id", type: "integer" },
      { name: "tenant_id", type: "integer" },
      { name: "parent_id", type: "integer" },
    ],
    foreignKeys: [
      {
        columns: ["tenant_id", "parent_id"],
        targetTable: "publication_cascade_parent",
        targetColumns: ["tenant_id", "id"],
        onUpdate: "cascade",
        onDelete: "cascade",
      },
    ],
    checks: [{ kind: "integer_range", column: "parent_id", min: "0", max: "10" }],
  },
  { table: "publication_update_log", primaryKey: ["id"], columns: auditColumns },
  { table: "publication_delete_log", primaryKey: ["id"], columns: auditColumns },
  {
    table: "publication_mutation_source",
    primaryKey: ["id"],
    columns: auditColumns,
    updateAudit: { targetTable: "publication_update_log" },
    deleteAudit: { targetTable: "publication_delete_log" },
  },
]);

export const effectPhases = [
  "check-insert",
  "check-update",
  "cascade-update",
  "cascade-delete",
  "trigger-update",
  "trigger-delete",
] as const;
type Row = Record<string, TypedScalar>;
const integer = (value: number): TypedScalar => ({ type: "integer", value: String(value) });
const text = (value: string): TypedScalar => ({ type: "string", value });
const nil: TypedScalar = { type: "null", value: null };

export async function exercisePublicationEffects(context: {
  phase: (typeof effectPhases)[number];
  source: Source;
  tables: readonly PublicationFixtureTable[];
  post: (
    path: string,
    body: object,
  ) => Promise<{ status: number; body: { skill?: { id: string }; [key: string]: unknown } }>;
  run: (
    id: string,
  ) => Promise<{ approved: boolean; results: readonly { id: string; passed: boolean }[] }>;
  publish: (id: string) => Promise<unknown>;
}): Promise<void> {
  const { source, phase, tables, post, run, publish } = context;
  const root = `/api/admin/personas/${source.personaId}/skills`;
  const seeds = (rows: Record<string, Row[]>) =>
    tables.map((t) => ({ table: t.table, rows: rows[t.table] ?? [] }));
  const bind = (column: string, name = column) => ({ column, binding: { kind: "input", name } });
  const parameter = (name: string, nullable = false, type = "integer") => ({
    name,
    type,
    nullable,
    meaning: name,
  });
  const insertCheck = {
    id: "check",
    effect: "insert",
    table: "publication_checked",
    values: [bind("id", "check_id"), bind("score")],
    where: [],
    outputs: [],
    rows: { min: 1, max: 1 },
  };
  const old: Row = { id: integer(10), marker: text("antes ação"), revision: integer(1) };
  const changed: Row = { ...old, marker: text("depois ação"), revision: integer(2) };
  let steps: object[], parameters: object[];
  const cases: {
    name: string;
    parameters: Row;
    initial: Record<string, Row[]>;
    expected: object;
  }[] = [];
  if (phase === "check-insert" || phase === "check-update") {
    steps =
      phase === "check-insert"
        ? [insertCheck]
        : [
            {
              id: "change",
              effect: "update",
              table: "publication_checked",
              values: [bind("score")],
              where: [bind("id", "check_id")],
              outputs: [],
              rows: { min: 1, max: 1 },
            },
          ];
    parameters = [parameter("check_id"), parameter("score", true)];
    for (const score of phase === "check-insert" ? [0, 10, null, -1, 11] : [10, 11]) {
      const valid = score === null || (score >= 0 && score <= 10);
      const row = { id: integer(1), score: score === null ? nil : integer(score) };
      cases.push({
        name: `CHECK ${phase} ${score ?? "null"}`,
        parameters: { check_id: integer(1), score: row.score },
        initial:
          phase === "check-update"
            ? { publication_checked: [{ id: integer(1), score: integer(0) }] }
            : {},
        expected: valid
          ? { affectedRows: 1, tables: seeds({ publication_checked: [row] }) }
          : { error: "NATIVE_FAILURE" },
      });
    }
  } else if (phase.startsWith("cascade")) {
    const update = phase === "cascade-update";
    steps = [
      {
        id: "parent",
        effect: update ? "update" : "delete",
        table: "publication_cascade_parent",
        values: update ? [bind("id", "new_id")] : [],
        where: [bind("tenant_id"), bind("id", "parent_id")],
        outputs: [],
        rows: { min: 1, max: 1 },
      },
      insertCheck,
    ];
    parameters = [
      parameter("tenant_id"),
      parameter("parent_id"),
      parameter("check_id"),
      parameter("score"),
      ...(update ? [parameter("new_id")] : []),
    ];
    const parents = [
      { tenant_id: integer(1), id: integer(7) },
      { tenant_id: integer(2), id: integer(7) },
    ];
    const children = [
      { id: integer(10), tenant_id: integer(1), parent_id: integer(7) },
      { id: integer(11), tenant_id: integer(1), parent_id: integer(7) },
      { id: integer(12), tenant_id: integer(2), parent_id: integer(7) },
    ];
    for (const kind of update
      ? ["success", "late-check", "child-check"]
      : ["success", "late-check"]) {
      const next = kind === "child-check" ? 11 : 8;
      cases.push({
        name: `${phase} ${kind}`,
        parameters: {
          tenant_id: integer(1),
          parent_id: integer(7),
          check_id: integer(99),
          score: integer(kind === "late-check" ? 11 : 0),
          ...(update ? { new_id: integer(next) } : {}),
        },
        initial: { publication_cascade_parent: parents, publication_cascade_child: children },
        expected:
          kind !== "success"
            ? { error: "NATIVE_FAILURE" }
            : {
                affectedRows: 2,
                tables: seeds({
                  publication_checked: [{ id: integer(99), score: integer(0) }],
                  publication_cascade_parent: update
                    ? [{ tenant_id: integer(1), id: integer(next) }, parents[1]!]
                    : [parents[1]!],
                  publication_cascade_child: update
                    ? [
                        { ...children[0]!, parent_id: integer(next) },
                        { ...children[1]!, parent_id: integer(next) },
                        children[2]!,
                      ]
                    : [children[2]!],
                }),
              },
      });
    }
  } else {
    const update = phase === "trigger-update";
    const target = update ? "publication_update_log" : "publication_delete_log";
    steps = [
      {
        id: "change",
        effect: update ? "update" : "delete",
        table: "publication_mutation_source",
        values: update ? [bind("marker"), bind("revision")] : [],
        where: [bind("id"), bind("revision", "expected_revision")],
        outputs: [],
        rows: { min: 1, max: 1 },
      },
    ];
    parameters = [
      parameter("id"),
      parameter("expected_revision"),
      ...(update ? [parameter("marker", true, "string"), parameter("revision")] : []),
    ];
    for (const duplicate of [false, true]) {
      const image = update ? changed : old;
      cases.push({
        name: `${phase} ${duplicate ? "rollback" : "image"}`,
        parameters: {
          id: integer(10),
          expected_revision: integer(1),
          ...(update ? { marker: changed.marker!, revision: changed.revision! } : {}),
        },
        initial: {
          publication_mutation_source: [old],
          ...(duplicate ? { [target]: [image] } : {}),
        },
        expected: duplicate
          ? { error: "NATIVE_FAILURE" }
          : {
              affectedRows: 1,
              tables: seeds({
                publication_mutation_source: update ? [changed] : [],
                [target]: [image],
              }),
            },
      });
    }
  }
  const created = await post(root, {
    slug: `effects-${phase}-${source.dialect}`,
    name: phase,
    kind: "operacao_sql",
    training: {
      sourceId: source.id,
      dialect: source.dialect,
      purpose: "Efeitos e rollback nas fixtures",
      mode: "somente_parametros",
      approval: "human",
      maxAffectedRows: steps.length,
      timeoutMs: 30000,
      parameters,
      steps,
      tables: tables.map((t) => ({
        name: t.table,
        meaning: "Fixture privada",
        identity: t.primaryKey,
        concurrency: t.table === "publication_mutation_source" ? ["revision"] : [],
        uniqueKeys: t.uniqueKeys,
        columns: t.columns.map((c) => ({
          name: c.name,
          type: c.type,
          writable: true,
          meaning: c.name,
        })),
      })),
      rules: [
        "NULL no CHECK preserva semântica nativa; não confundir com NOT NULL",
        "Cascata composta não afeta outro tenant",
      ],
      indirectEffects:
        "ON UPDATE/DELETE CASCADE afeta filhos; UPDATE copia NEW e DELETE copia OLD para logs distintos. Contagem direta exclui esses efeitos.",
      reconciliation: "Não reenviar resultado incerto",
    },
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const skillId = created.body.skill!.id;
  for (const test of cases)
    expect(
      (
        await post(`${root}/${skillId}/casos`, {
          required: true,
          content: {
            name: test.name,
            input: { parameters: test.parameters, fixtures: seeds(test.initial) },
            expected: test.expected,
          },
        })
      ).status,
    ).toBe(201);
  const report = await run(skillId);
  expect(report.approved, JSON.stringify({ phase, results: report.results })).toBe(true);
  await publish(skillId);
}
