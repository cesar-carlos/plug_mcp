import express from "express";
import request from "supertest";
import { expect, it, vi } from "vitest";
import { createPersonaV2McpHandler } from "../../../src/infrastructure/mcp/persona-v2-http.js";
import { registerDelegatedAdministrationRoutes } from "../../../src/infrastructure/http/persona-v2-delegated-administration.js";
import type { PersonaConsumerCatalog } from "../../../src/application/persona-v2/consumer-catalog.js";
import type { PersonaCatalog } from "../../../src/application/persona-v2/catalog.js";
import type { PersonaDelegatedTokens } from "../../../src/application/persona-v2/delegated-tokens.js";
import type { PersonaAdministrativeAuthorization } from "../../../src/application/persona-v2/administrative-authorization.js";
import type { PersonaIntegrationManagement } from "../../../src/application/persona-v2/integration-management.js";
import type { PersonaOAuth } from "../../../src/application/persona-v2/oauth.js";
import { PersonaV2Error } from "../../../src/domain/persona-v2/model.js";
import { parseMcpPayload } from "../../helpers/mcp-rpc.js";

it.each(["bearer", "oauth"] as const)(
  "transporta gestão %s sem cookies ou credenciais e reconfere revogação",
  async (mode) => {
    const identity = {
      personaId: "persona",
      tokenId: "token",
      tokenVersion: 1,
      personaVersion: 1,
      ...(mode === "oauth" ? { grant: { id: "grant" } } : {}),
    };
    const integrationId = "a1111111-1111-4111-8111-111111111111";
    let available = true;
    const resolve = vi.fn(async () => identity);
    const consumer = { authenticate: resolve } as unknown as PersonaConsumerCatalog;
    const oauth = { resolve } as unknown as PersonaOAuth;
    const catalog = {} as PersonaCatalog,
      tokens = {} as PersonaDelegatedTokens;
    const state = vi.fn(async () => {
      if (!available) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Integração indisponível.");
      return { managementVersion: 2, active: false, suspended: true };
    });
    const management = {
      list: async () => [],
      review: async () => ({ fingerprint: "a".repeat(64) }),
      state,
    } as unknown as PersonaIntegrationManagement;
    const app = express();
    app.use(express.json());
    app.post(
      "/mcp",
      createPersonaV2McpHandler(
        consumer,
        "http://fixture.test",
        undefined,
        undefined,
        undefined,
        mode === "oauth" ? oauth : undefined,
        undefined,
        {
          catalog,
          tokens,
          integrationManagement: management,
          authorization: {
            available: async () => (available ? ["gerenciar_integracoes"] : []),
          } as unknown as PersonaAdministrativeAuthorization,
        },
      ),
    );
    registerDelegatedAdministrationRoutes(
      app,
      consumer,
      catalog,
      tokens,
      oauth,
      undefined,
      management,
    );
    app.use(
      (
        error: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res
          .status(403)
          .json({ error: { code: error instanceof PersonaV2Error ? error.code : "INVALID_PLAN" } });
      },
    );
    const rpc = async (method: string, params: unknown) =>
      parseMcpPayload(
        await request(app)
          .post("/mcp")
          .set("Host", "fixture.test")
          .set("Authorization", "Bearer fixture")
          .set("Accept", "application/json, text/event-stream")
          .send({ jsonrpc: "2.0", id: 1, method, params }),
      );
    const listed = await rpc("tools/list", {});
    const tools = (
      listed.result as { tools: { name: string; annotations: { destructiveHint: boolean } }[] }
    ).tools;
    expect(tools.map((t) => t.name)).toContain("revisar_gestao_integracao");
    expect(
      tools.find((t) => t.name === "alterar_estado_integracao")?.annotations.destructiveHint,
    ).toBe(true);
    const confirmation = { expectedVersion: 1, fingerprint: "a".repeat(64), confirmed: true };
    const changed = await rpc("tools/call", {
      name: "alterar_estado_integracao",
      arguments: { integrationId, suspended: true, ...confirmation },
    });
    expect(changed.result).not.toHaveProperty("isError", true);
    expect(state).toHaveBeenLastCalledWith(identity, "persona", integrationId, true, confirmation);
    const path = `/api/consumer/${mode}/administration/integracoes/${integrationId}/recuperar`;
    await request(app)
      .post(path)
      .set("Authorization", "Bearer fixture")
      .send(confirmation)
      .expect(200);
    expect(state).toHaveBeenLastCalledWith(identity, "persona", integrationId, false, confirmation);
    await request(app).post(path).set("Cookie", "session=fixture").send(confirmation).expect(403);
    expect(state).toHaveBeenCalledTimes(2);
    available = false;
    await request(app)
      .post(path)
      .set("Authorization", "Bearer fixture")
      .send(confirmation)
      .expect(403);
    const denied = await rpc("tools/call", {
      name: "alterar_estado_integracao",
      arguments: { integrationId, suspended: false, ...confirmation },
    });
    expect(JSON.stringify(denied)).toMatch(/error|isError/);
    expect(state).toHaveBeenCalledTimes(3);
  },
);
