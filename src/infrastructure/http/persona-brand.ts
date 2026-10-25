import type { Express } from "express";
import { z } from "zod";
import type { StoredPersonaIcon } from "../../domain/persona-v2/persona-icon.js";

/** Official normal PNGs. Maskable variants stay on the console manifest only. */
export const PERSONA_BRAND_ICONS = [
  { path: "/brand/icon-192.png", file: "icon-192.png", sizes: ["192x192"] },
  { path: "/brand/icon-512.png", file: "icon-512.png", sizes: ["512x512"] },
] as const;

export interface PersonaBrandIcon {
  readonly src: string;
  readonly mimeType: "image/png";
  readonly sizes: string[];
}

/** Absolute icon URLs advertised by MCP initialize. Origin has no path. */
export const personaBrandIcons = (origin: string): PersonaBrandIcon[] =>
  PERSONA_BRAND_ICONS.map((icon) => ({
    src: `${origin}${icon.path}`,
    mimeType: "image/png",
    sizes: [...icon.sizes],
  }));

/** Public persona icon. Missing and suspended personas answer 404. */
export const registerPersonaIconRoute = (
  app: Express,
  read: (personaId: string) => Promise<StoredPersonaIcon | null>,
): void => {
  app.get("/brand/personas/:personaId/icon", (req, res, next) => {
    const personaId = z.uuid().safeParse(req.params.personaId);
    if (!personaId.success) {
      res.status(404).end();
      return;
    }
    void read(personaId.data)
      .then((icon) => {
        if (!icon) {
          res.status(404).end();
          return;
        }
        res.set({
          "Cache-Control": "public, max-age=3600",
          ETag: `"${icon.revision}"`,
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Access-Control-Allow-Origin": "*",
        });
        res.type(icon.mediaType).send(icon.bytes);
      })
      .catch(next);
  });
};

/** Anonymous brand icons for plugin and connector registration. */
export const registerPersonaBrandIcons = (app: Express, root: string): void => {
  for (const icon of PERSONA_BRAND_ICONS) {
    app.get(icon.path, (_req, res) => {
      res.set({
        "Cache-Control": "public, max-age=86400",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Access-Control-Allow-Origin": "*",
      });
      res.type("png");
      res.sendFile(`${root}/${icon.file}`);
    });
  }
};
