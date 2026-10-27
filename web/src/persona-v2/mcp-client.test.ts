import { describe, expect, it } from "vitest";
import { assertGrantedPublication, assertTokenPersona, parseMcpToolResult } from "./mcp-client";

describe("resultado de tool MCP", () => {
  it("devolve o JSON da tool quando a chamada conclui", () => {
    expect(
      parseMcpToolResult<{ id: string }>({
        result: { content: [{ text: '{"id":"persona-1"}' }] },
      }),
    ).toEqual({ id: "persona-1" });
  });

  it("recusa JSON ilegível sem instruir repetir o efeito", () => {
    expect(() =>
      parseMcpToolResult({
        result: { content: [{ text: "{não-json" }] },
      }),
    ).toThrow("não repita ações com possível efeito");
  });

  it("usa a mensagem da tool quando o MCP marca erro", () => {
    expect(() =>
      parseMcpToolResult({
        result: {
          isError: true,
          content: [{ text: '{"error":{"message":"Skill não concedida."}}' }],
        },
      }),
    ).toThrow("Skill não concedida.");
  });

  it("recusa ausência de resultado sem inventar autorização", () => {
    expect(() => parseMcpToolResult({})).toThrow(
      "Solicitação recusada. Confira treinamento, fonte e permissões.",
    );
  });

  it("não troca o contexto da persona do token", () => {
    expect(() => assertTokenPersona({ id: "other" }, "persona-1")).toThrow(
      "Este token pertence a outra persona.",
    );
    expect(() => assertTokenPersona({ id: "persona-1" }, "persona-1")).not.toThrow();
  });

  it("exige publicação, hash e skill concedidos juntos", () => {
    const permitted = [{ id: "skill", publicationId: "pub", hash: "hash" }];
    expect(() =>
      assertGrantedPublication(permitted, "skill", { id: "pub", hash: "other" }),
    ).toThrow("não está concedida");
    expect(() =>
      assertGrantedPublication(permitted, "skill", { id: "pub", hash: "hash" }),
    ).not.toThrow();
  });
});
