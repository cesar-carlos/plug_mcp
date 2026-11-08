import express from "express";
import request from "supertest";
import { expect, it, vi } from "vitest";
import { createPersonaV2McpHandler } from "../../../src/infrastructure/mcp/persona-v2-http.js";
import type { PersonaConsumerCatalog } from "../../../src/application/persona-v2/consumer-catalog.js";
import type { PersonaSourceQueries } from "../../../src/application/persona-v2/source-query.js";
import {
  trainingManifest,
  trainingTopic,
  TRAINING_TOPICS,
} from "../../../src/application/persona-v2/training-topics.js";
import { parseMcpPayload, toolJson } from "../../helpers/mcp-rpc.js";
import { personaPluginCompatibility } from "../../../src/infrastructure/plugins/persona-compatibility.js";

it("discovers and reads the advertised training through the real MCP transport without SQL", async () => {
  const catalog = {
    persona: vi.fn(async () => ({ id: "fixture", name: "Fixture" })),
    sources: vi.fn(async () => []),
    list: vi.fn(async () => []),
    authenticate: vi.fn(async () => ({
      personaId: "fixture",
      tokenId: "fixture",
      tokenVersion: 1,
      personaVersion: 1,
    })),
  };
  const queries = {
    capabilities: vi.fn(() => ({ generation: "persona-v2", localQuery: { fieldUses: {} } })),
    run: vi.fn(),
  };
  const app = express();
  app.use(express.json());
  app.post(
    "/mcp",
    createPersonaV2McpHandler(
      catalog as unknown as PersonaConsumerCatalog,
      "http://fixture.test",
      queries as unknown as PersonaSourceQueries,
    ),
  );
  const rpc = async (method: string, params: Record<string, unknown>) => {
    const response = await request(app)
      .post("/mcp")
      .set("Host", "fixture.test")
      .set("Authorization", "Bearer fixture")
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method, params });
    expect(response.status).toBe(200);
    return parseMcpPayload(response);
  };
  const listed = await rpc("tools/list", {});
  const resources = await rpc("resources/list", {});
  expect(JSON.stringify(resources)).toContain("guia://dialeto/postgres");
  expect(JSON.stringify(resources)).toContain("guia://dialeto/mssql");
  expect(JSON.stringify(resources)).toContain("guia://dialeto/sybase");
  expect(JSON.stringify(resources)).not.toContain("guia://dialeto/firebird");
  expect(listed.result).toMatchObject({
    tools: expect.arrayContaining([
      expect.objectContaining({
        name: "obter_treinamento_base",
        inputSchema: expect.objectContaining({
          properties: expect.objectContaining({
            topic: expect.objectContaining({ enum: [...TRAINING_TOPICS] }),
          }),
        }),
      }),
    ]),
  });
  const capabilities = toolJson(
    await rpc("tools/call", { name: "obter_capacidades", arguments: {} }),
  );
  expect(capabilities.training, JSON.stringify(capabilities)).toEqual(trainingManifest());
  expect(capabilities.pluginCompatibility).toEqual(personaPluginCompatibility("portable"));
  expect(queries.capabilities).toHaveBeenCalledTimes(1);
  for (const topic of TRAINING_TOPICS) {
    const guide = toolJson(
      await rpc("tools/call", { name: "obter_treinamento_base", arguments: { topic } }),
    );
    expect(guide).toEqual(trainingTopic(topic));
  }
  const invalid = await rpc("tools/call", {
    name: "obter_treinamento_base",
    arguments: { modulo: "plug-server" },
  });
  expect(
    invalid.error ?? (invalid.result as { isError?: boolean } | undefined)?.isError,
  ).toBeTruthy();
  expect(queries.run).not.toHaveBeenCalled();
});
