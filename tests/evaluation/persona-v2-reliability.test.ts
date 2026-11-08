import { expect, it } from "vitest";
import { evaluatePersonaConsumer, type PersonaEvaluationAnswer } from "./persona-v2-evaluator.js";
import type {
  EvaluationContext,
  EvaluationDiagnostic,
  EvaluationEvidence,
} from "./persona-v2-contract.js";
import { personaReliabilityCases } from "./persona-v2-reliability-cases.js";

const binding = {
  skillId: "fixture-skill",
  publicationId: "fixture-v1",
  sourceId: "fixture-source",
};
type Mode =
  | "correct"
  | "filters"
  | "sql"
  | "skip_page"
  | "page_size"
  | "publication"
  | "after_terminal"
  | "concurrent"
  | "invent_time"
  | "omit_limits"
  | "false_total"
  | "retry"
  | "wrong_diagnostic"
  | "old_authority"
  | "ignore_revocation";
async function run(mode: Mode) {
  const dispatches: string[] = [];
  const report = await evaluatePersonaConsumer({
    cases: personaReliabilityCases,
    datasetAuthorization: "synthetic",
    candidate: { mcp: "a".repeat(40), hub: "b".repeat(40), agent: "c".repeat(40) },
    adapter: {
      kind: "harness",
      model: "reliability-oracle",
      revision: "1",
      async evaluate(ctx) {
        const scenario = personaReliabilityCases.find((item) => item.question === ctx.question)!;
        const contexts: EvaluationContext[] = [],
          diagnostics: EvaluationDiagnostic[] = [];
        if (scenario.expected.behavior?.requiredTools?.includes("obter_skill"))
          await ctx.callTool("obter_skill", { slug: "fixture" });
        const call = async (page?: number) => {
          const args = {
            fonteId: "fixture-source",
            skillIds: ["fixture-skill"],
            sql: mode === "sql" && page === 2 ? "SELECT changed" : "SELECT fixture",
            params: { filter: mode === "filters" && page === 2 ? 2 : 1 },
            ...(page
              ? {
                  options: {
                    page: mode === "skip_page" && page === 2 ? 3 : page,
                    pageSize: mode === "page_size" && page === 2 ? 2 : 1,
                  },
                }
              : {}),
          };
          const result = (await ctx.callTool("consultar_dados", args)) as {
            context?: EvaluationContext;
            diagnostic?: EvaluationDiagnostic;
          };
          if (result.context) contexts.push(result.context);
          if (result.diagnostic) diagnostics.push(result.diagnostic);
        };
        if (scenario.id === "paged_subset") {
          if (mode === "concurrent") await Promise.all([call(1), call(2)]);
          else {
            await call(1);
            await call(2);
          }
        } else await call();
        if (mode === "retry" && diagnostics.length) await call().catch(() => undefined);
        if (mode === "invent_time" && contexts.length) contexts[0]!.readAt = "2030-01-01T00:00:00Z";
        if (mode === "omit_limits" && contexts.length) contexts[0]!.limits = {};
        if (mode === "wrong_diagnostic" && diagnostics.length)
          diagnostics[0]!.code = "AUTHENTICATION_EXPIRED";
        const answer: PersonaEvaluationAnswer = {
          decision: scenario.expected.decision,
          rows: scenario.expected.rows,
          text: "synthetic private explanation",
          ...(contexts.length ? { contexts } : {}),
          ...(diagnostics.length ? { diagnostics } : {}),
        };
        if (mode === "false_total" && scenario.id === "paged_subset") answer.decision = "responder";
        if (mode === "ignore_revocation" && scenario.id.endsWith("after_read")) {
          answer.decision = "responder";
          answer.rows = [{ total: "10.00" }];
        }
        return answer;
      },
    },
    judge: { kind: "harness", identity: "fixture", revision: "1", judge: async () => true },
    openSession: async (id) => ({
      instructions: "Synthetic only",
      tools: ["obter_skill", "consultar_dados"].map((name) => ({
        name,
        description: "fixture",
        inputSchema: {},
      })),
      close: async () => undefined,
      async callTool(name, args) {
        dispatches.push(`${id}:${name}`);
        if (name === "obter_skill")
          return {
            content: {},
            evidence: {
              status: "complete",
              sources: [binding.sourceId],
              publications: [binding.publicationId],
              bindings: [binding],
              authorityRevision: "revision-1",
            },
          };
        if (id.startsWith("hub_") || id.endsWith("after_read")) {
          const denied = id === "hub_denied" || id.endsWith("after_read");
          const diagnostic: EvaluationDiagnostic = {
            code: denied ? "AUTHORIZATION_DENIED" : "PLUG_SERVER_ERROR",
            source: id === "hub_rpc_http200" ? "client_token_rpc" : "plug_server_http",
            supportId: "00000000-0000-4000-8000-000000000001",
            retryable: false,
          };
          const evidence: EvaluationEvidence = {
            status: denied ? "denied" : id === "hub_unavailable" ? "unavailable" : "error",
            sources: [],
            publications: [],
            diagnostic,
          };
          return { content: { diagnostic: structuredClone(diagnostic) }, evidence };
        }
        const page = (args.options as { page?: number } | undefined)?.page;
        const publications = [
          mode === "publication" && page === 2 ? "fixture-v2" : binding.publicationId,
        ];
        const context: EvaluationContext = {
          sources: [binding.sourceId],
          publications,
          ...(id === "unknown_read_time" ? {} : { readAt: "2026-11-01T12:00:00Z" }),
          complete: id !== "paged_subset",
          limits: { maxRows: 2, maxBytes: 4096 },
        };
        const evidence: EvaluationEvidence = {
          status: id === "paged_subset" ? "partial" : "complete",
          sources: [binding.sourceId],
          publications,
          bindings: [binding],
          authorityRevision: mode === "old_authority" ? "revision-2" : "revision-1",
          context,
          ...(page
            ? {
                pagination: {
                  page,
                  pageSize: 1,
                  hasNextPage: mode === "after_terminal" ? false : page === 1,
                },
              }
            : {}),
        };
        return { content: { context: structuredClone(context) }, evidence };
      },
    }),
  });
  return { report, dispatches };
}

it("accepts honest fixture responses without certifying a real model", async () => {
  const { report } = await run("correct");
  expect(report.results.every((item) => item.passed)).toBe(true);
  expect(report.accepted).toBe(false);
  expect(JSON.stringify(report)).not.toContain("synthetic private explanation");
  expect(JSON.stringify(report)).not.toContain("2026-11-01");
});
it.each([
  "filters",
  "sql",
  "skip_page",
  "page_size",
  "publication",
  "after_terminal",
  "concurrent",
  "false_total",
] as const)("rejects pagination drift: %s", async (mode) => {
  const { report } = await run(mode);
  expect(report.results.find((item) => item.id === "paged_subset")!.passed).toBe(false);
});
it.each(["invent_time", "omit_limits", "old_authority"] as const)(
  "rejects unsupported response context: %s",
  async (mode) => {
    const { report } = await run(mode);
    expect(report.results.find((item) => item.id === "cached_context")!.passed).toBe(false);
    expect(report.results.find((item) => item.id === "unknown_read_time")!.passed).toBe(false);
  },
);
it.each(["retry", "wrong_diagnostic", "ignore_revocation"] as const)(
  "preserves failures and authority: %s",
  async (mode) => {
    const { report, dispatches } = await run(mode);
    for (const id of [
      "revoked_after_read",
      "rotated_after_read",
      "publication_changed_after_read",
    ]) {
      expect(report.results.find((item) => item.id === id)!.passed).toBe(false);
      expect(dispatches.filter((call) => call === `${id}:consultar_dados`)).toHaveLength(1);
    }
  },
);
