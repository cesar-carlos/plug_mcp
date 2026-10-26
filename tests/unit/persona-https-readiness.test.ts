import { describe, expect, it, vi } from "vitest";
import {
  checkPersonaHttps,
  parsePersonaHttpsArgs,
  type PersonaHttpsDependencies,
} from "../../scripts/homologation/persona-https.js";

const origin = "https://mcp.se7esistemassinop.com.br";
const args = [`--public-base-url=${origin}`, "--stage=discovery"];
const fixture = () => ({
  resource: {
    resource: `${origin}/mcp/chatgpt`,
    authorization_servers: [origin],
    scopes_supported: ["se7e:persona"],
    bearer_methods_supported: ["header"],
  },
  authorization: {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/persona-v2/authorize`,
    token_endpoint: `${origin}/oauth/persona-v2/token`,
    revocation_endpoint: `${origin}/oauth/persona-v2/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["se7e:persona"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  },
});
const endpoint =
  (data = fixture()): PersonaHttpsDependencies["endpoint"] =>
  async (url, method = "GET") => {
    if (url.pathname.endsWith("oauth-authorization-server")) {
      expect(method).toBe("GET");
      return { status: 200, headers: {}, body: data.authorization };
    }
    if (url.pathname.startsWith("/.well-known/")) {
      expect(method).toBe("GET");
      return { status: 200, headers: {}, body: data.resource };
    }
    if (method !== "POST") return { status: 405, headers: { allow: "POST" }, body: {} };
    return {
      status: 401,
      headers: {
        "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp/chatgpt"`,
      },
      body: {},
    };
  };

describe("homologação HTTPS persona-v2 sem autoridade legada", () => {
  it("exige destino autorizado explícito, sem env, segredos ou argumentos duplicados", () => {
    expect(parsePersonaHttpsArgs(args).origin).toBe(origin);
    expect(
      parsePersonaHttpsArgs([
        "--stage=discovery",
        "--public-base-url=https://homolog-mcp.se7esistemassinop.com.br",
      ]).origin,
    ).toBe("https://homolog-mcp.se7esistemassinop.com.br");
    for (const invalid of [
      [],
      ["--stage=discovery"],
      [...args, "--token=secret"],
      [...args, "--stage=pilot"],
      ["--stage=discovery", "--public-base-url=https://other.example.test"],
      ["--stage=discovery", `--public-base-url=${origin}.attacker.test`],
      ["--stage=discovery", `--public-base-url=${origin}?token=secret`],
      ["--stage=discovery", "--public-base-url=https://user:password@mcp.se7esistemassinop.com.br"],
      ["--stage=discovery", `--public-base-url=${origin}/`],
      ["--stage=discovery", "--public-base-url=https://localhost"],
    ]) {
      expect(() => parsePersonaHttpsArgs(invalid)).toThrow();
    }
  });
  it("discovery aprovado não certifica conexão, isolamento ou produção", async () => {
    const report = await checkPersonaHttps(parsePersonaHttpsArgs(args), { endpoint: endpoint() });
    expect(report.exitCode).toBe(0);
    expect(report.checks).toHaveLength(3);
    expect(report.chatGptConnection).toBe("not_verified");
    expect(report.infrastructureIsolation).toBe("not_verified");
    expect(report.productionReleased).toBe(false);
  });
  it.each(["scope", "issuer", "endpoint", "pkce", "audience"])(
    "recusa contrato divergente: %s",
    async (field) => {
      const data = fixture();
      if (field === "scope") {
        data.resource.scopes_supported = ["se7e:access"];
      }
      if (field === "issuer") {
        data.authorization.issuer = "https://other.example";
      }
      if (field === "endpoint") {
        data.authorization.token_endpoint = `${origin}/oauth/token`;
      }
      if (field === "pkce") {
        data.authorization.code_challenge_methods_supported = ["plain"];
      }
      if (field === "audience") {
        data.resource.resource = `${origin}/mcp`;
      }
      expect(
        (await checkPersonaHttps(parsePersonaHttpsArgs(args), { endpoint: endpoint(data) }))
          .exitCode,
      ).toBe(1);
    },
  );
  it("recusa endpoint sem challenge, redirects e erros sem revelar payload", async () => {
    for (const io of [
      async () => ({ status: 302, headers: {}, body: {} }),
      async () => ({ status: 401, headers: {}, body: {} }),
      async () => {
        throw new Error("secret-cookie-and-token");
      },
    ]) {
      const report = await checkPersonaHttps(parsePersonaHttpsArgs(args), { endpoint: io });
      expect(report.exitCode).toBe(1);
      expect(JSON.stringify(report)).not.toContain("secret-cookie-and-token");
    }
  });
  it("piloto exige IDs explícitos e valida pacote v2 e CIMD sem autenticar", async () => {
    expect(() => parsePersonaHttpsArgs([args[0]!, "--stage=pilot"])).toThrow();
    const input = parsePersonaHttpsArgs([
      args[0]!,
      "--stage=pilot",
      "--package=fixture/se7e",
      "--connection-id=asdk_app_fixture123",
      "--client-id=https://client.example/metadata",
      "--redirect-uri=https://client.example/callback",
    ]);
    const validatePackage = vi.fn(async () => undefined);
    const client = vi.fn(async () => undefined);
    const report = await checkPersonaHttps(input, {
      endpoint: endpoint(),
      package: validatePackage,
      client,
    });
    expect(report.exitCode).toBe(0);
    expect(client).toHaveBeenCalledWith(input.clientId, input.redirectUri);
    expect(validatePackage).toHaveBeenCalledWith(input.package, {
      runtime: "persona-v2",
      variant: "chatgpt",
      publicBaseUrl: origin,
      connectionId: input.connectionId,
    });
    expect(report.chatGptConnection).toBe("not_verified");
    const rejected = await checkPersonaHttps(input, {
      endpoint: endpoint(),
      package: async () => {
        throw new Error("mixed-generation");
      },
      client,
    });
    expect(rejected.checks.find((c) => c.code === "package.persona-v2")?.status).toBe("fail");
  });
});
