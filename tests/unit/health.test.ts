import { describe, expect, it } from "vitest";
import request from "supertest";
import { testConfig } from "../../src/config/env.js";
import { compose } from "../../src/composition/compose.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";

describe("health versionado", () => {
  it("GET /health devolve versão, sha e uptime", async () => {
    const { app, close } = await compose(testConfig(), { plug: new FakePlugServer() });
    try {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.service).toBe("se7e-mcp-server");
      expect(typeof res.body.version).toBe("string");
      expect(typeof res.body.sha).toBe("string");
      expect(typeof res.body.uptimeSec).toBe("number");
      const docs = await request(app).get("/docs/mcp/error-mapping.md");
      expect(docs.status).toBe(200);
      expect(String(docs.headers["content-type"])).toMatch(/markdown/);
      expect(docs.text).toContain("# Mapeamento de erros");
      expect(docs.text).toContain("TABELA_FORA_DO_ESCOPO");
      expect(docs.text).toContain("SKILL_GAP");
      const ready = await request(app).get("/ready");
      expect(ready.status).toBe(200);
      expect(ready.body.status).toBe("ready");
    } finally {
      await close();
    }
  });
});
