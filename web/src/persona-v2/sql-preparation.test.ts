import { expect, it, vi } from "vitest";
import { SqlPreparationSession, type GrantedSqlOperation } from "./sql-preparation";
const action = {
  skillId: "skill",
  publicationId: "publication",
  hash: "a".repeat(64),
  name: "Published",
  training: { mode: "somente_parametros" },
} as GrantedSqlOperation;
function fixture() {
  const context = { personaId: "persona", bearer: "fixture" };
  const call = vi.fn(async (tool: string): Promise<unknown> => {
    if (tool === "obter_contexto_persona") return { id: context.personaId };
    if (tool === "listar_skills")
      return [
        {
          id: action.skillId,
          slug: "operation",
          kind: "operacao_sql",
          publicationId: action.publicationId,
          hash: action.hash,
        },
      ];
    if (tool === "obter_skill")
      return { ...action, id: action.skillId, format: "persona-sql-operation-v2" };
    return {
      operationId: "operation",
      publicationId: action.publicationId,
      fingerprint: "b".repeat(64),
      state: "aprovacao_pendente",
      requireHumanApproval: true,
      expiresAt: "2030-01-01T00:00:00Z",
    };
  });
  const session = new SqlPreparationSession(
    call as <T>(tool: string, args: unknown) => Promise<T>,
    () => context,
  );
  return { context, call, session };
}
it("pins publication and prepares once without approval or execution", async () => {
  const f = fixture();
  await f.session.run();
  await f.session.run(action, { id: "1" });
  await f.session.run(action, { id: "1" });
  expect(f.call.mock.calls.map(([tool]) => tool)).toEqual([
    "obter_contexto_persona",
    "listar_skills",
    "obter_skill",
    "obter_contexto_persona",
    "preparar_operacao",
  ]);
  expect(f.call).toHaveBeenLastCalledWith("preparar_operacao", {
    publicationId: "publication",
    input: { id: "1" },
  });
  expect(f.session.result?.state).toBe("aprovacao_pendente");
});
it("refuses another persona before discovery", async () => {
  const f = fixture();
  f.call.mockResolvedValue({ id: "other" });
  await f.session.run();
  expect(f.call).toHaveBeenCalledTimes(1);
  expect(f.session.choices).toEqual([]);
});
it("lost preparation confirmation cannot resend", async () => {
  const f = fixture();
  await f.session.run();
  f.call.mockImplementation(async (tool) => {
    if (tool === "obter_contexto_persona") return { id: "persona" };
    throw new Error("Lost reply");
  });
  await f.session.run(action, {});
  const calls = f.call.mock.calls.length;
  await f.session.run(action, {});
  expect(f.call).toHaveBeenCalledTimes(calls);
  expect(f.session.error).toContain("não será reenviada");
});
it("discards late discovery after token change", async () => {
  const f = fixture();
  let finish!: (v: unknown) => void;
  f.call.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.session.run();
  f.context.bearer = "new";
  f.session.invalidate();
  finish({ id: "persona" });
  await pending;
  expect(f.session.choices).toEqual([]);
  expect(f.call).toHaveBeenCalledTimes(1);
});

it("refuses a publication changed between listing and reading", async () => {
  const f = fixture();
  const original = f.call.getMockImplementation()!;
  f.call.mockImplementation(async (tool) =>
    tool === "obter_skill"
      ? {
          ...action,
          id: action.skillId,
          format: "persona-sql-operation-v2",
          publicationId: "changed",
        }
      : original(tool),
  );
  await f.session.run();
  expect(f.session.choices).toEqual([]);
  expect(f.session.loaded).toBe(false);
});
it("preserves exact decimal and adaptive SQL without executing", async () => {
  const f = fixture();
  await f.session.run();
  const input = {
    parameters: { amount: { type: "decimal", value: "9007199254740993.01" } },
    sqlByStep: { update: "UPDATE fixture SET amount = :amount WHERE id = :id" },
  };
  await f.session.run(action, input);
  expect(f.call).toHaveBeenLastCalledWith("preparar_operacao", {
    publicationId: action.publicationId,
    input,
  });
  expect(f.call.mock.calls.some(([tool]) => tool === "executar_operacao")).toBe(false);
});
