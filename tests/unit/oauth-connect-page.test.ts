import { describe, expect, it } from "vitest";
import {
  oauthConnectErrorPage,
  oauthConsentPage,
  oauthTokenPage,
} from "../../src/infrastructure/http/oauth-connect-page.js";

describe("páginas de conectar o plugin", () => {
  it("pede o token em campo de senha e escapa o cliente", () => {
    const html = oauthTokenPage({
      clientId: "https://chatgpt.com/oauth/client.json?x=<script>",
      transactionId: "tx",
      csrf: 'a"b',
    });
    expect(html).toContain('name="token"');
    expect(html).toContain('type="password"');
    expect(html).toContain("Conferir acesso");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a&quot;b");
    expect(html).not.toContain("<script");
    expect(html).toContain('src="/app/icon-192.png"');
    expect(html).not.toContain("<svg");
    expect(html).toContain("<style>");
  });

  it("mostra a persona antes de confirmar a conexão", () => {
    const html = oauthConsentPage({
      persona: "Marina <admin>",
      clientId: "https://chatgpt.com/oauth/client.json",
      transactionId: "tx",
      csrf: "csrf",
    });
    expect(html).toContain("Persona:");
    expect(html).toContain("Marina &lt;admin&gt;");
    expect(html).toContain("Confirmar conexão");
    expect(html).toContain("Cancelar");
    expect(html).toContain('name="confirmed"');
  });

  it("explica a recusa sem novo campo de token", () => {
    const html = oauthConnectErrorPage();
    expect(html).toContain(
      "Conexão não concluída. Reinicie a conexão no ChatGPT e confira o token no navegador.",
    );
    expect(html).not.toContain('name="token"');
  });
});
