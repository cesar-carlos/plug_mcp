import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  SourceQueryGatewayPort,
  SourceQueryLease,
} from "../../../domain/ports/source-query.port.js";
import type { PublicationFixtureControlPort } from "../../../domain/ports/publication-fixture.port.js";
import { canonicalJson } from "../../../domain/persona-v2/catalog.js";
import { parseSelect, walkSelectTree } from "../../../application/use-cases/shared/sql-ast.js";
import type { OperatorChannel } from "./operator-channel.js";
import {
  type operatorCallSchema,
  type operatorFixtureSchema,
  operatorRequestSchema,
  operatorResponseSchema,
} from "./operator-contract.js";

const resultSchema = z.object({
  columns: z.array(z.string()).max(100),
  rows: z.array(z.record(z.string(), z.unknown())).max(101),
  truncated: z.boolean().optional(),
  pagination: z
    .object({
      page: z.number().int(),
      pageSize: z.number().int(),
      hasNextPage: z.boolean(),
      hasPreviousPage: z.boolean(),
    })
    .optional(),
  columnsMetadata: z
    .array(
      z.object({
        name: z.string(),
        typeSystem: z.string().optional(),
        odbcType: z.number().optional(),
        type: z.string().optional(),
        nullable: z.boolean().optional(),
      }),
    )
    .optional(),
  effectiveMaxRows: z.number().optional(),
  maxRowsHandling: z.string().optional(),
  sqlHandlingMode: z.string().optional(),
});
export class RemoteOperatorFixture
  implements SourceQueryGatewayPort, PublicationFixtureControlPort
{
  private sequence = 0;
  private poisoned = false;
  constructor(
    private readonly channel: OperatorChannel,
    private readonly fixture: z.infer<typeof operatorFixtureSchema>,
  ) {}
  private async call(call: z.infer<typeof operatorCallSchema>): Promise<unknown> {
    if (this.poisoned || Date.parse(this.fixture.expiresAt) <= Date.now())
      throw Error("Fixture unavailable.");
    try {
      const id = ++this.sequence;
      await this.channel.send(operatorRequestSchema.parse({ kind: "request", id, call }));
      const reply = operatorResponseSchema.parse(await this.channel.read());
      if (reply.id !== id || !reply.ok) throw Error("Fixture execution unconfirmed.");
      return reply.value;
    } catch {
      this.poisoned = true;
      throw Error("Fixture channel failed; do not retry.");
    }
  }
  private check(source: Parameters<SourceQueryGatewayPort["authorize"]>[0]): void {
    if (canonicalJson(source) !== canonicalJson(this.fixture.source))
      throw Error("Fixture source mismatch.");
  }
  async prepare(
    source: Parameters<PublicationFixtureControlPort["prepare"]>[0],
    seeds: Parameters<PublicationFixtureControlPort["prepare"]>[1],
  ): Promise<void> {
    this.check(source);
    await this.call({ op: "prepare", seeds: [...seeds] });
  }
  async clear(source: Parameters<PublicationFixtureControlPort["clear"]>[0]): Promise<void> {
    this.check(source);
    await this.call({ op: "clear" });
  }
  async authorize(
    source: Parameters<SourceQueryGatewayPort["authorize"]>[0],
    resources: Parameters<SourceQueryGatewayPort["authorize"]>[1],
    fences?: Parameters<SourceQueryGatewayPort["authorize"]>[2],
  ): Promise<SourceQueryLease> {
    this.check(source);
    const value = z
      .strictObject({ lease: z.uuid(), policyFingerprint: z.string().optional() })
      .parse(await this.call({ op: "authorize", resources: [...resources], fences }));
    return {
      policyFingerprint: value.policyFingerprint,
      revalidate: async () => {
        await this.call({ op: "revalidate", lease: value.lease });
      },
      execute: async (sql, params, options, expectedStructure) =>
        resultSchema.parse(
          await this.call({
            op: "execute",
            lease: value.lease,
            sql,
            params,
            options,
            expectedStructure,
          }),
        ),
    };
  }
}

/** Local fixture only. Does not receive reports, approval flags, DB URLs or credentials. */
export class LocalOperatorFixture {
  private sequence = 0;
  private poisoned = false;
  private busy = false;
  private readonly leases = new Map<string, SourceQueryLease>();
  constructor(
    private readonly fixture: z.infer<typeof operatorFixtureSchema>,
    private readonly reads: SourceQueryGatewayPort,
    private readonly control: PublicationFixtureControlPort,
  ) {}
  async handle(raw: unknown): Promise<z.infer<typeof operatorResponseSchema>> {
    const parsed = operatorRequestSchema.safeParse(raw);
    if (
      !parsed.success ||
      this.busy ||
      this.poisoned ||
      parsed.data.id !== this.sequence + 1 ||
      Date.parse(this.fixture.expiresAt) <= Date.now()
    ) {
      this.poisoned = true;
      this.leases.clear();
      throw Error("Fixture session refused.");
    }
    const request = parsed.data;
    this.busy = true;
    this.sequence = request.id;
    const call = request.call;
    try {
      let value: unknown = null;
      if (call.op === "prepare") {
        if (
          call.seeds.length !== this.fixture.tables.length ||
          new Set(call.seeds.map((s) => s.table)).size !== call.seeds.length ||
          call.seeds.some((s) => !this.fixture.tables.some((t) => t.table === s.table))
        )
          throw Error("Seeds outside fixture.");
        this.leases.clear();
        await this.control.prepare(this.fixture.source, call.seeds);
      } else if (call.op === "clear") {
        await this.control.clear(this.fixture.source);
        this.leases.clear();
      } else if (call.op === "authorize") {
        if (
          this.leases.size >= 64 ||
          call.resources.some((r) => !this.fixture.tables.some((t) => t.table === r.name))
        )
          throw Error("Resource outside fixture.");
        const lease = await this.reads.authorize(this.fixture.source, call.resources, {
          ...call.fences,
          exactResources: true,
          requireDatabase: true,
        });
        const id = randomUUID();
        this.leases.set(id, lease);
        value = { lease: id, policyFingerprint: lease.policyFingerprint };
      } else {
        const lease = this.leases.get(call.lease);
        if (!lease) throw Error("Unknown fixture lease.");
        if (call.op === "revalidate") await lease.revalidate();
        else {
          const ast = parseSelect(call.sql, "mssql", { allowSchemaQualifiedTables: true });
          walkSelectTree(ast, (node) => {
            if (
              node.tabelas.some(
                (t) =>
                  !t.isCte &&
                  !t.isSubquery &&
                  !this.fixture.tables.some((f) => f.table.toLowerCase() === t.nome.toLowerCase()),
              )
            )
              throw Error("SQL outside fixture.");
          });
          value = await lease.execute(call.sql, call.params, call.options, call.expectedStructure);
        }
      }
      if (this.poisoned) throw Error("Fixture session invalidated.");
      return { kind: "response", id: request.id, ok: true, value };
    } catch {
      this.poisoned = true;
      this.leases.clear();
      return { kind: "response", id: request.id, ok: false };
    } finally {
      this.busy = false;
    }
  }
}
