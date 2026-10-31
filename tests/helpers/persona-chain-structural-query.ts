import { expect } from "vitest";
import type { CryptoPort } from "../../src/domain/ports/crypto.port.js";
import type {
  PersonaRepositoryPort,
  SqlOperationGatewayPort,
} from "../../src/domain/ports/persona-v2.port.js";
import type { SourceQueryGatewayPort } from "../../src/domain/ports/source-query.port.js";
import { quoteOperationTable } from "../../src/domain/persona-v2/operation-identifiers.js";
import {
  fixtureSeedsSchema,
  fixtureTablesSchema,
} from "../../src/domain/persona-v2/publication-fixture.js";
import { runSqlPublicationCases } from "../../src/application/persona-v2/publication-cases.js";
import { caseRowsEqual } from "../../src/application/persona-v2/publication-case-values.js";
import { queryTrainingSchema } from "../../src/application/persona-v2/query-training.js";
import { BridgePublicationCaseExecutor } from "../../src/infrastructure/plug-server/bridge-publication-cases.js";

const integer = (value: number) => ({ type: "integer" as const, value: String(value) });
const records = (rows: readonly number[][], names: readonly string[]) =>
  rows.map((row) => Object.fromEntries(names.map((name, i) => [name, integer(row[i]!)])));

// These relations are provisioned by persona_chain_structure_fixture.dart and
// the native agent bootstrap before the scenario. Never recreate them: their
// real keys, views and subsequent deliberate drift are part of the test.
function fixture(name: string): { columns: string[]; rows: number[][] } {
  if (/^wide_(0[0-9]|1[0-5])$/.test(name))
    return {
      columns: ["tenant_id", "item_id", "marker"],
      rows: [
        [1, 10, 100],
        [2, 20, 200],
      ],
    };
  switch (name) {
    case "rel_left":
      return {
        columns: ["tenant_id", "left_id"],
        rows: [
          [1, 10],
          [1, 20],
        ],
      };
    case "rel_right":
      return {
        columns: ["tenant_id", "right_id"],
        rows: [
          [1, 100],
          [1, 200],
        ],
      };
    case "rel_link":
      return {
        columns: ["tenant_id", "left_id", "right_id"],
        rows: [
          [1, 10, 100],
          [1, 10, 200],
          [1, 20, 100],
        ],
      };
    case "schema_parent":
    case "schema_child":
      return { columns: ["tenant_id", "item_id"], rows: [] };
    default:
      throw new Error("Unknown private structural fixture");
  }
}

export async function verifyStructuralQuery(input: {
  repository: PersonaRepositoryPort;
  crypto: CryptoPort;
  reads: SourceQueryGatewayPort;
  operations: SqlOperationGatewayPort;
  personaId: string;
  skillId: string;
  runId: string;
  addCase: (content: object) => Promise<void>;
}) {
  const { personaId, skillId, repository, reads } = input;
  const { training, source } = await repository.transaction(
    { personaIds: [personaId], tokenIds: [] },
    async (tx) => {
      const draft = await tx.catalog.find(personaId, skillId);
      if (draft?.kind !== "consulta") throw new Error("Expected a query draft");
      const training = queryTrainingSchema.parse(draft.training);
      const source = (await tx.listSources(personaId)).find((s) => s.id === training.sourceId);
      if (source?.environment !== "test" || source.database !== input.runId || !source.identityHash)
        throw new Error("Expected a bound private engine");
      return { training, source };
    },
  );
  const names = training.tables.map((t) => t.name);
  const data = names.map((table) => fixture(table.split(".").at(-1)!));
  const tables = fixtureTablesSchema.parse(
    names.map((table, i) => ({
      table,
      columns: data[i]!.columns.map((name) => ({ name, type: "integer" })),
      primaryKey: data[i]!.columns.filter((name) => name !== "marker"),
    })),
  );
  const seeds = fixtureSeedsSchema.parse(
    tables.map((t, i) => ({ table: t.table, rows: records(data[i]!.rows, data[i]!.columns) })),
  );
  const relational = names.some((n) => n.split(".").at(-1) === "rel_link");
  const wide = names.some((n) => n.split(".").at(-1) === "wide_00");
  const cols = relational
    ? ["left_id", "right_id"]
    : wide
      ? ["tenant_id", "item_id", "marker"]
      : ["tenant_id", "item_id"];
  const expected = relational
    ? [
        [10, 100],
        [10, 200],
        [20, 100],
      ]
    : wide
      ? [[1, 10, 100]]
      : [];
  await input.addCase({
    name: "Verifica o JOIN sobre as relações sintéticas identificadas",
    input: { params: { tenant: 1 }, fixtures: seeds },
    expected: {
      columns: cols.map((name) => ({ name, type: "integer" })),
      rows: records(expected, cols),
      ordered: true,
    },
  });
  async function checkSeeds() {
    for (const [i, t] of tables.entries()) {
      const type = t.table.split(".").at(-1) === "wide_15" ? ("view" as const) : ("table" as const);
      const lease = await reads.authorize(source, [{ name: t.table, type }], {
        exactResources: true,
        requireDatabase: true,
      });
      const quote = (s: string) => quoteOperationTable(s, source.dialect);
      const projection = t.columns
        .map((c) => `CAST(${quote(c.name)} AS VARCHAR(32)) AS ${quote(c.name)}`)
        .join(", ");
      const result = await lease.execute(
        `SELECT ${projection} FROM ${quote(t.table)}`,
        {},
        { maxRows: 101, timeoutMs: 15000 },
      );
      await lease.revalidate();
      expect(result.truncated).toBe(false);
      expect(result.pagination?.hasNextPage).not.toBe(true);
      expect(caseRowsEqual(result.rows, seeds[i]!.rows, t.columns, false), t.table).toBe(true);
    }
  }
  const runner = new BridgePublicationCaseExecutor(
    source,
    tables,
    {
      prepare: async (actor, requested) => {
        expect(actor.id).toBe(source.id);
        expect(requested).toEqual(seeds);
        await checkSeeds();
      },
      clear: async (actor) => {
        expect(actor.id).toBe(source.id);
        await checkSeeds();
      },
    },
    reads,
    input.operations,
    { runId: input.runId, agentId: source.agentId, identityHash: source.identityHash! },
  );
  const result = await runSqlPublicationCases(repository, personaId, skillId, input.crypto, runner);
  expect(result.approved, JSON.stringify(result.results)).toBe(true);
}
