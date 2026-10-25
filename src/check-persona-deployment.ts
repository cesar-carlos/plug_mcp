import { loadConfig } from "./config/env.js";
import { assertPersonaDeployment } from "./config/persona-deployment.js";

try {
  assertPersonaDeployment(loadConfig());
  process.stdout.write("Configuração persona-v2 válida; conectividade não verificada.\n");
} catch {
  process.stderr.write("Configuração persona-v2 recusada; confira modo, origens, banco e cofre.\n");
  process.exitCode = 1;
}
