import { readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { testConfig } from "../../src/config/env.js";
import {
  checkChatGptReadiness,
  type ReadinessDependencies,
} from "../../src/infrastructure/oauth/readiness-check.js";
import { chatGptOAuthChallenge } from "../../src/infrastructure/oauth/challenge.js";
import { errorResult } from "../../src/infrastructure/mcp/tool-result.js";
import { oauthUnauthorized } from "../../src/domain/errors/oauth-error.js";
import { sessionContext } from "../../src/application/session-context.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";

const origin = "https://mcp.example.test",
  accessId = "00000000-0000-4000-8000-000000000001",
  client = "https://chatgpt.com/oauth/client.json",
  redirect = "https://chatgpt.com/callback";
const fixture = async () => {
  const config = testConfig({
    PUBLIC_BASE_URL: origin,
    DATABASE_URL: "postgres://synthetic:synthetic@localhost/ephemeral",
    CHATGPT_OAUTH_ENABLED: true,
    CHATGPT_OAUTH_ACCESS_IDS: [accessId],
    CHATGPT_OAUTH_CLIENTS: { [client]: [redirect] },
  });
  const dependencies: ReadinessDependencies = {
    nodeVersion: "24.21.0",
    database: async () => ({
      migrations: (await readdir("drizzle")).filter((n) => n.endsWith(".sql")),
      accesses: [{ id: accessId, status: "pending", expiresAt: null }],
    }),
    client: () => ({ validate: async () => undefined }),
    package: async () => undefined,
    endpoint: async (url) => {
      if (url.pathname.includes("protected-resource"))
        return {
          status: 200,
          headers: {},
          body: {
            resource: `${origin}/mcp/chatgpt`,
            authorization_servers: [origin],
            scopes_supported: ["se7e:access"],
          },
        };
      if (url.pathname.endsWith("authorization-server"))
        return {
          status: 200,
          headers: {},
          body: {
            issuer: origin,
            authorization_endpoint: `${origin}/oauth/authorize`,
            token_endpoint: `${origin}/oauth/token`,
            revocation_endpoint: `${origin}/oauth/revoke`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            token_endpoint_auth_methods_supported: ["none"],
            code_challenge_methods_supported: ["S256"],
            scopes_supported: ["se7e:access"],
            client_id_metadata_document_supported: true,
            authorization_response_iss_parameter_supported: true,
          },
        };
      return {
        status: 401,
        headers: { "www-authenticate": chatGptOAuthChallenge(origin) },
        body: {},
      };
    },
  };
  const input = {
    stage: "pilot" as const,
    package: "synthetic-package",
    connectionId: "plugin_asdk_app_realid",
  };
  return { config, dependencies, input };
};
describe("Prontidão ChatGPT", () => {
  it("prepare aceita flag desligada e allowlists vazias sem escrever ou acessar rede", async () => {
    const f = await fixture();
    f.config.CHATGPT_OAUTH_ENABLED = false;
    f.config.CHATGPT_OAUTH_ACCESS_IDS = [];
    f.config.CHATGPT_OAUTH_CLIENTS = {};
    f.dependencies.endpoint = async () => {
      throw new Error("prepare não deve acessar rede");
    };
    expect(
      (await checkChatGptReadiness(f.config, { stage: "prepare" }, f.dependencies)).exitCode,
    ).toBe(0);
  });
  it("pilot valida todos os contratos sem declarar homologação", async () => {
    const f = await fixture();
    const report = await checkChatGptReadiness(f.config, f.input, f.dependencies);
    expect(report.exitCode).toBe(0);
    expect(report.chatGptHomologation).toBe("not_verified");
    expect(report.checks).toHaveLength(11);
  });
  it("entradas operacionais ausentes produzem saída 2", async () => {
    const f = await fixture();
    expect(
      (await checkChatGptReadiness(f.config, { stage: "pilot" }, f.dependencies)).exitCode,
    ).toBe(2);
  });
  it.each(["24.18.0", "25.0.0", "malformed"])("recusa Node %s", async (nodeVersion) => {
    const f = await fixture();
    f.dependencies.nodeVersion = nodeVersion;
    expect(
      (await checkChatGptReadiness(f.config, { stage: "prepare" }, f.dependencies)).exitCode,
    ).toBe(1);
  });
  it.each(["database", "clients", "package", "discovery"])(
    "falha %s não expõe mensagens/segredos",
    async (caseName) => {
      const f = await fixture();
      const fail = async (): Promise<never> => {
        throw new Error("SECRET_TOKEN synthetic-password postgres://secret");
      };
      if (caseName === "database") f.dependencies.database = fail;
      if (caseName === "clients") f.dependencies.client = () => ({ validate: fail });
      if (caseName === "package") f.dependencies.package = fail;
      if (caseName === "discovery") f.dependencies.endpoint = fail;
      const report = await checkChatGptReadiness(f.config, f.input, f.dependencies);
      expect(report.exitCode).toBe(1);
      expect(JSON.stringify(report)).not.toMatch(
        /SECRET_TOKEN|synthetic-password|postgres:\/\/secret/,
      );
    },
  );
  it("migração ausente, acesso revogado e discovery divergente impedem aprovação", async () => {
    const f = await fixture();
    f.dependencies.database = async () => ({
      migrations: [],
      accesses: [{ id: accessId, status: "revoked", expiresAt: null }],
    });
    f.dependencies.endpoint = async () => ({
      status: 200,
      headers: {},
      body: { issuer: "https://other.test", registration_endpoint: "https://other.test/dcr" },
    });
    const report = await checkChatGptReadiness(f.config, f.input, f.dependencies);
    expect(report.exitCode).toBe(1);
    expect(report.checks.filter((c) => c.status === "fail").map((c) => c.code)).toEqual(
      expect.arrayContaining(["database.migrations", "pilot.accesses", "discovery.authorization"]),
    );
  });
});
it("desafio de tool OAuth possui descrição fixa; erro do hub não pede login", () => {
  const config = testConfig({ PUBLIC_BASE_URL: origin });
  sessionContext.run(
    {
      auth: {
        kind: "oauth",
        usuarioId: accessId,
        acessoId: accessId,
        sourceHash: "synthetic",
        grantId: "grant",
        expiresAt: Date.now() + 10000,
      },
    },
    () => {
      const oauth = errorResult(oauthUnauthorized(), config, new SilentTestLogger());
      expect(String(oauth._meta?.["mcp/www_authenticate"])).toContain(
        'error_description="Reconecte o Se7e para continuar."',
      );
      expect(
        errorResult(DomainError.unauthenticated(), config, new SilentTestLogger())._meta,
      ).toBeUndefined();
    },
  );
});
