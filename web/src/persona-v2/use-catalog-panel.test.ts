import { effectScope } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useCatalogPanel, type CatalogPanelEmit } from "./use-catalog-panel";
import type { ImportedDraftReference } from "./model";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

function lockValues(emit: CatalogPanelEmit & { mock: { calls: unknown[][] } }): boolean[] {
  return emit.mock.calls.filter((call) => call[0] === "lock").map((call) => call[1] as boolean);
}

function setup(): {
  scope: ReturnType<typeof effectScope>;
  emit: CatalogPanelEmit & { mock: { calls: unknown[][] } };
  panel: ReturnType<typeof useCatalogPanel>;
} {
  const scope = effectScope();
  const emit = vi.fn(
    (_event: "dirty" | "lock" | "openDraft", _value: boolean | ImportedDraftReference): void =>
      undefined,
  ) as CatalogPanelEmit & { mock: { calls: unknown[][] } };
  const panel = scope.run(() =>
    useCatalogPanel(
      {
        api: async <T>(): Promise<T> => {
          throw new Error("não deve consultar a API neste teste");
        },
        disabled: false,
        confirmDiscard: async () => true,
      },
      emit,
    ),
  );
  if (!panel) {
    throw new Error("painel do catálogo não foi criado");
  }
  return { scope, emit, panel };
}

describe("bloqueio do catálogo ao desmontar", () => {
  it("libera o bloqueio ao concluir enquanto montado", async () => {
    const state = setup();
    await state.panel.run(async () => undefined);
    expect(lockValues(state.emit)).toEqual([true, false]);
    expect(state.panel.busy.value).toBe(false);
    expect(state.panel.error.value).toBe("");
    state.scope.stop();
  });

  it.each(["sucesso", "falha"])(
    "desmontagem durante espera libera o bloqueio e ignora %s atrasado",
    async (outcome) => {
      const state = setup();
      const response = deferred<void>();
      const pending = state.panel.run(() => response.promise);
      expect(lockValues(state.emit)).toEqual([true]);
      expect(state.panel.busy.value).toBe(true);
      state.scope.stop();
      expect(lockValues(state.emit)).toEqual([true, false]);
      if (outcome === "sucesso") {
        response.resolve();
      } else {
        response.reject(new Error("falha desmontada"));
      }
      await pending;
      expect(state.panel.error.value).toBe("");
      expect(lockValues(state.emit)).toEqual([true, false]);
      const action = vi.fn(async () => undefined);
      await state.panel.run(action);
      expect(action).not.toHaveBeenCalled();
    },
  );
});
