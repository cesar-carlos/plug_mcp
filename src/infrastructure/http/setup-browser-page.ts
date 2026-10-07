import type { SetupPurpose } from "../../domain/ports/setup-operation.port.js";
import { browserPage, escapeHtml, hiddenField } from "./browser-page.js";

const titleFor = (purpose: SetupPurpose): string => {
  switch (purpose) {
    case "registrar":
      return "Conectar ao plug_server";
    case "adicionar":
      return "Outra persona";
    case "credenciais":
      return "Atualizar credenciais";
    case "rotacionar":
      return "Rotacionar Bearer";
    default: {
      const unknown: never = purpose;
      return unknown;
    }
  }
};

const accessFields = `<fieldset class="section"><legend>Acesso SQL</legend>
<label>Agente <input name="agentId" autocomplete="off" spellcheck="false" required placeholder="UUID do agentId"><span class="hint">O mesmo agentId já cadastrado no plug_server.</span></label>
<label>Dialeto <select name="dialeto"><option value="mssql">SQL Server (mssql)</option><option value="sybase">SQL Anywhere (sybase)</option><option value="postgres">Postgres</option><option value="firebird">Firebird</option></select></label>
<label>client_token <input type="password" name="clientToken" autocomplete="off" required><span class="hint">Token SQL deste acesso. Ele não volta a aparecer.</span></label>
<label>Nome amigável <input name="nomeAmigavel" autocomplete="off" placeholder="Opcional"></label>
</fieldset>`;

export const setupFormPage = (input: {
  purpose: SetupPurpose;
  code: string;
  csrf: string;
}): string => {
  const novoAcesso = input.purpose === "registrar" || input.purpose === "adicionar";
  return browserPage({
    title: titleFor(input.purpose),
    product: "Cofre MCP",
    body: `<p class="lead">Use as credenciais do Client existente no hub. Esta operação expira em 15 minutos e será consumida na confirmação.</p>
<form class="card" method="post" action="/setup/${encodeURIComponent(input.code)}">${hiddenField("csrf", input.csrf)}
<fieldset class="section"><legend>Conta do hub</legend>
<label>E-mail <input type="email" name="email" autocomplete="username" required></label>
<label>Senha do hub <input type="password" name="senha" autocomplete="current-password" required></label>
</fieldset>
${novoAcesso ? accessFields : ""}
<fieldset class="section"><legend>Confirmação</legend>
${input.purpose === "registrar" ? '<label class="choice"><input type="checkbox" name="recuperar" value="sim"><span>Recuperar acesso existente e substituir o Bearer</span></label>' : ""}
<label class="choice"><input type="checkbox" name="confirmado" value="sim" required><span>Confirmo esta operação no acesso informado</span></label>
</fieldset>
<div class="actions"><button type="submit">Confirmar</button></div>
</form>`,
  });
};

export const setupTokenPage = (token: string): string =>
  browserPage({
    title: "Token MCP",
    product: "Cofre MCP",
    body: `<p class="lead">Copie o token abaixo para o header Authorization: Bearer do seu cliente MCP. Ele não será mostrado de novo.</p>
<section class="card"><pre class="token">${escapeHtml(token)}</pre></section>`,
  });

export const setupUpdatedPage = (): string =>
  browserPage({
    title: "Credenciais atualizadas",
    product: "Cofre MCP",
    body: `<p class="ok">Credenciais atualizadas no hub e no cofre.</p>`,
  });

export const setupNoticePage = (message: string): string =>
  browserPage({
    title: "Operação do cofre",
    product: "Cofre MCP",
    body: `<p class="notice">${escapeHtml(message)}</p>`,
  });
