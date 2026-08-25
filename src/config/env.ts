import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().min(1).default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  PUBLIC_BASE_URL: z.string().url().default("http://127.0.0.1:3333"),
  DATABASE_URL: z.string().optional(),
  MCP_ENCRYPTION_KEY: z.string().min(32),
  PLUG_SERVER_BASE_URL: z.string().url(),
  PLUG_SERVER_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(35_000),
  QUERY_DEFAULT_MAX_ROWS: z.coerce.number().int().positive().default(500),
  QUERY_ABSOLUTE_MAX_ROWS: z.coerce.number().int().positive().default(5_000),
  MCP_SESSION_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 60_000),
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  MCP_ALLOWED_ORIGINS: z.string().optional().default(""),
  REDIS_URL: z.string().optional().default(""),
  MCP_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  MCP_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  MCP_BOOTSTRAP_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  MCP_TOKEN_TTL_DAYS: z.coerce.number().int().min(0).default(0),
  MCP_TOOL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  MCP_QUERY_TOOL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  MCP_SKILL_TOOLS_ENABLED: z
    .string()
    .optional()
    .default("false")
    .transform((value) => !["false", "0", "no"].includes(value.toLowerCase())),
  QUERY_CACHE_TTL_MS: z.coerce.number().int().positive().default(60_000),
});

export type AppConfig = z.infer<typeof envSchema> & {
  mcpResourceUrl: string;
  allowedOrigins: readonly string[];
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
    MCP_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    PLUG_SERVER_BASE_URL: "http://plug-server.test",
    MCP_RATE_LIMIT_MAX: "10000",
    MCP_BOOTSTRAP_RATE_LIMIT_MAX: "10000",
    ...Object.fromEntries(
      Object.entries(overrides).map(([k, v]) => [k, v === undefined ? undefined : String(v)]),
    ),
  });
