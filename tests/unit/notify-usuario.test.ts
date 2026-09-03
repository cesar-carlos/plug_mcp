import { describe, expect, it } from "vitest";
import { sessaoDeveReceberSkillsChanged } from "../../src/infrastructure/mcp/mcp-http.js";

describe("notifyUsuario / tools/list_changed", () => {
  it("só notifica sessões do mesmo usuarioId, não quem só compartilha agentId", () => {
    expect(
      sessaoDeveReceberSkillsChanged({ bootstrap: false, usuarioId: "user-a" }, "user-a"),
    ).toBe(true);
    expect(
      sessaoDeveReceberSkillsChanged({ bootstrap: false, usuarioId: "user-b" }, "user-a"),
    ).toBe(false);
    expect(sessaoDeveReceberSkillsChanged({ bootstrap: true, usuarioId: "user-a" }, "user-a")).toBe(
      false,
    );
    expect(sessaoDeveReceberSkillsChanged({ bootstrap: false, usuarioId: null }, "user-a")).toBe(
      false,
    );
  });
});
