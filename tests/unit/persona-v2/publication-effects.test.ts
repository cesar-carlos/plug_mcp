import { expect, it } from "vitest";
import {
  effectPhases,
  exercisePublicationEffects,
} from "../../helpers/persona-publication-effects.js";
import { matrixTables } from "../../helpers/persona-publication-matrix.js";
import { trainingSource } from "../../helpers/persona-v2-training.js";
import { operationCaseSchema } from "../../../src/application/persona-v2/operation-cases.js";
import {
  operationTrainingSchema,
  compileOperationTraining,
  compileOperationCommand,
} from "../../../src/application/persona-v2/operation-training.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";

for (const dialect of ["postgres", "mssql", "sybase"] as const) {
  it.each(effectPhases)(`${dialect}: contrato de %s compila sem remover guardas`, async (phase) => {
    const crypto = new NodeCryptoAdapter("a".repeat(64));
    const source = { ...trainingSource, dialect };
    let training: ReturnType<typeof operationTrainingSchema.parse> | undefined;
    const cases: ReturnType<typeof operationCaseSchema.parse>[] = [];
    await exercisePublicationEffects({
      phase,
      source,
      tables: matrixTables,
      post: (path, body) => {
        const input = body as Record<string, unknown>;
        if (path.endsWith("/casos")) cases.push(operationCaseSchema.parse(input.content));
        else training = operationTrainingSchema.parse(input.training);
        return Promise.resolve({ status: 201, body: { skill: { id: crypto.randomId() } } });
      },
      run: () => {
        const pkg = compileOperationTraining(training!, source, crypto, phase);
        for (const test of cases) {
          const command = compileOperationCommand(
            pkg,
            source,
            crypto.randomId(),
            test.input.parameters,
            crypto,
          );
          expect(command.steps.every((s) => s.affectedRows?.max === 1)).toBe(true);
          expect(command.maxAffectedRows).toBe(training!.steps.length);
        }
        expect(cases.some((c) => !("error" in c.expected))).toBe(true);
        expect(cases.some((c) => "error" in c.expected)).toBe(true);
        return Promise.resolve({ approved: true, results: [] });
      },
      publish: () => Promise.resolve(),
    });
  });
}
