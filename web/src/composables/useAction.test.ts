import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import { useSessionStore } from "../stores/session";
import { useAction } from "./useAction";

describe("useAction", () => {
  const setup = (): ReturnType<typeof useAction> => {
    setActivePinia(createPinia());
    const session = useSessionStore();
    session.setBearer("tok-mcp");
    return useAction();
  };

  it("grava o resultado no sucesso e devolve pending a falso", async () => {
    const { pending, error, run } = setup();
    expect(pending.value).toBe(false);

    const result = await run(async (bearer) => {
      expect(bearer).toBe("tok-mcp");
      expect(pending.value).toBe(true);
      return 42;
    });

    expect(result).toBe(42);
    expect(error.value).toBeNull();
    expect(pending.value).toBe(false);
  });

  it("preenche error na falha e devolve pending a falso", async () => {
    const { pending, error, run } = setup();
    const failure = new Error("falhou");

    const result = await run(async () => {
      expect(pending.value).toBe(true);
      throw failure;
    });

    expect(result).toBeUndefined();
    expect(error.value).toBe(failure);
    expect(pending.value).toBe(false);
  });
});
