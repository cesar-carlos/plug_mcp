import { afterEach, expect, it, vi } from "vitest";
import { ContextRequests, ConsoleRequestError } from "./model";

afterEach(() => {
  vi.unstubAllGlobals();
});
it("lê a resposta MCP stateless em SSE e ignora notificações", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          'event: message\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\nevent: message\r\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[]}}\r\n\r\n',
          { headers: { "Content-Type": "text/event-stream" } },
        ),
    ),
  );
  expect(await new ContextRequests().json("/mcp", {}, "mcp")).toEqual({
    jsonrpc: "2.0",
    id: 1,
    result: { content: [] },
  });
});
it("recusa SSE sem resposta correspondente sem expor o corpo", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response('data: {"id":9,"result":"private"}\n\n', {
          headers: { "Content-Type": "text/event-stream" },
        }),
    ),
  );
  await expect(new ContextRequests().json("/mcp", {}, "mcp")).rejects.toThrow(
    "Resposta inválida do servidor",
  );
});
it("descarta respostas de uma persona anterior mesmo se transporte ignorar abort", async () => {
  let finish: (value: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const requests = new ContextRequests();
  const pending = requests.json("/api/admin/personas").catch((error: unknown) => error);
  requests.reset();
  finish(new Response(JSON.stringify({ personas: ["old-context"] })));
  expect(await pending).toEqual(new Error("O contexto mudou. A resposta anterior foi descartada."));
});
it("não apresenta corpo HTML de falha de transporte nem persiste credenciais", async () => {
  const fetcher = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response("<html>secret-upstream</html>", { status: 503 }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(new ContextRequests().json("/api/admin/personas")).rejects.toThrow(
    "Resposta inválida do servidor",
  );
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    credentials: "same-origin",
    cache: "no-store",
  });
});

it("preserva o código de sessão revogada sem incorporar conteúdo do upstream", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: "ADMIN_SESSION_EXPIRED", message: "Entre novamente." } }),
          { status: 401 },
        ),
    ),
  );
  await expect(new ContextRequests().json("/api/admin/personas")).rejects.toMatchObject({
    code: "ADMIN_SESSION_EXPIRED",
    status: 401,
  });
  await expect(new ContextRequests().json("/api/admin/personas")).rejects.toBeInstanceOf(
    ConsoleRequestError,
  );
});

it.each(["network", "invalid-body"])(
  "não recomenda reenvio de mutação com confirmação perdida (%s)",
  async (failure) => {
    const fetcher = vi.fn(async () => {
      if (failure === "network") throw new Error("private upstream detail");
      return new Response("<html>private upstream detail</html>", { status: 502 });
    });
    vi.stubGlobal("fetch", fetcher);
    const error = await new ContextRequests()
      .json("/api/admin/personas", { method: "POST", body: "{}" })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ConsoleRequestError);
    expect(error).toMatchObject({ code: "RESPONSE_UNCONFIRMED", status: 0 });
    expect((error as Error).message).toContain("Confira o estado");
    expect((error as Error).message).not.toContain("private upstream");
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it("falha tardia de mutação descartada não é atribuída ao novo contexto", async () => {
  let fail: (reason: Error) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((_resolve, reject) => {
          fail = reject;
        }),
    ),
  );
  const requests = new ContextRequests();
  const pending = requests.json("/api/admin/personas", { method: "POST" }).catch((e: unknown) => e);
  requests.reset();
  fail(new Error("old connection"));
  expect(await pending).toEqual(new Error("O contexto mudou. A resposta anterior foi descartada."));
});

it("transporta somente referências simples de campo para a validação do formulário", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "VALIDATION_ERROR",
              message: "Confira os campos.",
              fields: ["agentId", "training", "params.secret-value", 4, {}],
            },
          }),
          { status: 400 },
        ),
    ),
  );
  await expect(new ContextRequests().json("/api/admin/personas")).rejects.toMatchObject({
    fields: ["agentId", "training"],
    status: 400,
  });
});
