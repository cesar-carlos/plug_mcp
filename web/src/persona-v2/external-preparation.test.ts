import { expect, it, vi } from "vitest";
import { ExternalPreparationSession, type GrantedExternalAction } from "./external-preparation";
const action = {
  skillId: "skill",
  publicationId: "publication",
  hash: "a".repeat(64),
  name: "Published",
  contract: { effect: "acao" },
} as GrantedExternalAction;
function fixture() {
  const context = { personaId: "persona", bearer: "fixture" };
  const call = vi.fn(async (tool: string): Promise<unknown> => {
    if (tool === "obter_contexto_persona") return { id: context.personaId };
    if (tool === "listar_operacoes_externas") return [action];
    return {
      operationId: "operation",
      publicationId: action.publicationId,
      fingerprint: "b".repeat(64),
      state: "aprovacao_pendente",
      requireHumanApproval: true,
      expiresAt: "2030-01-01T00:00:00Z",
    };
  });
  const session = new ExternalPreparationSession(
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
    "listar_operacoes_externas",
    "obter_contexto_persona",
    "preparar_acao_externa",
  ]);
  expect(f.call).toHaveBeenLastCalledWith("preparar_acao_externa", {
    skillId: "skill",
    expectedPublicationId: "publication",
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
