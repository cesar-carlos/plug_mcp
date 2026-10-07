import { browserPage, escapeHtml, hiddenField } from "./browser-page.js";

const page = (body: string): string =>
  browserPage({ title: "Conectar Se7e ao ChatGPT", product: "Plugin ChatGPT", body });

export const oauthTokenPage = (input: {
  clientId: string;
  transactionId: string;
  csrf: string;
}): string =>
  page(`<p class="lead">Informe o token MCP existente somente neste formulário.</p>
<section class="card">
<p class="meta">Cliente</p>
<p class="client">${escapeHtml(input.clientId)}</p>
<form method="post" action="/oauth/authorize/authenticate">${hiddenField("transaction", input.transactionId)}${hiddenField("csrf", input.csrf)}
<label>Token MCP <input type="password" name="token" autocomplete="off" required></label>
<div class="actions"><button type="submit">Conferir acesso</button></div>
</form>
</section>`);

export const oauthConsentPage = (input: {
  persona: string;
  clientId: string;
  transactionId: string;
  csrf: string;
}): string =>
  page(`<section class="card">
<p class="meta">Persona: <strong class="persona">${escapeHtml(input.persona)}</strong></p>
<p class="meta">Cliente</p>
<p class="client">${escapeHtml(input.clientId)}</p>
<p class="lead">Autoriza consulta, treinamento e administração permitidos neste acesso. Publicações, policy e confirmações continuam obrigatórias.</p>
<form method="post" action="/oauth/authorize/consent">${hiddenField("transaction", input.transactionId)}${hiddenField("csrf", input.csrf)}
<div class="actions"><button name="confirmed" value="yes" type="submit">Confirmar conexão</button><button class="secondary" name="confirmed" value="no" type="submit">Cancelar</button></div>
</form>
</section>`);

export const oauthConnectErrorPage = (): string =>
  page(
    `<p class="notice">Conexão não concluída. Reinicie a conexão no ChatGPT e confira o token no navegador.</p>`,
  );
