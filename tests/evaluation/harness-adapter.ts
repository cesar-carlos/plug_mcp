import { readFileSync } from "node:fs";
import { z } from "zod";
import type { ConsumerEvaluationAdapter } from "./consumer-contract.js";
const cases = z
  .object({
    cases: z.array(
      z.object({
        question: z.string(),
        sql: z.string(),
        params: z.record(z.string(), z.union([z.string(), z.number()])),
        expectedDecision: z.string(),
        group: z.string(),
      }),
    ),
  })
  .parse(
    JSON.parse(
      readFileSync(new URL("../fixtures/evaluation/scenarios.v1.json", import.meta.url), "utf8"),
    ),
  ).cases;
/** Somente ensaio do harness. Usa SQL de referência e nunca certifica qualidade de um modelo. */
const adapter: ConsumerEvaluationAdapter = {
  kind: "harness",
  model: "harness-self-test",
  async evaluate(input) {
    const scenario = cases.find((c) => c.question === input.question)!;
    await input.callTool("buscar_contexto", { query: input.question });
    await input.readResource("guia://treinamento-base");
    await input.callTool("obter_skill", { slug: "synthetic" });
    const args = { sql: scenario.sql, params: scenario.params, pergunta: input.question };
    const validation = z
      .object({ success: z.boolean() })
      .parse(await input.callTool("validar_consulta", args));
    if (!validation.success)
      return {
        decision:
          scenario.group === "seguranca"
            ? "recusar"
            : scenario.expectedDecision === "COLUNA_AMBIGUA"
              ? "ambigua"
              : "sem_cobertura",
        answer: "A consulta solicitada não possui autorização demonstrada.",
      };
    const result = z
      .object({
        success: z.boolean(),
        rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
      })
      .parse(await input.callTool("consultar_dados", args));
    return { decision: "responder", answer: JSON.stringify(result.rows), rows: result.rows };
  },
};
export default adapter;
