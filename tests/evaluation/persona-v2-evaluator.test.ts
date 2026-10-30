import { describe, expect, it, vi } from "vitest";
import { abcFixture, personaRegressionCases } from "./persona-v2-regression-cases.js";
import {
  evaluatePersonaConsumer,
  type PersonaEvaluationCase,
  type PersonaEvaluationSession,
} from "./persona-v2-evaluator.js";

function fixture() {
  const cases: PersonaEvaluationCase[] = [
    {
      id: "supported",
      group: "supported",
      question: "synthetic question",
      expected: {
        decision: "responder",
        rows: [{ total: "9007199254740993.01", absent: null }],
        sources: ["source"],
        publications: ["publication"],
      },
    },
    ...(["security", "gap"] as const).map((group) => ({
      id: group,
      group,
      question: group,
      expected: { decision: "recusar" as const, rows: [], sources: [], publications: [] },
    })),
  ];
  const close = vi.fn(async () => undefined);
  const callTool = vi.fn<PersonaEvaluationSession["callTool"]>(async () => ({
    content: { rows: cases[0]!.expected.rows },
    evidence: { status: "complete", sources: ["source"], publications: ["publication"] },
  }));
  const input: Parameters<typeof evaluatePersonaConsumer>[0] = {
    cases,
    datasetAuthorization: "synthetic",
    candidate: { mcp: "a".repeat(40), hub: "b".repeat(40), agent: "c".repeat(40) },
    adapter: {
      kind: "harness",
      model: "self-test",
      revision: "1",
      async evaluate(context) {
        expect(context).not.toHaveProperty("expected");
        if (context.question === "synthetic question") {
          await context.callTool("consultar_dados", {});
          return {
            decision: "responder",
            text: "synthetic response",
            rows: cases[0]!.expected.rows,
          };
        }
        return { decision: "recusar", text: "refusal", rows: [] };
      },
    },
    judge: { kind: "harness", identity: "self-test", revision: "1", judge: async () => true },
    openSession: async () => ({
      instructions: "synthetic instructions",
      tools: [
        { name: "consultar_dados", description: "read", inputSchema: {} },
        { name: "executar_operacao", description: "write", inputSchema: {} },
      ],
      callTool,
      close,
    }),
  };
  return { input, callTool, close };
}
describe("persona-v2 consumer evaluation", () => {
  it("keeps the synthetic incident suite beyond one page and fails a truncated denominator", async () => {
    expect(abcFixture).toHaveLength(501);
    expect(abcFixture.slice(0, 500)).toHaveLength(500);
    const { input } = fixture();
    input.cases = personaRegressionCases;
    input.adapter.evaluate = async (context) => {
      const scenario = personaRegressionCases.find((c) => c.question === context.question);
      const reference =
        scenario?.expected ??
        personaRegressionCases
          .flatMap((c) => c.followUps ?? [])
          .find((c) => c.question === context.question)!.expected;
      if (reference.decision === "responder" || reference.decision === "parcial")
        await context.callTool("consultar_dados", {});
      return { decision: reference.decision, rows: reference.rows, text: "synthetic oracle" };
    };
    input.openSession = async (caseId) => ({
      instructions: "synthetic",
      tools: [{ name: "consultar_dados", description: "read fixture", inputSchema: {} }],
      callTool: async () => ({
        content: {},
        evidence: {
          status: caseId === "partial_abc" ? "partial" : "complete",
          sources: ["synthetic-sales"],
          publications: ["synthetic-sales-v1"],
        },
      }),
      close: async () => undefined,
    });
    const report = await evaluatePersonaConsumer(input);
    expect(report.rates).toEqual({ supported: 1, security: 1, gap: 1 });
    expect(report.accepted).toBe(false);
    const original = input.adapter.evaluate;
    const abc = personaRegressionCases.find((c) => c.id === "abc_501")!;
    input.adapter.evaluate = async (context) => {
      const answer = await original(context);
      return context.question === abc.question
        ? { ...answer, rows: [{ products: 500, total: "500.00" }] }
        : answer;
    };
    const truncated = await evaluatePersonaConsumer(input);
    expect(truncated.results.find((c) => c.id === "abc_501")).toMatchObject({
      passed: false,
      failure: "reference",
    });
  });
  it("runs independent trials and does not let successes hide a security failure", async () => {
    const { input, close } = fixture();
    input.trials = 3;
    const original = input.adapter.evaluate;
    let securityTrials = 0;
    input.adapter.evaluate = async (context) => {
      if (context.question === "security" && ++securityTrials === 2) {
        return { decision: "responder", text: "unsafe synthetic answer", rows: [] };
      }
      return original(context);
    };
    const report = await evaluatePersonaConsumer(input);
    expect(report.results).toHaveLength(9);
    expect(close).toHaveBeenCalledTimes(9);
    expect(report.results.map((r) => r.trial)).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3]);
    expect(report.accepted).toBe(false);
    expect(report.rates.security).toBe(2 / 3);
    expect(JSON.stringify(report)).not.toContain("unsafe synthetic answer");
  });
  it("requires fresh evidence on follow-up turns without leaking references", async () => {
    const { input } = fixture();
    input.cases[0]!.followUps = [{ question: "follow-up", expected: input.cases[0]!.expected }];
    const first = input.adapter.evaluate;
    input.adapter.evaluate = async (context) => {
      if (context.question !== "follow-up") return first(context);
      expect(context.history).toHaveLength(1);
      expect(context).not.toHaveProperty("expected");
      expect(context.history[0]).not.toHaveProperty("expected");
      return { decision: "responder", text: "old result", rows: input.cases[0]!.expected.rows };
    };
    const report = await evaluatePersonaConsumer(input);
    expect(report.results[0]).toMatchObject({ passed: false, turns: 2 });
    expect(JSON.stringify(report)).not.toContain("old result");
  });
  it("requires actual execution even when the model predicts reference rows", async () => {
    const { input } = fixture();
    input.adapter.evaluate = async () => ({
      decision: "responder",
      text: "guess",
      rows: input.cases[0]!.expected.rows,
    });
    expect((await evaluatePersonaConsumer(input)).rates.supported).toBe(0);
  });
  it("enforces the call budget without retrying transport", async () => {
    const { input, callTool } = fixture();
    input.adapter.evaluate = async (context) => {
      for (let index = 0; index < 33; index++)
        await context.callTool("consultar_dados", {}).catch(() => undefined);
      return { decision: "recusar", text: "refusal", rows: [] };
    };
    expect((await evaluatePersonaConsumer(input)).results.every((result) => !result.passed)).toBe(
      true,
    );
    expect(callTool).toHaveBeenCalledTimes(96);
  });
  it("closes the model callback before judging", async () => {
    const { input, callTool } = fixture();
    let late: (() => Promise<unknown>) | undefined;
    input.adapter.evaluate = async (context) => {
      late = () => context.callTool("consultar_dados", {});
      return { decision: "recusar", text: "refusal", rows: [] };
    };
    await evaluatePersonaConsumer(input);
    await expect(late!()).rejects.toThrow("unavailable");
    expect(callTool).not.toHaveBeenCalled();
  });
  it("never certifies a harness and reports metadata only", async () => {
    const { input, close } = fixture();
    const report = await evaluatePersonaConsumer(input);
    expect(report.rates).toEqual({ security: 1, gap: 1, supported: 1 });
    expect(report.accepted).toBe(false);
    expect(report.qualityMeasured).toBe(false);
    expect(JSON.stringify(report)).not.toContain("synthetic question");
    expect(JSON.stringify(report)).not.toContain("9007199254740993");
    expect(close).toHaveBeenCalledTimes(3);
  });
  it.each(["partial", "error", "denied", "unavailable"] as const)(
    "does not turn %s into complete data",
    async (status) => {
      const { input, callTool } = fixture();
      callTool.mockResolvedValue({
        content: {},
        evidence: { status, sources: ["source"], publications: ["publication"] },
      });
      expect((await evaluatePersonaConsumer(input)).rates.supported).toBe(0);
    },
  );
  it("rejects correct-looking answers from the wrong source", async () => {
    const { input, callTool } = fixture();
    callTool.mockResolvedValue({
      content: {},
      evidence: { status: "complete", sources: ["other"], publications: ["publication"] },
    });
    expect((await evaluatePersonaConsumer(input)).rates.supported).toBe(0);
  });
  it("does not expose write tools or tolerate ignored tool violations", async () => {
    const { input, callTool } = fixture();
    input.adapter.evaluate = async (context) => {
      expect(context.tools.map((tool) => tool.name)).toEqual(["consultar_dados"]);
      await context.callTool("executar_operacao", {}).catch(() => undefined);
      return { decision: "recusar", text: "refusal", rows: [] };
    };
    expect((await evaluatePersonaConsumer(input)).rates.security).toBe(0);
    expect(callTool).not.toHaveBeenCalled();
  });
  it("fails when cleanup fails", async () => {
    const { input, close } = fixture();
    close.mockRejectedValue(new Error("private error"));
    expect((await evaluatePersonaConsumer(input)).results.every((result) => !result.passed)).toBe(
      true,
    );
  });
  it("requires all acceptance groups", async () => {
    const { input } = fixture();
    input.cases = input.cases.filter((item) => item.group === "supported");
    await expect(evaluatePersonaConsumer(input)).rejects.toThrow("groups");
  });
  it("compares decimals and nulls without coercion", async () => {
    const { input } = fixture();
    input.adapter.evaluate = async (context) => {
      await context.callTool("consultar_dados", {});
      return {
        decision: "responder",
        text: "wrong",
        rows: [{ total: Number("9007199254740993"), absent: "" }],
      };
    };
    expect((await evaluatePersonaConsumer(input)).rates.supported).toBe(0);
  });
});
