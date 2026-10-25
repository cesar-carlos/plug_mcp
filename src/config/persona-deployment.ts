import type { AppConfig } from "./env.js";

/** A test destination uses production protections; local fixtures keep their own settings. */
export function assertPersonaDeployment(config: AppConfig): void {
  if (config.PERSONA_V2_DEPLOYMENT === "local") {
    if (config.NODE_ENV === "production") {
      throw new Error(
        "persona-v2 exige distribuição explícita test-server; aceite de clientes bloqueado.",
      );
    }
    return;
  }
  if (config.NODE_ENV !== "production" || config.MCP_ENCRYPTION_LEGACY_KEY) {
    throw new Error("Servidor de teste exige modo production e cofre próprio.");
  }
  for (const origin of [config.PUBLIC_BASE_URL, config.PLUG_SERVER_BASE_URL]) {
    const url = new URL(origin);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    ) {
      throw new Error("Servidor de teste exige origens HTTPS canônicas.");
    }
  }
  const database = new URL(config.DATABASE_URL ?? "invalid:");
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !database.hostname ||
    !database.username ||
    !database.password ||
    database.hash ||
    !/^\/(se7e_persona_v2|persona_v2_[a-z0-9_]+)$/.test(database.pathname) ||
    ["host", "port", "user", "password", "database"].some((key) => database.searchParams.has(key))
  ) {
    throw new Error("Servidor de teste exige banco de controle v2 dedicado.");
  }
  const key = config.MCP_ENCRYPTION_KEY;
  if (
    !/^[a-f0-9]{64}$/.test(key) ||
    new Set(key).size < 8 ||
    key === "0123456789abcdef".repeat(4)
  ) {
    throw new Error("Servidor de teste exige chave externa aleatória.");
  }
}
