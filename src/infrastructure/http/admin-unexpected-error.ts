export const CONTROL_WRITE_FAILED = "CONTROL_WRITE_FAILED";

export interface AdminUnexpectedFailure {
  readonly code: typeof CONTROL_WRITE_FAILED | "AUTHORITY_UNAVAILABLE";
  readonly message: string;
  readonly log: {
    readonly name: string;
    readonly sqlstate?: string;
    readonly constraint?: string;
  };
}

const persistenceFailure = (
  error: unknown,
): { code: string; constraint: string | undefined } | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const severity =
    "severity" in error && typeof error.severity === "string" ? error.severity : undefined;
  if (!code || !severity || !/^[0-9A-Z]{5}$/.test(code)) return undefined;
  const constraint =
    "constraint" in error && typeof error.constraint === "string" ? error.constraint : undefined;
  return { code, constraint };
};

export function adminUnexpectedFailure(error: unknown): AdminUnexpectedFailure {
  const name = error instanceof Error ? error.name : "unknown";
  const persistence = persistenceFailure(error);
  if (!persistence) {
    return {
      code: "AUTHORITY_UNAVAILABLE",
      message:
        "Não foi possível concluir a solicitação. Confira o estado antes de repetir; o motivo técnico ficou no log do servidor.",
      log: { name },
    };
  }
  return {
    code: CONTROL_WRITE_FAILED,
    message:
      "Não foi possível gravar no banco de controle. Confira a lista antes de repetir; esta falha não é a autoridade do hub.",
    log: {
      name,
      sqlstate: persistence.code,
      ...(persistence.constraint ? { constraint: persistence.constraint } : {}),
    },
  };
}
