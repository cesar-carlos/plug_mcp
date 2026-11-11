import { ERROR_SOURCE, type DomainError } from "../../domain/errors/domain-error.js";
import { safeErrorDetails } from "../../domain/errors/safe-error-details.js";
import {
  PLUG_SERVER_STAGES,
  PLUG_SERVER_PHASE_STAGES,
} from "../../domain/errors/plug-server-stages.js";

/** Positive vocabulary only: never log native messages, hints or arbitrary details. */
export function adminDomainDiagnostics(error: DomainError): Record<string, unknown> {
  const stages: readonly string[] = [
    ...PLUG_SERVER_STAGES,
    ...PLUG_SERVER_PHASE_STAGES,
    "delegation",
    "validar_escopo",
  ];
  const sources: readonly string[] = Object.values(ERROR_SOURCE);
  return {
    ...(error.source && sources.includes(error.source) ? { source: error.source } : {}),
    ...(error.stage && stages.includes(error.stage) ? { stage: error.stage } : {}),
    ...safeErrorDetails(error.details),
  };
}
