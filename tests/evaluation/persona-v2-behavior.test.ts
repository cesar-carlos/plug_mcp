import { expect, it } from "vitest";
import { evaluatePersonaConsumer, type PersonaEvaluationSession } from "./persona-v2-evaluator.js";
import { personaBehaviorCases } from "./persona-v2-regression-cases.js";

async function run(
  mode:
    | "correct"
    | "skip_discovery"
    | "validation_only"
    | "retry"
    | "false_complete"
    | "excess_calls"
    | "wrong_order"
    | "concurrent"
    | "followup_retry"
    | "denied_contract"
    | "wrong_skill"
    | "stale_publication"
    | "wrong_source"
    | "missing_binding"
    | "inconsistent_read"
    | "concurrent_binding",
  trials = 1,
) {
  const dispatched: string[] = [];
  const cases = structuredClone(personaBehaviorCases);
  if (mode === "concurrent_binding") delete cases[0]!.expected.behavior!.toolPrerequisites;
  const report = await evaluatePersonaConsumer({
    cases,
    trials,
    datasetAuthorization: "synthetic",
    candidate: { mcp: "a".repeat(40), hub: "b".repeat(40), agent: "c".repeat(40) },
    adapter: {
      kind: "harness",
      model: "behavior-self-test",
      revision: "1",
      async evaluate(context) {
        expect(context).not.toHaveProperty("expected");
        // Oracle deliberately tests the evaluator, never qualifies as model evidence.
        const parent = personaBehaviorCases.find(
          (item) =>
            item.question === context.question ||
            item.followUps?.some((turn) => turn.question === context.question),
        )!;
        const scenario =
          parent.question === context.question
            ? parent
            : {
                ...parent.followUps!.find((turn) => turn.question === context.question)!,
                id: parent.id,
              };
        let sequence = [...scenario.expected.behavior!.requiredTools!];
        if (mode === "wrong_order") sequence = sequence.reverse();
        if (
          (mode === "concurrent" || mode === "concurrent_binding") &&
          scenario.id === "discover_sales_contract"
        ) {
          await Promise.all(sequence.map((name) => context.callTool(name, {})));
          sequence = [];
        }
        for (const name of sequence) {
          if (mode === "skip_discovery" && name !== "consultar_dados") continue;
          await context.callTool(
            mode === "validation_only" && name === "consultar_dados" ? "validar_consulta" : name,
            {},
          );
        }
        if (mode === "retry" && scenario.id.startsWith("hub_"))
          await context.callTool("consultar_dados", {}).catch(() => undefined);
        if (mode === "followup_retry" && context.history.length > 0)
          await context.callTool("consultar_dados", {}).catch(() => undefined);
        if (mode === "excess_calls" && scenario.id === "discover_sales_contract")
          await context.callTool("consultar_dados", {});
        return {
          decision:
            mode === "false_complete" && scenario.id === "partial_sales_result"
              ? "responder"
              : scenario.expected.decision,
          rows: scenario.expected.rows,
          text: "synthetic private answer",
        };
      },
    },
    judge: { kind: "harness", identity: "self-test", revision: "1", judge: async () => true },
    openSession: async (id) => ({
      instructions: "synthetic fixture",
      tools: ["buscar_contexto", "obter_skill", "validar_consulta", "consultar_dados"].map(
        (name) => ({ name, description: "fixture", inputSchema: {} }),
      ),
      async callTool(name) {
        dispatched.push(`${id}:${name}`);
        const status: NonNullable<
          Awaited<ReturnType<PersonaEvaluationSession["callTool"]>>["evidence"]
        >["status"] =
          mode === "denied_contract" && name === "obter_skill"
            ? "denied"
            : id === "hub_transport_no_retry"
              ? "error"
              : id === "hub_permission_no_retry"
                ? "denied"
                : id === "partial_sales_result"
                  ? "partial"
                  : "complete";
        return {
          content: {},
          evidence: {
            status,
            sources: [
              mode === "wrong_source" && name === "obter_skill"
                ? "other-source"
                : "synthetic-sales",
            ],
            publications: [
              (mode === "stale_publication" || mode === "inconsistent_read") &&
              name === "obter_skill"
                ? "synthetic-sales-v0"
                : "synthetic-sales-v1",
            ],
            ...(mode === "missing_binding"
              ? {}
              : {
                  bindings: [
                    {
                      skillId:
                        mode === "wrong_skill" && name === "obter_skill"
                          ? "other-skill"
                          : "sales-skill",
                      publicationId:
                        mode === "stale_publication" && name === "obter_skill"
                          ? "synthetic-sales-v0"
                          : "synthetic-sales-v1",
                      sourceId:
                        mode === "wrong_source" && name === "obter_skill"
                          ? "other-source"
                          : "synthetic-sales",
                    },
                  ],
                }),
          },
        };
      },
      close: async () => undefined,
    }),
  });
  return { report, dispatched };
}

it("evaluates the behavioral fixture without certifying a model or exporting content", async () => {
  const { report } = await run("correct");
  expect(report.rates).toEqual({ supported: 1, security: 1, gap: 1 });
  expect(report.accepted).toBe(false);
  expect(report.qualityMeasured).toBe(false);
  expect(JSON.stringify(report)).not.toContain("synthetic private answer");
});
it("resets failure protection only with a new independent trial", async () => {
  const { report, dispatched } = await run("correct", 2);
  expect(report.results.every((item) => item.passed)).toBe(true);
  for (const id of ["hub_transport_no_retry", "hub_permission_no_retry"]) {
    expect(report.results.filter((item) => item.id === id).map((item) => item.turns)).toEqual([
      2, 2,
    ]);
    expect(dispatched.filter((call) => call === `${id}:consultar_dados`)).toHaveLength(2);
  }
});

it.each([
  ["skip_discovery", "discover_sales_contract", "behavior"],
  ["validation_only", "discover_sales_contract", "execution"],
  ["false_complete", "partial_sales_result", "reference"],
  ["excess_calls", "discover_sales_contract", "behavior"],
  ["wrong_order", "discover_sales_contract", "behavior"],
  ["concurrent", "discover_sales_contract", "behavior"],
  ["denied_contract", "discover_sales_contract", "behavior"],
  ["wrong_skill", "discover_sales_contract", "behavior"],
  ["stale_publication", "discover_sales_contract", "behavior"],
  ["wrong_source", "discover_sales_contract", "behavior"],
  ["missing_binding", "discover_sales_contract", "behavior"],
  ["inconsistent_read", "discover_sales_contract", "behavior"],
  ["concurrent_binding", "discover_sales_contract", "behavior"],
] as const)("rejects %s even with an approving harness judge", async (mode, id, failure) => {
  const { report } = await run(mode);
  expect(report.results.find((item) => item.id === id)).toMatchObject({ passed: false, failure });
});

it.each(["retry", "followup_retry"] as const)(
  "rejects %s after hub failure or denial before another dispatch",
  async (mode) => {
    const { report, dispatched } = await run(mode);
    for (const id of ["hub_transport_no_retry", "hub_permission_no_retry"]) {
      expect(report.results.find((item) => item.id === id)).toMatchObject({
        passed: false,
        failure: "tool_policy",
        turns: mode === "followup_retry" ? 2 : 1,
      });
      expect(dispatched.filter((call) => call === `${id}:consultar_dados`)).toHaveLength(1);
    }
  },
);
