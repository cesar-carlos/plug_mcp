const actions = {
  FILE_CLOSE_FAILED:
    "Não foi possível confirmar o fechamento do arquivo. Verifique o ambiente local antes de repetir a validação.",
  FILE_READ_FAILED:
    "Não foi possível ler o arquivo de forma estável. Confira acesso e integridade da origem local.",
  INVALID_CONFIGURATION:
    "Confira geração, variante, URL HTTPS e ID da conexão; portátil não recebe conexão ChatGPT.",
  UNSAFE_FILE:
    "Use arquivos regulares dentro do pacote, sem links simbólicos e dentro dos limites de tamanho.",
  FILE_CHANGED:
    "Interrompa a edição concorrente e monte um novo pacote a partir de uma origem estável.",
  INVALID_PACKAGE:
    "Remonte e valide o pacote na revisão correspondente; não altere hashes para contornar a recusa.",
  DESTINATION_EXISTS: "Escolha um novo destino de montagem; preserve o pacote existente.",
  INTEGRITY_MISMATCH:
    "O inventário não corresponde aos bytes. Remonte o pacote a partir da origem; não ajuste hashes para contornar a validação.",
  CONTRACT_MISMATCH:
    "Confira geração, conexão, ambiente e revisão do pacote; remonte com o contrato correspondente ao servidor.",
  UNSAFE_CONTENT: "Remova credenciais e conteúdo confidencial da origem antes de montar o pacote.",
} as const;
export type PluginFailureCode = keyof typeof actions;
export class PluginFailure extends Error {
  cleanupFailed?: true;
  constructor(
    readonly code: PluginFailureCode,
    message: string = actions[code],
  ) {
    super(message);
  }
}
export function pluginDiagnostic(
  error: unknown,
  stage: "arguments" | "package" | "validation",
): {
  success: false;
  stage: typeof stage;
  code: PluginFailureCode;
  action: string;
  installedPackageVerified: false;
  cleanupFailed?: true;
} {
  const code =
    error instanceof PluginFailure
      ? error.code
      : stage === "arguments"
        ? "INVALID_CONFIGURATION"
        : "INVALID_PACKAGE";
  return {
    success: false,
    stage,
    code,
    action: actions[code],
    installedPackageVerified: false,
    ...(error instanceof PluginFailure && error.cleanupFailed
      ? { cleanupFailed: true as const }
      : {}),
  };
}
