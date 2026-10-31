import type { Express } from "express";
import { z } from "zod";
import type { PersonaInteractionErrors } from "../../application/persona-v2/interaction-error-report.js";

export function registerInteractionErrorRoutes(
  app: Express,
  service: PersonaInteractionErrors,
  session: (cookie: string | undefined) => string,
): void {
  app.get("/api/admin/personas/:personaId/erros-interacao", async (req, res) => {
    res.json(
      await service.list(
        session(req.get("cookie")),
        z.uuid().parse(req.params.personaId),
        req.query,
      ),
    );
  });
}
