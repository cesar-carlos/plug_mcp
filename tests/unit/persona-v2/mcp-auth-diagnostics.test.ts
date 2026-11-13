import express from "express";
import request from "supertest";
import pino from "pino";
import { expect, it } from "vitest";
import { PersonaV2Error } from "../../../src/domain/persona-v2/model.js";
import { createPersonaV2McpHandler } from "../../../src/infrastructure/mcp/persona-v2-http.js";
import { PinoLoggerAdapter } from "../../../src/infrastructure/logging/pino-logger.adapter.js";
import { PersonaOAuth } from "../../../src/application/persona-v2/oauth.js";
import { PersonaConsumerCatalog } from "../../../src/application/persona-v2/consumer-catalog.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";

it.each(["client", "identity", "expired", "temporary"])(
  "resolver OAuth distingue %s sem converter indisponibilidade em expiração",
  async (scenario) => {
    const record = {
      kind: "access_token",
      expiresAt: scenario === "expired" ? 0 : 2000,
      binding: {
        resource: "https://fixture.test/mcp",
        clientId: "fixture",
        redirectUri: "https://fixture.test/callback",
      },
      identity: { personaId: "persona", tokenId: "token", grant: { id: "grant" } },
    };
    const oauth = new PersonaOAuth(
      { record: async () => record } as unknown as ConstructorParameters<typeof PersonaOAuth>[0],
      {
        authorization: async () => {
          if (scenario === "temporary") throw Error("private-temporary");
          return null;
        },
      } as unknown as ConstructorParameters<typeof PersonaOAuth>[1],
      new NodeCryptoAdapter("a".repeat(64)),
      {} as ConstructorParameters<typeof PersonaOAuth>[3],
      {
        issuer: "https://fixture.test",
        resource: "https://fixture.test/mcp",
        clients: scenario === "client" ? {} : { fixture: ["https://fixture.test/callback"] },
      },
      () => "challenge",
      () => 1000,
    );
    if (scenario === "temporary")
      await expect(oauth.resolve("a".repeat(43))).rejects.not.toBeInstanceOf(PersonaV2Error);
    else
      await expect(oauth.resolve("a".repeat(43))).rejects.toMatchObject({
        code: "AUTHORIZATION_DENIED",
        authorizationReason:
          scenario === "client"
            ? "oauth_client_unavailable"
            : scenario === "expired"
              ? "access_expired"
              : "identity_invalid",
      });
  },
);

it("Bearer inexistente preserva identidade inválida sem inferir expiração", async () => {
  const catalog = new PersonaConsumerCatalog({
    repository: { authentication: async () => null },
    crypto: { sha256Hex: () => "synthetic-hash" },
  } as unknown as ConstructorParameters<typeof PersonaConsumerCatalog>[0]);
  await expect(catalog.authenticate("private-fixture")).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
    authorizationReason: "identity_invalid",
  });
});

it.each(["oauth", "bearer"] as const)(
  "diagnóstico HTTP %s conserva motivo e não pede reconexão temporária",
  async (mode) => {
    for (const reason of [
      "access_expired",
      "grant_revoked",
      "identity_invalid",
      "unknown",
      "temporary",
      "missing",
      "malformed",
    ] as const) {
      if (mode === "bearer" && reason === "missing") continue; // Anonymous discovery remains available.
      let log = "";
      const logger = new PinoLoggerAdapter(
        pino(
          {},
          {
            write: (line) => {
              log += line;
            },
          },
        ),
      );
      const fail = async () => {
        if (reason === "temporary") throw Error("private-password");
        throw new PersonaV2Error(
          "AUTHORIZATION_DENIED",
          "private-token",
          reason === "unknown"
            ? undefined
            : {
                authorizationReason:
                  reason === "missing" || reason === "malformed" ? "identity_invalid" : reason,
              },
        );
      };
      const app = express();
      app.use(express.json());
      app.post(
        "/mcp",
        createPersonaV2McpHandler(
          { authenticate: fail } as unknown as Parameters<typeof createPersonaV2McpHandler>[0],
          "https://fixture.test",
          undefined,
          undefined,
          undefined,
          mode === "oauth"
            ? ({ resolve: fail } as unknown as Parameters<typeof createPersonaV2McpHandler>[5])
            : undefined,
          undefined,
          undefined,
          undefined,
          logger,
        ),
      );
      const call = request(app).post("/mcp").set("Host", "fixture.test");
      if (reason !== "missing")
        call.set(
          "Authorization",
          reason === "malformed" ? "Basic private-token" : "Bearer private-token",
        );
      const response = await call.send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
      const expectedReason =
        reason === "temporary"
          ? "authentication_unavailable"
          : reason === "unknown"
            ? "authorization_unknown"
            : reason === "missing"
              ? "credential_missing"
              : reason === "malformed"
                ? "credential_malformed"
                : reason;
      expect(response.status).toBe(reason === "temporary" ? 503 : 401);
      expect(response.body.error).toMatchObject({
        source: "mcp",
        stage: "authentication",
        details: { authenticationMode: mode, authorizationReason: expectedReason },
      });
      expect(response.headers["x-support-id"]).toBe(response.body.error.supportId);
      const entry = JSON.parse(log.trim());
      expect(entry).toMatchObject({
        supportId: response.body.error.supportId,
        authenticationMode: mode,
        authorizationReason: expectedReason,
        stage: "authentication",
      });
      expect(log + JSON.stringify(response.body) + JSON.stringify(response.headers)).not.toContain(
        "private-",
      );
      if (reason === "temporary") {
        expect(response.headers).not.toHaveProperty("www-authenticate");
        expect(entry.challengeType).toBe("none");
        expect(response.body.error.hint).toContain("Não peça reconexão");
      }
      if (reason === "access_expired" && mode === "oauth") {
        expect(response.headers["www-authenticate"]).toContain("invalid_token");
        expect(response.headers["www-authenticate"]).toContain("refresh");
        expect(response.body.error.hint).toContain("refresh");
      }
      if (reason === "missing")
        expect(response.headers["www-authenticate"]).not.toContain("invalid_token");
    }
  },
);
