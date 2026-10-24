import { expect, it, vi } from "vitest";
import {
  ConsumerOperationSession,
  type ConsumerOperationView,
  type OperationKind,
} from "./consumer-operation";
const reference = {
  operationId: "14afef81-33f5-423e-8aac-77e4b36ce484",
  fingerprint: "a".repeat(64),
};
const view = (changes: Partial<ConsumerOperationView> = {}): ConsumerOperationView => ({
  ...reference,
  state: "aprovada",
  requireHumanApproval: true,
  expiresAt: "2030-01-01T00:00:00Z",
  ...changes,
});
function fixture(kind: OperationKind = "sql") {
  const c = { kind, personaId: "persona-a", bearer: "fixture-only-token", reference };
  let result = view();
  const call = vi.fn(async (tool: string): Promise<unknown> =>
    tool === "obter_contexto_persona" ? { id: c.personaId } : result,
  );
  const session = new ConsumerOperationSession(
    call as <T>(tool: string, args: unknown) => Promise<T>,
    () => c,
    () => Date.parse("2026-10-17T00:00:00Z"),
  );
  return {
    c,
    session,
    call,
    set: (value: ConsumerOperationView) => {
      result = value;
    },
  };
}
it("sem Bearer ou com outra persona não consulta journal nem envia execução", async () => {
  const f = fixture();
  f.c.bearer = "";
  await f.session.run("refresh");
  expect(f.call).not.toHaveBeenCalled();
  f.c.bearer = "fixture";
  f.call.mockResolvedValue({ id: "outra-persona" });
  await f.session.run("refresh");
  expect(f.call).toHaveBeenCalledTimes(1);
  expect(f.session.view).toBeUndefined();
  expect(f.session.error).toContain("outra persona");
});
it("aprovação administrativa não executa: exige leitura Bearer, confirmação e envia apenas a referência", async () => {
  const f = fixture();
  await f.session.run("execute", true);
  expect(f.call).not.toHaveBeenCalled();
  await f.session.run("refresh");
  await f.session.run("execute");
  expect(f.call.mock.calls.some(([tool]) => tool === "executar_operacao")).toBe(false);
  f.set(view({ state: "concluida" }));
  // Revalidation before dispatch must see the live state, not the old approved snapshot.
  await f.session.run("execute", true);
  expect(f.call.mock.calls.some(([tool]) => tool === "executar_operacao")).toBe(false);
  await f.session.run("refresh");
  f.set(view());
  await f.session.run("refresh");
  await f.session.run("execute", true);
  expect(f.call).toHaveBeenCalledWith("executar_operacao", reference);
  expect(f.session.attempted).toBe(true);
});
it("preparação com aprovação pendente ou validade vencida não habilita execução", async () => {
  const f = fixture();
  for (const result of [
    view({ state: "preparada" }),
    view({ state: "aprovacao_pendente" }),
    view({ expiresAt: "2026-01-01T00:00:00Z" }),
    view({ state: "resultado_desconhecido" }),
  ]) {
    f.set(result);
    await f.session.run("refresh");
    expect(f.session.mayExecute()).toBe(false);
  }
  f.set(view({ state: "preparada", requireHumanApproval: false }));
  await f.session.run("refresh");
  expect(f.session.mayExecute()).toBe(true);
});
it("clique duplo envia um único pedido e perda da confirmação não oferece reenvio", async () => {
  const f = fixture();
  await f.session.run("refresh");
  let reject!: (error: Error) => void;
  const pending = new Promise<never>((_resolve, fail) => {
    reject = fail;
  });
  f.call.mockImplementation(async (tool) => {
    if (tool === "executar_operacao") return pending;
    return tool === "obter_contexto_persona" ? { id: f.c.personaId } : view();
  });
  const first = f.session.run("execute", true);
  await vi.waitFor(() => expect(f.call).toHaveBeenCalledWith("executar_operacao", reference));
  await f.session.run("execute", true);
  reject(new Error("Confirmação indisponível"));
  await first;
  expect(f.session.view).toBeUndefined();
  expect(f.session.attempted).toBe(true);
  await f.session.run("refresh");
  expect(f.session.mayExecute()).toBe(false);
  await f.session.run("execute", true);
  expect(f.call.mock.calls.filter(([tool]) => tool === "executar_operacao")).toHaveLength(1);
});
it("trocar token em trânsito descarta resposta e não avança para consultar outra operação", async () => {
  const f = fixture();
  let release!: (value: unknown) => void;
  f.call.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const request = f.session.run("refresh");
  f.c.bearer = "outro-token";
  f.session.invalidate();
  release({ id: f.c.personaId });
  await request;
  expect(f.session.view).toBeUndefined();
  expect(f.call).toHaveBeenCalledTimes(1);
});
it("recusa resposta com outra referência sem mostrar comprovante", async () => {
  const f = fixture();
  f.set(view({ fingerprint: "b".repeat(64), receipt: "não mostrar" }));
  await f.session.run("refresh");
  expect(f.session.view).toBeUndefined();
  expect(f.session.error).toContain("não corresponde");
});
it("referência administrativa com conteúdo adicional envia somente ID e fingerprint", async () => {
  const f = fixture();
  f.c.reference = {
    ...reference,
    command: { sql: "synthetic SQL must stay in review" },
  } as typeof reference;
  await f.session.run("refresh");
  await f.session.run("execute", true);
  expect(f.call).toHaveBeenCalledWith("obter_operacao", reference);
  expect(f.call).toHaveBeenCalledWith("executar_operacao", reference);
});
it("cancelamento SQL em execução não vira rollback; ação externa enviada não pode cancelar", async () => {
  const sql = fixture();
  sql.set(view({ state: "executando" }));
  await sql.session.run("refresh");
  expect(sql.session.mayCancel()).toBe(true);
  sql.call.mockImplementation(async (tool) =>
    tool === "obter_contexto_persona"
      ? { id: sql.c.personaId }
      : view({ state: tool === "cancelar_operacao" ? "cancelamento_solicitado" : "executando" }),
  );
  await sql.session.run("cancel", true);
  expect(sql.session.view?.state).toBe("cancelamento_solicitado");
  const external = fixture("external");
  external.set(view({ state: "executando" }));
  await external.session.run("refresh");
  expect(external.session.mayCancel()).toBe(false);
});
it("conciliação externa usa leitura treinada e relê estado, sem executar ou fabricar receipt", async () => {
  const f = fixture("external");
  const unknown = view({
    state: "resultado_desconhecido",
    receipt: { state: "resultado_desconhecido" },
  });
  f.set(unknown);
  await f.session.run("refresh");
  f.call.mockImplementation(async (tool) =>
    tool === "obter_contexto_persona"
      ? { id: f.c.personaId }
      : tool === "conciliar_acao_externa"
        ? { status: "inconclusive" }
        : unknown,
  );
  await f.session.run("reconcile");
  expect(f.call).toHaveBeenCalledWith("conciliar_acao_externa", reference);
  expect(f.session.view).toEqual(unknown);
  expect(f.call.mock.calls.some(([tool]) => tool.startsWith("executar_"))).toBe(false);
});
