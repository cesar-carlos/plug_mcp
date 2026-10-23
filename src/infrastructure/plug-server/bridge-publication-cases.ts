import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { PublicationFixtureControlPort } from "../../domain/ports/publication-fixture.port.js";
import type { SourceQueryGatewayPort } from "../../domain/ports/source-query.port.js";
import type { SqlOperationGatewayPort } from "../../domain/ports/persona-v2.port.js";
import type { IsolatedPublicationCaseExecutor } from "../../application/persona-v2/publication-cases.js";
import type { OperationCase } from "../../application/persona-v2/operation-cases.js";
import type { OperationPackage } from "../../domain/persona-v2/operation-training.js";
import type { SqlOperationCommand } from "../../domain/persona-v2/operation.js";
import { PersonaV2Error, type Source } from "../../domain/persona-v2/model.js";
import { canonicalJson, type QueryPackage } from "../../domain/persona-v2/catalog.js";
import {
  fixtureSeedsSchema,
  fixtureTablesSchema,
  type PublicationFixtureTable,
  type PublicationFixtureSeed,
  type QueryPublicationCase,
} from "../../domain/persona-v2/publication-fixture.js";
import { quoteOperationTable } from "../../domain/persona-v2/operation-identifiers.js";
import { caseRowsEqual, caseValue } from "../../application/persona-v2/publication-case-values.js";
import {
  PersonaSourceQueries,
  type SourceQueryResponse,
  type FederationQueryContext,
} from "../../application/persona-v2/source-query.js";
import { queryLimits } from "../../domain/persona-v2/execution-limits.js";
import type { PublicationRunEvidence } from "../../domain/persona-v2/publication-run.js";
import type { CatalogPublication } from "../../domain/persona-v2/catalog.js";

// Operator-only pacing, shared by in-process runs; never cache policy or retry SQL.
const readCheckSchedule = new WeakMap<SourceQueryGatewayPort, Map<string, number>>();
const OPERATOR_READ_CHECK_INTERVAL_MS = 200;

/** Only composed by the operator runner for freshly created, explicitly bound fixtures. */
export class BridgePublicationCaseExecutor implements IsolatedPublicationCaseExecutor {
  readonly supportsStructureGuard = true as const;
  private readonly tables: readonly PublicationFixtureTable[];
  private poisoned = false;
  private readonly targetSource: Source;
  private async paceReadCheck(): Promise<void> {
    let schedule = readCheckSchedule.get(this.reads);
    if (!schedule) {
      schedule = new Map();
      readCheckSchedule.set(this.reads, schedule);
    }
    const now = Date.now();
    const slot = Math.max(now, schedule.get(this.source.agentId) ?? now);
    schedule.set(this.source.agentId, slot + OPERATOR_READ_CHECK_INTERVAL_MS);
    if (slot > now) await delay(slot - now);
  }
  constructor(
    private readonly source: Source,
    tables: unknown,
    private readonly control: PublicationFixtureControlPort,
    private readonly reads: SourceQueryGatewayPort,
    private readonly operations: SqlOperationGatewayPort,
    binding: { runId: string; agentId: string; identityHash: string },
    targetSource?: Source,
  ) {
    if (
      !/^se7e_persona_[a-f0-9]{12}_test$/.test(binding.runId) ||
      source.environment !== "test" ||
      source.database !== binding.runId ||
      source.agentId !== binding.agentId ||
      source.identityHash !== binding.identityHash ||
      !source.identityHash
    )
      throw new PersonaV2Error(
        "AUTHORIZATION_DENIED",
        "Runner exige fonte descartável e identidade explicitamente vinculadas.",
      );
    this.tables = fixtureTablesSchema.parse(tables);
    this.targetSource = targetSource ?? source;
    if (
      !this.targetSource.active ||
      !/^[a-f0-9]{64}$/.test(this.targetSource.identityHash ?? "") ||
      this.targetSource.dialect !== source.dialect ||
      canonicalJson(this.targetSource.rowRestrictions) !== canonicalJson(source.rowRestrictions)
    )
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Fixture exige o mesmo dialeto e recortes explícitos da fonte pretendida.",
      );
  }
  evidence(source: Source): PublicationRunEvidence["sources"][number] {
    if (canonicalJson(source) !== canonicalJson(this.targetSource))
      throw new PersonaV2Error("STALE_AUTHORIZATION", "Vínculo pretendido mudou.");
    return {
      sourceId: source.id,
      sourceVersion: source.authorizationVersion,
      credentialVersion: source.credentialVersion,
      sourceFingerprint: createHash("sha256").update(canonicalJson(source)).digest("hex"),
      dialect: source.dialect,
      identityHash: source.identityHash!,
      fixtureSourceId: this.source.id,
      fixtureIdentityHash: this.source.identityHash!,
      fixtureManifestHash: createHash("sha256").update(canonicalJson(this.tables)).digest("hex"),
    };
  }
  async prepareFederation(
    source: Source,
    seeds: readonly PublicationFixtureSeed[],
    tables: readonly string[],
  ): Promise<void> {
    this.check(source.id, seeds, tables);
    this.evidence(source);
    await this.prepare(seeds);
  }
  async finishFederation(terminal: boolean): Promise<void> {
    if (this.poisoned)
      throw new PersonaV2Error(
        "AUTHORIZATION_DENIED",
        "Fixture incerta; descarte sem limpar ou repetir.",
      );
    await this.finish(terminal);
  }
  private check(
    sourceId: string,
    seeds: readonly PublicationFixtureSeed[],
    tableNames: readonly string[],
  ): void {
    if (this.poisoned || sourceId !== this.targetSource.id)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fixture indisponível ou divergente.");
    fixtureSeedsSchema.parse(seeds);
    const names = this.tables.map((t) => t.table);
    if (
      seeds.length !== names.length ||
      new Set(seeds.map((s) => s.table)).size !== names.length ||
      seeds.some((s) => !names.includes(s.table)) ||
      tableNames.some((name) => !names.includes(name))
    )
      throw new PersonaV2Error("INVALID_PLAN", "Fixtures devem corresponder ao manifesto privado.");
    for (const table of this.tables) {
      const seed = seeds.find((s) => s.table === table.table)!;
      if (
        canonicalJson([...seed.generated].sort()) !==
          canonicalJson(
            table.columns
              .filter((c) => c.generated)
              .map((c) => c.name)
              .sort(),
          ) ||
        seed.rows.some(
          (row) =>
            Object.keys(row).some((name) => !table.columns.some((c) => c.name === name)) ||
            table.columns.some((c) =>
              c.generated
                ? row[c.name] !== undefined
                : !row[c.name] ||
                  (row[c.name]!.type === "null" ? !c.nullable : row[c.name]!.type !== c.type),
            ),
        )
      )
        throw new PersonaV2Error("INVALID_PLAN", "Linhas ou tipos de fixture incompatíveis.");
    }
  }
  private async prepare(seeds: readonly PublicationFixtureSeed[]): Promise<void> {
    try {
      await this.control.prepare(this.source, seeds);
    } catch (error) {
      this.poisoned = true;
      throw error;
    }
  }
  private async finish(terminal: boolean): Promise<void> {
    if (!terminal) this.poisoned = true;
    if (this.poisoned) return;
    try {
      await this.control.clear(this.source);
    } catch (error) {
      this.poisoned = true;
      throw error;
    }
  }
  private async compare(
    expected: readonly { table: string; rows: PublicationFixtureSeed["rows"] }[],
  ): Promise<boolean> {
    if (
      expected.length !== this.tables.length ||
      new Set(expected.map((t) => t.table)).size !== this.tables.length
    )
      return false;
    try {
      await this.paceReadCheck();
      const lease = await this.reads.authorize(
        this.source,
        this.tables.map((table) => ({ name: table.table, type: "table" as const })),
        { exactResources: true, requireDatabase: true },
      );
      const tableAlias = quoteOperationTable("fixture_table", this.source.dialect);
      const countAlias = quoteOperationTable("fixture_rows", this.source.dialect);
      await this.paceReadCheck();
      const counts = await lease.execute(
        this.tables
          .map(
            (table) =>
              `SELECT '${table.table}' AS ${tableAlias}, CAST(COUNT(*) AS VARCHAR(32)) AS ${countAlias} FROM ${quoteOperationTable(table.table, this.source.dialect)}`,
          )
          .join(" UNION ALL "),
        {},
        { maxRows: this.tables.length + 1, timeoutMs: 15000 },
      );
      await this.paceReadCheck();
      await lease.revalidate();
      if (
        counts.truncated !== false ||
        counts.pagination?.hasNextPage ||
        canonicalJson(counts.columns) !== canonicalJson(["fixture_table", "fixture_rows"]) ||
        counts.rows.length !== this.tables.length ||
        new Set(counts.rows.map((row) => row.fixture_table)).size !== this.tables.length ||
        this.tables.some((table) => {
          const row = counts.rows.find((r) => r.fixture_table === table.table);
          return (
            !row ||
            Object.keys(row).length !== 2 ||
            caseValue(row.fixture_rows, "integer") !==
              String(expected.find((t) => t.table === table.table)?.rows.length)
          );
        })
      )
        return false;
      for (const table of this.tables) {
        const wanted = expected.find((t) => t.table === table.table);
        if (!wanted) return false;
        if (wanted.rows.length === 0) continue; // Exact zero already proved, not inferred.
        const projection = table.columns
          .map((c) => {
            const name = quoteOperationTable(c.name, this.source.dialect);
            return c.type === "decimal" || c.type === "integer"
              ? `CAST(${name} AS VARCHAR(128)) AS ${name}`
              : c.type === "uuid"
                ? `CAST(${name} AS VARCHAR(36)) AS ${name}`
                : name;
          })
          .join(", ");
        await this.paceReadCheck();
        const result = await lease.execute(
          `SELECT ${projection} FROM ${quoteOperationTable(table.table, this.source.dialect)}`,
          {},
          { maxRows: 101, timeoutMs: 15000 },
        );
        await this.paceReadCheck();
        await lease.revalidate();
        if (
          result.truncated !== false ||
          result.pagination?.hasNextPage ||
          canonicalJson(result.columns) !== canonicalJson(table.columns.map((c) => c.name)) ||
          !caseRowsEqual(result.rows, wanted.rows, table.columns, false)
        )
          return false;
      }
      return true;
    } catch (error) {
      this.poisoned = true;
      throw error;
    }
  }
  async evaluate(
    pkg: OperationPackage,
    command: SqlOperationCommand,
    test: OperationCase,
  ): Promise<boolean> {
    this.check(
      pkg.sourceId,
      test.input.fixtures,
      pkg.training.tables.map((t) => t.name),
    );
    if (
      pkg.sourceFingerprint !==
        createHash("sha256").update(canonicalJson(this.targetSource)).digest("hex") ||
      pkg.dialect !== this.source.dialect ||
      command.database !== this.targetSource.database ||
      pkg.training.tables.some((t) => {
        const declared = this.tables.find((d) => d.table === t.name)!;
        return (
          canonicalJson(t.columns.map((c) => ({ name: c.name, type: c.type }))) !==
          canonicalJson(declared.columns.map((c) => ({ name: c.name, type: c.type })))
        );
      })
    )
      throw new PersonaV2Error("INVALID_PLAN", "Treinamento diverge da declaração da fixture.");
    await this.prepare(test.input.fixtures);
    let terminal = false;
    try {
      const dispatched =
        command.database === this.source.database
          ? command
          : {
              ...command,
              database: this.source.database,
              fingerprint: createHash("sha256")
                .update(canonicalJson({ command, fixture: this.evidence(this.targetSource) }))
                .digest("hex"),
            };
      await this.operations.verifyCapabilitiesAndPolicy(this.source, dispatched);
      const receipt = await this.operations.execute(this.source, dispatched);
      if (
        receipt.operationId !== dispatched.operationId ||
        receipt.fingerprint !== dispatched.fingerprint
      )
        throw new PersonaV2Error("INVALID_PLAN", "Recibo diverge da operação enviada.");
      terminal = receipt.state !== "resultado_desconhecido";
      if (!terminal)
        throw new PersonaV2Error(
          "INCOMPLETE_INPUT",
          "Resultado incerto: descarte a fixture; nunca reenvie.",
        );
      if ("error" in test.expected)
        return (
          receipt.state === "rollback_confirmado" &&
          (test.expected.error === "NATIVE_FAILURE"
            ? receipt.failureCode === "SQL_OPERATION_NATIVE_FAILED"
            : test.expected.error === "ROW_CONDITION_FAILED" &&
              ["SQL_OPERATION_CONDITION_FAILED", "SQL_OPERATION_ROW_LIMIT"].includes(
                receipt.failureCode ?? "",
              )) &&
          (await this.compare(test.input.fixtures))
        );
      return (
        receipt.state === "concluida" &&
        receipt.directlyAffectedRows === test.expected.affectedRows &&
        (await this.compare(test.expected.tables))
      );
    } finally {
      await this.finish(terminal);
    }
  }
  async evaluateQuery(
    pkg: QueryPackage,
    source: Source,
    test: QueryPublicationCase,
  ): Promise<boolean> {
    this.check(source.id, test.input.fixtures, pkg.scope.tabelas);
    if (canonicalJson(source) !== canonicalJson(this.targetSource))
      throw new PersonaV2Error("STALE_AUTHORIZATION", "Fonte alterada.");
    await this.prepare(test.input.fixtures);
    let terminal = false;
    try {
      const result = await this.readQuery(
        pkg,
        source,
        test.input.sql ?? pkg.sqlModel,
        test.input.params,
      );
      terminal = true;
      return (
        result.completeness.complete &&
        canonicalJson(result.columns) === canonicalJson(test.expected.columns.map((c) => c.name)) &&
        caseRowsEqual(
          result.rows ?? [],
          test.expected.rows,
          test.expected.columns,
          test.expected.ordered,
        )
      );
    } finally {
      await this.finish(terminal);
    }
  }

  /** SQL is validated against the intended snapshot, then sent only to the bound fixture. */
  async readQuery(
    pkg: QueryPackage,
    source: Source,
    sql: string,
    params: Readonly<Record<string, string | number | boolean | null>>,
    revalidate: () => Promise<void> = () => Promise.resolve(),
    internal?: FederationQueryContext,
  ): Promise<SourceQueryResponse> {
    let dispatched = false;
    this.evidence(source);
    if (
      this.poisoned ||
      pkg.sourceFingerprint !== this.evidence(source).sourceFingerprint ||
      pkg.dialect !== this.source.dialect ||
      pkg.scope.tabelas.some((t) => !this.tables.some((d) => d.table === t))
    )
      throw new PersonaV2Error("INVALID_PLAN", "Pacote diverge da fixture vinculada.");
    const publication: CatalogPublication<QueryPackage> = {
      id: internal?.publicationId ?? source.id,
      personaId: source.personaId,
      skillId: source.id,
      revision: 1,
      package: pkg,
      hash: internal?.hash ?? createHash("sha256").update(canonicalJson(pkg)).digest("hex"),
      sourceVersion: source.authorizationVersion,
      sourceFingerprint: pkg.sourceFingerprint,
      suspendedAt: null,
    };
    const queries = new PersonaSourceQueries(
      {
        query: () =>
          Promise.resolve({
            source,
            publications: [publication],
            executionLimits: queryLimits(pkg.limits ?? {}),
          }),
        revalidateQuery: revalidate,
        sourceForVerification: () => Promise.resolve(source),
        suspendStructuralQuery: () => {
          throw new PersonaV2Error(
            "STALE_AUTHORIZATION",
            "Fixture incompatível; não suspender fonte de negócio por teste.",
          );
        },
      },
      {
        authorize: async (_target, resources, fences) => {
          await revalidate();
          const lease = await this.reads.authorize(this.source, resources, fences);
          return {
            execute: (...args) => {
              dispatched = true;
              return lease.execute(...args);
            },
            revalidate: async () => {
              await lease.revalidate();
              await revalidate();
            },
          };
        },
      },
    );
    try {
      return await queries.run(
        {
          personaId: source.personaId,
          tokenId: "trusted-runner",
          tokenVersion: 1,
          personaVersion: 1,
        },
        {
          fonteId: source.id,
          skillIds: [publication.skillId],
          sql,
          params: { ...params },
          options: { maxRows: 101, timeoutMs: 15000 },
        },
        false,
        internal,
      );
    } catch (error) {
      if (dispatched) this.poisoned = true;
      throw error;
    }
  }
}
