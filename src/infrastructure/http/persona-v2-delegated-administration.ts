import type { Express, Request } from "express";
import { z } from "zod";
import type { PersonaConsumerCatalog } from "../../application/persona-v2/consumer-catalog.js";
import type { PersonaCatalog } from "../../application/persona-v2/catalog.js";
import type { PersonaDelegatedTokens } from "../../application/persona-v2/delegated-tokens.js";
import type { PersonaOAuth } from "../../application/persona-v2/oauth.js";
import type { PersonaExternalIntegrations } from "../../application/persona-v2/external-integrations.js";
import type { PersonaIntegrationManagement } from "../../application/persona-v2/integration-management.js";
import { readBearer } from "../mcp/mcp-auth.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";

/** Dedicated Bearer/OAuth paths never accept a cookie in place of consumer authority. */
export function registerDelegatedAdministrationRoutes(
  app: Express,
  consumer: PersonaConsumerCatalog,
  catalog: PersonaCatalog,
  tokens: PersonaDelegatedTokens,
  oauth?: PersonaOAuth,
  external?: PersonaExternalIntegrations,
  integrations?: PersonaIntegrationManagement,
): void {
  for (const mode of ["bearer", "oauth"] as const) {
    if (mode === "oauth" && !oauth) continue;
    const root = `/api/consumer/${mode}/administration`;
    const identity = async (req: Request) => {
      const bearer = readBearer(req);
      if (!bearer || req.get("cookie"))
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Use somente a credencial do consumidor.");
      return mode === "oauth" ? oauth!.resolve(bearer) : consumer.authenticate(bearer);
    };
    if (external) {
      app.post(`${root}/integracoes/importar`, async (req, res) => {
        const actor = await identity(req);
        res.json(await external.importCandidates(actor, actor.personaId, req.body));
      });
      const externalRoot = `${root}/external-skills`;
      app.get(externalRoot, async (req, res) => {
        const actor = await identity(req);
        res.json({ skills: await external.drafts(actor, actor.personaId) });
      });
      app.post(externalRoot, async (req, res) => {
        const actor = await identity(req);
        res.status(201).json(await external.create(actor, actor.personaId, req.body));
      });
      app.get(`${externalRoot}/:skillId`, async (req, res) => {
        const actor = await identity(req);
        res.json(await external.detail(actor, actor.personaId, z.uuid().parse(req.params.skillId)));
      });
      app.post(`${externalRoot}/:skillId/rascunho`, async (req, res) => {
        const actor = await identity(req);
        res.json(
          await external.update(
            actor,
            actor.personaId,
            z.uuid().parse(req.params.skillId),
            req.body,
          ),
        );
      });
      app.post(`${externalRoot}/:skillId/preview`, async (req, res) => {
        const actor = await identity(req);
        z.strictObject({}).parse(req.body);
        res.json(
          await external.preview(actor, actor.personaId, z.uuid().parse(req.params.skillId)),
        );
      });
      app.post(`${externalRoot}/:skillId/publicar`, async (req, res) => {
        const actor = await identity(req);
        const body = z
          .strictObject({ confirmationHash: z.string().regex(/^[a-f0-9]{64}$/) })
          .parse(req.body);
        res.json(
          await external.publish(
            actor,
            actor.personaId,
            z.uuid().parse(req.params.skillId),
            body.confirmationHash,
          ),
        );
      });
    }
    if (integrations) {
      app.get(`${root}/integracoes`, async (req, res) => {
        const actor = await identity(req);
        res.json({ integrations: await integrations.list(actor, actor.personaId) });
      });
      app.get(`${root}/integracoes/:integrationId/impacto`, async (req, res) => {
        const actor = await identity(req);
        res.json(
          await integrations.review(
            actor,
            actor.personaId,
            z.uuid().parse(req.params.integrationId),
          ),
        );
      });
      for (const action of ["suspender", "recuperar"] as const) {
        app.post(`${root}/integracoes/:integrationId/${action}`, async (req, res) => {
          const actor = await identity(req);
          res.json(
            await integrations.state(
              actor,
              actor.personaId,
              z.uuid().parse(req.params.integrationId),
              action === "suspender",
              req.body,
            ),
          );
        });
      }
    }
    app.get(`${root}/skills`, async (req, res) => {
      const actor = await identity(req);
      res.json({ skills: await catalog.list(actor, actor.personaId) });
    });
    app.get(`${root}/skills/:skillId/testes`, async (req, res) => {
      const actor = await identity(req),
        skillId = z.uuid().parse(req.params.skillId);
      const { kind, after } = z
        .strictObject({
          kind: z.enum(["consulta", "operacao_sql", "cruzamento", "acao_externa"]),
          after: z.uuid().optional(),
        })
        .parse(req.query);
      if (kind === "acao_externa") {
        if (!external) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Capacidade indisponível.");
        res.json(await external.tests(actor, actor.personaId, skillId, after));
        return;
      }
      res.json(
        kind === "consulta"
          ? await catalog.queryTests(actor, actor.personaId, skillId, after)
          : kind === "operacao_sql"
            ? await catalog.operationTests(actor, actor.personaId, skillId, after)
            : await catalog.federationTests(actor, actor.personaId, skillId, after),
      );
    });
    app.post(`${root}/skills/:skillId/testes`, async (req, res) => {
      const actor = await identity(req),
        skillId = z.uuid().parse(req.params.skillId);
      const { kind, ...value } = z
        .object({ kind: z.enum(["consulta", "operacao_sql", "cruzamento", "acao_externa"]) })
        .passthrough()
        .parse(req.body);
      if (kind === "acao_externa") {
        if (!external) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Capacidade indisponível.");
        res.json(await external.changeCase(actor, actor.personaId, skillId, value));
        return;
      }
      res.json(
        kind === "consulta"
          ? await catalog.editQueryCase(actor, actor.personaId, skillId, value)
          : kind === "operacao_sql"
            ? await catalog.editOperationCase(actor, actor.personaId, skillId, value)
            : await catalog.editFederationCase(actor, actor.personaId, skillId, value),
      );
    });
    app.post(`${root}/skills`, async (req, res) => {
      const actor = await identity(req);
      res.status(201).json({ skill: await catalog.create(actor, actor.personaId, req.body) });
    });
    app.post(`${root}/skills/template`, async (req, res) => {
      const actor = await identity(req);
      res
        .status(201)
        .json({ skill: await catalog.createFromTemplate(actor, actor.personaId, req.body) });
    });
    app.post(`${root}/templates/ler`, async (req, res) => {
      const actor = await identity(req);
      res.json(await catalog.readTemplate(actor, actor.personaId, req.body));
    });
    for (const action of ["rascunho", "casos", "preview", "publicar", "suspender"] as const) {
      app.post(`${root}/skills/:skillId/${action}`, async (req, res) => {
        const actor = await identity(req),
          skillId = z.uuid().parse(req.params.skillId);
        if (action === "rascunho")
          res.json(await catalog.update(actor, actor.personaId, skillId, req.body));
        else if (action === "casos")
          res.status(201).json(await catalog.addCase(actor, actor.personaId, skillId, req.body));
        else if (action === "publicar") {
          const { confirmationHash } = z
            .strictObject({ confirmationHash: z.string().regex(/^[a-f0-9]{64}$/) })
            .parse(req.body);
          res
            .status(201)
            .json(await catalog.publish(actor, actor.personaId, skillId, confirmationHash));
        } else {
          z.strictObject({}).parse(req.body);
          if (action === "preview")
            res.json(await catalog.preview(actor, actor.personaId, skillId));
          else {
            await catalog.suspend(actor, actor.personaId, skillId);
            res.status(204).end();
          }
        }
      });
    }
    app.get(`${root}/tokens`, async (req, res) =>
      res.json({ tokens: await tokens.list(await identity(req)) }),
    );
    app.post(`${root}/tokens/editar`, async (req, res) =>
      res.json(await tokens.edit(await identity(req), req.body)),
    );
    app.post(`${root}/tokens/revogar`, async (req, res) =>
      res.json(await tokens.revoke(await identity(req), req.body)),
    );
  }
}
