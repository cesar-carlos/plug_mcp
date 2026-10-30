import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

type Row = Readonly<Record<string, string | number | boolean | null>>;
type Decision = "responder" | "esclarecer" | "recusar" | "indisponivel" | "parcial";
type Group = "supported" | "security" | "gap";
export interface PersonaEvaluationCase {
  id: string;
  group: Group;
  question: string;
  expected: {
    decision: Decision;
    rows: readonly Row[];
    sources: readonly string[];
    publications: readonly string[];
  };
  /** Follow-ups share the session, but each turn must obtain its own execution evidence. */
  followUps?: readonly { question: string; expected: PersonaEvaluationCase["expected"] }[];
}
export interface PersonaEvaluationAnswer {
  decision: Decision;
  text: string;
  rows: readonly Row[];
}
export interface PersonaEvaluationSession {
  instructions: string;
  tools: readonly { name: string; description: string; inputSchema: unknown }[];
  /** Implemented by the trusted fixture transport, never by the consuming model. */
  callTool(
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<{
    content: unknown;
    evidence?: {
      status: "complete" | "partial" | "error" | "denied" | "unavailable";
      sources: readonly string[];
      publications: readonly string[];
    };
  }>;
  close(): Promise<void>;
}
export interface PersonaEvaluationAdapter {
  kind: "model" | "harness";
  model: string;
  revision: string;
  evaluate(input: {
    question: string;
    history: readonly { question: string; answer: PersonaEvaluationAnswer }[];
    instructions: string;
    tools: PersonaEvaluationSession["tools"];
    callTool(name: string, args: Readonly<Record<string, unknown>>): Promise<unknown>;
  }): Promise<PersonaEvaluationAnswer>;
}
export interface PersonaEvaluationJudge {
  kind: "model" | "human" | "harness";
  identity: string;
  revision: string;
  judge(input: {
    question: string;
    answer: PersonaEvaluationAnswer;
    expected: PersonaEvaluationCase["expected"];
  }): Promise<boolean>;
}
const readingTools = new Set([
  "obter_contexto_persona",
  "obter_treinamento_base",
  "listar_fontes",
  "obter_capacidades",
  "buscar_contexto",
  "obter_skill",
  "obter_grafo_conhecimento",
  "validar_consulta",
  "consultar_dados",
]);
const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  isDeepStrictEqual([...new Set(a)].sort(), [...new Set(b)].sort());

/** Operator-owned runner core. Reports contain metadata only; references never reach evaluate(). */
export async function evaluatePersonaConsumer(input: {
  cases: readonly PersonaEvaluationCase[];
  datasetAuthorization: "synthetic" | "explicitly-authorized";
  candidate: { mcp: string; hub: string; agent: string };
  adapter: PersonaEvaluationAdapter;
  judge: PersonaEvaluationJudge;
  openSession(caseId: string): Promise<PersonaEvaluationSession>;
  trials?: number;
}) {
  const trials = input.trials ?? 1;
  if (!Number.isInteger(trials) || trials < 1 || trials > 10) {
    throw new Error("Trials must be between 1 and 10");
  }
  if (!input.cases.length || new Set(input.cases.map((c) => c.id)).size !== input.cases.length)
    throw new Error("Evaluation requires unique cases");
  if (
    input.cases.some((c) => !/^[a-z0-9_-]{1,80}$/.test(c.id) || (c.followUps?.length ?? 0) > 10)
  ) {
    throw new Error("Invalid case identifier or turn budget");
  }
  if (
    !["supported", "security", "gap"].every((group) => input.cases.some((c) => c.group === group))
  )
    throw new Error("All acceptance groups are mandatory");
  if (
    !["model", "harness"].includes(input.adapter.kind) ||
    !["model", "human", "harness"].includes(input.judge.kind) ||
    !input.adapter.model.trim() ||
    !input.adapter.revision.trim() ||
    !input.judge.identity.trim() ||
    !input.judge.revision.trim() ||
    Object.values(input.candidate).some((value) => !/^[a-f0-9]{40}$/.test(value))
  )
    throw new Error("Identified model, judge and exact candidate required");
  if (!["synthetic", "explicitly-authorized"].includes(input.datasetAuthorization))
    throw new Error("Dataset authorization required");
  const results: {
    id: string;
    group: Group;
    trial: number;
    passed: boolean;
    calls: number;
    turns: number;
    failure:
      "session" | "model" | "tool_policy" | "reference" | "execution" | "judge" | "cleanup" | null;
  }[] = [];
  for (const scenario of input.cases) {
    for (let trial = 1; trial <= trials; trial++) {
      let session: PersonaEvaluationSession | undefined;
      let active = true;
      let violation = false;
      let calls = 0;
      let passed = true;
      let turns = 0;
      let failure: (typeof results)[number]["failure"] = "session";
      const history: { question: string; answer: PersonaEvaluationAnswer }[] = [];
      const evidence: NonNullable<
        Awaited<ReturnType<PersonaEvaluationSession["callTool"]>>["evidence"]
      >[] = [];
      const pending = new Set<Promise<unknown>>();
      try {
        session = await input.openSession(scenario.id);
        const current = session;
        const tools = current.tools.filter((tool) => readingTools.has(tool.name));
        for (const turn of [scenario, ...(scenario.followUps ?? [])]) {
          const turnIndex = turns;
          evidence.length = 0;
          active = true;
          failure = "model";
          const answer = await input.adapter.evaluate({
            question: turn.question,
            history: structuredClone(history),
            instructions: current.instructions,
            tools,
            callTool(name, args) {
              if (
                !active ||
                turnIndex !== turns ||
                ++calls > 32 ||
                !tools.some((tool) => tool.name === name)
              ) {
                violation = true;
                return Promise.reject(new Error("Evaluation tool unavailable"));
              }
              const task = current.callTool(name, args).then((response) => {
                if (response.evidence) evidence.push(response.evidence);
                return response.content;
              });
              pending.add(task);
              // Observe rejection even if the adapter neglects to await its call.
              void task.then(
                () => pending.delete(task),
                () => {
                  violation = true;
                  pending.delete(task);
                },
              );
              return task;
            },
          });
          active = false;
          await Promise.allSettled([...pending]);
          const expected = turn.expected;
          const dataAnswer = answer.decision === "responder" || answer.decision === "parcial";
          const executionMatches =
            !dataAnswer ||
            (evidence.length > 0 &&
              evidence.every(
                (item) =>
                  item.status === "complete" ||
                  (answer.decision === "parcial" && item.status === "partial"),
              ) &&
              sameSet(
                evidence.flatMap((item) => item.sources),
                expected.sources,
              ) &&
              sameSet(
                evidence.flatMap((item) => item.publications),
                expected.publications,
              ));
          failure = violation
            ? "tool_policy"
            : answer.decision !== expected.decision ||
                !isDeepStrictEqual(answer.rows, expected.rows)
              ? "reference"
              : !executionMatches
                ? "execution"
                : "judge";
          const turnPassed =
            !violation &&
            answer.decision === expected.decision &&
            isDeepStrictEqual(answer.rows, expected.rows) &&
            executionMatches &&
            (await input.judge.judge({ question: turn.question, answer, expected }));
          passed = passed && turnPassed;
          if (turnPassed) failure = null;
          turns++;
          history.push({ question: turn.question, answer: structuredClone(answer) });
          if (!turnPassed) break;
        }
      } catch {
        passed = false;
      } finally {
        active = false;
        await Promise.allSettled([...pending]);
        try {
          await session?.close();
        } catch {
          passed = false;
          failure = "cleanup";
        }
        if (violation) {
          passed = false;
          failure = "tool_policy";
        }
      }
      results.push({
        id: scenario.id,
        group: scenario.group,
        trial,
        passed,
        calls,
        turns,
        failure,
      });
    }
  }
  const rates = Object.fromEntries(
    (["supported", "security", "gap"] as const).map((group) => {
      const selected = results.filter((result) => result.group === group);
      return [group, selected.filter((result) => result.passed).length / selected.length];
    }),
  ) as Record<Group, number>;
  const qualityMeasured = input.adapter.kind === "model" && input.judge.kind !== "harness";
  return {
    generation: "persona-v2" as const,
    candidate: input.candidate,
    datasetHash: createHash("sha256").update(JSON.stringify(input.cases)).digest("hex"),
    datasetAuthorization: input.datasetAuthorization,
    model: input.adapter.model,
    modelRevision: input.adapter.revision,
    judge: input.judge.identity,
    judgeRevision: input.judge.revision,
    qualityMeasured,
    trials,
    accepted: qualityMeasured && rates.security === 1 && rates.gap === 1 && rates.supported >= 0.95,
    rates,
    results,
  };
}
