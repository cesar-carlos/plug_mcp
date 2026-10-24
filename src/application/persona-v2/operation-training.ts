import { z } from "zod";
import { operationLimits, type OperationLimits } from "../../domain/persona-v2/execution-limits.js";
import {
  operationTrainingSchema,
  operationScalarSchema,
  type OperationPackage,
  type OperationTraining,
} from "../../domain/persona-v2/operation-training.js";
export {
  operationTrainingSchema,
  operationScalarSchema,
  type OperationTraining,
  type OperationPackage,
} from "../../domain/persona-v2/operation-training.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { PersonaV2Error, type Source } from "../../domain/persona-v2/model.js";
import {
  validateOperationCommand,
  type OperationParameter,
  type SqlOperationCommand,
  type TypedScalar,
} from "../../domain/persona-v2/operation.js";
import { parseSourceRestrictions } from "./source-restrictions.js";
import { PERSONA_V2_TRAINING_BASE } from "./training-base.js";
import { adaptOperationSql } from "./operation-sql-adaptation.js";
import { quoteOperationTable } from "../../domain/persona-v2/operation-identifiers.js";
import { assertQueryRelationshipPaths } from "./query-relationship-paths.js";

const fail = (message: string): never => {
  throw new PersonaV2Error("INVALID_PLAN", message);
};
const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

const outputLookupKey = (
  t: OperationTraining,
  s: OperationTraining["steps"][number],
  source: Source,
): string[] | undefined => {
  const table = t.tables.find((v) => v.name === s.table)!;
  const fields = [...s.values, ...s.where];
  const scopes = parseSourceRestrictions(source.rowRestrictions).filter((r) => r.table === s.table);
  const keys = s.effect === "insert" ? (table.uniqueKeys ?? []) : [table.identity];
  return keys.find((key) =>
    key.every((column) => {
      if (scopes.some((r) => r.column === column)) return true;
      const binding = fields.find((v) => v.column === column)?.binding;
      return (
        binding &&
        (binding.kind !== "input" ||
          t.parameters.some((p) => p.name === binding.name && !p.nullable))
      );
    }),
  );
};

export function compileOperationTraining(
  raw: unknown,
  source: Source,
  crypto: CryptoPort,
  skillName: string,
): OperationPackage {
  const t = operationTrainingSchema.parse(raw);
  const relationships = t.relationships ?? [];
  assertQueryRelationshipPaths({ tables: t.tables, relationships });
  for (const relation of relationships) {
    const from = t.tables.find((table) => table.name === relation.from);
    const to = t.tables.find((table) => table.name === relation.to);
    if (
      !from ||
      !to ||
      new Set(relation.keys.map((key) => `${key.from}:${key.to}`)).size !== relation.keys.length ||
      relation.keys.some(
        (key) =>
          !from.columns.some((c) => c.name === key.from) ||
          !to.columns.some((c) => c.name === key.to),
      )
    ) {
      fail("Relacionamento da operação exige tabelas, campos e pares explícitos sem duplicação.");
    }
  }
  if (
    t.tables.some((table) =>
      table.columns.some((c) => c.classification && c.classification !== "livre"),
    )
  ) {
    fail("Classificação não livre não habilita operação SQL.");
  }
  if (t.tables.some((table) => table.name.split(".").at(-1) === "se7e_source_identity"))
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "A tabela de identidade é reservada à verificação do agente.",
    );
  if (!source.active || t.sourceId !== source.id || t.dialect !== source.dialect)
    fail("Fonte ou dialeto divergente.");
  const restrictions = parseSourceRestrictions(source.rowRestrictions);
  for (const table of t.tables) {
    quoteOperationTable(table.name, t.dialect);
    for (const other of [...t.tables.map((v) => v.name), ...restrictions.map((r) => r.table)]) {
      if (
        table.name !== other &&
        table.name.split(".").at(-1) === other.split(".").at(-1) &&
        (!table.name.includes(".") || !other.includes("."))
      ) {
        fail(
          "Tabela ou recorte ambíguo: use o mesmo nome físico qualificado em todas as referências.",
        );
      }
    }
  }
  if (
    !unique(t.parameters.map((p) => p.name)) ||
    t.parameters.some((p) => p.name.startsWith("__scope_")) ||
    !unique(t.tables.map((p) => p.name))
  )
    fail("Parâmetros ou tabelas duplicados/reservados.");
  const previous = new Map<string, (typeof t.steps)[number]>();
  for (const s of t.steps) {
    const table = t.tables.find((v) => v.name === s.table) ?? fail("Tabela não treinada.");
    if (
      !table ||
      !unique(table.columns.map((c) => c.name)) ||
      !unique([...table.identity, ...table.concurrency]) ||
      [...table.identity, ...table.concurrency].some(
        (c) => !table.columns.some((v) => v.name === c),
      )
    )
      fail("Identidade, concorrência ou estrutura inválida.");
    if (
      previous.has(s.id) ||
      s.id.startsWith("__operation_") ||
      !unique(s.values.map((c) => c.column)) ||
      !unique(s.where.map((c) => c.column)) ||
      !unique(s.outputs.map((c) => c.column))
    )
      fail("Etapa ou coluna duplicada.");
    if ((s.effect === "select" || s.effect === "delete") && s.values.length)
      fail("Valores não permitidos nesta etapa.");
    if (s.effect === "insert" && s.where.length) fail("INSERT não admite condição WHERE.");
    if ((s.effect === "insert" || s.effect === "update") && !s.values.length)
      fail("Escrita exige valores.");
    if (
      (s.effect === "update" || s.effect === "delete") &&
      [...table.identity, ...table.concurrency].some((c) => !s.where.some((w) => w.column === c))
    )
      fail("Identidade e condição de concorrência são obrigatórias.");
    if (s.effect !== "select" && (!s.rows.max || s.rows.max > t.maxAffectedRows))
      fail("Limite de escrita inválido.");
    if (s.effect === "select" && (!s.outputs.length || s.rows.min !== 1 || s.rows.max !== 1))
      fail("Leitura auxiliar exige uma linha e projeção explícita.");
    if (s.effect === "delete" && s.outputs.length) fail("DELETE com saídas ainda não suportado.");
    if (
      table.uniqueKeys?.some(
        (key) => !unique(key) || key.some((c) => !table.columns.some((v) => v.name === c)),
      )
    )
      fail("Chave única inválida.");
    if (t.dialect === "sybase" && s.effect !== "select" && s.outputs.length) {
      if (s.rows.min !== 1 || s.rows.max !== 1)
        fail("Saídas SQL Anywhere exigem exatamente uma linha alterada.");
      if (!outputLookupKey(t, s, source))
        fail(
          "SQL Anywhere exige chave UNIQUE treinada, preenchida e não nula para recuperar saídas.",
        );
    }
    for (const f of [...s.values, ...s.where]) {
      const column = table.columns.find((c) => c.name === f.column) ?? fail("Coluna não treinada.");
      if (!column || (s.values.includes(f) && !column.writable))
        fail("Coluna não treinada ou sem permissão de gravação.");
      const b = f.binding;
      const type =
        b.kind === "input"
          ? t.parameters.find((p) => p.name === b.name)?.type
          : b.kind === "operation_id"
            ? "uuid"
            : previous.get(b.stepId)?.outputs.find((o) => o.column === b.output)?.type;
      if (type !== column.type) fail("Binding inexistente, futuro ou de tipo incompatível.");
    }
    if (s.outputs.some((o) => !table.columns.some((c) => c.name === o.column && c.type === o.type)))
      fail("Saída sem contrato de coluna.");
    if (
      s.adaptiveFilters?.length &&
      (t.mode !== "sql_adaptavel" || s.effect === "insert" || !s.where.length)
    )
      fail("Filtros adaptáveis exigem modo SQL adaptável e WHERE obrigatório.");
    for (const f of s.adaptiveFilters ?? []) {
      const col =
        table.columns.find((c) => c.name === f.column) ?? fail("Coluna adaptável não treinada.");
      const param =
        t.parameters.find((p) => p.name === f.parameter) ??
        fail("Parâmetro adaptável não treinado.");
      if (param.type !== col.type || param.nullable)
        fail("Filtro adaptável sem coluna/parâmetro tipado não nulo.");
      if (["boolean", "uuid"].includes(col.type) && !["=", "<>"].includes(f.operator))
        fail("Comparação ordenada incompatível com o tipo.");
    }
    for (const r of parseSourceRestrictions(source.rowRestrictions).filter(
      (r) => r.table === s.table,
    )) {
      if (
        !table.columns.some((c) => c.name === r.column) ||
        s.values.some((c) => c.column === r.column) ||
        s.where.some((c) => c.column === r.column) ||
        s.adaptiveFilters?.some((c) => c.column === r.column)
      )
        fail("Coluna de recorte é reservada ao servidor.");
    }
    previous.set(s.id, s);
  }
  if (!t.steps.some((s) => s.effect !== "select")) fail("Operação precisa conter lançamento.");
  const nativeSteps =
    1 +
    t.steps.length +
    (t.dialect === "mssql" || t.dialect === "sybase"
      ? t.steps.filter((s) => s.effect !== "select").length
      : 0) +
    (t.dialect === "sybase"
      ? t.steps.filter((s) => s.effect !== "select" && s.outputs.length).length
      : 0);
  if (nativeSteps > 32)
    fail("Operação excede 32 comandos SQL incluindo identidade da base e contagem de linhas.");
  if (t.reconciliationQuery) {
    const r = t.reconciliationQuery;
    const table =
      t.tables.find((v) => v.name === r.table) ?? fail("Tabela do marcador não treinada.");
    const writes = t.steps.filter((s) => s.table === r.table && s.effect !== "select");
    if (
      table.identity.length !== 1 ||
      table.identity[0] !== r.operationIdColumn ||
      table.columns.find((c) => c.name === r.operationIdColumn)?.type !== "uuid" ||
      writes.length !== 1 ||
      writes[0]!.effect !== "insert" ||
      writes[0]!.rows.min !== 1 ||
      writes[0]!.rows.max !== 1 ||
      !writes[0]!.values.some(
        (v) => v.column === r.operationIdColumn && v.binding.kind === "operation_id",
      )
    )
      fail("Conciliação exige marcador UUID único inserido uma vez na mesma transação.");
    if (
      parseSourceRestrictions(source.rowRestrictions).some(
        (v) => v.table === r.table && v.column === r.operationIdColumn,
      )
    )
      fail("Marcador da operação não pode ser coluna de recorte.");
  }
  const capabilities = t.steps.flatMap((s) => [
    `source:${source.id}:table:${s.table}:${s.effect}`,
    ...s.values.map((c) => `source:${source.id}:column:${s.table}.${c.column}:write`),
    ...[...s.where, ...s.outputs, ...(s.adaptiveFilters ?? [])].map(
      (c) => `source:${source.id}:column:${s.table}.${c.column}:read`,
    ),
  ]);
  if (t.dialect === "sybase")
    for (const s of t.steps.filter((s) => s.effect !== "select" && s.outputs.length)) {
      capabilities.push(`source:${source.id}:table:${s.table}:select`);
      for (const column of [
        ...outputLookupKey(t, s, source)!,
        ...parseSourceRestrictions(source.rowRestrictions)
          .filter((r) => r.table === s.table)
          .map((r) => r.column),
      ])
        capabilities.push(`source:${source.id}:column:${s.table}.${column}:read`);
    }
  if (t.reconciliationQuery)
    capabilities.push(
      `source:${source.id}:table:${t.reconciliationQuery.table}:select`,
      `source:${source.id}:column:${t.reconciliationQuery.table}.${t.reconciliationQuery.operationIdColumn}:read`,
    );
  // The exact operation contract is a grant: changed predicates/limits/approval also require explicit release.
  const sourceFingerprint = crypto.sha256Hex(canonicalJson(source));
  capabilities.push(
    `operation-contract:${crypto.sha256Hex(canonicalJson({ training: t, sourceFingerprint }))}`,
  );
  return {
    format: "persona-sql-operation-v2",
    name: skillName,
    purpose: t.purpose,
    sourceId: source.id,
    sourceFingerprint,
    dialect: source.dialect,
    training: t,
    requiredCapabilities: [...new Set(capabilities)].sort(),
    commonTraining: {
      version: PERSONA_V2_TRAINING_BASE.version,
      hash: PERSONA_V2_TRAINING_BASE.hash,
      hubContractRef: PERSONA_V2_TRAINING_BASE.hubContract.ref,
    },
  };
}

export function compileOperationCommand(
  pkg: OperationPackage,
  source: Source,
  operationId: string,
  raw: unknown,
  crypto: CryptoPort,
  limits?: Partial<OperationLimits>,
): SqlOperationCommand {
  z.uuid().parse(operationId);
  const t = pkg.training;
  if (!!t.sharedKnowledge !== !!pkg.sharedKnowledge) {
    fail("Operação compartilhada exige pacote adotado e comprovado pela publicação.");
  }
  const adaptive =
    t.mode === "sql_adaptavel"
      ? z
          .strictObject({
            parameters: z.record(z.string(), operationScalarSchema),
            sqlByStep: z.record(z.string(), z.string().min(1).max(30000)).default({}),
          })
          .parse(raw)
      : null;
  const input = z
    .record(
      z
        .string()
        .regex(/^[a-z_][a-z0-9_]*$/)
        .max(100),
      operationScalarSchema,
    )
    .parse(adaptive ? adaptive.parameters : raw);
  if (adaptive && Object.keys(adaptive.sqlByStep).some((id) => !t.steps.some((s) => s.id === id)))
    fail("SQL proposto referencia etapa inexistente.");
  if (pkg.sourceFingerprint !== crypto.sha256Hex(canonicalJson(source)))
    fail("Fonte mudou desde a publicação.");
  if (
    Object.keys(input).length !== t.parameters.length ||
    t.parameters.some(
      (p) =>
        !input[p.name] ||
        (input[p.name]!.type !== p.type && !(p.nullable && input[p.name]!.type === "null")),
    )
  )
    fail("Entradas devem corresponder exatamente aos parâmetros tipados.");
  const q = (v: string): string =>
    t.dialect === "mssql" || t.dialect === "sybase" ? `[${v}]` : `"${v}"`;
  const steps = t.steps.flatMap((s, stepIndex) => {
    const target = quoteOperationTable(s.table, t.dialect);
    const params: Record<string, OperationParameter> = {};
    const bind = (f: (typeof s.values)[number], prefix: string): string => {
      const key = `${prefix}_${f.column}`;
      params[key] =
        f.binding.kind === "input"
          ? { kind: "value", scalar: input[f.binding.name]! }
          : f.binding.kind === "operation_id"
            ? { kind: "value", scalar: { type: "uuid", value: operationId } }
            : f.binding;
      return `:${key}`;
    };
    const values = s.values.map((f) => [f.column, bind(f, "v")] as const);
    const predicates = s.where.map((f) => `${q(f.column)} = ${bind(f, "w")}`);
    for (const r of parseSourceRestrictions(source.rowRestrictions).filter(
      (r) => r.table === s.table,
    )) {
      const col = t.tables
        .find((v) => v.name === s.table)!
        .columns.find((c) => c.name === r.column)!;
      const value = col.type === "boolean" ? r.value : String(r.value);
      const scalar = operationScalarSchema.parse({ type: col.type, value }) as TypedScalar;
      params[r.parameter] = { kind: "value", scalar };
      if (s.effect === "insert") values.push([r.column, `:${r.parameter}`]);
      else predicates.push(`${q(r.column)} = :${r.parameter}`);
    }
    const where = predicates.length ? ` WHERE ${predicates.join(" AND ")}` : "";
    const returning = s.outputs.map((o) => q(o.column)).join(", ");
    const output =
      t.dialect === "mssql" && returning && s.effect !== "select"
        ? ` OUTPUT ${s.outputs.map((o) => `INSERTED.${q(o.column)}`).join(", ")}`
        : "";
    let sql: string;
    if (s.effect === "select") sql = `SELECT ${returning} FROM ${target}${where}`;
    else if (s.effect === "insert")
      sql = `INSERT INTO ${target} (${values.map(([c]) => q(c)).join(", ")})${output} VALUES (${values.map(([, v]) => v).join(", ")})`;
    else if (s.effect === "update")
      sql = `UPDATE ${target} SET ${values.map(([c, v]) => `${q(c)} = ${v}`).join(", ")}${output}${where}`;
    else sql = `DELETE FROM ${target}${where}`;
    if (returning && s.effect !== "select" && ["postgres"].includes(t.dialect))
      sql += ` RETURNING ${returning}`;
    const proposed = adaptive?.sqlByStep[s.id];
    if (proposed !== undefined) {
      const filters = (s.adaptiveFilters ?? []).map((f, i) => ({
        key: `a_${i}`,
        predicate: `${q(f.column)} ${f.operator} :a_${i}`,
        parameter: f.parameter,
      }));
      const adapted = adaptOperationSql(
        sql,
        proposed,
        t.dialect,
        filters.map((f) => f.predicate),
      );
      sql = adapted.sql;
      for (const f of filters)
        if (adapted.usedParameters.has(f.key))
          params[f.key] = { kind: "value", scalar: input[f.parameter]! };
    }
    // Complete RETURNING rows prove the direct affected count on these drivers.
    // A constant avoids reading an ungranted business column. It is appended
    // after validating consumer adaptations and belongs to the prepared hash.
    if (!returning && s.effect !== "select" && ["postgres"].includes(t.dialect))
      sql += ' RETURNING 1 AS "__operation_row"';
    const step = {
      id: s.id,
      effect: s.effect,
      sql,
      params,
      outputs: Object.fromEntries(s.outputs.map((o) => [o.column, o.type])),
      ...(s.effect === "select" ? { expectedRows: s.rows } : { affectedRows: s.rows }),
    };
    if (t.dialect !== "sybase" || s.effect === "select" || !s.outputs.length) return [step];
    // Recover outputs from the affected row by a published UNIQUE key, on the
    // same connection/transaction. No session-global identity or MAX(id).
    const key = outputLookupKey(t, s, source)!;
    const scopes = parseSourceRestrictions(source.rowRestrictions).filter(
      (r) => r.table === s.table,
    );
    const lookupName = (column: string) =>
      scopes.find((r) => r.column === column)?.parameter ??
      `${s.values.some((v) => v.column === column) ? "v" : "w"}_${column}`;
    const lookup = Object.fromEntries(
      key.map((column) => {
        const name = lookupName(column);
        return [name, params[name]!];
      }),
    );
    const lookupPredicates = key.map((column) => `${q(column)} = :${lookupName(column)}`);
    for (const r of scopes.filter((r) => !key.includes(r.column))) {
      lookup[r.parameter] = params[r.parameter]!;
      lookupPredicates.push(`${q(r.column)} = :${r.parameter}`);
    }
    return [
      { ...step, id: `__operation_write_${stepIndex}`, outputs: {} },
      {
        id: s.id,
        effect: "select" as const,
        sql: `SELECT ${returning} FROM ${target} WHERE ${lookupPredicates.join(" AND ")}`,
        params: lookup,
        outputs: step.outputs,
        expectedRows: { min: 1, max: 1 },
      },
    ];
  });
  const content = {
    operationId,
    database: source.database,
    steps,
    ...operationLimits(t, limits ?? {}),
    ...(pkg.sharedKnowledge ? { expectedStructure: pkg.sharedKnowledge.expectedStructure } : {}),
  };
  if (
    t.steps.filter((s) => s.effect !== "select").reduce((sum, s) => sum + s.rows.min, 0) >
    content.maxAffectedRows
  )
    throw new PersonaV2Error(
      "BUDGET_EXCEEDED",
      "Limite de linhas afetadas não comporta as condições mínimas da operação.",
    );
  const command = {
    ...content,
    fingerprint: crypto.sha256Hex(canonicalJson({ publication: pkg, content })),
  };
  validateOperationCommand(command);
  if (Buffer.byteLength(canonicalJson(command), "utf8") > 2 * 1024 * 1024 - 65536 - 4096)
    fail("Conteúdo excede o limite de transporte da operação.");
  return command;
}
