import { resolve } from "node:path";
import { parsePluginValidationArgs } from "../src/infrastructure/plugins/package-args.js";
import { validateSe7ePackage } from "../src/infrastructure/plugins/package-validation.js";

try {
  const { root, input } = parsePluginValidationArgs(
    process.argv.slice(2),
    process.env.PUBLIC_BASE_URL,
  );
  await validateSe7ePackage(resolve(root), {
    ...input,
    variant: input.portable ? "portable" : "chatgpt",
  });
  process.stdout.write(
    "Pacote aprovado pelo perfil local se7e-package-v1. Instalação no cliente não verificada.\n",
  );
} catch {
  process.stderr.write(
    "Verificação recusada. Informe --package=DIRETORIO, --runtime=legacy|persona-v2, --public-base-url=HTTPS (ou PUBLIC_BASE_URL) e --portable ou --connection-id=ID_REAL. Confira o perfil e a integridade do pacote.\n",
  );
  process.exitCode = 1;
}
