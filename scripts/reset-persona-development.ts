import { resetDevelopmentPersonaData } from "../src/infrastructure/persistence/persona-v2/reset-development.js";

try {
  const args = process.argv.slice(2);
  if (
    args.some(
      (arg) => !/^--(apply|simulate|generation=persona-v2|confirm-database=[a-z0-9_]+)$/.test(arg),
    ) ||
    new Set(args.map((arg) => arg.split("=")[0])).size !== args.length ||
    (args.includes("--apply") && args.includes("--simulate"))
  )
    throw new Error("Arguments refused");
  const result = await resetDevelopmentPersonaData({
    databaseUrl: process.env.PERSONA_V2_RESET_DATABASE_URL ?? "",
    environment: process.env.NODE_ENV ?? "",
    generation: args.find((arg) => arg.startsWith("--generation="))?.slice(13) ?? "",
    confirmDatabase: args.find((arg) => arg.startsWith("--confirm-database="))?.slice(19) ?? "",
    apply: args.includes("--apply"),
  });
  process.stdout.write(JSON.stringify(result) + "\n");
} catch {
  console.error(
    "Reset persona-v2 recusado ou falhou. Confira alvo descartável, confirmação, geração, migrations e ausência de conexões; nenhuma credencial é exibida.",
  );
  process.exitCode = 1;
}
