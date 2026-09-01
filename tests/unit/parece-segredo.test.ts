import { describe, expect, it } from "vitest";
import { pareceSegredoEmTexto } from "../../src/domain/entities/parece-segredo.js";

describe("pareceSegredoEmTexto", () => {
  it("aceita orientação de tom sem credencial", () => {
    expect(pareceSegredoEmTexto("Fale como vendedor. Não cole senha nem token no chat.")).toBe(
      false,
    );
  });

  it("detecta JWT, Bearer, client_token e senha", () => {
    expect(pareceSegredoEmTexto("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb")).toBe(true);
    expect(pareceSegredoEmTexto("Authorization: Bearer abcdefghijklmnop")).toBe(true);
    expect(pareceSegredoEmTexto('{"client_token":"tok-sql-123456"}')).toBe(true);
    expect(pareceSegredoEmTexto("client_token=tok-sql-123456")).toBe(true);
    expect(pareceSegredoEmTexto("senha=secret-pass")).toBe(true);
    expect(pareceSegredoEmTexto("-----BEGIN RSA PRIVATE KEY-----\nMII")).toBe(true);
  });
});
