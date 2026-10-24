import type { Express } from "express";
import { z } from "zod";
import type { SharedKnowledge } from "../../application/persona-v2/shared-knowledge.js";

/** Registered after administrative Host/Origin/session/CSRF guards, before the error handler. */
export const registerSharedKnowledgeRoutes = (
  app: Express,
  knowledge: SharedKnowledge,
  session: (cookie: string | undefined) => string,
): void => {
  const uuid = (value: string): string => z.uuid().parse(value);
  const root = "/api/admin/catalogos";
  app.get(`${root}/:catalogId/publicacoes/:publicationId/impacto`, async (req, res) => {
    res.json(
      await knowledge.impact(
        session(req.get("cookie")),
        uuid(req.params.catalogId),
        uuid(req.params.publicationId),
        req.query,
      ),
    );
  });
  app.post(`${root}/:catalogId/importar-ddl`, async (req, res) => {
    res.json(
      await knowledge.library.importDdl(
        session(req.get("cookie")),
        uuid(req.params.catalogId),
        req.body,
      ),
    );
  });
  app.get(`${root}/:catalogId/biblioteca`, async (req, res) => {
    res.json(
      await knowledge.library.list(
        session(req.get("cookie")),
        uuid(req.params.catalogId),
        req.query,
      ),
    );
  });
  app.post(`${root}/:catalogId/biblioteca`, async (req, res) => {
    res
      .status(201)
      .json(
        await knowledge.library.save(
          session(req.get("cookie")),
          uuid(req.params.catalogId),
          req.body,
        ),
      );
  });
  app.get(`${root}/:catalogId/biblioteca/:libraryId`, async (req, res) => {
    res.json(
      await knowledge.library.get(
        session(req.get("cookie")),
        uuid(req.params.catalogId),
        uuid(req.params.libraryId),
        req.query,
      ),
    );
  });
  app.post(`${root}/:catalogId/biblioteca/:libraryId/versoes`, async (req, res) => {
    res
      .status(201)
      .json(
        await knowledge.library.save(
          session(req.get("cookie")),
          uuid(req.params.catalogId),
          req.body,
          uuid(req.params.libraryId),
        ),
      );
  });
  app.get(root, async (req, res) => {
    res.json({ catalogs: await knowledge.list(session(req.get("cookie"))) });
  });
  const proposals = `${root}/:catalogId/propostas`;
  app.get(proposals, async (req, res) => {
    res.json(
      await knowledge.curation.list(
        session(req.get("cookie")),
        uuid(req.params.catalogId),
        req.query,
      ),
    );
  });
  app.post(proposals, async (req, res) => {
    res.status(201).json({
      proposal: await knowledge.curation.propose(
        session(req.get("cookie")),
        uuid(req.params.catalogId),
        req.body,
      ),
    });
  });
  app.get(`${proposals}/:proposalId`, async (req, res) => {
    res.json({
      proposal: await knowledge.curation.get(
        session(req.get("cookie")),
        uuid(req.params.catalogId),
        uuid(req.params.proposalId),
      ),
    });
  });
  app.post(`${proposals}/:proposalId/preview`, async (req, res) => {
    z.strictObject({}).parse(req.body);
    res.json(
      await knowledge.curation.preview(
        session(req.get("cookie")),
        uuid(req.params.catalogId),
        uuid(req.params.proposalId),
      ),
    );
  });
  for (const action of ["incorporar", "rejeitar"] as const)
    app.post(`${proposals}/:proposalId/${action}`, async (req, res) => {
      res.json(
        await knowledge.curation[action === "incorporar" ? "incorporate" : "reject"](
          session(req.get("cookie")),
          uuid(req.params.catalogId),
          uuid(req.params.proposalId),
          req.body,
        ),
      );
    });
  app.post(root, async (req, res) => {
    res.status(201).json({ catalog: await knowledge.create(session(req.get("cookie")), req.body) });
  });
  app.get(`${root}/:catalogId/membros`, async (req, res) => {
    res.json({
      members: await knowledge.members(session(req.get("cookie")), uuid(req.params.catalogId)),
    });
  });
  app.post(`${root}/:catalogId/membros`, async (req, res) => {
    await knowledge.setMember(session(req.get("cookie")), uuid(req.params.catalogId), req.body);
    res.status(204).end();
  });
  const patterns = `${root}/:catalogId/padroes`;
  app.get(patterns, async (req, res) => {
    res.json(await knowledge.listPatterns(session(req.get("cookie")), uuid(req.params.catalogId)));
  });
  app.post(patterns, async (req, res) => {
    res.status(201).json({
      pattern: await knowledge.createPattern(
        session(req.get("cookie")),
        uuid(req.params.catalogId),
        req.body,
      ),
    });
  });
  app.post(`${patterns}/:patternId/editar`, async (req, res) => {
    res.json({
      pattern: await knowledge.updatePattern(
        session(req.get("cookie")),
        uuid(req.params.catalogId),
        uuid(req.params.patternId),
        req.body,
      ),
    });
  });
  app.get(`${patterns}/:patternId/versoes`, async (req, res) => {
    const { beforeId } = z.strictObject({ beforeId: z.uuid().optional() }).parse(req.query);
    res.json(
      await knowledge.history(
        session(req.get("cookie")),
        uuid(req.params.catalogId),
        uuid(req.params.patternId),
        beforeId,
      ),
    );
  });
  app.post(`${root}/:catalogId/comparar`, async (req, res) => {
    res.json(
      await knowledge.compare(session(req.get("cookie")), uuid(req.params.catalogId), req.body),
    );
  });
  app.post(`${patterns}/:patternId/preview`, async (req, res) => {
    const { reviewDueAt } = z
      .strictObject({ reviewDueAt: z.iso.datetime().optional() })
      .parse(req.body);
    res.json(
      await knowledge.preview(
        session(req.get("cookie")),
        uuid(req.params.catalogId),
        uuid(req.params.patternId),
        reviewDueAt,
      ),
    );
  });
  app.post(`${patterns}/:patternId/publicar`, async (req, res) => {
    res.status(201).json({
      publication: await knowledge.publish(
        session(req.get("cookie")),
        uuid(req.params.catalogId),
        uuid(req.params.patternId),
        req.body,
      ),
    });
  });
  app.get(`${root}/:catalogId/publicacoes/:publicationId`, async (req, res) => {
    res.json({
      publication: await knowledge.publication(
        session(req.get("cookie")),
        uuid(req.params.catalogId),
        uuid(req.params.publicationId),
      ),
    });
  });
  app.post(`${root}/:catalogId/publicacoes/:publicationId/suspender`, async (req, res) => {
    z.strictObject({}).parse(req.body);
    await knowledge.suspend(
      session(req.get("cookie")),
      uuid(req.params.catalogId),
      uuid(req.params.publicationId),
    );
    res.status(204).end();
  });
};
