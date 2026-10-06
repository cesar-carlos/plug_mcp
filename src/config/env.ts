import { z } from "zod";

/** Piso de login/refresh/`getPolicy`. Não corta `sql.execute`. */
export const PLUG_SERVER_HTTP_TIMEOUT_MS_DEFAULT = 35_000;
/** Teto do piso de login — evita hang se o env for 300s+. Não aplica a `sql.execute`. */
export const PLUG_SERVER_HTTP_TIMEOUT_MS_MAX = 60_000;

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().min(1).default("127.0.0.1"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  PUBLIC_BASE_URL: z.string().url().default("http://127.0.0.1:3333"),
  DATABASE_URL: z.string().optional(),
  CHATGPT_OAUTH_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  CHATGPT_OAUTH_ACCESS_IDS: z
    .string()
    .default("[]")
    .transform((value, ctx): string[] => {
      try {
        return z.array(z.string().uuid()).parse(JSON.parse(value));
      } catch {
        ctx.addIssue({ code: "custom", message: "Allowlist de acessos OAuth inválida." });
        return [];
      }
    }),
  CHATGPT_OAUTH_CLIENTS: z
    .string()
    .default("{}")
    .transform((value, ctx): Record<string, string[]> => {
      try {
        const clients = z
          .record(z.string().url(), z.array(z.string().url()))
          .parse(JSON.parse(value));
        for (const [id, redirects] of Object.entries(clients))
          for (const raw of [id, ...redirects]) {
            const url = new URL(raw);
            if (url.protocol !== "https:" || url.username || url.password || url.hash)
              throw new Error("invalid_url");
          }
        return clients;
      } catch {
        ctx.addIssue({ code: "custom", message: "Allowlist de clientes OAuth inválida." });
        return {};
      }
    }),
  MCP_ENCRYPTION_KEY: z.string().min(32),
  MCP_ENCRYPTION_KEY_ID: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,64}$/)
    .default("primary"),
  MCP_ENCRYPTION_LEGACY_KEY: z.string().min(32).optional(),
  MCP_ENCRYPTION_PREVIOUS_KEYS: z
    .string()
    .default("{}")
    .transform((value, ctx): Record<string, string> => {
      try {
        const parsed = z
          .record(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), z.string().min(32))
          .safeParse(JSON.parse(value));
        if (parsed.success) {
          return parsed.data;
        }
      } catch {
        /* diagnóstico sem segredos */
      }
      ctx.addIssue({ code: "custom", message: "Keyring inválido." });
      return {};
    }),
  PLUG_SERVER_BASE_URL: z.string().url(),
  PLUG_SERVER_HTTP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(PLUG_SERVER_HTTP_TIMEOUT_MS_MAX)
    .default(PLUG_SERVER_HTTP_TIMEOUT_MS_DEFAULT),
  QUERY_DEFAULT_MAX_ROWS: z.coerce.number().int().positive().default(500),
  QUERY_ABSOLUTE_MAX_ROWS: z.coerce.number().int().positive().default(5_000),
  MCP_SESSION_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 60_000),
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  MCP_ALLOWED_ORIGINS: z.string().optional().default(""),
  MCP_ALLOWED_HOSTS: z.string().default(""),
  TRUST_PROXY: z.string().default(""),
  MCP_MAX_SESSIONS: z.coerce.number().int().positive().default(2000),
  MCP_MAX_SESSIONS_PER_ACCESS: z.coerce.number().int().positive().default(200),
  ANEXO_MAX_BYTES_PER_ACCESS: z.coerce
    .number()
    .int()
    .positive()
    .default(32 * 1024 * 1024),
  ANEXO_MAX_BYTES_PROCESS: z.coerce
    .number()
    .int()
    .positive()
    .default(128 * 1024 * 1024),
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
  MCP_INSPECTION_ENABLED: z
    .string()
    .optional()
    .default("true")
    .transform((value) => !["false", "0", "no"].includes(value.toLowerCase())),
  MCP_DISCOVERY_QUERY_ENABLED: z
    .string()
    .optional()
    .default("true")
    .transform((value) => !["false", "0", "no"].includes(value.toLowerCase())),
  MCP_SEMANTIC_QUERY_ENABLED: z
    .string()
    .optional()
    .default("true")
    .transform((value) => !["false", "0", "no"].includes(value.toLowerCase())),
  MCP_SCHEMA_DRIFT_ENABLED: z
    .string()
    .optional()
    .default("true")
    .transform((value) => !["false", "0", "no"].includes(value.toLowerCase())),
  QUERY_CACHE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  QUERY_CACHE_SINGLEFLIGHT_WAIT_MS: z.coerce.number().int().positive().max(300_000).default(35_000),
  QUERY_CACHE_SINGLEFLIGHT_LEASE_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(305_000)
    .default(300_000),
  PLUG_SERVER_TIMINGS_SAMPLE_PERCENT: z.coerce.number().int().min(0).max(100).default(10),
  OPERATIONS_WORKER_INTERVAL_MS: z.coerce.number().int().min(10_000).max(3_600_000).default(60_000),
  OPERATIONS_SLO_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1_440).default(15),
  OPERATIONS_SLO_MIN_OBSERVATIONS: z.coerce.number().int().min(1).max(10_000).default(20),
  OPERATIONS_SLO_ERROR_WARNING_PERCENT: z.coerce.number().min(0).max(100).default(5),
  OPERATIONS_SLO_ERROR_CRITICAL_PERCENT: z.coerce.number().min(0).max(100).default(20),
  OPERATIONS_SLO_P95_WARNING_MS: z.coerce.number().int().positive().default(10_000),
  OPERATIONS_SLO_P95_CRITICAL_MS: z.coerce.number().int().positive().default(30_000),
  OPERATIONS_SLO_TRUNCATION_WARNING_PERCENT: z.coerce.number().min(0).max(100).default(10),
  OPERATIONS_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(8_000),
  OPERATIONS_WEBHOOK_LEASE_MS: z.coerce.number().int().min(10_000).max(3_600_000).default(305_000),
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
  if (parsed.CHATGPT_OAUTH_ENABLED) {
    const url = new URL(publicBase);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error("OAuth exige PUBLIC_BASE_URL HTTPS canônica, sem path/query/credenciais.");
    if (!parsed.DATABASE_URL && parsed.NODE_ENV !== "test")
      throw new Error("OAuth exige PostgreSQL.");
    if (
      parsed.DATABASE_URL &&
      !["postgres:", "postgresql:"].includes(new URL(parsed.DATABASE_URL).protocol)
    )
      throw new Error("OAuth exige URL PostgreSQL.");
  }
  return {
    ...parsed,
    PUBLIC_BASE_URL: publicBase,
    PLUG_SERVER_BASE_URL: stripTrailingSlash(parsed.PLUG_SERVER_BASE_URL),
    mcpResourceUrl: `${publicBase}/mcp`,
    allowedOrigins: (parsed.MCP_ALLOWED_ORIGINS || new URL(publicBase).origin)
      .split(",")
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
    MCP_ALLOWED_HOSTS: "127.0.0.1,localhost",
    ...Object.fromEntries(
      Object.entries(overrides).map(([k, v]) => [
        k,
        v === undefined ? undefined : typeof v === "object" ? JSON.stringify(v) : String(v),
      ]),
    ),
  });
