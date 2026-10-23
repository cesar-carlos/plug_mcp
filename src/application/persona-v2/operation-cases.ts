import { z } from "zod";
import type { PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import {
  compileOperationCommand,
  operationScalarSchema,
  type OperationPackage,
} from "./operation-training.js";
import type { SqlOperationCommand } from "../../domain/persona-v2/operation.js";
import { compileOperationPublication } from "./shared-operation-adoption.js";
import { operationTableNameSchema } from "../../domain/persona-v2/operation-training.js";

const row = z.record(z.string().regex(/^[a-z_][a-z0-9_]*$/), operationScalarSchema);
export const operationCaseSchema = z.strictObject({
  name: z.string().min(1),
  input: z.strictObject({
    parameters: row,
    operationId: z.uuid().optional(),
    sqlByStep: z.record(z.string(), z.string().min(1).max(30000)).optional(),
    fixtures: z
      .array(
        z.strictObject({
          table: operationTableNameSchema,
          generated: z.array(z.string()).default([]),
          rows: z.array(row).max(100),
        }),
      )
      .min(1)
      .max(32),
  }),
  expected: z.union([
    z.strictObject({
      affectedRows: z.number().int().min(0),
      tables: z
        .array(z.strictObject({ table: operationTableNameSchema, rows: z.array(row).max(100) }))
        .min(1)
        .max(32),
    }),
    z.strictObject({ error: z.enum(["ROW_CONDITION_FAILED", "NATIVE_FAILURE", "INVALID_PLAN"]) }),
  ]),
});
export type OperationCase = z.infer<typeof operationCaseSchema>;
export function assertOperationCaseCoverage(
  pkg: OperationPackage,
  cases: readonly { required: boolean; content: unknown }[],
): void {
  if (pkg.training.mode !== "sql_adaptavel" && !pkg.training.reconciliationQuery) return;
  const mandatory = cases
    .filter((c) => c.required)
    .map((c) => operationCaseSchema.parse(c.content));
  const positive = mandatory.filter((c) => !("error" in c.expected));
  if (!positive.length)
    throw new PersonaV2Error("INCOMPLETE_INPUT", "Operação exige caso positivo obrigatório.");
  if (
    pkg.training.mode === "sql_adaptavel" &&
    (!positive.some((c) => Object.keys(c.input.sqlByStep ?? {}).length > 0) ||
      !mandatory.some(
        (c) =>
          "error" in c.expected &&
          c.expected.error === "INVALID_PLAN" &&
          Object.keys(c.input.sqlByStep ?? {}).length > 0,
      ))
  )
    throw new PersonaV2Error(
      "INCOMPLETE_INPUT",
      "SQL adaptável exige casos obrigatórios de adaptação aceita e SQL recusado.",
    );
  if (
    pkg.training.reconciliationQuery &&
    !positive.some(
      (c) =>
        c.input.operationId &&
        !("error" in c.expected) &&
        c.expected.tables.some(
          (t) =>
            t.table === pkg.training.reconciliationQuery!.table &&
            t.rows.some(
              (r) =>
                r[pkg.training.reconciliationQuery!.operationIdColumn]?.value ===
                c.input.operationId,
            ),
        ),
    )
  )
    throw new PersonaV2Error(
      "INCOMPLETE_INPUT",
      "Conciliação exige caso obrigatório com marcador da operação.",
    );
}
export interface IsolatedOperationCaseExecutor {
  /** Only executors checking the expectation on the actual fixture connection may opt in. */
  readonly supportsStructureGuard?: true;
  /** Real dedicated fixture engine, rollback after comparison. Never use a registered source connection. */
  evaluate(
    pkg: OperationPackage,
    command: SqlOperationCommand,
    test: OperationCase,
  ): Promise<boolean>;
}
/** Operator-only runner. No consumer/admin endpoint accepts a report or an approval boolean. */
export async function runOperationCases(
  tx: PersonaTransaction,
  personaId: string,
  skillId: string,
  crypto: CryptoPort,
  executor: IsolatedOperationCaseExecutor,
  now: () => Date = () => new Date(),
): Promise<{
  approved: boolean;
  revision: number;
  packageHash: string;
  results: { id: string; passed: boolean }[];
  scope: string;
}> {
  const draft = await tx.catalog.find(personaId, skillId);
  if (draft?.kind !== "operacao_sql")
    throw new PersonaV2Error("INVALID_PLAN", "Runner exige operação SQL.");
  const sources = await tx.listSources(personaId);
  const source = sources.find((s) => s.id === Reflect.get(draft.training as object, "sourceId"));
  if (!source) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte indisponível.");
  const persona = await tx.findPersona(personaId);
  if (!persona) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Persona indisponível.");
  const pkg = await compileOperationPublication(
    tx,
    persona.ownerId,
    source,
    draft.training,
    { crypto, now },
    draft.name,
  );
  if (pkg.sharedKnowledge && executor.supportsStructureGuard !== true) {
    throw new PersonaV2Error(
      "CAPABILITY_UNAVAILABLE",
      "Runner sem guarda estrutural na conexão da fixture; não pode aprovar operação compartilhada.",
    );
  }
  const cases = await tx.catalog.cases(personaId, skillId);
  assertOperationCaseCoverage(pkg, cases);
  if (!cases.some((c) => c.required))
    throw new PersonaV2Error("INCOMPLETE_INPUT", "Cadastre casos obrigatórios.");
  const results: { id: string; passed: boolean }[] = [];
  for (const test of cases) {
    let passed = false;
    try {
      const content = operationCaseSchema.parse(test.content);
      let command: SqlOperationCommand | undefined;
      try {
        command = compileOperationCommand(
          pkg,
          source,
          content.input.operationId ?? crypto.randomId(),
          pkg.training.mode === "sql_adaptavel"
            ? {
                parameters: content.input.parameters,
                sqlByStep: content.input.sqlByStep ?? {},
              }
            : content.input.parameters,
          crypto,
        );
      } catch (error) {
        passed =
          "error" in content.expected &&
          content.expected.error === "INVALID_PLAN" &&
          error instanceof PersonaV2Error &&
          error.code === "INVALID_PLAN";
      }
      if (command && !("error" in content.expected && content.expected.error === "INVALID_PLAN"))
        passed = await executor.evaluate(pkg, command, content);
    } catch {
      /* Missing/invalid fixture or engine is a failed case, never a skipped approval. */
    }
    results.push({ id: test.id, passed });
  }
  const approved = cases
    .filter((c) => c.required)
    .every((c) => results.find((r) => r.id === c.id)?.passed);
  const packageHash = crypto.sha256Hex(canonicalJson(pkg));
  await tx.catalog.saveReport(
    personaId,
    skillId,
    draft.revision,
    packageHash,
    crypto.sha256Hex(canonicalJson(cases)),
    approved,
    results,
  );
  return {
    approved,
    revision: draft.revision,
    packageHash,
    results,
    scope: "SQL em fixture isolada com rollback; não certifica journal, ODBC ou IA consumidora.",
  };
}
