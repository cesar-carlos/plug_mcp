import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { randomUUID } from "node:crypto";
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
    logger?: LoggerPort;
    publicBaseUrl: string;
  },
): void {
  const origin = new URL(input.publicBaseUrl).origin;
  for (const mode of ["bearer", "oauth"] as const) {
    if (mode === "oauth" && !input.oauth) {
      continue;
    }
    app.all(`/api/consumer/${mode}/attachments/:handle`, async (req, res) => {
      const reject = (status: number, code: string, message: string) => {
        const supportId = randomUUID();
        input.logger?.warn("persona-v2 attachment failed", { supportId, status, errorCode: code });
        res.setHeader("X-Support-Id", supportId);
        res.status(status).json({ error: { code, message, supportId } });
      };
      res.setHeader("Cache-Control", "no-store, private");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Referrer-Policy", "no-referrer");
      if (
        req.get("host") !== new URL(origin).host ||
        (req.get("origin") && req.get("origin") !== origin) ||
        req.get("sec-fetch-site") === "cross-site"
      ) {
        reject(403, "ORIGIN_DENIED", "Origem não permitida.");
        return;
      }
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        reject(405, "METHOD_NOT_ALLOWED", "Use GET para obter o anexo.");
        return;
      }
      const bearer = readBearer(req);
      const challenge =
        mode === "oauth"
          ? chatGptOAuthChallenge(input.publicBaseUrl, Boolean(bearer))
          : 'Bearer realm="persona-v2"';
      if (!bearer) {
        res.setHeader("WWW-Authenticate", challenge);
        reject(401, "AUTHORIZATION_DENIED", "Autenticação necessária.");
        return;
      }
      let authenticated = false;
      try {
        const identity =
          mode === "oauth"
            ? await input.oauth!.resolve(bearer)
            : await input.catalog.authenticate(bearer);
        authenticated = true;
        if (req.get("range")) {
          reject(416, "RANGE_UNAVAILABLE", "Solicite o arquivo completo.");
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
        const denied = code === "AUTHORIZATION_DENIED" || code === "STALE_AUTHORIZATION";
        if (denied && !authenticated) {
          res.setHeader("WWW-Authenticate", challenge);
        }
        const status = denied
          ? authenticated
            ? 403
            : 401
          : code === "ATTACHMENT_UNAVAILABLE"
            ? 404
            : code === "BUDGET_EXCEEDED"
              ? 413
              : 503;
        const messages = {
          401:
            mode === "oauth"
              ? "O cliente deve renovar a autenticação via OAuth."
              : "Confira a validade do token.",
          403: "Permissão insuficiente para obter o anexo.",
          404: "Anexo indisponível ou expirado.",
          413: "Anexo excede o limite permitido.",
          503: "Serviço temporariamente indisponível.",
        };
        reject(status, code, messages[status]);
      }
    });
  }
}
