import { effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useDatasetRequest } from "./useDatasetRequest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

function setup() {
  const scope = effectScope();
  const context = ref("persona-a/source-a/revision-1/query-a/dataset-a");
  const disabled = ref(false);
  const error = ref("");
  const preview = ref<string>();
  const lock = vi.fn();
  const request = scope.run(() =>
    useDatasetRequest(
      () => context.value,
      () => disabled.value,
      error,
      () => {
        preview.value = undefined;
      },
      lock,
    ),
  )!;
  return { scope, context, disabled, error, preview, lock, ...request };
}

describe("leituras editoriais do seletor de datasets", () => {
  it("descarta sucesso antigo mesmo ao sair e voltar ao contexto original", async () => {
    const state = setup();
    const response = deferred<string>();
    const pending = state.run(async (isCurrent) => {
      const value = await response.promise;
      if (isCurrent()) state.preview.value = value;
    });
    const original = state.context.value;
    state.context.value = "outra persona";
    state.context.value = original;
    response.resolve("sementes antigas");
    await pending;
    expect(state.preview.value).toBeUndefined();
    expect(state.error.value).toBe("");
    expect(state.busy.value).toBe(false);
    expect(state.lock.mock.calls).toEqual([[true], [false]]);
    state.scope.stop();
  });

  it("ignora falha atrasada sem sobrescrever o erro da seleção atual", async () => {
    const state = setup();
    const response = deferred<void>();
    const pending = state.run(() => response.promise);
    state.context.value = "nova revisão";
    state.error.value = "Confira a nova seleção";
    response.reject(new Error("Falha da consulta anterior"));
    await pending;
    expect(state.error.value).toBe("Confira a nova seleção");
    state.scope.stop();
  });

  it("invalida prévia e erro imediatamente ao trocar o dataset", () => {
    const state = setup();
    state.preview.value = "prévia anterior";
    state.error.value = "erro anterior";
    state.context.value = "dataset-b";
    expect(state.preview.value).toBeUndefined();
    expect(state.error.value).toBe("");
    state.scope.stop();
  });

  it("mantém falha vigente e permite recuperação somente por nova tentativa explícita", async () => {
    const state = setup();
    const action = vi.fn(() => Promise.reject(new Error("Catálogo indisponível")));
    await state.run(action);
    expect(state.error.value).toBe("Catálogo indisponível");
    expect(action).toHaveBeenCalledTimes(1);
    expect(state.busy.value).toBe(false);
    await state.run((isCurrent) => {
      if (isCurrent()) state.preview.value = "nova prévia";
      return Promise.resolve();
    });
    expect(state.preview.value).toBe("nova prévia");
    expect(state.error.value).toBe("");
    state.scope.stop();
  });

  it.each(["sucesso", "falha"])(
    "desmontagem ignora %s e libera o bloqueio uma vez",
    async (outcome) => {
      const state = setup();
      const response = deferred<string>();
      const pending = state.run(async (isCurrent) => {
        const value = await response.promise;
        if (isCurrent()) state.preview.value = value;
      });
      state.scope.stop();
      if (outcome === "sucesso") response.resolve("prévia desmontada");
      else response.reject(new Error("falha desmontada"));
      await pending;
      expect(state.preview.value).toBeUndefined();
      expect(state.error.value).toBe("");
      expect(state.lock.mock.calls).toEqual([[true], [false]]);
      const action = vi.fn(() => Promise.resolve());
      await state.run(action);
      expect(action).not.toHaveBeenCalled();
    },
  );

  it("não duplica leitura durante espera nem inicia leitura desabilitada", async () => {
    const state = setup();
    const response = deferred<void>();
    const pending = state.run(() => response.promise);
    state.context.value = "outra fonte";
    const action = vi.fn(() => Promise.resolve());
    await state.run(action);
    expect(action).not.toHaveBeenCalled();
    expect(state.busy.value).toBe(true);
    response.resolve();
    await pending;
    state.disabled.value = true;
    await state.run(action);
    expect(action).not.toHaveBeenCalled();
    state.scope.stop();
  });
});
