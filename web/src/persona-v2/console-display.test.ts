import { describe, expect, it } from "vitest";
import { displayCell, splitList } from "./console-display";

describe("exibição de valores na interface", () => {
  it("formata células sem interpretar valores de domínio", () => {
    expect(displayCell(null)).toBe("—");
    expect(displayCell(undefined)).toBe("—");
    expect(displayCell("texto")).toBe("texto");
    expect(displayCell(12)).toBe("12");
    expect(displayCell(false)).toBe("false");
    expect(displayCell({ id: 1 })).toBe('{"id":1}');
    expect(displayCell(Symbol("x"))).toBe("Valor não exibível");
  });
  it("separa listas editoriais por vírgula e ignora vazios", () => {
    expect(splitList(" id , nome,  ")).toEqual(["id", "nome"]);
    expect(splitList("")).toEqual([]);
  });
});
