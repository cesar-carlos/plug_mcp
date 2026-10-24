import type { Express } from "express";
import { z } from "zod";
import type {
  PersonaPhysicalCuration,
  PhysicalCurationScope,
} from "../../application/persona-v2/physical-curation.js";
export function registerPhysicalCurationRoutes(
  app: Express,
  curation: PersonaPhysicalCuration,
  session: (cookie: string | undefined) => string,
): void {
  const path =
    "/api/admin/personas/:personaId/fontes/:sourceId/perfis/curadoria/:catalogId/:profilePublicationId/propostas";
  const scope = (params: unknown): PhysicalCurationScope =>
    z
      .object({
        personaId: z.uuid(),
        sourceId: z.uuid(),
        catalogId: z.uuid(),
        profilePublicationId: z.uuid(),
      })
      .parse(params);
  app.get(path, async (req, res) =>
    res.json(await curation.list(session(req.get("cookie")), scope(req.params), req.query)),
  );
  app.post(path, async (req, res) =>
    res
      .status(201)
      .json(await curation.propose(session(req.get("cookie")), scope(req.params), req.body)),
  );
  for (const action of ["preview", "incorporar", "rejeitar"] as const)
    app.post(`${path}/:proposalId/${action}`, async (req, res) =>
      res.json(
        await curation.review(
          session(req.get("cookie")),
          scope(req.params),
          z.uuid().parse(req.params.proposalId),
          req.body,
          action,
        ),
      ),
    );
}
