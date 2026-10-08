import { afterEach, describe, expect, it, vi } from "vitest";
import { api, invalidateRequests } from "./api";
import { createPinia, setActivePinia } from "pinia";
import { useSessionStore } from "./stores/session";
import { useAction } from "./composables/useAction";
import { effectScope } from "vue";

afterEach(() => {
  invalidateRequests();
  vi.unstubAllGlobals();
});
describe("HTTP e sessão do console", () => {
  it("recusa escopo incompatível antes de atualizar a persona", async () => {
    setActivePinia(createPinia());
    const session = useSessionStore();
    session.setBearer("synthetic");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            acessos: [
              {
                id: "synthetic",
                agentId: "agent",
                dialeto: "postgres",
                nomeAmigavel: "Teste",
                statusAcesso: "ativo",
                escopoPadrao: {
                  bindings: [{ tabela: "fato", coluna: "empresa", param: "unsupported" }],
                },
              },
            ],
          }),
        ),
      ),
    );
    await expect(session.refreshAcesso()).rejects.toThrow("Vínculo de escopo incompatível");
    expect(session.acesso).toBeNull();
  });
  it("preserva a origem de 401 do hub e não repete mutação", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          code: "PLUG_SERVER_ERROR",
          message: "Hub indisponível",
          hint: "Confira o hub",
          error: { source: "plug_server_http", nextAction: "verificar_acesso", retryable: true },
        }),
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(api.post("/app/api/test", {}, "synthetic")).rejects.toMatchObject({
      code: "PLUG_SERVER_ERROR",
      source: "plug_server_http",
      nextAction: "verificar_acesso",
      status: 401,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("omite HTML e erros de transporte brutos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>private upstream</html>", { status: 502 })),
    );
    await expect(api.get("/test")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      message: "O servidor devolveu uma resposta incompatível.",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private password")));
    await expect(api.get("/test")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message: "Não foi possível conectar ao servidor.",
    });
  });
  it("desconsidera resposta anterior mesmo se o transporte ignora abort", async () => {
    setActivePinia(createPinia());
    const session = useSessionStore();
    session.setBearer("first-synthetic");
    let finish: (response: Response) => void = () => {
      throw new Error("Fetch não iniciado");
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const request = api.get("/test", session.bearer ?? undefined);
    session.setBearer("second-synthetic");
    finish(new Response('{"success":true}'));
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(session.acesso).toBeNull();
    expect(session.issuedToken).toBeNull();
  });
  it("impede clique duplo e ignora estado após desmontagem", async () => {
    setActivePinia(createPinia());
    const scope = effectScope();
    const action = scope.run(() => useAction())!;
    let finish: (value: string) => void = () => {
      throw new Error("Ação não iniciada");
    };
    const operation = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const first = action.run(operation);
    await action.run(operation);
    expect(operation).toHaveBeenCalledTimes(1);
    scope.stop();
    finish("done");
    expect(await first).toBeUndefined();
    expect(action.success.value).toBe(false);
  });
});
