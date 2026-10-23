import type { FederationGatewayPort } from "../../domain/ports/federation.port.js";
import {
  DEFAULT_FEDERATION_BUDGET,
  type AggregateStep,
  type DataRow,
  type DataScalar,
  type FederationBudget,
  type FederationPlan,
  type FederationResult,
  type FederationStep,
  type JoinStep,
  type LocalQueryResult,
} from "../../domain/persona-v2/federation.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";

interface Table {
  readonly rows: readonly DataRow[];
  readonly columns: readonly string[];
}
const invalid = (message: string): never => {
  throw new PersonaV2Error("INVALID_PLAN", message);
};
const value = (row: DataRow, column: string): DataScalar => {
  if (!Object.hasOwn(row, column)) {
    return invalid("Coluna ausente na entrada do cruzamento.");
  }
  return row[column]!;
};
// SQL-like NULL semantics: missing keys never match, including NULL to NULL.
const key = (row: DataRow, columns: readonly string[]): string | null => {
  const values = columns.map((c) => value(row, c));
  return values.includes(null) ? null : JSON.stringify(values.map((v) => [typeof v, v]));
};
const compare = (a: DataScalar, b: DataScalar): number => {
  if (a === b) {
    return 0;
  }
  if (a === null || b === null || typeof a !== typeof b) {
    return invalid("Tipos incompatíveis; treine uma normalização explícita na fonte.");
  }
  return a < b ? -1 : 1;
};

interface Decimal {
  units: bigint;
  scale: number;
}
const decimal = (input: DataScalar): Decimal => {
  if (typeof input !== "string" && !(typeof input === "number" && Number.isSafeInteger(input))) {
    return invalid("Decimais devem ser strings exatas; números inteiros precisam ser seguros.");
  }
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(input));
  if (!match || String(input).length > 1000) {
    return invalid("Decimal inválido.");
  }
  return { units: BigInt(`${match[1]}${match[2]}${match[3] ?? ""}`), scale: match[3]?.length ?? 0 };
};
const decimalAdd = (left: Decimal, right: Decimal): Decimal => {
  const scale = Math.max(left.scale, right.scale);
  return {
    units:
      left.units * 10n ** BigInt(scale - left.scale) +
      right.units * 10n ** BigInt(scale - right.scale),
    scale,
  };
};
const decimalText = ({ units, scale }: Decimal): string => {
  const sign = units < 0 ? "-" : "";
  const digits = (units < 0 ? -units : units).toString().padStart(scale + 1, "0");
  return scale === 0
    ? `${sign}${digits}`
    : `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
};
const compareDecimal = (a: DataScalar, b: DataScalar): number => {
  const left = decimal(a),
    right = decimal(b);
  const difference = decimalAdd(left, { units: -right.units, scale: right.scale }).units;
  return difference === 0n ? 0 : difference < 0n ? -1 : 1;
};

export const federationBudget = (
  ...ceilings: readonly Partial<FederationBudget>[]
): FederationBudget => {
  const budget = { ...DEFAULT_FEDERATION_BUDGET };
  for (const ceiling of ceilings) {
    for (const field of Object.keys(budget) as (keyof FederationBudget)[]) {
      const requested = ceiling[field];
      if (requested !== undefined) {
        if (!Number.isSafeInteger(requested) || requested < 1) {
          return invalid("Limite inválido.");
        }
        budget[field] = Math.min(budget[field], requested);
      }
    }
  }
  return budget;
};

export class ExecuteFederation {
  constructor(private readonly gateway: FederationGatewayPort) {}

  async execute(plan: FederationPlan, budget = federationBudget()): Promise<FederationResult> {
    budget = federationBudget(budget);
    if (
      plan.steps.length < 1 ||
      plan.steps.length > budget.steps ||
      !Number.isSafeInteger(plan.page) ||
      plan.page < 1 ||
      !Number.isSafeInteger(plan.pageSize) ||
      plan.pageSize < 1 ||
      plan.pageSize > budget.intermediateRows
    ) {
      return invalid("Quantidade de etapas ou paginação inválida.");
    }
    const ids = new Set<string>();
    const sources = new Set<string>();
    for (const step of plan.steps) {
      if (!step.id || ids.has(step.id)) {
        return invalid("Identidade de etapa duplicada.");
      }
      const dependencies =
        step.kind === "local"
          ? []
          : step.kind === "join"
            ? [step.left, step.right]
            : step.kind === "union"
              ? step.inputs
              : [step.input];
      if (dependencies.some((id) => !ids.has(id))) {
        return invalid("Dependência ausente ou futura.");
      }
      ids.add(step.id);
      if (step.kind === "local") {
        sources.add(step.sourceId);
      }
    }
    if (!ids.has(plan.output) || sources.size > budget.sources) {
      return invalid("Saída ou número de fontes inválido.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget.timeoutMs);
    const deadline = Date.now() + budget.timeoutMs;
    const check = (table?: Table): void => {
      if (Date.now() >= deadline || controller.signal.aborted) {
        throw new PersonaV2Error("BUDGET_EXCEEDED", "Tempo do cruzamento excedido.");
      }
      if (
        table &&
        (table.rows.length > budget.intermediateRows ||
          Buffer.byteLength(JSON.stringify(table), "utf8") > budget.intermediateBytes)
      ) {
        throw new PersonaV2Error("BUDGET_EXCEEDED", "Memória ou linhas intermediárias excedidas.");
      }
    };
    try {
      await this.abortable(this.gateway.authorize(plan, controller.signal), controller.signal);
      const tables = new Map<string, Table>();
      const provenance: FederationResult["provenance"][number][] = [];
      const rowsBySource = new Map<string, number>();
      // Sequential dispatch is deliberately bounded to one <= the allowed concurrency ceiling.
      for (const [stepIndex, step] of plan.steps.entries()) {
        check();
        let table: Table;
        if (step.kind === "local") {
          await this.abortable(this.gateway.authorize(plan, controller.signal), controller.signal);
          check();
          const remaining = budget.rowsPerSource - (rowsBySource.get(step.sourceId) ?? 0);
          if (remaining <= 0) {
            throw new PersonaV2Error("BUDGET_EXCEEDED", "Limite de linhas por fonte excedido.");
          }
          const result = await this.queryWithAbort(step, remaining, controller.signal);
          check();
          this.validateLocal(result);
          if (result.truncated) {
            throw new PersonaV2Error(
              "INCOMPLETE_INPUT",
              "Entrada truncada impede cruzamento completo.",
            );
          }
          if (result.rows.length > remaining) {
            throw new PersonaV2Error("BUDGET_EXCEEDED", "Fonte excedeu o limite de linhas.");
          }
          rowsBySource.set(
            step.sourceId,
            (rowsBySource.get(step.sourceId) ?? 0) + result.rows.length,
          );
          table = result;
          provenance.push({
            sourceId: step.sourceId,
            publicationId: step.publicationId,
            publicationHash: result.publicationHash,
            readAt: result.readAt,
          });
        } else {
          table = this.combine(step, tables, check, budget.intermediateRows);
        }
        check(table);
        tables.set(step.id, table);
        const needed = new Set([
          plan.output,
          ...plan.steps
            .slice(stepIndex + 1)
            .flatMap((future) =>
              future.kind === "local"
                ? []
                : future.kind === "join"
                  ? [future.left, future.right]
                  : future.kind === "union"
                    ? future.inputs
                    : [future.input],
            ),
        ]);
        for (const id of tables.keys()) {
          if (!needed.has(id)) {
            tables.delete(id);
          }
        }
        const retained = [...tables.values()];
        if (
          retained.reduce((count, t) => count + t.rows.length, 0) > budget.intermediateRows ||
          Buffer.byteLength(JSON.stringify(retained), "utf8") > budget.intermediateBytes
        ) {
          throw new PersonaV2Error("BUDGET_EXCEEDED", "Memória total intermediária excedida.");
        }
      }
      await this.abortable(this.gateway.authorize(plan, controller.signal), controller.signal);
      check();
      const output = tables.get(plan.output)!;
      const start = (plan.page - 1) * plan.pageSize;
      if (!Number.isSafeInteger(start)) {
        return invalid("Página inválida.");
      }
      return {
        rows: output.rows.slice(start, start + plan.pageSize),
        columns: output.columns,
        totalRows: output.rows.length,
        complete: true,
        provenance,
      };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  private async queryWithAbort(
    step: Extract<FederationStep, { kind: "local" }>,
    maxRows: number,
    signal: AbortSignal,
  ): Promise<LocalQueryResult> {
    return this.abortable(this.gateway.query(step, { maxRows, signal }), signal);
  }

  private async abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
      throw new PersonaV2Error("BUDGET_EXCEEDED", "Plano expirou.");
    }
    let onAbort: () => void = () => undefined;
    const abort = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new PersonaV2Error("BUDGET_EXCEEDED", "Plano expirou."));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([promise, abort]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  private validateLocal(result: LocalQueryResult): void {
    if (new Set(result.columns).size !== result.columns.length) {
      return invalid("Colunas duplicadas.");
    }
    for (const row of result.rows) {
      if (Object.keys(row).length !== result.columns.length) {
        return invalid("Schema da resposta mudou.");
      }
      for (const column of result.columns) {
        const v = value(row, column);
        if (typeof v === "number" && Number.isInteger(v) && !Number.isSafeInteger(v)) {
          return invalid("Inteiro fora da precisão segura; a fonte deve retornar texto exato.");
        }
        if (
          v !== null &&
          typeof v !== "string" &&
          typeof v !== "boolean" &&
          !(typeof v === "number" && Number.isFinite(v))
        ) {
          return invalid("Valor não escalar.");
        }
      }
    }
  }

  private combine(
    step: Exclude<FederationStep, { kind: "local" }>,
    tables: ReadonlyMap<string, Table>,
    check: (table?: Table) => void,
    rowLimit: number,
  ): Table {
    const get = (id: string): Table => tables.get(id) ?? invalid("Etapa de entrada ausente.");
    if (step.kind === "join") {
      return this.join(step, get(step.left), get(step.right), check, rowLimit);
    }
    if (step.kind === "union") {
      if (step.inputs.length < 2) {
        return invalid("União exige duas entradas.");
      }
      const inputs = step.inputs.map(get);
      const first = inputs[0]!;
      if (inputs.some((t) => JSON.stringify(t.columns) !== JSON.stringify(first.columns))) {
        return invalid("União exige schemas compatíveis e ordenados.");
      }
      if (inputs.reduce((count, t) => count + t.rows.length, 0) > rowLimit) {
        throw new PersonaV2Error("BUDGET_EXCEEDED", "União excedeu limite.");
      }
      for (const column of first.columns) {
        const types = new Set(
          inputs
            .flatMap((t) => t.rows.map((r) => value(r, column)))
            .filter((v) => v !== null)
            .map((v) => typeof v),
        );
        if (types.size > 1) {
          return invalid("Tipos incompatíveis na união.");
        }
      }
      return { columns: first.columns, rows: inputs.flatMap((t) => t.rows) };
    }
    const input = get(step.input);
    if (step.kind === "project") {
      this.assertColumns(
        input,
        step.columns.map((c) => c.column),
      );
      const columns = step.columns.map((c) => c.as);
      this.assertAliases(columns);
      return {
        columns,
        rows: input.rows.map((r) =>
          Object.fromEntries(step.columns.map((c) => [c.as, value(r, c.column)])),
        ),
      };
    }
    if (step.kind === "aggregate") {
      return this.aggregate(step, input, check);
    }
    this.assertColumns(
      input,
      step.order.map((c) => c.column),
    );
    const rows = [...input.rows].sort((left, right) => {
      for (const item of step.order) {
        const a = value(left, item.column),
          b = value(right, item.column);
        if (a === b) {
          continue;
        }
        if (a === null || b === null) {
          return (a === null ? -1 : 1) * (item.nulls === "first" ? 1 : -1);
        }
        const result =
          (item.valueType === "decimal" ? compareDecimal(a, b) : compare(a, b)) *
          (item.direction === "asc" ? 1 : -1);
        if (result !== 0) {
          return result;
        }
      }
      return 0;
    });
    return { columns: input.columns, rows };
  }

  private join(
    step: JoinStep,
    left: Table,
    right: Table,
    check: (table?: Table) => void,
    limit: number,
  ): Table {
    if (step.keys.length === 0) {
      return invalid("JOIN exige chaves treinadas.");
    }
    this.assertColumns(
      left,
      step.keys.map((k) => k.left),
    );
    this.assertColumns(
      right,
      step.keys.map((k) => k.right),
    );
    this.assertColumns(
      left,
      step.columns.filter((c) => c.side === "left").map((c) => c.column),
    );
    this.assertColumns(
      right,
      step.columns.filter((c) => c.side === "right").map((c) => c.column),
    );
    for (const pair of step.keys) {
      const types = new Set(
        [
          ...left.rows.map((r) => value(r, pair.left)),
          ...right.rows.map((r) => value(r, pair.right)),
        ]
          .filter((v) => v !== null)
          .map((v) => typeof v),
      );
      if (types.size > 1) {
        return invalid("Chaves com tipos incompatíveis; normalize explicitamente na fonte.");
      }
    }
    const columns = step.columns.map((c) => c.as);
    this.assertAliases(columns);
    const index = (table: Table, keys: readonly string[]): Map<string, DataRow[]> => {
      const map = new Map<string, DataRow[]>();
      for (const row of table.rows) {
        const k = key(row, keys);
        if (k !== null) {
          const bucket = map.get(k) ?? [];
          bucket.push(row);
          map.set(k, bucket);
        }
      }
      return map;
    };
    const leftIndex = index(
      left,
      step.keys.map((k) => k.left),
    );
    const rightIndex = index(
      right,
      step.keys.map((k) => k.right),
    );
    if (
      (step.cardinality !== "many_to_one" &&
        [...leftIndex.values()].some((rows) => rows.length > 1)) ||
      (step.cardinality !== "one_to_many" &&
        [...rightIndex.values()].some((rows) => rows.length > 1))
    ) {
      return invalid("Cardinalidade observada viola o relacionamento publicado.");
    }
    const rows: DataRow[] = [];
    for (const l of left.rows) {
      check();
      const k = key(
        l,
        step.keys.map((item) => item.left),
      );
      const matches: readonly (DataRow | null)[] =
        (k === null ? undefined : rightIndex.get(k)) ?? (step.join === "left" ? [null] : []);
      for (const r of matches) {
        if (rows.length >= limit) {
          throw new PersonaV2Error("BUDGET_EXCEEDED", "JOIN excedeu limite.");
        }
        rows.push(
          Object.fromEntries(
            step.columns.map((c) => [
              c.as,
              c.side === "left" ? value(l, c.column) : r === null ? null : value(r, c.column),
            ]),
          ),
        );
      }
    }
    return { columns, rows };
  }

  private aggregate(step: AggregateStep, input: Table, check: (table?: Table) => void): Table {
    this.assertColumns(input, [
      ...step.dimensions,
      ...step.measures.flatMap((m) => (m.column ? [m.column] : [])),
    ]);
    if (step.measures.some((m) => m.operation !== "count" && !m.column)) {
      return invalid("Medida sem coluna.");
    }
    const columns = [...step.dimensions, ...step.measures.map((m) => m.as)];
    this.assertAliases(columns);
    const groups = new Map<string, DataRow[]>();
    for (const row of input.rows) {
      const k = JSON.stringify(step.dimensions.map((c) => value(row, c)));
      const group = groups.get(k) ?? [];
      group.push(row);
      groups.set(k, group);
    }
    if (groups.size === 0 && step.dimensions.length === 0) {
      groups.set("[]", []);
    }
    return {
      columns,
      rows: [...groups.values()].map((rows) => {
        check();
        const result: Record<string, DataScalar> = Object.fromEntries(
          step.dimensions.map((c) => [c, value(rows[0]!, c)]),
        );
        for (const measure of step.measures) {
          const values = measure.column
            ? rows.map((r) => value(r, measure.column!)).filter((v) => v !== null)
            : [];
          if (measure.operation === "count") {
            result[measure.as] = measure.column ? values.length : rows.length;
          } else if (values.length === 0) {
            result[measure.as] = null;
          } else if (measure.operation === "sum") {
            result[measure.as] = decimalText(values.map(decimal).reduce(decimalAdd));
          } else {
            result[measure.as] = values.reduce((best, v) =>
              (measure.valueType === "decimal" ? compareDecimal(best, v) : compare(best, v)) *
                (measure.operation === "min" ? 1 : -1) <=
              0
                ? best
                : v,
            );
          }
        }
        return result;
      }),
    };
  }

  private assertColumns(table: Table, columns: readonly string[]): void {
    if (columns.some((c) => !table.columns.includes(c))) {
      return invalid("Coluna não declarada na entrada.");
    }
  }
  private assertAliases(columns: readonly string[]): void {
    if (
      columns.length === 0 ||
      columns.some((c) => !c) ||
      new Set(columns).size !== columns.length
    ) {
      return invalid("Projeção vazia ou aliases duplicados.");
    }
  }
}
