import { validatePersonaProductionConfiguration } from "../src/config/persona-production.js";

try {
  if (process.argv.length !== 2) throw new Error("Arguments refused");
  validatePersonaProductionConfiguration(process.env);
  process.stdout.write(
    "Configuração estática v2 válida; não autoriza release, migration ou deploy.\n",
  );
} catch {
  console.error(
    "Configuração de produção v2 recusada. Confira imagem por digest, origens HTTPS, banco dedicado, chave e porta explícitos; nenhum segredo é exibido.",
  );
  process.exitCode = 1;
}
