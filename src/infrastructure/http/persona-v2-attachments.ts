import type { Express } from "express";
import type { PersonaAttachments } from "../../application/persona-v2/attachments.js";
import type { PersonaConsumerCatalog } from "../../application/persona-v2/consumer-catalog.js";
import type { PersonaOAuth } from "../../application/persona-v2/oauth.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { readBearer } from "../mcp/mcp-auth.js";
import { chatGptOAuthChallenge } from "../oauth/challenge.js";

export function registerPersonaAttachmentRoutes(
  app: Express,
  input: {
    attachments: PersonaAttachments;
    catalog: PersonaConsumerCatalog;
    oauth?: PersonaOAuth;
    publicBaseUrl: string;
  },
): void {
  const origin = new URL(input.publicBaseUrl).origin;
  for (const mode of ["bearer", "oauth"] as const) {
    if (mode === "oauth" && !input.oauth) {
      continue;
    }
    app.all(`/api/consumer/${mode}/attachments/:handle`, async (req, res) => {
      res.setHeader("Cache-Control", "no-store, private");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Referrer-Policy", "no-referrer");
      if (
        req.get("host") !== new URL(origin).host ||
        (req.get("origin") && req.get("origin") !== origin) ||
        req.get("sec-fetch-site") === "cross-site"
      ) {
        res.status(403).json({ error: { code: "ORIGIN_DENIED" } });
        return;
      }
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        res.status(405).end();
        return;
      }
      const bearer = readBearer(req);
      const challenge =
        mode === "oauth"
          ? chatGptOAuthChallenge(input.publicBaseUrl, true)
          : 'Bearer realm="persona-v2"';
      if (!bearer) {
        res.setHeader("WWW-Authenticate", challenge);
        res.status(401).json({ error: { code: "AUTHORIZATION_DENIED" } });
        return;
      }
      try {
        const identity =
          mode === "oauth"
            ? await input.oauth!.resolve(bearer)
            : await input.catalog.authenticate(bearer);
        if (req.get("range")) {
          res.status(416).end();
          return;
        }
        const file = await input.attachments.read(identity, String(req.params.handle));
        if (Date.parse(file.descriptor.expiresAt) <= Date.now()) {
          throw new PersonaV2Error("ATTACHMENT_UNAVAILABLE", "Anexo indisponível.");
        }
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Disposition", `attachment; filename="${file.descriptor.filename}"`);
        res.setHeader("Content-Length", file.data.byteLength);
        res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
        res.type(file.descriptor.mimeType).send(Buffer.from(file.data));
      } catch (error) {
        const code = error instanceof PersonaV2Error ? error.code : "CAPABILITY_UNAVAILABLE";
        if (
          code === "AUTHORIZATION_DENIED" ||
          code === "STALE_AUTHORIZATION" ||
          code === "ADMIN_SESSION_EXPIRED"
        ) {
          res.setHeader("WWW-Authenticate", challenge);
        }
        const status =
          code === "ATTACHMENT_UNAVAILABLE"
            ? 404
            : code === "AUTHORIZATION_DENIED"
              ? 401
              : code === "STALE_AUTHORIZATION"
                ? 403
                : code === "BUDGET_EXCEEDED"
                  ? 413
                  : 503;
        res.status(status).json({
          error: {
            code,
            message: "Anexo indisponível nesta conexão; confira validade e permissões.",
          },
        });
      }
    });
  }
}
