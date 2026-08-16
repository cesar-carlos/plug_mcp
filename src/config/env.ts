import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3333),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  PUBLIC_BASE_URL: z.string().url().default("http://127.0.0.1:3333"),
  DATABASE_URL: z.string().optional(),
  MCP_JWT_SECRET: z.string().min(32),
  MCP_JWT_ISSUER: z.string().default("se7e-mcp"),
  MCP_JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  MCP_JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(1_209_600),
  MCP_ENCRYPTION_KEY: z.string().min(32),
  MCP_SESSION_SECRET: z.string().min(32),
  PLUG_SERVER_BASE_URL: z.string().url(),
  PLUG_SERVER_CLIENT_EMAIL: z.string().optional().default(""),
  PLUG_SERVER_CLIENT_PASSWORD: z.string().optional().default(""),
  PLUG_SERVER_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(35_000),
  MCP_DEV_BEARER_TOKEN: z.string().optional().default(""),
  QUERY_DEFAULT_MAX_ROWS: z.coerce.number().int().positive().default(500),
  QUERY_ABSOLUTE_MAX_ROWS: z.coerce.number().int().positive().default(5_000),
  MCP_SESSION_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 60_000),
  OAUTH_CLEANUP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60_000),
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  CONSULTA_MEMORIA_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  // Lista separada por vírgulas; vazio = reflete o Origin da requisição (clientes MCP variados).
  MCP_ALLOWED_ORIGINS: z.string().optional().default(""),
  EMBEDDING_API_URL: z.string().optional().default(""),
  EMBEDDING_API_KEY: z.string().optional().default(""),
  EMBEDDING_MODEL: z.string().optional().default("text-embedding-3-small"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  REDIS_URL: z.string().optional().default(""),
  MCP_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  MCP_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
});

export type AppConfig = z.infer<typeof envSchema> & {
  mcpResourceUrl: string;
  allowedOrigins: readonly string[];
  devAccountId?: string;
};

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, "");

export const loadConfig = (overrides: Record<string, string | undefined> = {}): AppConfig => {
  const merged = { ...process.env, ...overrides };
  const parsed = envSchema.parse(merged);
  const publicBase = stripTrailingSlash(parsed.PUBLIC_BASE_URL);
  return {
    ...parsed,
    PUBLIC_BASE_URL: publicBase,
    PLUG_SERVER_BASE_URL: stripTrailingSlash(parsed.PLUG_SERVER_BASE_URL),
    mcpResourceUrl: `${publicBase}/mcp`,
    allowedOrigins: parsed.MCP_ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  };
};

export const testConfig = (overrides: Partial<AppConfig> = {}): AppConfig =>
  loadConfig({
    NODE_ENV: "test",
    PUBLIC_BASE_URL: "http://127.0.0.1:3333",
    MCP_JWT_SECRET: "test-mcp-jwt-secret-min-32-characters!",
    MCP_SESSION_SECRET: "test-session-secret-min-32-characters",
    MCP_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    PLUG_SERVER_BASE_URL: "http://plug-server.test",
    PLUG_SERVER_CLIENT_EMAIL: "mcp-service@test.local",
    PLUG_SERVER_CLIENT_PASSWORD: "secret-pass",
    MCP_RATE_LIMIT_MAX: "10000",
    ...Object.fromEntries(
      Object.entries(overrides).map(([k, v]) => [k, v === undefined ? undefined : String(v)]),
    ),
  });
