import { randomUUID } from "node:crypto";
import { DomainError, ERROR_SOURCE } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
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
  operatorPrepareWaitSchema,
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
    const preparationDeadline = Math.min(Date.now() + 135000, Date.parse(this.fixture.expiresAt));
    const preparationTimer =
      call.op === "prepare"
        ? setTimeout(() => this.channel.close(), Math.max(1, preparationDeadline - Date.now()))
        : undefined;
    try {
      const id = ++this.sequence;
      await this.channel.send(operatorRequestSchema.parse({ kind: "request", id, call }));
      let previousRemaining = 90001;
      let waits = 0;
      let message = await this.channel.read();
      while (operatorPrepareWaitSchema.safeParse(message).success) {
        const wait = operatorPrepareWaitSchema.parse(message);
        if (
          call.op !== "prepare" ||
          wait.id !== id ||
          ++waits > 9 ||
          wait.remainingMs >= previousRemaining ||
          Date.now() >= preparationDeadline
        )
          throw Error("Invalid preparation wait.");
        previousRemaining = wait.remainingMs;
        message = await this.channel.read();
      }
      if (call.op === "prepare" && Date.now() >= preparationDeadline)
        throw Error("Preparation deadline expired.");
      const reply = operatorResponseSchema.parse(message);
      if (reply.id !== id || !reply.ok) throw Error("Fixture execution unconfirmed.");
      return reply.value;
    } catch {
      this.poisoned = true;
      throw Error("Fixture channel failed; do not retry.");
    } finally {
      clearTimeout(preparationTimer);
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

/** Pace only between cases, outside the query budget; liveness never approves or retries. */
export function createOperatorCasePacer(
  now: () => number = () => performance.now(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): (
  raw: unknown,
  progress?: (frame: z.infer<typeof operatorPrepareWaitSchema>) => Promise<void>,
) => Promise<void> {
  let previous: number | undefined;
  return async (raw, progress) => {
    const request = operatorRequestSchema.parse(raw);
    if (request.call.op !== "prepare") return;
    if (previous !== undefined) {
      let remaining = Math.ceil(90000 - (now() - previous));
      for (let pulses = 0; remaining > 0; pulses++) {
        if (pulses >= 9) throw Error("Preparation pacing deadline expired.");
        await progress?.(
          operatorPrepareWaitSchema.parse({
            kind: "prepare-wait",
            id: request.id,
            remainingMs: remaining,
          }),
        );
        await sleep(Math.min(10000, remaining));
        remaining = Math.ceil(90000 - (now() - previous));
      }
    }
    previous = now();
  };
}

export interface LocalFixtureDiagnostic {
  operation: z.infer<typeof operatorCallSchema>["op"];
  code: string;
  source?: string;
  retryAfterMs?: number;
}

/** Local fixture only. Does not receive reports, approval flags, DB URLs or credentials. */
export class LocalOperatorFixture {
  private failureMetadata?: LocalFixtureDiagnostic;
  get failure(): LocalFixtureDiagnostic | undefined {
    return this.failureMetadata ? { ...this.failureMetadata } : undefined;
  }
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
    } catch (error) {
      const domain = error instanceof DomainError ? error : undefined;
      this.failureMetadata = {
        operation: call.op,
        code:
          domain && Object.values(ERROR_CODES).includes(domain.code)
            ? domain.code
            : "RUNNER_FAILED",
        ...(domain?.source && Object.values(ERROR_SOURCE).some((value) => value === domain.source)
          ? { source: domain.source }
          : {}),
        ...(domain?.code === "RATE_LIMITED" &&
        typeof domain.retryAfterMs === "number" &&
        Number.isFinite(domain.retryAfterMs) &&
        domain.retryAfterMs >= 0 &&
        domain.retryAfterMs <= 86_400_000
          ? { retryAfterMs: domain.retryAfterMs }
          : {}),
      };
      this.poisoned = true;
      this.leases.clear();
      return { kind: "response", id: request.id, ok: false };
    } finally {
      this.busy = false;
    }
  }
}
