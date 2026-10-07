import { describe, expect, it } from "vitest";
import {
  setupFormPage,
  setupNoticePage,
  setupTokenPage,
  setupUpdatedPage,
} from "../../src/infrastructure/http/setup-browser-page.js";

describe("páginas do cofre no navegador", () => {
  it("cadastra o acesso com os campos e o dialeto submetidos", () => {
    const html = setupFormPage({
      purpose: "registrar",
      code: "abc/def",
      csrf: 'csrf"1',
    });
    expect(html).toContain('action="/setup/abc%2Fdef"');
    expect(html).toContain("csrf&quot;1");
    expect(html).toContain('name="agentId"');
    expect(html).toContain('name="clientToken"');
    expect(html).toContain('value="mssql"');
    expect(html).toContain('name="recuperar" value="sim"');
    expect(html).toContain('name="confirmado" value="sim"');
    expect(html).toContain("Confirmar");
    expect(html).not.toContain("<script");
  });

  it("outra persona não oferece recuperar o Bearer atual", () => {
    const html = setupFormPage({ purpose: "adicionar", code: "code", csrf: "csrf" });
    expect(html).toContain('name="agentId"');
    expect(html).not.toContain('name="recuperar"');
  });

  it("credenciais e rotação pedem só a conta do hub", () => {
    for (const purpose of ["credenciais", "rotacionar"] as const) {
      const html = setupFormPage({ purpose, code: "code", csrf: "csrf" });
      expect(html).toContain('name="email"');
      expect(html).toContain('name="senha"');
      expect(html).not.toContain('name="agentId"');
      expect(html).not.toContain('name="clientToken"');
      expect(html).not.toContain('name="recuperar"');
    }
  });

  it("mostra o Bearer uma vez, escapado", () => {
    const html = setupTokenPage("tok<script>");
    expect(html).toContain("Authorization: Bearer");
    expect(html).toContain("tok&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("confirma credenciais e explica a recusa", () => {
    expect(setupUpdatedPage()).toContain("Credenciais atualizadas no hub e no cofre.");
    expect(setupNoticePage("Origem não autorizada.")).toContain("Origem não autorizada.");
  });
});
