import { describe, expect, it } from "vitest";
import { sessaoDeveReceberSkillsChanged } from "../../src/infrastructure/mcp/mcp-http.js";

describe("notifyUsuario / tools/list_changed", () => {
  it("só notifica sessões do mesmo usuarioId e acessoId", () => {
    expect(
      sessaoDeveReceberSkillsChanged(
        { bootstrap: false, usuarioId: "user-a", acessoId: "acc-a" },
        "user-a",
        "acc-a",
      ),
    ).toBe(true);
    expect(
      sessaoDeveReceberSkillsChanged(
        { bootstrap: false, usuarioId: "user-a", acessoId: "acc-b" },
        "user-a",
        "acc-a",
      ),
    ).toBe(false);
    expect(
      sessaoDeveReceberSkillsChanged(
        { bootstrap: false, usuarioId: "user-b", acessoId: "acc-a" },
        "user-a",
        "acc-a",
      ),
    ).toBe(false);
    expect(
      sessaoDeveReceberSkillsChanged(
        { bootstrap: true, usuarioId: "user-a", acessoId: "acc-a" },
        "user-a",
        "acc-a",
      ),
    ).toBe(false);
    expect(
      sessaoDeveReceberSkillsChanged(
        { bootstrap: false, usuarioId: null, acessoId: "acc-a" },
        "user-a",
        "acc-a",
      ),
    ).toBe(false);
  });
});
