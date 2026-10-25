import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import request from "supertest";
import { expect, it } from "vitest";
import {
  personaBrandIcons,
  registerPersonaBrandIcons,
} from "../../../src/infrastructure/http/persona-brand.js";
import { OFFICIAL_PLUGIN_ICONS } from "../../../src/infrastructure/plugins/package-files.js";
import { createPersonaV2McpHandler } from "../../../src/infrastructure/mcp/persona-v2-http.js";
import type { PersonaConsumerCatalog } from "../../../src/application/persona-v2/consumer-catalog.js";
import { parseMcpPayload } from "../../helpers/mcp-rpc.js";

const root = fileURLToPath(new URL("../../../web/public/", import.meta.url));

it("publica os PNGs oficiais para consumo externo", async () => {
  const app = express();
  app.use(helmet());
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  registerPersonaBrandIcons(app, root);
  for (const [file, packaged] of [
    ["icon-192.png", "assets/se7e-192.png"],
    ["icon-512.png", "assets/se7e-512.png"],
  ] as const) {
    const hash = OFFICIAL_PLUGIN_ICONS[packaged];
    if (!hash) throw new Error("Hash oficial ausente.");
    const response = await request(app).get(`/brand/${file}`).expect(200);
    expect(response.headers["content-type"]).toMatch(/^image\/png/);
    expect(response.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["cache-control"]).toContain("public");
    expect(createHash("sha256").update(response.body).digest("hex")).toBe(hash);
    expect(
      createHash("sha256")
        .update(await readFile(`${root}/${file}`))
        .digest("hex"),
    ).toBe(hash);
  }
  await request(app).get("/brand/icon-192-maskable.png").expect(404);
});

it("anuncia os ícones oficiais no initialize", async () => {
  const app = express();
  app.use(express.json());
  app.post(
    "/mcp",
    createPersonaV2McpHandler({} as PersonaConsumerCatalog, "https://mcp.fixture.test"),
  );
  const payload = parseMcpPayload(
    await request(app)
      .post("/mcp")
      .set("Host", "mcp.fixture.test")
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      }),
  );
  const info = (payload.result as { serverInfo?: { icons?: unknown } } | undefined)?.serverInfo;
  expect(info?.icons).toEqual(personaBrandIcons("https://mcp.fixture.test"));
});
