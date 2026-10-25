import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { administrativePermissionSchema } from "../../domain/persona-v2/administrative-permissions.js";
import { type PersonaOAuth, PERSONA_OAUTH_SCOPE } from "../../application/persona-v2/oauth.js";
import { OAuthError } from "../../domain/errors/oauth-error.js";
import type { Permissions } from "../../domain/persona-v2/model.js";
import { browserPage, escapeHtml, hiddenField } from "./browser-page.js";
import { createRateLimiter } from "./rate-limit.js";
import type { PersonaConsumerCatalog } from "../../application/persona-v2/consumer-catalog.js";
import type { StoredPersonaIcon } from "../../domain/persona-v2/persona-icon.js";
import {
  QUERY_LIMITS,
  OPERATION_LIMITS,
  queryLimits,
  operationLimits,
} from "../../domain/persona-v2/execution-limits.js";

const root = "/oauth/persona-v2";
const cookieName = "__Host-persona_oauth_v2";
const scalar = z.string().max(4096);
const params = z
  .record(z.string().max(100), scalar)
  .refine((value) => Object.keys(value).length <= 20);
const cookie = (req: Request): string => {
  const values = (req.get("cookie") ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(`${cookieName}=`));
  return values.length === 1 ? values[0]!.slice(cookieName.length + 1) : "";
};
const page = (body: string) =>
  browserPage({ title: "Conectar persona ao ChatGPT", product: "Se7e — Personas", body });

/** Published name wins. A draft name stays visibly unpublished and does not authorize use. */
export const consentSkillTitle = (
  publishedName: string | undefined,
  draftName: string | undefined,
): string =>
  publishedName ??
  (draftName ? `${draftName} · sem publicação utilizável` : "Skill sem publicação utilizável");
const choices = (permissions: Permissions, labels: ReadonlyMap<string, string>) => {
  const group = (title: string, name: string, items: readonly string[]) =>
    `<fieldset><legend>${title}</legend>${items.length ? items.map((id) => `<label><input type="checkbox" name="${name}" value="${escapeHtml(id)}"> ${escapeHtml(labels.get(id) ?? id)}</label>`).join("") : "<p>Nenhuma concessão.</p>"}</fieldset>`;
  return (
    group("Bases", "sources", permissions.sourceIds) +
    group(
      "Skills publicadas",
      "skills",
      permissions.skills.map((g) => g.skillId),
    ) +
    group("Operações externas", "external", permissions.externalOperationIds) +
    group(
      "Integrações administráveis (não concede execução)",
      "managedIntegrations",
      permissions.managedIntegrationIds ?? [],
    ) +
    group(
      "Administração: selecione somente as permissões desejadas",
      "administrative",
      permissions.administrative,
    ) +
    limitChoices(permissions)
  );
};
const limitChoices = (permissions: Permissions) => {
  const labels: Record<string, string> = {
    maxRows: "Linhas por consulta",
    maxBytes: "Resposta máxima (bytes)",
    timeoutMs: "Prazo de execução (ms)",
    pageSize: "Linhas por página",
    maxAffectedRows: "Linhas diretamente afetadas por lançamento",
  };
  const group = (prefix: string, title: string, limits: object) =>
    `<fieldset><legend>${title}</legend><p>Opcional: reduza os tetos desta conexão. Em branco preserva os limites existentes. Publicações e outras concessões podem impor valores menores.</p>${Object.entries(
      limits,
    )
      .map(
        ([key, max]) =>
          `<label>${labels[key]}<input type="number" name="${prefix}_${key}" min="1" max="${String(max)}" step="1"></label>`,
      )
      .join("")}</fieldset>`;
  return (
    group("query", "Limites de consulta da conexão", queryLimits(permissions.queryLimits ?? {})) +
    group(
      "operation",
      "Limites de lançamento da conexão",
      operationLimits(permissions.operationLimits ?? {}),
    )
  );
};

export const registerPersonaOAuthRoutes = (
  app: Express,
  oauth: PersonaOAuth,
  catalog: PersonaConsumerCatalog,
  readPersonaIcon?: (personaId: string) => Promise<StoredPersonaIcon | null>,
): void => {
  const { issuer, resource } = oauth.policy;
  const origin = new URL(issuer).origin;
  const route =
    (action: (req: Request, res: Response) => Promise<void> | void) =>
    async (req: Request, res: Response) => {
      try {
        if (
          req.get("host") !== new URL(origin).host ||
          (req.get("origin") && req.get("origin") !== origin)
        ) {
          throw new OAuthError("invalid_request", 403);
        }
        if (req.method === "POST" && !req.is("application/x-www-form-urlencoded")) {
          throw new OAuthError("invalid_request", 415);
        }
        await action(req, res);
      } catch (error) {
        const known = error instanceof OAuthError;
        res.status(known ? error.status : error instanceof z.ZodError ? 400 : 503);
        const code = known
          ? error.code
          : error instanceof z.ZodError
            ? "invalid_request"
            : "temporarily_unavailable";
        if (req.path.endsWith("/token") || req.path.endsWith("/revoke")) {
          res.json({ error: code });
        } else {
          res
            .type("html")
            .send(
              page(
                '<p role="alert">Conexão não concluída. Reinicie a conexão no ChatGPT e confira o token somente no navegador.</p>',
              ),
            );
        }
      }
    };
  app.get(
    "/.well-known/oauth-protected-resource/mcp/chatgpt",
    route((_req, res) => {
      res.json({
        resource,
        authorization_servers: [issuer],
        scopes_supported: [PERSONA_OAUTH_SCOPE],
        bearer_methods_supported: ["header"],
        resource_name: "Se7e — Personas",
      });
    }),
  );
  app.get(
    "/.well-known/oauth-authorization-server",
    route((_req, res) => {
      res.json({
        issuer,
        authorization_endpoint: `${issuer}${root}/authorize`,
        token_endpoint: `${issuer}${root}/token`,
        revocation_endpoint: `${issuer}${root}/revoke`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: [PERSONA_OAUTH_SCOPE],
        client_id_metadata_document_supported: true,
        authorization_response_iss_parameter_supported: true,
      });
    }),
  );
  app.use(
    root,
    createRateLimiter({ windowMs: 60000, max: 60 }),
    express.urlencoded({ extended: false, limit: "32kb", parameterLimit: 2000 }),
    (_req, res, next) => {
      res.set({
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "Referrer-Policy": "same-origin",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      });
      next();
    },
  );
  app.get(
    `${root}/authorize`,
    route(async (req, res) => {
      const result = await oauth.begin(params.parse(req.query));
      res.cookie(cookieName, result.nonce, {
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 900000,
      });
      res
        .type("html")
        .send(
          page(
            `<p>Informe o token da persona somente neste formulário. Ele não será mostrado ao cliente.</p><p>Cliente: ${escapeHtml(result.clientId)}</p><form method="post" action="${root}/authenticate">${hiddenField("transaction", result.id)}${hiddenField("csrf", result.csrf)}<label>Token da persona <input type="password" name="token" autocomplete="off" maxlength="256" required></label><button type="submit">Revisar conexão</button></form>`,
          ),
        );
    }),
  );
  app.post(
    `${root}/authenticate`,
    route(async (req, res) => {
      if (req.get("origin") !== origin) {
        throw new OAuthError("invalid_request", 403);
      }
      const body = z
        .strictObject({ transaction: scalar, csrf: scalar, token: z.string().min(1).max(256) })
        .parse(req.body);
      const result = await oauth.authenticate(body.transaction, cookie(req), body.csrf, body.token);
      res.set(
        "Content-Security-Policy",
        `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self' ${new URL(result.redirectUri).origin}; frame-ancestors 'none'; base-uri 'none'`,
      );
      const [sources, skills, draftNames] = await Promise.all([
        catalog.sources(result.identity),
        catalog.list(result.identity),
        catalog.grantedSkillNames(result.identity),
      ]);
      const icon = readPersonaIcon
        ? await readPersonaIcon(result.identity.personaId).catch(() => null)
        : null;
      const iconSrc = icon
        ? `/brand/personas/${result.identity.personaId}/icon`
        : "/brand/icon-192.png";
      const labels = new Map(sources.map((s) => [s.id, `${s.name} · ${s.dialect}`]));
      for (const grant of result.permissions.skills) {
        const skill = skills.find((s) => s.id === grant.skillId);
        labels.set(
          grant.skillId,
          `${consentSkillTitle(skill?.name, draftNames.get(grant.skillId))} · comandos: ${grant.effects.join(", ")} · aprovação: ${grant.requireHumanApproval ? "humana adicional" : "conforme publicação"} (${grant.skillId})`,
        );
      }
      res
        .type("html")
        .send(
          page(
            `<p><img src="${escapeHtml(iconSrc)}" alt="" width="64" height="64"></p><p>Persona: <strong>${escapeHtml(result.persona)}</strong></p><p>Selecione explicitamente as concessões. Sem seleção, a conexão terá apenas o contexto da persona. Fontes e dependências da skill precisam estar selecionadas. Administração depende da delegação vigente e das opções selecionadas; aprovação humana não é delegada. Cada seleção preserva os limites do token e da publicação; o consentimento não os amplia.</p><form method="post" action="${root}/consent">${hiddenField("transaction", body.transaction)}${hiddenField("csrf", result.csrf)}${choices(result.permissions, labels)}<button name="confirmed" value="yes" type="submit">Confirmar conexão</button><button name="confirmed" value="no" type="submit">Cancelar</button></form>`,
          ),
        );
    }),
  );
  app.post(
    `${root}/consent`,
    route(async (req, res) => {
      if (req.get("origin") !== origin) {
        throw new OAuthError("invalid_request", 403);
      }
      const ids = z
        .union([z.uuid(), z.array(z.uuid()).max(1000)])
        .transform((v) => (typeof v === "string" ? [v] : v))
        .default([]);
      const limitField = (max: number) =>
        z.preprocess(
          (value) => (value === "" ? undefined : value),
          z.coerce.number().int().positive().max(max).optional(),
        );
      const body = z
        .strictObject({
          transaction: scalar,
          csrf: scalar,
          confirmed: z.enum(["yes", "no"]),
          sources: ids,
          skills: ids,
          external: ids,
          managedIntegrations: ids,
          query_maxRows: limitField(QUERY_LIMITS.maxRows),
          query_maxBytes: limitField(QUERY_LIMITS.maxBytes),
          query_timeoutMs: limitField(QUERY_LIMITS.timeoutMs),
          query_pageSize: limitField(QUERY_LIMITS.pageSize),
          operation_maxAffectedRows: limitField(OPERATION_LIMITS.maxAffectedRows),
          operation_timeoutMs: limitField(OPERATION_LIMITS.timeoutMs),
          administrative: z
            .union([administrativePermissionSchema, z.array(administrativePermissionSchema).max(5)])
            .transform((v) => (typeof v === "string" ? [v] : v))
            .default([]),
        })
        .parse(req.body);
      const location = await oauth.consent(
        body.transaction,
        cookie(req),
        body.csrf,
        body.confirmed === "yes"
          ? {
              sources: body.sources,
              skills: body.skills,
              external: body.external,
              managedIntegrations: body.managedIntegrations,
              administrative: body.administrative,
              ...([
                body.query_maxRows,
                body.query_maxBytes,
                body.query_timeoutMs,
                body.query_pageSize,
              ].some((v) => v !== undefined)
                ? {
                    queryLimits: {
                      maxRows: body.query_maxRows,
                      maxBytes: body.query_maxBytes,
                      timeoutMs: body.query_timeoutMs,
                      pageSize: body.query_pageSize,
                    },
                  }
                : {}),
              ...([body.operation_maxAffectedRows, body.operation_timeoutMs].some(
                (v) => v !== undefined,
              )
                ? {
                    operationLimits: {
                      maxAffectedRows: body.operation_maxAffectedRows,
                      timeoutMs: body.operation_timeoutMs,
                    },
                  }
                : {}),
            }
          : null,
      );
      res.clearCookie(cookieName, { secure: true, httpOnly: true, sameSite: "lax", path: "/" });
      res.set("Referrer-Policy", "no-referrer");
      // Navigation is only to the exact redirect already validated and stored by the service.
      res.set(
        "Content-Security-Policy",
        `default-src 'none'; form-action 'self' ${new URL(location).origin}; frame-ancestors 'none'; base-uri 'none'`,
      );
      res.redirect(303, location);
    }),
  );
  for (const action of ["token", "revoke"] as const) {
    app.post(
      `${root}/${action}`,
      route(async (req, res) => {
        const body = params.parse(req.body);
        if (
          req.get("authorization") ||
          body.client_secret !== undefined ||
          body.client_assertion !== undefined
        ) {
          throw new OAuthError("invalid_client");
        }
        if (action === "token") {
          res.json(await oauth.token(body));
        } else {
          await oauth.revokeToken(body);
          res.status(200).end();
        }
      }),
    );
  }
};
