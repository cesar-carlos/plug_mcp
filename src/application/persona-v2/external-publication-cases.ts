import { z } from "zod";
import type { TrainingCase } from "../../domain/persona-v2/catalog.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import {
  externalContractSchema,
  validateExternalValues,
  type ExternalPackage,
  type ExternalConnection,
  type ExternalTransport,
  type ExternalActionTransport,
} from "../../domain/persona-v2/external-contract.js";
import { classifyExternalEvidence } from "../../domain/persona-v2/external-reconciliation.js";
export const externalCaseContentSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  input: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  expected: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

/** One attempt per case; an ambiguous effect stops the remaining dispatches. */
export async function evaluateExternalCases(
  pkg: ExternalPackage,
  cases: readonly TrainingCase[],
  fixture: ExternalConnection,
  transport: ExternalTransport & Partial<ExternalActionTransport>,
  revalidate: () => Promise<void>,
): Promise<{ results: { id: string; passed: boolean }[]; uncertain: boolean }> {
  const results: { id: string; passed: boolean }[] = [];
  let uncertain = false;
  for (const test of cases) {
    if (uncertain) {
      results.push({ id: test.id, passed: false });
      continue;
    }
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), pkg.training.timeoutMs);
    timer.unref();
    let passed: boolean,
      sent = false;
    try {
      const c = externalCaseContentSchema.parse(test.content);
      const values = validateExternalValues(pkg.training.input, c.input);
      validateExternalValues(pkg.training.output, c.expected);
      const beforeDispatch = async () => {
        if (controller.signal.aborted) throw new Error("Fixture timeout");
        await revalidate();
        if (controller.signal.aborted) throw new Error("Fixture timeout");
      };
      const args = [fixture, pkg.training, values, controller.signal, beforeDispatch] as const;
      const data =
        pkg.training.effect === "acao"
          ? await transport.executeAction?.(...args, async () => {
              await beforeDispatch();
              sent = true;
            })
          : await transport.invoke(...args);
      passed =
        canonicalJson(validateExternalValues(pkg.training.output, data)) ===
        canonicalJson(c.expected);
      const check = pkg.training.reconciliationCheck;
      if (passed && check) {
        const read = externalContractSchema.parse({
          operationId: pkg.training.operationId,
          integrationId: pkg.training.integrationId,
          purpose: check.guarantee,
          effect: "consulta",
          transport: check.transport,
          input: check.input,
          output: check.output,
          timeoutMs: pkg.training.timeoutMs,
          maxResponseBytes: pkg.training.maxResponseBytes,
        });
        const evidence = validateExternalValues(
          check.output,
          await transport.invoke(
            fixture,
            read,
            validateExternalValues(
              check.input,
              Object.fromEntries(
                Object.entries(check.bindings).map(([key, source]) => [key, values[source]!]),
              ),
            ),
            controller.signal,
            beforeDispatch,
          ),
        );
        passed = classifyExternalEvidence(check, values, evidence).status === "applied_verified";
      }
      if (controller.signal.aborted) passed = false;
    } catch {
      uncertain = sent;
      passed = false;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    results.push({ id: test.id, passed });
  }
  return { results, uncertain };
}
