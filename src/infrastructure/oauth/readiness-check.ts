import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import { z } from "zod";
import type { AppConfig } from "../../config/env.js";
import { CimdClient } from "./cimd-client.js";
import { readPublicOAuthEndpoint } from "./public-https-check.js";
import { validateChatGptPackage, validatePublicPluginUrl } from "../plugins/package-validation.js";

export interface ReadinessInput {
  stage: "prepare" | "pilot";
  package?: string;
  connectionId?: string;
}
export interface ReadinessReport {
  version: string;
  checkedAt: string;
  stage: ReadinessInput["stage"];
  checks: { code: string; status: "ok" | "fail"; action: string }[];
  exitCode: 0 | 1 | 2;
  chatGptHomologation: "not_verified";
}
export interface ReadinessDependencies {
  nodeVersion: string;
  database: (url: string) => Promise<{
    migrations: string[];
    accesses: { id: string; status: string; expiresAt: Date | null }[];
  }>;
  endpoint: typeof readPublicOAuthEndpoint;
  client: (allowed: Record<string, string[]>) => Pick<CimdClient, "validate">;
  package: typeof validateChatGptPackage;
}
const database: ReadinessDependencies["database"] = async (url) => {
  const db = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  await db.connect();
  try {
    await db.query("BEGIN READ ONLY");
    const migrations = await db.query<{ filename: string }>("SELECT filename FROM _mcp_migrations");
    const accesses = await db.query<{ id: string; status: string; expiresAt: Date | null }>(
      'SELECT id,status_acesso AS status,token_expires_at AS "expiresAt" FROM acesso',
    );
    await db.query("COMMIT");
    return { migrations: migrations.rows.map((r) => r.filename), accesses: accesses.rows };
  } finally {
    await db.end();
  }
};
export const checkChatGptReadiness = async (
  config: AppConfig,
  input: ReadinessInput,
  overrides: Partial<ReadinessDependencies> = {},
): Promise<ReadinessReport> => {
  const manifest = JSON.parse(
    await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
  ) as { version: string; engines: { node: string } };
  const dependencies: ReadinessDependencies = {
    nodeVersion: process.versions.node,
    database,
    endpoint: readPublicOAuthEndpoint,
    client: (clients) => new CimdClient(clients),
    package: validateChatGptPackage,
    ...overrides,
  };
  const report: ReadinessReport = {
    version: manifest.version,
    checkedAt: new Date().toISOString(),
    stage: input.stage,
    checks: [],
    exitCode: 0,
    chatGptHomologation: "not_verified",
  };
  const check = async (
    code: string,
    action: string,
    operation: () => Promise<void> | void,
  ): Promise<void> => {
    try {
      await operation();
      report.checks.push({ code, status: "ok", action: "Nenhuma." });
    } catch {
      report.checks.push({ code, status: "fail", action });
      report.exitCode = 1;
    }
  };
  const require = (value: unknown): void => {
    if (!value) throw new Error("Check failed.");
  };
  await check("runtime.node", `Use Node ${manifest.engines.node}.`, () => {
    const bounds = /^>=(\d+)\.(\d+)\.(\d+) <(\d+)$/.exec(manifest.engines.node);
    const current = dependencies.nodeVersion.replace(/^v/, "").split(".").map(Number);
    require(bounds && current.length === 3 && current.every(Number.isInteger));
    const floor = bounds!.slice(1, 4).map(Number);
    require(
      (current.map((v, i) => v - floor[i]!).find((v) => v !== 0) ?? 0) >= 0 &&
        current[0]! < Number(bounds![4]),
    );
  });
  await check("config.https", "Configure PUBLIC_BASE_URL HTTPS canônica.", () => {
    validatePublicPluginUrl(config.PUBLIC_BASE_URL);
  });
  let data: Awaited<ReturnType<ReadinessDependencies["database"]>> | undefined;
  await check(
    "database.available",
    "Configure PostgreSQL acessível, sem aplicar migrações por este comando.",
    async () => {
      require(
        config.DATABASE_URL &&
          ["postgres:", "postgresql:"].includes(new URL(config.DATABASE_URL).protocol),
      );
      data = await dependencies.database(config.DATABASE_URL!);
    },
  );
  await check(
    "database.migrations",
    "Aplique as migrações exigidas pelo procedimento de implantação.",
    async () => {
      const required = (await readdir(new URL("../../../drizzle/", import.meta.url))).filter(
        (name) => name.endsWith(".sql"),
      );
      require(data && required.every((name) => data!.migrations.includes(name)));
    },
  );
  if (input.stage === "prepare") return report;
  if (!input.package || !input.connectionId) {
    report.checks.push({
      code: "pilot.inputs",
      status: "fail",
      action: "Informe --package e --connection-id reais.",
    });
    report.exitCode = 2;
    return report;
  }
  await check(
    "pilot.enabled",
    "Habilite CHATGPT_OAUTH_ENABLED somente após preparar o ambiente.",
    () => require(config.CHATGPT_OAUTH_ENABLED),
  );
  await check(
    "pilot.accesses",
    "Configure acessos existentes, não revogados e com credencial vigente.",
    () => {
      require(config.CHATGPT_OAUTH_ACCESS_IDS.length && data);
      require(
        config.CHATGPT_OAUTH_ACCESS_IDS.every((id) =>
          data!.accesses.some(
            (a) =>
              a.id === id &&
              a.status !== "revoked" &&
              (!a.expiresAt || a.expiresAt.getTime() > Date.now()),
          ),
        ),
      );
    },
  );
  await check(
    "pilot.clients",
    "Configure CIMD e redirects exatos e verifique sua disponibilidade HTTPS.",
    async () => {
      const clients = Object.entries(config.CHATGPT_OAUTH_CLIENTS);
      require(clients.length);
      const client = dependencies.client(config.CHATGPT_OAUTH_CLIENTS);
      for (const [id, redirects] of clients) {
        require(redirects.length);
        for (const redirect of redirects) await client.validate(id, redirect);
      }
    },
  );
  await check("discovery.resource", "Corrija a descoberta pública do recurso OAuth.", async () => {
    const response = await dependencies.endpoint(
      new URL("/.well-known/oauth-protected-resource/mcp/chatgpt", config.PUBLIC_BASE_URL),
    );
    require(response.status === 200);
    z.object({
      resource: z.literal(`${config.PUBLIC_BASE_URL}/mcp/chatgpt`),
      authorization_servers: z.tuple([z.literal(config.PUBLIC_BASE_URL)]),
      scopes_supported: z.tuple([z.literal("se7e:access")]),
    }).parse(response.body);
  });
  await check(
    "discovery.authorization",
    "Corrija issuer, endpoints e capacidades OAuth anunciadas.",
    async () => {
      const response = await dependencies.endpoint(
        new URL("/.well-known/oauth-authorization-server", config.PUBLIC_BASE_URL),
      );
      require(response.status === 200);
      const metadata = z
        .object({
          issuer: z.literal(config.PUBLIC_BASE_URL),
          authorization_endpoint: z.literal(`${config.PUBLIC_BASE_URL}/oauth/authorize`),
          token_endpoint: z.literal(`${config.PUBLIC_BASE_URL}/oauth/token`),
          revocation_endpoint: z.literal(`${config.PUBLIC_BASE_URL}/oauth/revoke`),
          response_types_supported: z.tuple([z.literal("code")]),
          grant_types_supported: z.tuple([
            z.literal("authorization_code"),
            z.literal("refresh_token"),
          ]),
          token_endpoint_auth_methods_supported: z.tuple([z.literal("none")]),
          code_challenge_methods_supported: z.tuple([z.literal("S256")]),
          scopes_supported: z.tuple([z.literal("se7e:access")]),
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
      ])
        require(!(unsupported in metadata));
    },
  );
  await check(
    "endpoint.challenge",
    "Corrija o 401 e a descoberta para chamadas sem credencial.",
    async () => {
      const response = await dependencies.endpoint(new URL("/mcp/chatgpt", config.PUBLIC_BASE_URL));
      require(response.status === 401);
      const challenge = response.headers["www-authenticate"];
      require(
        typeof challenge === "string" &&
          challenge.startsWith("Bearer ") &&
          challenge.includes(
            `resource_metadata="${config.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource/mcp/chatgpt"`,
          ) &&
          !challenge.includes('error="invalid_token"'),
      );
    },
  );
  await check(
    "package.chatgpt",
    "Monte a variante ChatGPT com a conexão real, skills e sem MCP duplicado.",
    () => dependencies.package(input.package!, input.connectionId!, config.PUBLIC_BASE_URL),
  );
  return report;
};
