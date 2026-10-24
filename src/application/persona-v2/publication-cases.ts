import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type {
  PersonaRepositoryPort,
  PersonaTransaction,
} from "../../domain/ports/persona-v2.port.js";
import { canonicalJson, type QueryPackage } from "../../domain/persona-v2/catalog.js";
import { PersonaV2Error, type Source } from "../../domain/persona-v2/model.js";
import {
  queryPublicationCaseSchema,
  type QueryPublicationCase,
} from "../../domain/persona-v2/publication-fixture.js";
import { compileQueryTraining, queryTrainingSchema } from "./query-training.js";
import { adoptQueryKnowledge } from "./shared-query-adoption.js";
import { compileOperationPublication } from "./shared-operation-adoption.js";
import { compileOperationCommand } from "./operation-training.js";
import type { PublicationRunEvidence } from "../../domain/persona-v2/publication-run.js";
import type { TypedScalar } from "../../domain/persona-v2/operation.js";
import type { OperationPackage } from "../../domain/persona-v2/operation-training.js";
import {
  assertOperationCaseCoverage,
  operationCaseSchema,
  type IsolatedOperationCaseExecutor,
} from "./operation-cases.js";

export interface IsolatedPublicationCaseExecutor extends IsolatedOperationCaseExecutor {
  evidence?(source: Source): PublicationRunEvidence["sources"][number];
  evaluateQuery(pkg: QueryPackage, source: Source, test: QueryPublicationCase): Promise<boolean>;
}

/** Operator-only. No endpoint accepts reports. Network work never holds MCP locks. */
export async function runSqlPublicationCases(
  repository: PersonaRepositoryPort,
  personaId: string,
  skillId: string,
  crypto: CryptoPort,
  executor: IsolatedPublicationCaseExecutor,
  now: () => Date = () => new Date(),
): Promise<{
  approved: boolean;
  revision: number;
  packageHash: string;
  results: { id: string; passed: boolean }[];
}> {
  const locks = { personaIds: [personaId], tokenIds: [] };
  const runId = crypto.randomId();
  const startedAt = now().toISOString();
  const evidence = (
    source: Source,
    pkg: QueryPackage | OperationPackage,
    completed = false,
  ): PublicationRunEvidence | undefined =>
    executor.evidence
      ? {
          version: 1,
          runId,
          startedAt,
          ...(completed ? { completedAt: now().toISOString() } : {}),
          scope: "isolated-sql-transport",
          sources: [executor.evidence(source)],
          dependencies: pkg.sharedKnowledge
            ? [
                {
                  publicationId: pkg.sharedKnowledge.publicationId,
                  hash: pkg.sharedKnowledge.publicationHash,
                },
                ...(pkg.sharedKnowledge.profilePublicationId
                  ? [
                      {
                        publicationId: pkg.sharedKnowledge.profilePublicationId,
                        hash: pkg.sharedKnowledge.profileHash!,
                      },
                    ]
                  : []),
              ]
            : [],
        }
      : undefined;
  const capture = async (tx: PersonaTransaction) => {
    const persona = await tx.findPersona(personaId);
    const draft = await tx.catalog.find(personaId, skillId);
    if (!persona?.active || !draft || !["consulta", "operacao_sql"].includes(draft.kind))
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Persona ou rascunho SQL indisponível.");
    if (!draft.training || typeof draft.training !== "object")
      throw new PersonaV2Error("INVALID_PLAN", "Treinamento inválido.");
    const source = (await tx.listSources(personaId)).find(
      (s) => s.id === Reflect.get(draft.training as object, "sourceId"),
    );
    if (!source?.active) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte indisponível.");
    const pkg =
      draft.kind === "operacao_sql"
        ? await compileOperationPublication(
            tx,
            persona.ownerId,
            source,
            draft.training,
            { crypto, now },
            draft.name,
          )
        : await (async (): Promise<QueryPackage> => {
            const training = queryTrainingSchema.parse(draft.training);
            return {
              ...compileQueryTraining(training, source, crypto),
              ...(training.sharedKnowledge
                ? {
                    sharedKnowledge: await adoptQueryKnowledge(
                      tx,
                      persona.ownerId,
                      source,
                      training,
                      { crypto, now },
                    ),
                  }
                : {}),
              name: draft.name,
            };
          })();
    const cases = await tx.catalog.cases(personaId, skillId);
    if (!cases.some((c) => c.required))
      throw new PersonaV2Error("INCOMPLETE_INPUT", "Runner exige casos obrigatórios.");
    if (pkg.format === "persona-sql-operation-v2") assertOperationCaseCoverage(pkg, cases);
    if (pkg.sharedKnowledge && executor.supportsStructureGuard !== true)
      throw new PersonaV2Error(
        "CAPABILITY_UNAVAILABLE",
        "Runner sem guarda estrutural na conexão da fixture.",
      );
    return {
      draft,
      source,
      pkg,
      cases,
      packageHash: crypto.sha256Hex(canonicalJson(pkg)),
      casesHash: crypto.sha256Hex(canonicalJson(cases)),
      fence: crypto.sha256Hex(
        canonicalJson({
          persona,
          source,
          revision: draft.revision,
          name: draft.name,
          kind: draft.kind,
        }),
      ),
    };
  };
  const snapshot = await repository.transaction(locks, async (tx) => {
    const current = await capture(tx);
    await tx.catalog.saveReport(
      personaId,
      skillId,
      current.draft.revision,
      current.packageHash,
      current.casesHash,
      false,
      current.cases.map((c) => ({ id: c.id, passed: false })),
      "persona-generic-sql-fixtures-v1",
      evidence(current.source, current.pkg),
    );
    return structuredClone(current);
  });
  const results: { id: string; passed: boolean }[] = [];
  for (const test of snapshot.cases) {
    await repository.transaction(locks, async (tx) => {
      const current = await capture(tx);
      if (
        current.fence !== snapshot.fence ||
        current.packageHash !== snapshot.packageHash ||
        current.casesHash !== snapshot.casesHash
      )
        throw new PersonaV2Error(
          "STALE_AUTHORIZATION",
          "Conteúdo, casos ou fonte mudaram antes do próximo teste.",
        );
    });
    let passed: boolean;
    if (snapshot.pkg.format === "persona-query-v2") {
      passed = await executor.evaluateQuery(
        snapshot.pkg,
        snapshot.source,
        queryPublicationCaseSchema.parse(test.content),
      );
    } else {
      const content = operationCaseSchema.parse(test.content);
      const operationId = crypto.randomId();
      const alias = content.input.operationId;
      if (alias !== undefined) {
        const marker = snapshot.pkg.training.reconciliationQuery;
        if (!marker)
          throw new PersonaV2Error(
            "INCOMPLETE_INPUT",
            "ID simbólico exige marcador de conciliação treinado.",
          );
        // A fixed ID in a case is a logical alias only; never dispatch it or reuse its receipt.
        const replace = (table: string, rows: Record<string, TypedScalar>[]) => {
          if (table !== marker.table) return;
          for (const row of rows) {
            const value = row[marker.operationIdColumn];
            if (value?.type === "uuid" && value.value === alias)
              row[marker.operationIdColumn] = { type: "uuid", value: operationId };
          }
        };
        for (const fixture of content.input.fixtures) replace(fixture.table, fixture.rows);
        if (!("error" in content.expected))
          for (const table of content.expected.tables) replace(table.table, table.rows);
        content.input.operationId = operationId;
      }
      let command;
      try {
        command = compileOperationCommand(
          snapshot.pkg,
          snapshot.source,
          operationId,
          snapshot.pkg.training.mode === "sql_adaptavel"
            ? { parameters: content.input.parameters, sqlByStep: content.input.sqlByStep ?? {} }
            : content.input.parameters,
          crypto,
        );
      } catch (error) {
        if (!(error instanceof PersonaV2Error) || error.code !== "INVALID_PLAN") throw error;
        results.push({
          id: test.id,
          passed: "error" in content.expected && content.expected.error === "INVALID_PLAN",
        });
        continue;
      }
      passed =
        !("error" in content.expected && content.expected.error === "INVALID_PLAN") &&
        (await executor.evaluate(snapshot.pkg, command, content));
    }
    results.push({ id: test.id, passed });
  }
  return repository.transaction(locks, async (tx) => {
    const current = await capture(tx);
    if (
      current.fence !== snapshot.fence ||
      current.packageHash !== snapshot.packageHash ||
      current.casesHash !== snapshot.casesHash
    )
      throw new PersonaV2Error(
        "STALE_AUTHORIZATION",
        "Conteúdo, casos ou fonte mudaram durante os testes. Execute uma nova rodada.",
      );
    const approved =
      (current.pkg.format !== "persona-sql-operation-v2" ||
        current.cases.some(
          (c) => c.required && !("error" in operationCaseSchema.parse(c.content).expected),
        )) &&
      current.cases
        .filter((c) => c.required)
        .every((c) => results.find((r) => r.id === c.id)?.passed);
    await tx.catalog.saveReport(
      personaId,
      skillId,
      current.draft.revision,
      current.packageHash,
      current.casesHash,
      approved,
      results,
      "persona-generic-sql-fixtures-v1",
      evidence(current.source, current.pkg, true),
    );
    return {
      approved,
      revision: current.draft.revision,
      packageHash: current.packageHash,
      results,
    };
  });
}
