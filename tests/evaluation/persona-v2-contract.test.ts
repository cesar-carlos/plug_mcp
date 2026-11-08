import { expect, it, vi } from "vitest";
import {
  personaEvaluationManifestSchema,
  personaEvaluationReferenceSchema,
  evaluationBindingsSchema,
} from "./persona-v2-contract.js";
import { evaluatePersonaConsumer } from "./persona-v2-evaluator.js";
import { personaBehaviorCases } from "./persona-v2-regression-cases.js";

it("uses the same strict contract for CLI manifests and direct evaluation", async () => {
  const manifest = {
    generation: "persona-v2",
    isolatedFixture: true,
    datasetAuthorization: "synthetic",
    candidate: { mcp: "a".repeat(40), hub: "b".repeat(40), agent: "c".repeat(40) },
    cases: personaBehaviorCases,
  };
  expect(personaEvaluationManifestSchema.safeParse(manifest).success).toBe(true);
  const invalid = structuredClone(manifest);
  invalid.cases[0]!.expected.behavior = {
    toolPrerequisites: [{ before: "unknown" as "obter_skill", after: "consultar_dados" }],
  };
  expect(personaEvaluationManifestSchema.safeParse(invalid).success).toBe(false);
  const openSession = vi.fn(async () => {
    throw new Error("must not open");
  });
  await expect(
    evaluatePersonaConsumer({
      ...invalid,
      datasetAuthorization: "synthetic",
      openSession,
      adapter: {
        kind: "harness",
        model: "test",
        revision: "1",
        evaluate: async () => {
          throw new Error("must not evaluate");
        },
      },
      judge: { kind: "harness", identity: "test", revision: "1", judge: async () => true },
    }),
  ).rejects.toThrow();
  expect(openSession).not.toHaveBeenCalled();
});
it("requires explicit expected bindings and rejects duplicates", () => {
  const reference = structuredClone(personaBehaviorCases[0]!.expected);
  delete reference.bindings;
  expect(personaEvaluationReferenceSchema.safeParse(reference).success).toBe(false);
  const binding = personaBehaviorCases[0]!.expected.bindings![0]!;
  expect(evaluationBindingsSchema.safeParse([binding, binding]).success).toBe(false);
});
