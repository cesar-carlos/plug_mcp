import { describe, expect, it } from "vitest";
import request from "supertest";
import { testConfig } from "../../src/config/env.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { consumeSetupToken, createExpressApp } from "../../src/infrastructure/http/create-app.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import { MCP_SETUP_TTL_MS } from "../../src/domain/ports/mcp-setup-repository.port.js";
import type { ToolUseCases } from "../../src/infrastructure/mcp/register-tools.js";
import type { LoggerPort } from "../../src/domain/ports/logger.port.js";
import {
  InMemoryAcessoRepository,
  InMemoryMcpSetupRepository,
  InMemorySkillRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);

const silentLogger: LoggerPort = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

const stubUseCases = {} as ToolUseCases;

describe("mcp_setup persistente", () => {
  it("consume é one-shot na memória persistente (inclusive concorrente)", async () => {
    const persist = new InMemoryMcpSetupRepository();
    await persist.issue({
      code: "abc",
      token: "tok-one",
      expiresAt: new Date(Date.now() + MCP_SETUP_TTL_MS),
      acessoId: null,
    });
    const [first, second] = await Promise.all([persist.consume("abc"), persist.consume("abc")]);
    const tokens = [first, second].filter((item): item is string => item !== null);
    expect(tokens).toEqual(["tok-one"]);
    expect(await persist.consume("abc")).toBeNull();
  });

  it("purgeExpired remove linhas vencidas no issue", async () => {
    const persist = new InMemoryMcpSetupRepository();
    await persist.issue({
      code: "old",
      token: "tok-old",
      expiresAt: new Date(Date.now() - 1000),
      acessoId: null,
    });
    expect(await persist.purgeExpired()).toBe(1);
    expect(await persist.consume("old")).toBeNull();
  });

  it("GET não revela Bearer de setup legado; armazenamento antigo só é consumível internamente", async () => {
    const persist = new InMemoryMcpSetupRepository();
    const memory = new SetupCodeStore();
    const issued = memory.issue("tok-restart", MCP_SETUP_TTL_MS);
    await persist.issue({
      code: issued.code,
      token: "tok-restart",
      expiresAt: issued.expiresAt,
      acessoId: null,
    });

    const emptyMem = new SetupCodeStore();
    expect(await consumeSetupToken(emptyMem, persist, issued.code)).toBe("tok-restart");
    expect(await consumeSetupToken(emptyMem, persist, issued.code)).toBeNull();

    const memory2 = new SetupCodeStore();
    const issued2 = memory2.issue("tok-mem", MCP_SETUP_TTL_MS);
    await persist.issue({
      code: issued2.code,
      token: "tok-mem",
      expiresAt: issued2.expiresAt,
      acessoId: null,
    });
    expect(await consumeSetupToken(memory2, persist, issued2.code)).toBe("tok-mem");
    expect(await persist.consume(issued2.code)).toBeNull();

    const persistHttp = new InMemoryMcpSetupRepository();
    const codeHttp = "setuphttpcode01";
    await persistHttp.issue({
      code: codeHttp,
      token: "tok-http",
      expiresAt: new Date(Date.now() + MCP_SETUP_TTL_MS),
      acessoId: null,
    });
    const { app, dispose } = createExpressApp({
      config: testConfig(),
      logger: silentLogger,
      useCases: stubUseCases,
      acessos: new InMemoryAcessoRepository(),
      skills: new InMemorySkillRepository(),
      crypto,
      setup: new SetupCodeStore(),
      setupPersistent: persistHttp,
    });
    try {
      const first = await request(app).get(`/setup/${codeHttp}`);
      expect(first.status).toBe(404);
      expect(first.text).not.toContain("tok-http");
      expect(first.headers["cache-control"]).toBe("no-store");
      const second = await request(app).get(`/setup/${codeHttp}`);
      expect(second.status).toBe(404);
    } finally {
      dispose();
    }
  });
});
