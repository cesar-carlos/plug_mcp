/** Offline validation only. This does not authorize release or connect to services. */
export const validatePersonaProductionConfiguration = (
  env: Record<string, string | undefined>,
): void => {
  const required = (key: string): string => {
    const value = env[key];
    if (!value?.trim() || value.trim() !== value) throw new Error("Configuração v2 incompleta.");
    return value;
  };
  const httpsOrigin = (key: string): void => {
    const url = new URL(required(key));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error("Origem HTTPS canônica obrigatória.");
  };
  if (
    !/^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(required("PERSONA_V2_PRODUCTION_IMAGE"))
  )
    throw new Error("Imagem por digest obrigatório.");
  httpsOrigin("PERSONA_V2_PRODUCTION_PUBLIC_URL");
  httpsOrigin("PERSONA_V2_PRODUCTION_HUB_URL");
  const database = new URL(required("PERSONA_V2_PRODUCTION_DATABASE_URL"));
  // pg lets query parameters override the authority; validate one explicit destination.
  const connectionOverrides = ["host", "port", "user", "password", "database"];
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !database.hostname ||
    !database.username ||
    !database.password ||
    connectionOverrides.some((parameter) => database.searchParams.has(parameter)) ||
    !/^\/(se7e_persona_v2|persona_v2_[a-z0-9_]+)$/.test(database.pathname) ||
    database.hash
  )
    throw new Error("Banco de controle v2 dedicado obrigatório.");
  const key = required("PERSONA_V2_PRODUCTION_ENCRYPTION_KEY");
  if (!/^[a-f0-9]{64}$/.test(key) || new Set(key).size < 8 || key === "0123456789abcdef".repeat(4))
    throw new Error("Chave externa aleatória obrigatória.");
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(required("PERSONA_V2_PRODUCTION_ENCRYPTION_KEY_ID")))
    throw new Error("Identificação da chave obrigatória.");
  const port = required("PERSONA_V2_PRODUCTION_LOCAL_PORT");
  if (!/^\d{4,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535)
    throw new Error("Porta local explícita obrigatória.");
};
