import { z } from "zod";
import { readPublicOAuthEndpoint } from "../../src/infrastructure/oauth/public-https-check.js";
import { CimdClient } from "../../src/infrastructure/oauth/cimd-client.js";
import {
  validateSe7ePackage,
  validateConnectionId,
} from "../../src/infrastructure/plugins/package-validation.js";

export interface PersonaHttpsInput {
  origin: string;
  stage: "discovery" | "pilot";
  package?: string;
  connectionId?: string;
  clientId?: string;
  redirectUri?: string;
}

export const parsePersonaHttpsArgs = (args: readonly string[]): PersonaHttpsInput => {
  const values = new Map<string, string>();
  for (const arg of args) {
    const match =
      /^--(public-base-url|stage|package|connection-id|client-id|redirect-uri)=(.+)$/.exec(arg);
    if (!match || values.has(match[1]!)) {
      throw new Error("arguments.invalid");
    }
    values.set(match[1]!, match[2]!);
  }
  const origin = values.get("public-base-url") ?? "";
  // Explicit destinations only; DV2-017 authorizes the current test-server origin.
  if (
    ![
      "https://homolog-mcp.se7esistemassinop.com.br",
      "https://mcp.se7esistemassinop.com.br",
    ].includes(origin)
  ) {
    throw new Error("homologation.origin.invalid");
  }
  const stage = values.get("stage");
  if (stage !== "discovery" && stage !== "pilot") {
    throw new Error("arguments.invalid");
  }
  const input: PersonaHttpsInput = {
    origin,
    stage,
    package: values.get("package"),
    connectionId: values.get("connection-id"),
    clientId: values.get("client-id"),
    redirectUri: values.get("redirect-uri"),
  };
  const pilotFields = [input.package, input.connectionId, input.clientId, input.redirectUri];
  if (stage === "discovery" ? pilotFields.some(Boolean) : pilotFields.some((v) => !v)) {
    throw new Error("arguments.invalid");
  }
  if (stage === "pilot") {
    validateConnectionId(input.connectionId);
    for (const value of [input.clientId!, input.redirectUri!]) {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) {
        throw new Error("arguments.invalid");
      }
    }
  }
  return input;
};

export interface PersonaHttpsDependencies {
  endpoint: typeof readPublicOAuthEndpoint;
  package: typeof validateSe7ePackage;
  client: (clientId: string, redirectUri: string) => Promise<void>;
}

export const checkPersonaHttps = async (
  input: PersonaHttpsInput,
  overrides: Partial<PersonaHttpsDependencies> = {},
): Promise<{
  generation: "persona-v2";
  checkedAt: string;
  stage: PersonaHttpsInput["stage"];
  checks: { code: string; status: "ok" | "fail" }[];
  exitCode: 0 | 1;
  chatGptConnection: "not_verified";
  infrastructureIsolation: "not_verified";
  productionReleased: false;
}> => {
  const io: PersonaHttpsDependencies = {
    endpoint: readPublicOAuthEndpoint,
    package: validateSe7ePackage,
    client: (id, redirect) => new CimdClient({ [id]: [redirect] }).validate(id, redirect),
    ...overrides,
  };
  const checks: { code: string; status: "ok" | "fail" }[] = [];
  const check = async (code: string, run: () => Promise<void>): Promise<void> => {
    try {
      await run();
      checks.push({ code, status: "ok" });
    } catch {
      // Never serialize remote bodies, URLs from errors, cookies or credentials.
      checks.push({ code, status: "fail" });
    }
  };
  const scope = z.tuple([z.literal("se7e:persona")]);
  await check("discovery.resource", async () => {
    const response = await io.endpoint(
      new URL("/.well-known/oauth-protected-resource/mcp/chatgpt", input.origin),
    );
    z.literal(200).parse(response.status);
    z.object({
      resource: z.literal(`${input.origin}/mcp/chatgpt`),
      authorization_servers: z.tuple([z.literal(input.origin)]),
      scopes_supported: scope,
      bearer_methods_supported: z.tuple([z.literal("header")]),
    }).parse(response.body);
  });
  await check("discovery.authorization", async () => {
    const response = await io.endpoint(
      new URL("/.well-known/oauth-authorization-server", input.origin),
    );
    z.literal(200).parse(response.status);
    const metadata = z
      .object({
        issuer: z.literal(input.origin),
        authorization_endpoint: z.literal(`${input.origin}/oauth/persona-v2/authorize`),
        token_endpoint: z.literal(`${input.origin}/oauth/persona-v2/token`),
        revocation_endpoint: z.literal(`${input.origin}/oauth/persona-v2/revoke`),
        response_types_supported: z.tuple([z.literal("code")]),
        grant_types_supported: z.tuple([
          z.literal("authorization_code"),
          z.literal("refresh_token"),
        ]),
        token_endpoint_auth_methods_supported: z.tuple([z.literal("none")]),
        code_challenge_methods_supported: z.tuple([z.literal("S256")]),
        scopes_supported: scope,
        client_id_metadata_document_supported: z.literal(true),
        authorization_response_iss_parameter_supported: z.literal(true),
      })
      .passthrough()
      .parse(response.body);
    for (const unsupported of [
      "registration_endpoint",
      "jwks_uri",
      "userinfo_endpoint",
      "id_token_signing_alg_values_supported",
    ]) {
      if (unsupported in metadata) {
        throw new Error("discovery.unsupported");
      }
    }
  });
  await check("endpoint.challenge", async () => {
    const response = await io.endpoint(new URL("/mcp/chatgpt", input.origin), "POST");
    z.literal(401).parse(response.status);
    const challenge = response.headers["www-authenticate"];
    if (
      typeof challenge !== "string" ||
      !challenge.startsWith("Bearer ") ||
      !challenge.includes(
        `resource_metadata="${input.origin}/.well-known/oauth-protected-resource/mcp/chatgpt"`,
      ) ||
      challenge.includes('error="invalid_token"')
    ) {
      throw new Error("challenge.invalid");
    }
  });
  if (input.stage === "pilot") {
    await check("client.metadata", () => io.client(input.clientId!, input.redirectUri!));
    await check("package.persona-v2", () =>
      io.package(input.package!, {
        runtime: "persona-v2",
        variant: "chatgpt",
        publicBaseUrl: input.origin,
        connectionId: input.connectionId!,
      }),
    );
  }
  return {
    generation: "persona-v2",
    checkedAt: new Date().toISOString(),
    stage: input.stage,
    checks,
    exitCode: checks.some((c) => c.status === "fail") ? 1 : 0,
    chatGptConnection: "not_verified",
    infrastructureIsolation: "not_verified",
    productionReleased: false,
  };
};
