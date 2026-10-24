import type { Express } from "express";
import { z } from "zod";
import type { PersonaKnowledgeMaintenance } from "../../application/persona-v2/knowledge-maintenance.js";
export function registerKnowledgeMaintenanceRoutes(
  app: Express,
  service: PersonaKnowledgeMaintenance,
  session: (cookie: string | undefined) => string,
): void {
  const id = (value: unknown) => z.uuid().parse(value);
  const page = (raw: unknown) =>
    z.strictObject({ beforeVersion: z.coerce.number().int().positive().optional() }).parse(raw)
      .beforeVersion;
  const root = "/api/admin/personas/:personaId/feedback-conhecimento";
  app.get(root, async (req, res) =>
    res.json(
      await service.listFeedback(session(req.get("cookie")), id(req.params.personaId), req.query),
    ),
  );
  app.post(`${root}/:feedbackId/decidir`, async (req, res) =>
    res.json(
      await service.decideFeedback(
        session(req.get("cookie")),
        id(req.params.personaId),
        id(req.params.feedbackId),
        req.body,
      ),
    ),
  );
  const standard = "/api/admin/catalogos/:catalogId/publicacoes/:publicationId/revisao";
  app.post(`${standard}/notificacoes/:taskId/lida`, async (req, res) => {
    z.strictObject({}).parse(req.body);
    res.json(
      await service.standardReview(
        session(req.get("cookie")),
        id(req.params.catalogId),
        id(req.params.publicationId),
        undefined,
        undefined,
        id(req.params.taskId),
      ),
    );
  });
  app.get(standard, async (req, res) =>
    res.json(
      await service.standardReview(
        session(req.get("cookie")),
        id(req.params.catalogId),
        id(req.params.publicationId),
        undefined,
        page(req.query),
      ),
    ),
  );
  app.post(standard, async (req, res) =>
    res.json(
      await service.standardReview(
        session(req.get("cookie")),
        id(req.params.catalogId),
        id(req.params.publicationId),
        req.body,
      ),
    ),
  );
  const physical =
    "/api/admin/personas/:personaId/fontes/:sourceId/perfis/:catalogId/:publicationId/revisao";
  app.post(`${physical}/notificacoes/:taskId/lida`, async (req, res) => {
    z.strictObject({}).parse(req.body);
    res.json(
      await service.physicalReview(
        session(req.get("cookie")),
        id(req.params.personaId),
        id(req.params.sourceId),
        id(req.params.catalogId),
        id(req.params.publicationId),
        undefined,
        undefined,
        id(req.params.taskId),
      ),
    );
  });
  app.get(physical, async (req, res) =>
    res.json(
      await service.physicalReview(
        session(req.get("cookie")),
        id(req.params.personaId),
        id(req.params.sourceId),
        id(req.params.catalogId),
        id(req.params.publicationId),
        undefined,
        page(req.query),
      ),
    ),
  );
  app.post(physical, async (req, res) =>
    res.json(
      await service.physicalReview(
        session(req.get("cookie")),
        id(req.params.personaId),
        id(req.params.sourceId),
        id(req.params.catalogId),
        id(req.params.publicationId),
        req.body,
      ),
    ),
  );
  const privatePath =
    "/api/admin/personas/:personaId/skills/:skillId/publicacoes/:publicationId/revisao";
  app.post(`${privatePath}/notificacoes/:taskId/lida`, async (req, res) => {
    z.strictObject({}).parse(req.body);
    res.json(
      await service.privateReview(
        session(req.get("cookie")),
        id(req.params.personaId),
        id(req.params.skillId),
        id(req.params.publicationId),
        undefined,
        undefined,
        id(req.params.taskId),
      ),
    );
  });
  app.get(privatePath, async (req, res) =>
    res.json(
      await service.privateReview(
        session(req.get("cookie")),
        id(req.params.personaId),
        id(req.params.skillId),
        id(req.params.publicationId),
        undefined,
        page(req.query),
      ),
    ),
  );
  app.post(privatePath, async (req, res) =>
    res.json(
      await service.privateReview(
        session(req.get("cookie")),
        id(req.params.personaId),
        id(req.params.skillId),
        id(req.params.publicationId),
        req.body,
      ),
    ),
  );
}
