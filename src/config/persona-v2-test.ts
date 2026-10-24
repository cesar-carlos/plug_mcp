/** An explicit fixture URL is required; never fall back to operational DATABASE_URL. */
export const personaV2TestDatabaseUrl = (): string => {
  const value = process.env.PERSONA_V2_TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      "PERSONA_V2_TEST_DATABASE_URL obrigatório; teste PostgreSQL não pode ser omitido.",
    );
  }
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !/^\/[a-z0-9_]+_test$/.test(url.pathname) ||
    process.env.NODE_ENV === "production"
  ) {
    throw new Error("Use um banco descartável explicitamente nomeado com sufixo _test.");
  }
  return value;
};
