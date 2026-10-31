import express from "express";
import request from "supertest";
import { expect, it, vi } from "vitest";
import { PersonaV2Error } from "../../../src/domain/persona-v2/model.js";
import { registerPersonaAttachmentRoutes } from "../../../src/infrastructure/http/persona-v2-attachments.js";

it.each(["oauth", "bearer"])(
  "separates invalid identity from denied download in %s",
  async (mode) => {
    const denied = new PersonaV2Error("AUTHORIZATION_DENIED", "fixture");
    const authenticate = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(denied);
    const read = vi.fn().mockRejectedValue(denied);
    const app = express();
    registerPersonaAttachmentRoutes(app, {
      publicBaseUrl: "https://example.test",
      attachments: { read },
      catalog: { authenticate },
      oauth: { resolve: authenticate },
    } as unknown as Parameters<typeof registerPersonaAttachmentRoutes>[1]);
    const get = () =>
      request(app)
        .get(`/api/consumer/${mode}/attachments/fixture`)
        .set("Host", "example.test")
        .set("Authorization", "Bearer fixture");
    const forbidden = await get().expect(403);
    expect(forbidden.headers["www-authenticate"]).toBeUndefined();
    expect(forbidden.body.error.code).toBe("AUTHORIZATION_DENIED");
    const invalid = await get().expect(401);
    expect(invalid.headers["www-authenticate"]).toContain("Bearer");
    if (mode === "oauth") {
      expect(invalid.headers["www-authenticate"]).toContain('error="invalid_token"');
      expect(invalid.headers["www-authenticate"]).toContain("refresh");
    }
    expect(read).toHaveBeenCalledTimes(1);
  },
);
