import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { browserPage, escapeHtml, hiddenField } from "./browser-page.js";
import { createRateLimiter } from "./rate-limit.js";
import type { PersonaTemporarySetups } from "../../application/persona-v2/setup.js";
import type { Permissions } from "../../domain/persona-v2/model.js";

const permissionReview = (title: string, p: Permissions): string => {
  const list = (values: readonly string[]) =>
    values.length ? values.map((v) => `<li>${escapeHtml(v)}</li>`).join("") : "<li>Nenhuma</li>";
  const limits = (v: object | undefined) =>
    Object.entries(v ?? {})
      .map(([k, n]) => `${k}: ${String(n)}`)
      .join("; ") || "Sem redução adicional nesta camada; prevalecem os tetos vigentes";
  return `<section><h3>${escapeHtml(title)}</h3><h4>Fontes (identificadores)</h4><ul>${list(p.sourceIds)}</ul><h4>Permissões administrativas</h4><ul>${list(p.administrative)}</ul><h4>Operações externas</h4><ul>${list(p.externalOperationIds)}</ul><h4>Skills</h4>${p.skills.map((s) => `<section><p>Skill: ${escapeHtml(s.skillId)} · comandos: ${escapeHtml(s.effects.join(", "))} · aprovação adicional: ${s.requireHumanApproval ? "sim" : "não (a exigida pela skill permanece)"}</p><ul>${list(s.capabilities)}</ul><p>Consulta: ${escapeHtml(limits(s.queryLimits))}</p><p>Operação: ${escapeHtml(limits(s.operationLimits))}</p><p>Cruzamento: ${escapeHtml(limits(s.federationLimits))}</p></section>`).join("") || "<p>Nenhuma</p>"}<p>Limites globais de consulta: ${escapeHtml(limits(p.queryLimits))}</p><p>Limites globais de operação: ${escapeHtml(limits(p.operationLimits))}</p><p>Limites globais de cruzamento: ${escapeHtml(limits(p.federationLimits))}</p></section>`;
};
export const registerPersonaSetupRoutes = (
  app: Express,
  setups: PersonaTemporarySetups,
  origin: string,
): void => {
  const page = (body: string) =>
    browserPage({ title: "Configurar persona", product: "Se7e — Personas", body });
  const route =
    (action: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response) => {
      try {
        res.set("Cache-Control", "no-store");
        if (
          req.get("host") !== new URL(origin).host ||
          (req.get("origin") && req.get("origin") !== origin)
        ) {
          res.status(403).end();
          return;
        }
        res.set("Referrer-Policy", "no-referrer");
        res.set(
          "Content-Security-Policy",
          "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        );
        await action(req, res);
      } catch {
        res
          .status(400)
          .type("html")
          .send(
            page(
              '<p role="alert">Configuração não concluída. Confira o prazo, a autorização e os dados. As credenciais foram descartadas. Abra novamente o link original para outra tentativa.</p>',
            ),
          );
      }
    };
  app.get("/app/setup-client.js", (_req, res) =>
    res.type("application/javascript").send(`
const csrf=location.hash.slice(1); history.replaceState(null,"",location.pathname);
const field=document.querySelector('input[name="csrf"]'); if(field) field.value=csrf;
const form=document.querySelector('form'); let dirty=false;
const token=document.getElementById('rotated-token');
if(token){
 const clearToken=()=>{token.value='';token.disabled=true;};
 window.addEventListener('pagehide',clearToken);setTimeout(clearToken,60000);
 document.getElementById('reveal-token').addEventListener('click',()=>{token.type='text';setTimeout(()=>{token.type='password';},10000);});
 document.getElementById('copy-token').addEventListener('click',async()=>{const status=document.getElementById('copy-status');try{await navigator.clipboard.writeText(token.value);status.textContent='Token copiado.';}catch{status.textContent='Cópia indisponível. Use a seleção manual.';}});
}
if(form) {
  const mode=form.querySelector('[name="credentialType"]');
  if(mode){const sync=()=>{for(const group of form.querySelectorAll('[data-credential]')){const enabled=group.dataset.credential===mode.value;group.hidden=!enabled;for(const input of group.querySelectorAll('input')){input.disabled=!enabled;input.required=enabled;}}};mode.addEventListener('change',sync);sync();}
  form.addEventListener('input',()=>{dirty=true;});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  form.addEventListener('submit',()=>{dirty=false;const b=form.querySelector('button');if(b)b.disabled=true;});
  const clear=()=>{dirty=false;form.reset();for(const i of form.elements)i.disabled=true;};
  window.addEventListener('pagehide',clear);
  setTimeout(()=>{clear();const note=document.getElementById('setup-status');if(note)note.textContent='Setup expirado. Credenciais descartadas; solicite um novo link.';},Math.max(0,Number(form.dataset.expiresAt)-Date.now()));
}`),
  );
  app.use(
    "/app/setup",
    createRateLimiter({ windowMs: 60000, max: 20 }),
    express.urlencoded({ extended: false, limit: "24kb" }),
  );
  app.get(
    "/app/setup/:code",
    route(async (req, res) => {
      const value = await setups.inspect(String(req.params.code));
      const field = (label: string, name: string, type = "text", max = 1024) =>
        `<label>${label}<input name="${name}" type="${type}" maxlength="${max}" autocomplete="off" required></label>`;
      const create = value.purpose === "source_create";
      const rotateToken = value.purpose === "token_rotate";
      const issueToken = value.purpose === "token_issue";
      const issuance = value.issuance;
      const integration =
        value.purpose === "integration_create" || value.purpose === "integration_rotate";
      const integrationForm = integration
        ? `${value.integration ? `<p>Integração: ${escapeHtml(value.integration.name)} · ${escapeHtml(value.integration.kind)} · versão ${value.integration.version}</p><p>Destino fixado: ${escapeHtml(value.integration.destination)}</p>` : `<fieldset><legend>Integração</legend>${field("Nome da integração", "name", "text", 200)}<label>Tipo<select name="kind" aria-label="Tipo"><option value="rest">REST</option><option value="mcp_http">MCP remoto (HTTP)</option></select></label>${field("Destino HTTPS público (sem query ou credenciais)", "destination", "url", 2048)}</fieldset>`}
        <fieldset><legend>Credencial técnica da integração</legend><label>Autenticação<select name="credentialType" aria-label="Autenticação"><option value="bearer">Bearer</option><option value="api_key">API key em header</option><option value="basic">Basic</option></select></label>
        <div data-credential="bearer">${field("Bearer da integração", "token", "password", 8192)}</div>
        <div data-credential="api_key">${field("Nome do header", "header", "text", 100)}${field("API key", "apiKey", "password", 8192)}</div>
        <div data-credential="basic">${field("Usuário técnico", "username", "text", 8192)}${field("Senha técnica", "password", "password", 8192)}</div></fieldset>
        <p>Use somente a credencial própria desta integração. Não informe o Bearer da persona nem credenciais do hub ou das bases. Nenhuma conexão externa será testada; integração e operações ficam inativas até implementação e publicação dos contratos.</p>
        <label><input type="checkbox" name="confirmed" value="save" required>Confirmo salvar esta credencial e manter a integração inativa.</label>`
        : "";
      // Chromium sends Origin:null for form POST under no-referrer; keep exact-origin enforcement.
      res.set("Referrer-Policy", "same-origin");
      res.type("html").send(
        page(`<p>${integration ? "Configurar credencial de integração" : issueToken ? "Emitir token com concessões limitadas" : rotateToken ? "Rotacionar o token originador desta conexão" : create ? "Cadastrar uma nova base" : "Rotacionar credenciais da mesma base"}. O responsável deve autenticar novamente. O link dura até 15 minutos e não concede novas permissões ao consumidor.</p>
      <p id="setup-status" role="status"></p><form data-expires-at="${value.expiresAt.getTime()}" method="post" action="/app/setup/${escapeHtml(String(req.params.code))}">${hiddenField("csrf", "")}
      <fieldset><legend>Responsável da persona</legend>${field("E-mail do responsável", "ownerEmail", "email", 320)}${field("Senha do responsável", "ownerPassword", "password")}</fieldset>
      ${create ? `<fieldset><legend>Identificação da base</legend>${field("Nome", "name", "text", 200)}${field("Finalidade", "purpose", "text", 5000)}${field("Ambiente", "environment", "text", 100)}${field("AGENT_ID", "agentId", "text", 36)}<label>DIALETO<select name="dialect"><option value="mssql">SQL Server</option><option value="postgres">PostgreSQL</option><option value="sybase">SQL Anywhere</option></select></label></fieldset>` : ""}
      ${integration ? integrationForm : issueToken && issuance ? `<h2>Revisão da proposta</h2><p>Consumidor: ${escapeHtml(issuance.name)}</p><p>Validade: ${escapeHtml(issuance.expiresAt)}</p>${permissionReview("Concessões do novo token", issuance.permissions)}${permissionReview("Teto para delegar a terceiros", issuance.delegation)}<p>Confirme exatamente esta proposta. Para alterar, solicite um novo link. O token solicitante permanece válido. O novo Bearer aparece somente aqui, uma vez.</p><label><input type="checkbox" name="confirmed" value="issue" required>Confirmo a emissão com estas concessões e validade.</label>` : rotateToken ? '<p>O Bearer anterior e todas as conexões OAuth derivadas serão invalidados imediatamente. Permissões e validade serão preservadas. O novo token será exibido uma única vez aqui por 60 segundos; não envie pelo chat. Se perder a resposta, rotacione novamente pelo console autenticado.</p><label><input type="checkbox" name="confirmed" value="rotate" required>Confirmo a rotação do token e a revogação das conexões derivadas.</label>' : `<fieldset><legend>Credenciais da base</legend>${field("CLIENT_EMAIL", "email", "email", 320)}${field("CLIENT_PASSWORD", "password", "password")}${field("CLIENT_TOKEN", "clientToken", "password", 8192)}</fieldset><p>Banco, motor e identidade serão confirmados pelo plug_server e plug_agente.</p>`}
      <button type="submit">${integration ? "Salvar credencial" : issueToken ? "Emitir token" : rotateToken ? "Rotacionar token" : create ? "Cadastrar base" : "Rotacionar credenciais"}</button></form><script src="/app/setup-client.js" defer></script>`),
      );
    }),
  );
  app.post(
    "/app/setup/:code",
    route(async (req, res) => {
      if (req.get("origin") !== origin || !req.is("application/x-www-form-urlencoded")) {
        res.status(403).end();
        return;
      }
      const body = z
        .object({
          csrf: z.string().max(256),
          ownerEmail: z.email().max(320),
          ownerPassword: z.string().min(1).max(1024),
        })
        .passthrough()
        .parse(req.body);
      const { csrf, ownerEmail, ownerPassword, ...source } = body;
      const result = await setups.complete(
        String(req.params.code),
        csrf,
        { email: ownerEmail, password: ownerPassword },
        source,
      );
      if ("bearer" in result) {
        res
          .type("html")
          .send(
            page(
              `<p role="status">${result.issued ? "Token emitido com as concessões confirmadas." : "Token rotacionado. Bearer anterior e conexões derivadas revogados."} Copie agora; não é recuperável.</p><label>Novo token<input id="rotated-token" type="password" readonly autocomplete="off" value="${escapeHtml(result.bearer)}"></label><button id="reveal-token" type="button">Revelar por 10 segundos</button><button id="copy-token" type="button">Copiar token</button><p id="copy-status" role="status"></p><a href="/app/">Abrir console</a><script src="/app/setup-client.js" defer></script>`,
            ),
          );
        return;
      }
      if ("integrationId" in result) {
        res
          .type("html")
          .send(
            page(
              `<p role="status">Credencial salva. Integração: ${escapeHtml(result.integrationId)}. Versão: ${result.version}. Integração e operações permanecem inativas. Nenhum segredo será exibido.</p><a href="/app/">Abrir console</a>`,
            ),
          );
        return;
      }
      res
        .type("html")
        .send(
          page(
            `<p role="status">Configuração concluída. As credenciais não serão exibidas. Fonte: ${escapeHtml(result.sourceId)}.</p><a href="/app/">Abrir console</a>`,
          ),
        );
    }),
  );
};
